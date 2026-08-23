import { mountAuthWidget } from "./auth-widget.js";
import { db } from "./firebase-init.js";
import {
  collection,
  getDocs,
  orderBy,
  query,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const authContainer = document.getElementById("auth-widget");
const eventsSection = document.getElementById("events-section");
const eventsList = document.getElementById("event-list");
const myRsvpsList = document.getElementById("my-rsvps-list");
const myRsvpsEmpty = document.getElementById("my-rsvps-empty");
const signedOutHint = document.getElementById("signed-out-hint");

mountAuthWidget(authContainer, async (user) => {
  if (!user) {
    eventsSection.hidden = true;
    signedOutHint.hidden = false;
    return;
  }
  signedOutHint.hidden = true;
  eventsSection.hidden = false;
  await Promise.all([loadMyRsvps(user), loadOpenEvents()]);
});

async function loadMyRsvps(user) {
  myRsvpsList.innerHTML = "<li>Loading...</li>";
  try {
    const q = query(collection(db, "userRsvps", user.uid, "items"), orderBy("respondedAt", "desc"));
    const snap = await getDocs(q);
    myRsvpsEmpty.hidden = !snap.empty;
    myRsvpsList.innerHTML = "";
    snap.forEach((docSnap) => {
      const r = docSnap.data();
      const date = r.eventDate && r.eventDate.toDate ? r.eventDate.toDate() : null;
      const li = document.createElement("li");
      li.innerHTML = `
        <a href="/event.html?id=${encodeURIComponent(docSnap.id)}">${escapeHtml(r.eventTitle || "Untitled event")}</a>
        ${date ? `<time>${escapeHtml(date.toLocaleString())}</time>` : ""}
        <div class="hint">Your response: ${escapeHtml(r.status || "")}${r.guestCount ? `, ${r.guestCount} guest(s)` : ""}</div>
      `;
      myRsvpsList.appendChild(li);
    });
  } catch (err) {
    myRsvpsEmpty.hidden = true;
    myRsvpsList.innerHTML = `<li class="hint">Couldn't load your RSVPs: ${escapeHtml(err.message)}</li>`;
  }
}

async function loadOpenEvents() {
  eventsList.innerHTML = "<li>Loading...</li>";
  try {
    const q = query(collection(db, "openEvents"), orderBy("date"));
    const snap = await getDocs(q);
    if (snap.empty) {
      eventsList.innerHTML =
        '<li class="hint">No open events right now.</li>';
      return;
    }
    eventsList.innerHTML = "";
    snap.forEach((docSnap) => {
      const e = docSnap.data();
      const date = e.date && e.date.toDate ? e.date.toDate() : null;
      const li = document.createElement("li");
      li.innerHTML = `
        <a href="/event.html?id=${encodeURIComponent(docSnap.id)}">${escapeHtml(e.title || "Untitled event")}</a>
        ${date ? `<time>${escapeHtml(date.toLocaleString())}</time>` : ""}
        ${e.location ? `<div>${escapeHtml(e.location)}</div>` : ""}
      `;
      eventsList.appendChild(li);
    });
  } catch (err) {
    eventsList.innerHTML = `<li class="hint">Couldn't load events: ${escapeHtml(err.message)}</li>`;
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
