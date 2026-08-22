import { mountAuthWidget, refreshAuthWidget } from "./auth-widget.js";
import { db } from "./firebase-init.js";
import { sendMagicLink, applyProfileName } from "./auth.js";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const authContainer = document.getElementById("auth-widget");
const notFoundHint = document.getElementById("not-found-hint");
const missingIdHint = document.getElementById("missing-id-hint");
const eventSection = document.getElementById("event-section");
const eventDetail = document.getElementById("event-detail");
const quickRsvpForm = document.getElementById("quick-rsvp-form");
const quickRsvpSent = document.getElementById("quick-rsvp-sent");
const rsvpForm = document.getElementById("rsvp-form");
const rsvpStatus = document.getElementById("rsvp-status");

const eventId = new URLSearchParams(location.search).get("id");
const pendingKey = eventId ? `pendingRsvp:${eventId}` : null;

function showTopLevel(el) {
  [notFoundHint, missingIdHint, eventSection].forEach((e) => {
    e.hidden = e !== el;
  });
}

// Within event-section, exactly one of these is visible at a time.
function showRsvpState(el) {
  [quickRsvpForm, quickRsvpSent, rsvpForm].forEach((e) => {
    e.hidden = e !== el;
  });
}

if (!eventId) {
  showTopLevel(missingIdHint);
} else {
  loadEventDetails();
  mountAuthWidget(authContainer, async (user) => {
    if (!user) {
      showRsvpState(quickRsvpForm);
      return;
    }
    await handleSignedIn(user);
  });
}

async function loadEventDetails() {
  let eventSnap;
  try {
    eventSnap = await getDoc(doc(db, "events", eventId));
  } catch (err) {
    showTopLevel(notFoundHint);
    return;
  }
  if (!eventSnap.exists()) {
    showTopLevel(notFoundHint);
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
  showTopLevel(eventSection);
}

quickRsvpForm.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const errEl = quickRsvpForm.querySelector(".error");
  errEl.hidden = true;
  const fd = new FormData(quickRsvpForm);
  const payload = {
    firstName: fd.get("firstName").trim(),
    lastName: fd.get("lastName").trim(),
    email: fd.get("email").trim(),
    status: fd.get("status"),
    guestCount: Number(fd.get("guestCount")) || 1,
    comment: fd.get("comment") || "",
  };
  try {
    localStorage.setItem(pendingKey, JSON.stringify(payload));
    await sendMagicLink(payload.email);
    showRsvpState(quickRsvpSent);
  } catch (err) {
    localStorage.removeItem(pendingKey);
    errEl.textContent = err.message;
    errEl.hidden = false;
  }
});

async function handleSignedIn(user) {
  const pendingRaw = localStorage.getItem(pendingKey);
  if (pendingRaw) {
    localStorage.removeItem(pendingKey);
    try {
      const payload = JSON.parse(pendingRaw);
      await applyProfileName(payload.firstName, payload.lastName);
      refreshAuthWidget(authContainer);
      await writeRsvp(user, payload);
    } catch (err) {
      await showSignedInForm(user);
      reportRsvpError(err);
      return;
    }
  }
  await showSignedInForm(user);
}

async function writeRsvp(user, payload) {
  await setDoc(doc(db, "events", eventId, "rsvps", user.uid), {
    email: user.email,
    name: [payload.firstName, payload.lastName].filter(Boolean).join(" "),
    firstName: payload.firstName || "",
    lastName: payload.lastName || "",
    status: payload.status,
    guestCount: payload.guestCount,
    comment: payload.comment || "",
    respondedAt: serverTimestamp(),
  });
}

function reportRsvpError(err) {
  rsvpStatus.textContent =
    err.code === "permission-denied"
      ? "This link doesn't appear to be for your invite to this event."
      : "Couldn't save your RSVP: " + err.message;
  rsvpStatus.className = "status-msg error";
  rsvpStatus.hidden = false;
}

async function showSignedInForm(user) {
  showRsvpState(rsvpForm);

  const existing = await getDoc(doc(db, "events", eventId, "rsvps", user.uid));
  if (existing.exists()) {
    const data = existing.data();
    rsvpForm.status.value = data.status || "yes";
    rsvpForm.guestCount.value = data.guestCount || 1;
    rsvpForm.comment.value = data.comment || "";
    rsvpStatus.textContent = "RSVP saved. Thank you!";
    rsvpStatus.className = "status-msg success";
    rsvpStatus.hidden = false;
  }

  rsvpForm.onsubmit = async (ev) => {
    ev.preventDefault();
    rsvpStatus.hidden = true;
    const fd = new FormData(rsvpForm);
    const [firstName, ...rest] = (user.displayName || "").split(" ");
    try {
      await writeRsvp(user, {
        firstName: firstName || "",
        lastName: rest.join(" "),
        email: user.email,
        status: fd.get("status"),
        guestCount: Number(fd.get("guestCount")) || 1,
        comment: fd.get("comment") || "",
      });
      rsvpStatus.textContent = "RSVP saved. Thank you!";
      rsvpStatus.className = "status-msg success";
      rsvpStatus.hidden = false;
    } catch (err) {
      reportRsvpError(err);
    }
  };
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
