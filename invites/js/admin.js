import { mountAuthWidget } from "./auth-widget.js";
import { auth, db } from "./firebase-init.js";
import { isAdminUser } from "./auth.js";
import {
  collection,
  doc,
  getDocs,
  addDoc,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const authContainer = document.getElementById("auth-widget");
const signedOutHint = document.getElementById("signed-out-hint");
const notAdminHint = document.getElementById("not-admin-hint");
const adminSection = document.getElementById("admin-section");
const createForm = document.getElementById("create-event-form");
const eventListEl = document.getElementById("event-list");

function showOnly(el) {
  [signedOutHint, notAdminHint, adminSection].forEach((e) => {
    e.hidden = e !== el;
  });
}

mountAuthWidget(authContainer, async (user) => {
  if (!user) {
    showOnly(signedOutHint);
    return;
  }
  if (!isAdminUser(user)) {
    showOnly(notAdminHint);
    return;
  }
  showOnly(adminSection);
  await loadEvents();
});

createForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(createForm);
  const isOpen = fd.get("isOpen") === "on";
  const dateVal = fd.get("date");
  const date = dateVal ? Timestamp.fromDate(new Date(dateVal)) : null;
  const data = {
    title: fd.get("title").trim(),
    description: (fd.get("description") || "").trim(),
    location: (fd.get("location") || "").trim(),
    hostName: (fd.get("hostName") || "").trim(),
    isOpen,
    date,
    createdBy: auth.currentUser.email,
    createdAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, "events"), data);
  if (isOpen) {
    await setDoc(doc(db, "openEvents", ref.id), {
      title: data.title,
      date: data.date,
      location: data.location,
    });
  }
  createForm.reset();
  await loadEvents();
});

async function loadEvents() {
  eventListEl.innerHTML = "Loading...";
  const snap = await getDocs(query(collection(db, "events"), orderBy("createdAt", "desc")));
  eventListEl.innerHTML = "";
  if (snap.empty) {
    eventListEl.innerHTML = '<p class="hint">No events yet.</p>';
    return;
  }
  snap.forEach((docSnap) => {
    eventListEl.appendChild(renderEventCard(docSnap.id, docSnap.data()));
  });
}

function renderEventCard(id, e) {
  const card = document.createElement("div");
  card.className = "admin-section";
  const date = e.date && e.date.toDate ? e.date.toDate() : null;
  const inviteUrl = `${location.origin}/event.html?id=${encodeURIComponent(id)}`;

  card.innerHTML = `
    <h3>${escapeHtml(e.title || "Untitled event")} ${e.isOpen ? "<small>(open)</small>" : "<small>(invite-only)</small>"}</h3>
    ${date ? `<p class="hint">${escapeHtml(date.toLocaleString())}</p>` : ""}
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
    <button type="button" class="small-btn load-rsvps-btn">Load RSVPs</button>
    <button type="button" class="small-btn export-csv-btn" hidden>Export CSV</button>
    <table class="rsvp-table" hidden>
      <thead><tr><th>Name</th><th>Email</th><th>Status</th><th>Guests</th><th>Comment</th></tr></thead>
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
      tr.innerHTML = `
        <td>${escapeHtml(r.name || "")}</td>
        <td>${escapeHtml(r.email || "")}</td>
        <td>${escapeHtml(r.status || "")}</td>
        <td>${escapeHtml(String(r.guestCount ?? ""))}</td>
        <td>${escapeHtml(r.comment || "")}</td>
      `;
      rsvpBody.appendChild(tr);
    });
    rsvpTable.hidden = false;
    exportBtn.hidden = lastRsvps.length === 0;
  });

  exportBtn.addEventListener("click", () => {
    downloadCsv(`${(e.title || "event").replace(/[^a-z0-9]+/gi, "-")}-rsvps.csv`, lastRsvps);
  });

  return card;
}

async function loadInvitees(eventId, tbody) {
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

function downloadCsv(filename, rows) {
  const header = ["name", "email", "status", "guestCount", "comment"];
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
