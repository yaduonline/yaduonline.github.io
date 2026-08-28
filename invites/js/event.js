import { mountAuthWidget, refreshAuthWidget } from "./auth-widget.js";
import { db } from "./firebase-init.js";
import { sendMagicLink, applyProfileName, isAdminUser } from "./auth.js";
import { summarizeRsvps, describeTotals } from "./rsvp-summary.js";
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
const quickRsvpDone = document.getElementById("quick-rsvp-done");
const rsvpForm = document.getElementById("rsvp-form");
const rsvpStatus = document.getElementById("rsvp-status");
const guestListSection = document.getElementById("guest-list-section");
const guestList = document.getElementById("guest-list");
const guestTotal = document.getElementById("guest-total");
const signinToggleLink = document.getElementById("signin-toggle-link");

signinToggleLink.addEventListener("click", () => {
  authContainer.hidden = false;
  signinToggleLink.hidden = true;
});

const eventId = new URLSearchParams(location.search).get("id");
const pendingKey = eventId ? `pendingRsvp:${eventId}` : null;

let eventHasStarted = false;
let eventIsOpen = false;
let eventCreatedByUid = null;
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
  [quickRsvpForm, quickRsvpSent, quickRsvpDone, rsvpForm, eventClosedHint].forEach((e) => {
    e.hidden = e !== el;
  });
}

function revealSignIn() {
  authContainer.hidden = false;
  signinToggleLink.hidden = true;
  authContainer.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

document.getElementById("post-rsvp-signin-link").addEventListener("click", revealSignIn);

if (!eventId) {
  showTopLevel(missingIdHint);
} else {
  eventDetailsPromise = loadEventDetails();
  mountAuthWidget(authContainer, async (user, { magicLinkError } = {}) => {
    await eventDetailsPromise;
    if (magicLinkError) {
      const errEl = quickRsvpForm.querySelector(".error");
      errEl.textContent =
        "That sign-in link didn't work - it may have expired or already been used. Please submit the form again to get a fresh one.";
      errEl.hidden = false;
    }
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
  eventIsOpen = e.isOpen === true;
  eventCreatedByUid = e.createdByUid || null;
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
  document.getElementById("quick-rsvp-hint").textContent = eventIsOpen
    ? "No account needed - your RSVP is saved as soon as you submit."
    : "We'll email you a link to confirm it's really you - no password needed.";
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
  // Open events accept a first RSVP with no account at all - the whole
  // point being that a guest hits no wall before responding. Invite-only
  // events still go through the magic link, because their gate is "is your
  // address on the invite list", which is meaningless unless the address is
  // actually verified (firestore.rules enforces the same split).
  if (!eventIsOpen) {
    try {
      localStorage.setItem(pendingKey, JSON.stringify(payload));
      await sendMagicLink(payload.email);
      showRsvpState(quickRsvpSent);
    } catch (err) {
      localStorage.removeItem(pendingKey);
      errEl.textContent = err.message;
      errEl.hidden = false;
    }
    return;
  }

  try {
    await writeRsvp(payload, null);
    showRsvpState(quickRsvpDone);
  } catch (err) {
    // The rules only apply `create` when no document exists for this
    // address, so a denial here is - on an open, not-yet-started event
    // whose payload we built ourselves - an existing RSVP for this email.
    if (err.code === "permission-denied") {
      errEl.textContent =
        `There's already an RSVP for ${payload.email}. Sign in with that address to change it.`;
      errEl.hidden = false;
      revealSignIn();
    } else {
      errEl.textContent = "Couldn't save your RSVP: " + err.message;
      errEl.hidden = false;
    }
  }
});

async function handleSignedIn(user) {
  const pendingRaw = localStorage.getItem(pendingKey);
  if (pendingRaw) {
    localStorage.removeItem(pendingKey);
    // Parsing is inside the try alongside the writes: a malformed or
    // stale-schema payload must not throw out of this callback, or the
    // RSVP form never renders at all and the page looks broken.
    try {
      const payload = JSON.parse(pendingRaw);
      // Only apply this if it's really the continuation of the magic-link
      // flow that stashed it - i.e. the account that just signed in is the
      // same email the pending RSVP was for. Without this check, a stale
      // pending payload (an abandoned quick-RSVP whose email link was never
      // clicked) would get applied to whoever signs in next on this page by
      // any method, silently overwriting their real name.
      if ((user.email || "").toLowerCase() === (payload.email || "").toLowerCase()) {
        await applyProfileName(payload.firstName, payload.lastName);
        refreshAuthWidget(authContainer);
        await writeRsvp(payload, user);
      }
    } catch (err) {
      await showSignedInForm(user);
      reportRsvpError(err);
      return;
    }
  }
  await showSignedInForm(user);
}

// Writes (or overwrites) the RSVP for `payload.email`. `user` is the signed-in
// account when there is one, and null for a no-account RSVP on an open event -
// it only affects the personal "Your RSVPs" index, which needs a uid to hang
// off. The RSVP document itself is keyed by lowercased email either way, so
// the same person gets the same row whether or not they ever sign in, and
// firestore.rules can treat "one RSVP per address" as a plain create/update
// distinction.
async function writeRsvp(payload, user) {
  const email = payload.email.trim();
  const emailKey = email.toLowerCase();
  const respondedAt = serverTimestamp();
  await setDoc(doc(db, "events", eventId, "rsvps", emailKey), {
    email,
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

  if (!user) return;

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

// Writes the userRsvps index entry if it's missing. Only matters for RSVPs
// created without an account, which couldn't write it at the time; a normal
// signed-in save writes it inline (see writeRsvp). Best-effort - a failure
// here only costs a homepage listing, so it must never break the page.
async function ensureUserRsvpIndex(user, rsvp) {
  try {
    const indexRef = doc(db, "userRsvps", user.uid, "items", eventId);
    if ((await getDoc(indexRef)).exists()) return;
    const eventSnap = await getDoc(doc(db, "events", eventId));
    const e = eventSnap.exists() ? eventSnap.data() : {};
    await setDoc(indexRef, {
      eventTitle: e.title || "Untitled event",
      eventDate: e.date || null,
      status: rsvp.status,
      guestCount: rsvp.guestCount,
      respondedAt: rsvp.respondedAt || serverTimestamp(),
    });
  } catch (err) {
    console.warn("Could not backfill the Your-RSVPs index:", err);
  }
}

function reportRsvpError(err) {
  rsvpStatus.textContent =
    err.code === "permission-denied"
      ? "Couldn't save your RSVP - either this event has already happened, or it's invite-only and this address isn't on its guest list."
      : "Couldn't save your RSVP: " + err.message;
  rsvpStatus.className = "status-msg error";
  rsvpStatus.hidden = false;
}

async function showSignedInForm(user) {
  // Keyed by their verified address, so signing in picks up an RSVP they
  // made earlier without an account (see writeRsvp).
  const emailKey = (user.email || "").toLowerCase();
  const existing = await getDoc(doc(db, "events", eventId, "rsvps", emailKey));
  const existingData = existing.exists() ? existing.data() : null;

  // Reset state from any previously-signed-in user on this same page load
  // (sign-out/sign-in doesn't navigate away, so stale content would
  // otherwise persist) before conditionally re-populating it below.
  rsvpForm.reset();
  rsvpStatus.hidden = true;
  guestListSection.hidden = true;
  guestList.innerHTML = "";

  // Shown read-only rather than collected - a signed-in RSVP is always
  // attributed to the account's own name/email, so these fields just let
  // the guest confirm who they're RSVPing as, not edit it.
  //
  // An account created *after* a no-account RSVP has no displayName yet
  // (nobody ever typed a name into a signup form), so fall back to the name
  // already on the RSVP. Without this, signing in to tweak an answer would
  // silently blank out the name the guest originally gave.
  const fromAccount = splitDisplayName(user.displayName);
  const firstName = fromAccount.firstName || existingData?.firstName || "";
  const lastName = fromAccount.lastName || existingData?.lastName || "";
  rsvpForm.querySelector(".rsvp-first-name").value = firstName;
  rsvpForm.querySelector(".rsvp-last-name").value = lastName;
  rsvpForm.querySelector(".rsvp-email").value = user.email || "";

  // Adopt that name onto the account itself so it's coherent everywhere
  // else (auth widget, future events) rather than only on this RSVP.
  if (!user.displayName && (firstName || lastName)) {
    applyProfileName(firstName, lastName)
      .then(() => refreshAuthWidget(authContainer))
      .catch((err) => console.warn("Could not apply profile name:", err));
  }

  if (existingData) {
    loadGuestList(user);
    // An RSVP made without an account couldn't write the personal index
    // (no uid to hang it off). Now that they've signed in, backfill it so
    // the event shows up under "Your RSVPs" on the homepage.
    ensureUserRsvpIndex(user, existingData);
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
    try {
      await writeRsvp({
        // Resolved above - account name, falling back to the name already
        // on the RSVP for accounts created after a no-account response.
        firstName,
        lastName,
        email: user.email,
        status: fd.get("status"),
        comment: fd.get("comment") || "",
        ...readGuestCounts(rsvpForm),
      }, user);
      rsvpStatus.textContent = "RSVP saved. Thank you!";
      rsvpStatus.className = "status-msg success";
      rsvpStatus.hidden = false;
      loadGuestList(user);
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
async function loadGuestList(user) {
  guestList.innerHTML = "<li>Loading...</li>";
  guestListSection.hidden = false;
  guestTotal.hidden = true;
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

    // Running total, for the person actually catering the event. Every guest
    // can already see each individual response here, so this is a
    // presentation choice rather than a privacy boundary - it keeps the
    // guest-facing view about who's coming, not about headcount management.
    if (user && (isAdminUser(user) || user.uid === eventCreatedByUid)) {
      guestTotal.textContent = `Total: ${describeTotals(summarizeRsvps(rsvps), splitGuestsByAge)}`;
      guestTotal.hidden = false;
    }
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
