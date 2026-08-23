import { auth, db } from "./firebase-init.js";
import { isAdminUser } from "./auth.js";
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  serverTimestamp,
  runTransaction,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const DAILY_EVENT_LIMIT = 10;

// Creates an event, attributed to the current user. Admins have no limit;
// everyone else is capped at DAILY_EVENT_LIMIT per rolling 24h window,
// enforced both here (for a fast, friendly error) and - the real boundary
// - in firestore.rules' underDailyEventLimit(), so this can't be bypassed
// by calling Firestore directly. Also maintains the userEvents index (see
// firestore.rules) and, for admin-created open events only, the public
// openEvents browse list - non-admin events never appear in that shared
// feed, even when open, so users still only see events they created or
// RSVP'd to (see invites/docs/DESIGN.md).
export async function createEvent(data) {
  const user = auth.currentUser;
  const eventData = {
    ...data,
    createdBy: user.email,
    createdByUid: user.uid,
    createdAt: serverTimestamp(),
  };
  const eventRef = doc(collection(db, "events"));
  const admin = isAdminUser(user);

  if (admin) {
    await setDoc(eventRef, eventData);
  } else {
    const counterRef = doc(db, "eventCounts", user.uid);
    await runTransaction(db, async (tx) => {
      const counterSnap = await tx.get(counterRef);
      const now = Date.now();
      let count = 1;
      let windowStart = serverTimestamp();
      if (counterSnap.exists()) {
        const c = counterSnap.data();
        const expired = now - c.windowStart.toMillis() > DAY_MS;
        if (!expired) {
          if ((c.count || 0) >= DAILY_EVENT_LIMIT) {
            throw new Error(`You've reached today's limit of ${DAILY_EVENT_LIMIT} events. Try again later.`);
          }
          count = c.count + 1;
          windowStart = c.windowStart;
        }
      }
      tx.set(counterRef, { count, windowStart });
      tx.set(eventRef, eventData);
    });
  }

  await setDoc(doc(db, "userEvents", user.uid, "items", eventRef.id), {
    createdAt: eventData.createdAt,
  });

  if (admin && eventData.isOpen) {
    await setDoc(doc(db, "openEvents", eventRef.id), {
      title: eventData.title,
      date: eventData.date,
      location: eventData.location,
    });
  }

  return eventRef;
}

// Renders one event's admin/owner management card: invite link, invitee
// list (add/remove), RSVP table + CSV export (adult/child columns when
// the event uses that split). Used by both admin.js (all events) and
// my-events.js (a user's own events) - identical UI either way, since
// access is governed entirely by firestore.rules (isAdmin() or
// isEventOwner()), not by which page is rendering it.
export function renderEventCard(id, e) {
  const card = document.createElement("div");
  card.className = "admin-section";
  const date = e.date && e.date.toDate ? e.date.toDate() : null;
  const inviteUrl = `${location.origin}/event.html?id=${encodeURIComponent(id)}`;

  card.innerHTML = `
    <h3>${escapeHtml(e.title || "Untitled event")} ${e.isOpen ? "<small>(open)</small>" : "<small>(invite-only)</small>"}</h3>
    ${date ? `<p class="hint">${escapeHtml(date.toLocaleString())}</p>` : ""}
    ${e.createdBy ? `<p class="hint">Created by ${escapeHtml(e.createdBy)}</p>` : ""}
    <p class="hint">Invite link: <code>${escapeHtml(inviteUrl)}</code>
      <button type="button" class="small-btn copy-link-btn">Copy</button>
    </p>

    <h4>Invitees</h4>
    <form class="inline-form add-invitee-form">
      <label>Email <input type="email" name="email" required></label>
      <label>Name <input type="text" name="name"></label>
      <label>Max guests <input type="number" name="maxGuests" min="1" value="1"></label>
      <button type="submit">Add invitee</button>
    </form>
    <table class="invitee-table">
      <thead><tr><th>Email</th><th>Name</th><th>Max guests</th><th></th></tr></thead>
      <tbody></tbody>
    </table>

    <h4>RSVPs</h4>
    ${e.splitGuestsByAge ? `<p class="hint">Children are guests under age ${escapeHtml(String(e.childAgeThreshold ?? ""))}.</p>` : ""}
    <button type="button" class="small-btn load-rsvps-btn">Load RSVPs</button>
    <button type="button" class="small-btn export-csv-btn" hidden>Export CSV</button>
    <table class="rsvp-table" hidden>
      <thead><tr><th>Name</th><th>Email</th><th>Status</th>${e.splitGuestsByAge ? "<th>Adults</th><th>Children</th>" : "<th>Guests</th>"}<th>Comment</th></tr></thead>
      <tbody></tbody>
    </table>
  `;

  card.querySelector(".copy-link-btn").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      card.querySelector(".copy-link-btn").textContent = "Copied!";
      setTimeout(() => (card.querySelector(".copy-link-btn").textContent = "Copy"), 1500);
    } catch {
      window.prompt("Copy this link:", inviteUrl);
    }
  });

  const inviteeBody = card.querySelector(".invitee-table tbody");
  loadInvitees(id, inviteeBody);

  card.querySelector(".add-invitee-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const form = ev.target;
    const fd = new FormData(form);
    const emailKey = fd.get("email").trim().toLowerCase();
    await setDoc(doc(db, "events", id, "invitees", emailKey), {
      name: (fd.get("name") || "").trim(),
      maxGuests: Number(fd.get("maxGuests")) || 1,
      invitedAt: serverTimestamp(),
    });
    form.reset();
    await loadInvitees(id, inviteeBody);
  });

  const rsvpTable = card.querySelector(".rsvp-table");
  const rsvpBody = card.querySelector(".rsvp-table tbody");
  const exportBtn = card.querySelector(".export-csv-btn");
  let lastRsvps = [];

  card.querySelector(".load-rsvps-btn").addEventListener("click", async () => {
    const snap = await getDocs(collection(db, "events", id, "rsvps"));
    lastRsvps = [];
    rsvpBody.innerHTML = "";
    snap.forEach((rsvpDoc) => {
      const r = rsvpDoc.data();
      lastRsvps.push(r);
      const tr = document.createElement("tr");
      const guestCells = e.splitGuestsByAge
        ? `<td>${escapeHtml(String(r.adultCount ?? ""))}</td><td>${escapeHtml(String(r.childCount ?? ""))}</td>`
        : `<td>${escapeHtml(String(r.guestCount ?? ""))}</td>`;
      tr.innerHTML = `
        <td>${escapeHtml(r.name || "")}</td>
        <td>${escapeHtml(r.email || "")}</td>
        <td>${escapeHtml(r.status || "")}</td>
        ${guestCells}
        <td>${escapeHtml(r.comment || "")}</td>
      `;
      rsvpBody.appendChild(tr);
    });
    rsvpTable.hidden = false;
    exportBtn.hidden = lastRsvps.length === 0;
  });

  exportBtn.addEventListener("click", () => {
    const header = e.splitGuestsByAge
      ? ["name", "email", "status", "adultCount", "childCount", "comment"]
      : ["name", "email", "status", "guestCount", "comment"];
    downloadCsv(`${(e.title || "event").replace(/[^a-z0-9]+/gi, "-")}-rsvps.csv`, lastRsvps, header);
  });

  return card;
}

export async function loadInvitees(eventId, tbody) {
  const snap = await getDocs(collection(db, "events", eventId, "invitees"));
  tbody.innerHTML = "";
  snap.forEach((inviteeDoc) => {
    const inv = inviteeDoc.data();
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(inviteeDoc.id)}</td>
      <td>${escapeHtml(inv.name || "")}</td>
      <td>${escapeHtml(String(inv.maxGuests ?? ""))}</td>
      <td><button type="button" class="small-btn remove-invitee-btn">Remove</button></td>
    `;
    tr.querySelector(".remove-invitee-btn").addEventListener("click", async () => {
      await deleteDoc(doc(db, "events", eventId, "invitees", inviteeDoc.id));
      await loadInvitees(eventId, tbody);
    });
    tbody.appendChild(tr);
  });
}

export function downloadCsv(filename, rows, header = ["name", "email", "status", "guestCount", "comment"]) {
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      header
        .map((k) => `"${String(r[k] ?? "").replace(/"/g, '""')}"`)
        .join(",")
    );
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
