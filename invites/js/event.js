import { mountAuthWidget } from "./auth-widget.js";
import { db } from "./firebase-init.js";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const authContainer = document.getElementById("auth-widget");
const signedOutHint = document.getElementById("signed-out-hint");
const noAccessHint = document.getElementById("no-access-hint");
const missingIdHint = document.getElementById("missing-id-hint");
const eventSection = document.getElementById("event-section");
const eventDetail = document.getElementById("event-detail");
const rsvpForm = document.getElementById("rsvp-form");
const rsvpStatus = document.getElementById("rsvp-status");

const eventId = new URLSearchParams(location.search).get("id");

function showOnly(el) {
  [signedOutHint, noAccessHint, missingIdHint, eventSection].forEach((e) => {
    e.hidden = e !== el;
  });
}

if (!eventId) {
  showOnly(missingIdHint);
} else {
  mountAuthWidget(authContainer, async (user) => {
    if (!user) {
      showOnly(signedOutHint);
      return;
    }
    await loadEvent(user);
  });
}

async function loadEvent(user) {
  let eventSnap;
  try {
    eventSnap = await getDoc(doc(db, "events", eventId));
  } catch (err) {
    showOnly(noAccessHint);
    return;
  }
  if (!eventSnap.exists()) {
    showOnly(noAccessHint);
    return;
  }

  const e = eventSnap.data();
  const date = e.date && e.date.toDate ? e.date.toDate() : null;
  eventDetail.innerHTML = `
    <h2>${escapeHtml(e.title || "Untitled event")}</h2>
    ${date ? `<time>${escapeHtml(date.toLocaleString())}</time>` : ""}
    ${e.location ? `<p>${escapeHtml(e.location)}</p>` : ""}
    ${e.description ? `<p>${escapeHtml(e.description)}</p>` : ""}
    ${e.hostName ? `<p class="hint">Hosted by ${escapeHtml(e.hostName)}</p>` : ""}
  `;
  showOnly(eventSection);

  const existing = await getDoc(doc(db, "events", eventId, "rsvps", user.uid));
  if (existing.exists()) {
    const data = existing.data();
    rsvpForm.status.value = data.status || "yes";
    rsvpForm.guestCount.value = data.guestCount || 1;
    rsvpForm.comment.value = data.comment || "";
  }

  rsvpForm.onsubmit = async (ev) => {
    ev.preventDefault();
    rsvpStatus.hidden = true;
    const fd = new FormData(rsvpForm);
    try {
      await setDoc(doc(db, "events", eventId, "rsvps", user.uid), {
        email: user.email,
        name: user.displayName || user.email,
        status: fd.get("status"),
        guestCount: Number(fd.get("guestCount")) || 1,
        comment: fd.get("comment") || "",
        respondedAt: serverTimestamp(),
      });
      rsvpStatus.textContent = "RSVP saved. Thank you!";
      rsvpStatus.className = "status-msg success";
      rsvpStatus.hidden = false;
    } catch (err) {
      rsvpStatus.textContent = "Couldn't save your RSVP: " + err.message;
      rsvpStatus.className = "status-msg error";
      rsvpStatus.hidden = false;
    }
  };
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
