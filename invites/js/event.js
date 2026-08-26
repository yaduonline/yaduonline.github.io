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
const eventPhotoWrap = document.getElementById("event-photo-wrap");
const eventDetail = document.getElementById("event-detail");
const eventHost = document.getElementById("event-host");
const authSlotInline = document.getElementById("auth-slot-inline");
const authSlotBottom = document.getElementById("auth-slot-bottom");
const eventClosedHint = document.getElementById("event-closed-hint");
const quickRsvpForm = document.getElementById("quick-rsvp-form");
const quickRsvpSent = document.getElementById("quick-rsvp-sent");
const rsvpForm = document.getElementById("rsvp-form");
const rsvpStatus = document.getElementById("rsvp-status");
const guestListSection = document.getElementById("guest-list-section");
const guestList = document.getElementById("guest-list");
const signinToggleLink = document.getElementById("signin-toggle-link");

signinToggleLink.addEventListener("click", () => {
  authContainer.hidden = false;
  signinToggleLink.hidden = true;
});

const eventId = new URLSearchParams(location.search).get("id");
const pendingKey = eventId ? `pendingRsvp:${eventId}` : null;

let eventHasStarted = false;
let splitGuestsByAge = false;
let childAgeThreshold = null;
let eventDetailsPromise = Promise.resolve();

// Toggles each form between a single "Number of guests" field and separate
// Adults/Children fields, based on the event's splitGuestsByAge setting.
function applyGuestCountMode(form) {
  const generic = form.querySelector(".guest-count-generic");
  const split = form.querySelector(".guest-count-split");
  generic.hidden = splitGuestsByAge;
  generic.querySelector("input").required = !splitGuestsByAge;
  split.hidden = !splitGuestsByAge;
  split.querySelector('[name="adultCount"]').required = splitGuestsByAge;
  if (splitGuestsByAge) {
    form.querySelector(".child-count-label").firstChild.textContent =
      `Children (under ${childAgeThreshold}) `;
  }
}

// Reads guest-count fields from a submitted form according to the current
// mode. `guestCount` is always populated (as the adult+child total when
// split) so every downstream consumer - admin table/CSV, "Your RSVPs",
// "Who's coming" - keeps working whether or not an event uses the split.
function readGuestCounts(form) {
  if (!splitGuestsByAge) {
    return { guestCount: Number(form.guestCount.value) || 1 };
  }
  const adultCount = Number(form.adultCount.value) || 1;
  const childCount = Number(form.childCount.value) || 0;
  return { guestCount: adultCount + childCount, adultCount, childCount };
}

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
      // Signed out, the widget renders the sign-in forms, which belong next
      // to the toggle link that reveals them - so move it back up inline
      // (it may be sitting in the bottom slot from a previous signed-in
      // render on this same page load). Collapsed by default so those forms
      // don't dominate the page; the toggle link reveals authContainer (see
      // click handler above).
      authSlotInline.appendChild(authContainer);
      signinToggleLink.hidden = false;
      authContainer.hidden = true;
      if (eventHasStarted) {
        eventClosedHint.textContent = "This event has already happened. RSVP is closed.";
        showRsvpState(eventClosedHint);
      } else {
        showRsvpState(quickRsvpForm);
      }
      return;
    }
    // Signed in, the widget is just the compact status bar (name, admin
    // link, Sign out) - that goes at the very bottom, after the RSVP.
    authSlotBottom.appendChild(authContainer);
    signinToggleLink.hidden = true;
    authContainer.hidden = false;
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
  splitGuestsByAge = !!e.splitGuestsByAge;
  childAgeThreshold = e.childAgeThreshold ?? null;
  applyGuestCountMode(quickRsvpForm);
  applyGuestCountMode(rsvpForm);
  eventPhotoWrap.innerHTML = e.photoUrl
    ? `<img src="${escapeHtml(e.photoUrl)}" alt="" class="event-photo">`
    : "";
  // Title, then description, then when, then where - the order someone
  // reads an invite in. "Hosted by" is deliberately not here: it renders
  // into #event-host, below the RSVP forms.
  eventDetail.innerHTML = `
    <h2>${escapeHtml(e.title || "Untitled event")}</h2>
    ${e.description ? `<p>${escapeHtml(e.description)}</p>` : ""}
    ${date ? `<time>${escapeHtml(date.toLocaleString())}</time>` : ""}
    ${e.location ? `<p>${escapeHtml(e.location)}</p>` : ""}
  `;
  eventHost.textContent = e.hostName ? `Hosted by ${e.hostName}` : "";
  eventHost.hidden = !e.hostName;
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
    comment: fd.get("comment") || "",
    ...readGuestCounts(quickRsvpForm),
  };
  if (!payload.firstName && !payload.lastName) {
    errEl.textContent = "Enter your first name or last name.";
    errEl.hidden = false;
    return;
  }
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
    const payload = JSON.parse(pendingRaw);
    // Only apply this if it's really the continuation of the magic-link
    // flow that stashed it - i.e. the account that just signed in is the
    // same email the pending RSVP was for. Without this check, a stale
    // pending payload (an abandoned quick-RSVP whose email link was never
    // clicked) would get applied to whoever signs in next on this page by
    // any method, silently overwriting their real name.
    if ((user.email || "").toLowerCase() === (payload.email || "").toLowerCase()) {
      try {
        await applyProfileName(payload.firstName, payload.lastName);
        refreshAuthWidget(authContainer);
        await writeRsvp(user, payload);
      } catch (err) {
        await showSignedInForm(user);
        reportRsvpError(err);
        return;
      }
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
    adultCount: payload.adultCount ?? null,
    childCount: payload.childCount ?? null,
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

  // Shown read-only rather than collected - a signed-in RSVP is always
  // attributed to the account's own name/email (see writeRsvp() below and
  // its onsubmit handler), so these fields just let the guest confirm
  // who they're RSVPing as, not edit it.
  const { firstName, lastName } = splitDisplayName(user.displayName);
  rsvpForm.querySelector(".rsvp-first-name").value = firstName;
  rsvpForm.querySelector(".rsvp-last-name").value = lastName;
  rsvpForm.querySelector(".rsvp-email").value = user.email || "";

  if (existingData) {
    loadGuestList();
  }

  if (eventHasStarted) {
    eventClosedHint.textContent = existingData
      ? `This event has already happened. Your response: ${existingData.status}${describeGuestCount(existingData)}.`
      : "This event has already happened. RSVP is closed.";
    showRsvpState(eventClosedHint);
    return;
  }

  showRsvpState(rsvpForm);

  if (existingData) {
    rsvpForm.status.value = existingData.status || "yes";
    rsvpForm.guestCount.value = existingData.guestCount || 1;
    if (splitGuestsByAge) {
      rsvpForm.adultCount.value = existingData.adultCount || 1;
      rsvpForm.childCount.value = existingData.childCount || 0;
    }
    rsvpForm.comment.value = existingData.comment || "";
    rsvpStatus.textContent = "RSVP saved. Thank you!";
    rsvpStatus.className = "status-msg success";
    rsvpStatus.hidden = false;
  }

  rsvpForm.onsubmit = async (ev) => {
    ev.preventDefault();
    rsvpStatus.hidden = true;
    const fd = new FormData(rsvpForm);
    const { firstName, lastName } = splitDisplayName(user.displayName);
    try {
      await writeRsvp(user, {
        firstName,
        lastName,
        email: user.email,
        status: fd.get("status"),
        comment: fd.get("comment") || "",
        ...readGuestCounts(rsvpForm),
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

// Formats the guest-count portion of a status line, e.g. ", 2 guest(s)" or
// ", 2 adult(s), 1 child(ren)" when the event splits guests by age.
function describeGuestCount(r) {
  if (splitGuestsByAge && (r.adultCount != null || r.childCount != null)) {
    return `, ${r.adultCount ?? 0} adult(s), ${r.childCount ?? 0} child(ren)`;
  }
  return r.guestCount ? `, ${r.guestCount} guest(s)` : "";
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
        <div class="hint">${escapeHtml(r.status || "")}${escapeHtml(describeGuestCount(r))}</div>
      `;
      guestList.appendChild(li);
    });
  } catch (err) {
    guestList.innerHTML = `<li class="hint">Couldn't load responses: ${escapeHtml(err.message)}</li>`;
  }
}

// A signed-in user's account only stores one combined displayName, not
// separate first/last fields - this splits it on the first space for
// display/writing purposes wherever the RSVP flow needs both.
function splitDisplayName(displayName) {
  const [firstName, ...rest] = (displayName || "").split(" ");
  return { firstName: firstName || "", lastName: rest.join(" ") };
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
