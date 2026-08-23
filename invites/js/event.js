import { mountAuthWidget, refreshAuthWidget } from "./auth-widget.js";
import { db } from "./firebase-init.js";
import { sendMagicLink, applyProfileName } from "./auth.js";
import {
  doc,
  getDoc,
  getDocs,
  collection,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const authContainer = document.getElementById("auth-widget");
const notFoundHint = document.getElementById("not-found-hint");
const missingIdHint = document.getElementById("missing-id-hint");
const eventSection = document.getElementById("event-section");
const eventDetail = document.getElementById("event-detail");
const eventClosedHint = document.getElementById("event-closed-hint");
const quickRsvpForm = document.getElementById("quick-rsvp-form");
const quickRsvpSent = document.getElementById("quick-rsvp-sent");
const rsvpForm = document.getElementById("rsvp-form");
const rsvpStatus = document.getElementById("rsvp-status");
const guestListSection = document.getElementById("guest-list-section");
const guestList = document.getElementById("guest-list");

const eventId = new URLSearchParams(location.search).get("id");
const pendingKey = eventId ? `pendingRsvp:${eventId}` : null;

let eventHasStarted = false;
let eventDetailsPromise = Promise.resolve();

function showTopLevel(el) {
  [notFoundHint, missingIdHint, eventSection].forEach((e) => {
    e.hidden = e !== el;
  });
}

// Within event-section, exactly one of these is visible at a time.
function showRsvpState(el) {
  [quickRsvpForm, quickRsvpSent, rsvpForm, eventClosedHint].forEach((e) => {
    e.hidden = e !== el;
  });
}

if (!eventId) {
  showTopLevel(missingIdHint);
} else {
  eventDetailsPromise = loadEventDetails();
  mountAuthWidget(authContainer, async (user) => {
    await eventDetailsPromise;
    if (!user) {
      if (eventHasStarted) {
        eventClosedHint.textContent = "This event has already happened. RSVP is closed.";
        showRsvpState(eventClosedHint);
      } else {
        showRsvpState(quickRsvpForm);
      }
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
  eventHasStarted = !!date && date.getTime() < Date.now();
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
  const respondedAt = serverTimestamp();
  await setDoc(doc(db, "events", eventId, "rsvps", user.uid), {
    email: user.email,
    name: [payload.firstName, payload.lastName].filter(Boolean).join(" "),
    firstName: payload.firstName || "",
    lastName: payload.lastName || "",
    status: payload.status,
    guestCount: payload.guestCount,
    comment: payload.comment || "",
    respondedAt,
  });

  // Mirrored index so the signed-in user can find and edit this RSVP again
  // later without needing the original invite link (see "Your RSVPs" on
  // index.html). Firestore rules can't grant a signed-in user `list` on
  // events/*/rsvps directly (per-doc access there depends on event/invitee
  // content), so this denormalized per-user collection exists instead.
  const eventSnap = await getDoc(doc(db, "events", eventId));
  const e = eventSnap.exists() ? eventSnap.data() : {};
  await setDoc(doc(db, "userRsvps", user.uid, "items", eventId), {
    eventTitle: e.title || "Untitled event",
    eventDate: e.date || null,
    status: payload.status,
    guestCount: payload.guestCount,
    respondedAt,
  });
}

function reportRsvpError(err) {
  rsvpStatus.textContent =
    err.code === "permission-denied"
      ? "Couldn't save your RSVP - either this event has already happened, or this link isn't for your invite to it."
      : "Couldn't save your RSVP: " + err.message;
  rsvpStatus.className = "status-msg error";
  rsvpStatus.hidden = false;
}

async function showSignedInForm(user) {
  const existing = await getDoc(doc(db, "events", eventId, "rsvps", user.uid));
  const existingData = existing.exists() ? existing.data() : null;

  // Reset state from any previously-signed-in user on this same page load
  // (sign-out/sign-in doesn't navigate away, so stale content would
  // otherwise persist) before conditionally re-populating it below.
  rsvpForm.reset();
  rsvpStatus.hidden = true;
  guestListSection.hidden = true;
  guestList.innerHTML = "";

  if (existingData) {
    loadGuestList();
  }

  if (eventHasStarted) {
    eventClosedHint.textContent = existingData
      ? `This event has already happened. Your response: ${existingData.status}${existingData.guestCount ? `, ${existingData.guestCount} guest(s)` : ""}.`
      : "This event has already happened. RSVP is closed.";
    showRsvpState(eventClosedHint);
    return;
  }

  showRsvpState(rsvpForm);

  if (existingData) {
    rsvpForm.status.value = existingData.status || "yes";
    rsvpForm.guestCount.value = existingData.guestCount || 1;
    rsvpForm.comment.value = existingData.comment || "";
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
      loadGuestList();
    } catch (err) {
      reportRsvpError(err);
    }
  };
}

// Only visible to guests who've RSVP'd themselves (enforced in
// firestore.rules via hasRsvpd()) - shows name, response, and guest count
// for everyone who's responded. Deliberately omits email and comments,
// which are more personal and stay admin-only.
async function loadGuestList() {
  guestList.innerHTML = "<li>Loading...</li>";
  guestListSection.hidden = false;
  try {
    const snap = await getDocs(collection(db, "events", eventId, "rsvps"));
    const rsvps = snap.docs
      .map((d) => d.data())
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    if (rsvps.length === 0) {
      guestList.innerHTML = '<li class="hint">No responses yet.</li>';
      return;
    }
    guestList.innerHTML = "";
    rsvps.forEach((r) => {
      const li = document.createElement("li");
      li.innerHTML = `
        <strong>${escapeHtml(r.name || "Someone")}</strong>
        <div class="hint">${escapeHtml(r.status || "")}${r.guestCount ? `, ${r.guestCount} guest(s)` : ""}</div>
      `;
      guestList.appendChild(li);
    });
  } catch (err) {
    guestList.innerHTML = `<li class="hint">Couldn't load responses: ${escapeHtml(err.message)}</li>`;
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
