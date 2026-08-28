import { auth, db, storage } from "./firebase-init.js";
import { isAdminUser } from "./auth.js";
import { summarizeRsvps } from "./rsvp-summary.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  runTransaction,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import {
  ref,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-storage.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const DAILY_EVENT_LIMIT = 10;
const PHOTO_MAX_DIMENSION = 1600;
const PHOTO_QUALITY = 0.82;

// Downscales an image client-side before it ever leaves the browser, so
// "reasonably sized" doesn't depend on trusting what the guest's phone
// camera produced (often 10MB+). Longest side capped at
// PHOTO_MAX_DIMENSION, re-encoded as JPEG - typically well under 1MB
// after this, comfortably inside storage.rules' 5MB hard cap.
function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > PHOTO_MAX_DIMENSION || height > PHOTO_MAX_DIMENSION) {
        if (width >= height) {
          height = Math.round((height * PHOTO_MAX_DIMENSION) / width);
          width = PHOTO_MAX_DIMENSION;
        } else {
          width = Math.round((width * PHOTO_MAX_DIMENSION) / height);
          height = PHOTO_MAX_DIMENSION;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Could not process that image"))),
        "image/jpeg",
        PHOTO_QUALITY
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image file"));
    };
    img.src = url;
  });
}

// Shows an instant local preview of a chosen photo file - before any
// upload happens, since the actual upload only occurs at form-submit time
// (see "Editing an event"/"Event photos" in DESIGN.md). Purely a client-
// side object URL, no network involved, so it's free and immediate; used
// by both the create forms (admin.js, my-events.js) and the edit form
// below on the same file input + <img class="form-photo-preview"> pair.
export function wirePhotoPreview(input, previewImg) {
  input.addEventListener("change", () => {
    const file = input.files[0];
    if (previewImg.src) URL.revokeObjectURL(previewImg.src);
    if (file) {
      previewImg.src = URL.createObjectURL(file);
      previewImg.hidden = false;
    } else {
      previewImg.hidden = true;
    }
  });
}

// One photo per event - re-uploading (via the "Edit event" form's
// "Replace photo" field) overwrites the previous one at the same path.
// The owner's uid is embedded in the path itself (rather than checked via
// a Storage-rules-side Firestore lookup) so storage.rules can authorize
// the write with a simple, self-contained path check - see storage.rules.
export async function uploadEventPhoto(eventId, ownerUid, file) {
  const blob = await resizeImage(file);
  const photoRef = ref(storage, `eventPhotos/${eventId}/${ownerUid}/photo.jpg`);
  await uploadBytes(photoRef, blob, { contentType: "image/jpeg" });
  return getDownloadURL(photoRef);
}

// Creates an event, attributed to the current user. Admins have no limit;
// everyone else is capped at DAILY_EVENT_LIMIT per rolling 24h window,
// enforced both here (for a fast, friendly error) and - the real boundary
// - in firestore.rules' underDailyEventLimit(), so this can't be bypassed
// by calling Firestore directly. Also maintains the userEvents index (see
// firestore.rules) and, for admin-created open events only, the public
// openEvents browse list - non-admin events never appear in that shared
// feed, even when open, so users still only see events they created or
// RSVP'd to (see invites/docs/DESIGN.md).
//
// `photoFile`, if given, is uploaded (see uploadEventPhoto) after the
// event itself exists, so its `photoUrl` can be attached via updateDoc.
// A photo failure doesn't undo the event; it's reported back via the
// returned `photoError` so the caller can show it without implying the
// whole thing failed.
export async function createEvent(data, photoFile) {
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

  let photoError = null;
  if (photoFile) {
    try {
      const photoUrl = await uploadEventPhoto(eventRef.id, user.uid, photoFile);
      await updateDoc(eventRef, { photoUrl });
    } catch (err) {
      photoError = err.message;
    }
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

  return { eventRef, photoError };
}

// Updates an existing event's fields, attributed to whoever's editing (an
// admin or the event's own creator - enforced server-side by
// firestore.rules' update rule, same as here). No rate limit applies to
// edits (only creation). `photoFile`, if given, replaces the photo at the
// same Storage path the event was created with - always keyed by the
// event's original `createdByUid`, not the editor's uid, so an admin
// editing someone else's event still overwrites the one existing photo
// rather than creating a second one storage.rules would then have to
// reconcile (storage.rules' isAdmin() bypass allows this).
export async function updateEvent(eventId, existing, data, photoFile) {
  const eventRef = doc(db, "events", eventId);
  await updateDoc(eventRef, data);

  let photoError = null;
  if (photoFile) {
    try {
      const photoUrl = await uploadEventPhoto(eventId, existing.createdByUid, photoFile);
      await updateDoc(eventRef, { photoUrl });
    } catch (err) {
      photoError = err.message;
    }
  }

  // Keep the openEvents browse-feed mirror in sync, same admin-only /
  // isOpen-only condition createEvent() applies - based on whether the
  // event's original creator is an admin (createdBy's email), not whoever
  // is doing this particular edit.
  if (isAdminUser({ email: existing.createdBy })) {
    const merged = { ...existing, ...data };
    if (merged.isOpen) {
      await setDoc(doc(db, "openEvents", eventId), {
        title: merged.title,
        date: merged.date,
        location: merged.location,
      });
    } else {
      await deleteDoc(doc(db, "openEvents", eventId));
    }
  }

  return { photoError };
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
    ${e.photoUrl ? `<img src="${escapeHtml(e.photoUrl)}" alt="" class="event-card-photo">` : ""}
    <h3>${escapeHtml(e.title || "Untitled event")} ${e.isOpen ? "<small>(open)</small>" : "<small>(invite-only)</small>"}</h3>
    ${date ? `<p class="hint">${escapeHtml(date.toLocaleString())}</p>` : ""}
    ${e.createdBy ? `<p class="hint">Created by ${escapeHtml(e.createdBy)}</p>` : ""}
    <p class="hint">Invite link: <code>${escapeHtml(inviteUrl)}</code>
      <button type="button" class="small-btn copy-link-btn">Copy</button>
      <button type="button" class="small-btn edit-event-btn">Edit event</button>
    </p>
    <p class="error edit-event-error" hidden></p>
    <form class="admin-form edit-event-form" hidden>
      <label>Title <input type="text" name="title" value="${escapeHtml(e.title || "")}" required></label>
      <label>Date &amp; time <input type="datetime-local" name="date" value="${escapeHtml(toDatetimeLocalValue(date))}"></label>
      <label>Location <input type="text" name="location" value="${escapeHtml(e.location || "")}"></label>
      <label>Host name <input type="text" name="hostName" value="${escapeHtml(e.hostName || "")}"></label>
      <label>Description <textarea name="description" rows="3">${escapeHtml(e.description || "")}</textarea></label>
      <label>Replace photo (optional) <input type="file" name="photo" accept="image/*"></label>
      <img class="form-photo-preview" alt="" hidden>
      <label><input type="checkbox" name="isOpen" ${e.isOpen ? "checked" : ""}> Open event (anyone signed in can RSVP, no invite list needed)</label>
      <label><input type="checkbox" name="splitGuestsByAge" class="edit-split-guests-checkbox" ${e.splitGuestsByAge ? "checked" : ""}> Split guests into adults &amp; children</label>
      <label class="edit-child-age-label" ${e.splitGuestsByAge ? "" : "hidden"}>Children are guests under age
        <input type="number" name="childAgeThreshold" min="1" max="99" value="${escapeHtml(String(e.childAgeThreshold ?? 13))}">
      </label>
      <p class="photo-upload-status" hidden></p>
      <button type="submit">Save changes</button>
      <button type="button" class="link-btn cancel-edit-btn">Cancel</button>
    </form>

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
      <tfoot></tfoot>
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

  const editForm = card.querySelector(".edit-event-form");
  const editError = card.querySelector(".edit-event-error");
  const editSplitCheckbox = editForm.querySelector(".edit-split-guests-checkbox");
  const editChildAgeLabel = editForm.querySelector(".edit-child-age-label");
  const editPhotoStatus = editForm.querySelector(".photo-upload-status");

  card.querySelector(".edit-event-btn").addEventListener("click", () => {
    editForm.hidden = !editForm.hidden;
  });
  card.querySelector(".cancel-edit-btn").addEventListener("click", () => {
    editForm.hidden = true;
  });
  editSplitCheckbox.addEventListener("change", () => {
    editChildAgeLabel.hidden = !editSplitCheckbox.checked;
  });
  wirePhotoPreview(editForm.querySelector('[name="photo"]'), editForm.querySelector(".form-photo-preview"));

  editForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    editError.hidden = true;
    const fd = new FormData(editForm);
    const isOpen = fd.get("isOpen") === "on";
    const splitGuestsByAge = fd.get("splitGuestsByAge") === "on";
    const dateVal = fd.get("date");
    const photoFile = fd.get("photo");
    const hasPhoto = photoFile && photoFile.size > 0;
    const submitBtn = editForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    if (hasPhoto) {
      editPhotoStatus.textContent = "Uploading photo…";
      editPhotoStatus.hidden = false;
    }
    try {
      const { photoError } = await updateEvent(
        id,
        e,
        {
          title: fd.get("title").trim(),
          description: (fd.get("description") || "").trim(),
          location: (fd.get("location") || "").trim(),
          hostName: (fd.get("hostName") || "").trim(),
          isOpen,
          date: dateVal ? Timestamp.fromDate(new Date(dateVal)) : null,
          splitGuestsByAge,
          childAgeThreshold: splitGuestsByAge ? Number(fd.get("childAgeThreshold")) || 13 : null,
        },
        hasPhoto ? photoFile : null
      );
      const freshSnap = await getDoc(doc(db, "events", id));
      const freshCard = renderEventCard(id, freshSnap.data());
      if (photoError) {
        const freshErr = freshCard.querySelector(".edit-event-error");
        freshErr.textContent = "Event updated, but the photo couldn't be uploaded: " + photoError;
        freshErr.hidden = false;
      }
      card.replaceWith(freshCard);
    } catch (err) {
      editError.textContent = err.message;
      editError.hidden = false;
      submitBtn.disabled = false;
      editPhotoStatus.hidden = true;
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
  const rsvpFoot = card.querySelector(".rsvp-table tfoot");
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

    // Totals row. This card is only ever rendered for an admin or the
    // event's own creator (admin.js / my-events.js), so unlike the guest
    // list on event.html there's no extra visibility check needed here.
    const totals = summarizeRsvps(lastRsvps);
    const totalCells = e.splitGuestsByAge
      ? `<td>${totals.attendingAdults}</td><td>${totals.attendingChildren}</td>`
      : `<td>${totals.attendingGuests}</td>`;
    rsvpFoot.innerHTML = lastRsvps.length
      ? `<tr class="rsvp-total-row">
           <td>Total attending</td>
           <td></td>
           <td>${totals.yes} yes, ${totals.no} no, ${totals.maybe} maybe</td>
           ${totalCells}
           <td></td>
         </tr>`
      : "";

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

// Formats a Date for a <input type="datetime-local"> value, in the
// browser's local timezone (toISOString() would shift to UTC, which is
// wrong for pre-filling an edit form with the value a "date &amp; time"
// field originally captured in local time).
function toDatetimeLocalValue(date) {
  if (!date) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
