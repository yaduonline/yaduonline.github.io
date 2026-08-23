# Invites — Design

Living document. Update this whenever the implementation changes — it
describes how the app currently works, not a history of how it got there.
See [REQUIREMENTS.md](./REQUIREMENTS.md) for the what/why.

## Architecture

```
www.yaduonline.com        → GitHub Pages (unchanged: games, blog, etc.)
invites.yaduonline.com    → Firebase Hosting, serving invites/ (static HTML/JS/CSS)
                              ↳ Firebase Auth (email/password, Google, email-link)
                              ↳ Firestore (events, invitees, rsvps, users, openEvents)
```

Same repo as the main site. `invites/` is the Firebase Hosting public root —
entirely separate deploy target from GitHub Pages (excluded from Pages via
the root `_config.yml`). No bundler: plain HTML + `<script type="module">`,
Firebase JS SDK loaded straight from `gstatic.com`. No backend/Cloud
Functions — everything is client SDK calls against Firebase Auth/Firestore,
authorized by Firestore Security Rules. This keeps the whole app on
Firebase's free Spark plan.

## Data model (Firestore)

- `users/{uid}` — `{ email, displayName, firstName, lastName, createdAt }`
- `events/{eventId}` — `{ title, description, date, location, hostName, isOpen, createdBy, createdAt }`
- `events/{eventId}/invitees/{lowercasedEmail}` — `{ name, maxGuests, invitedAt }` (admin-managed guest list for invite-only events)
- `events/{eventId}/rsvps/{uid}` — `{ email, name, firstName, lastName, status: yes|no|maybe, guestCount, comment, respondedAt }`
- `openEvents/{eventId}` — denormalized copy of `isOpen: true` events (title/date/location only), kept in sync by `admin.js` whenever an open event is created. Exists purely so signed-in users can browse open events without a `list` query against `events` (Firestore rules can't grant `list` on a collection whose per-document access depends on document content).
- `userRsvps/{uid}/items/{eventId}` — `{ eventTitle, eventDate, status, guestCount, respondedAt }`, a per-user denormalized index written alongside every RSVP so a signed-in guest can see and revisit everything they've RSVP'd to (the "Your RSVPs" list on the homepage) without needing the original invite link again — same rationale as `openEvents`: Firestore rules can't grant `list` on `events/*/rsvps` scoped to "docs belonging to me" since that's a collection-group concern, but a plain per-uid collection like this one is trivially listable by its own path.

## Security model (`firestore.rules`)

- **Admins**: a hardcoded email allowlist in the rules file (`isAdmin()`).
  No custom claims, no Cloud Functions — editing the allowlist requires a
  rules redeploy (`firebase deploy --only firestore:rules`).
- **`events/{eventId}` get**: public (`allow get: if true`) — the event's
  own descriptive fields are readable by anyone with the direct link, by
  design (see REQUIREMENTS.md). `list` stays admin-only, so events can't be
  enumerated without a link.
- **`invitees` subcollection**: admin-only read/write. Never exposed to
  guests — a guest can't tell who else is invited or check membership
  directly; access is inferred server-side via `isInvited()`.
- **`rsvps` subcollection**: a signed-in user can create/update only their
  own doc (`request.auth.uid == uid`), and only if (`isRsvpAllowed()`): the
  event is `isOpen` or their email is in that event's `invitees`, **and**
  the event's `date` is either unset or still in the future
  (`event.date > request.time`) — this is what actually closes RSVPs once
  an event starts; the client also hides the form at that point, but this
  rule is what makes it real. Reading the full collection (for the admin
  dashboard) is admin-only.
- **`userRsvps/{uid}/items/{eventId}`**: readable/writable only by that uid
  (`request.auth.uid == uid`) — this check is on a path segment, not
  document content, so unlike `events`/`rsvps` it's a plain, always-safe
  `list` grant.
- **`users/{uid}`**: readable/writable by that user or an admin.

## Auth flows

Firebase Auth supports multiple sign-in methods per account simultaneously
(password, Google, email-link can all coexist on one account) — the design
below leans on that instead of building any custom state machine.

### Quick RSVP (first-time guest, no account yet)
1. `event.html` loads event details via a public `get` (no auth needed) and
   shows a "quick RSVP" form (first/last name, email, RSVP fields) whenever
   the visitor isn't signed in.
2. On submit: the payload is stashed in `localStorage` under
   `pendingRsvp:<eventId>`, and `sendMagicLink(email)` (in
   [js/auth.js](../js/auth.js)) calls Firebase's `sendSignInLinkToEmail`
   with `url: window.location.href` — so the emailed link returns to this
   exact event page, query params and all. No Firestore write happens yet
   (can't — not authenticated).
3. Clicking the emailed link reloads `event.html?id=...&mode=signIn&oobCode=...`.
   `auth-widget.js`'s `mountAuthWidget` calls `completeMagicLinkSignIn()`
   *before* wiring up the auth-state listener, so the very first render
   already reflects the signed-in state. That function (in `auth.js`)
   detects the callback via `isSignInWithEmailLink`, signs in via
   `signInWithEmailLink`, cleans the auth params off the URL, and clears the
   `emailForSignIn` localStorage key.
4. Back in `event.js`'s auth-state callback: it looks for the
   `pendingRsvp:<eventId>` entry. If found, it applies the given name to the
   (possibly brand-new) account via `applyProfileName()`, writes the RSVP
   doc (`writeRsvp()`, which also mirrors a summary into
   `userRsvps/{uid}/items/{eventId}` — see Data model), and clears the
   pending entry — the guest never has to fill anything in twice. If the
   write fails with `permission-denied` (email wasn't actually on that
   event's invite list, or the event has already started), that's surfaced
   as a plain message instead of a raw Firebase error.
5. **Cross-device fallback**: if there's no local pending payload (e.g. the
   link was opened on a different device than the one that submitted the
   form), sign-in still completes; the guest just sees the normal
   already-signed-in RSVP form instead of an auto-filled one.

### "Email me a sign-in link" (returning users, any page)
Same `sendMagicLink`/`completeMagicLinkSignIn` pair, exposed as a form in
`auth-widget.js`'s signed-out state on every page (home, event, admin). No
pending-RSVP payload involved — just a plain sign-in.

### Setting a password after a passwordless sign-in
`user.providerData` reports `providerId: "password"` for **both**
password-based *and* email-link-based sign-in (a documented Firebase
quirk) — so it can't be used to tell whether a real password exists, and
`fetchSignInMethodsForEmail` is unreliable if a project has Email
Enumeration Protection on. So this is tracked explicitly instead: a
`hasPassword: true` field on `users/{uid}`, set by `signUpWithEmail`,
`signInWithEmail`, and `setPassword`. `auth-widget.js`'s signed-in render
does a `getDoc` on that field (`hasPassword(uid)` in `auth.js`) to decide
whether to show the standing "Set a password" control.

`setPassword()` tries `linkWithCredential` first; because of the same
provider-sharing quirk, that call fails with `auth/provider-already-linked`
for anyone who signed in via email-link (the "password" slot is already
occupied even though no real password exists yet) — the fallback in that
case is `updatePassword()`, which sets the password on the existing slot
instead of trying to add a new one. Either way, the magic-link sign-in
method keeps working afterward — Firebase doesn't remove it.

Because `onAuthStateChanged` only fires on sign-in/out transitions (not
when a signed-in user's profile fields change), anything that mutates the
current user outside of that listener firing again — `signUpWithEmail`,
`applyProfileName` after a quick-RSVP — calls `refreshAuthWidget()`
afterward to force the widget to re-render with fresh data instead of
waiting on a listener that won't re-fire for that change.

### "Your RSVPs" list and RSVP editing
`app.js` queries `userRsvps/{uid}/items` (ordered by `respondedAt desc`) for
the signed-in user and renders it on the homepage, each entry linking to
that event. There's no separate edit UI: `event.js`'s signed-in RSVP form is
always the same form whether it's a first response or a change — it
pre-fills from the existing `rsvps/{uid}` doc if one exists, and saving
just overwrites it (`writeRsvp()`). The only thing that changes this is
`isRsvpAllowed()`'s date check (see Security model) — once
`event.date` is in the past, `event.js` shows a closed message instead of
the form at all (checked client-side via `eventHasStarted`, computed once
in `loadEventDetails()` and awaited by the auth-state callback before it
decides what to render, so there's no race between the two async loads).

## File map

- `invites/index.html` / `js/app.js` — home: auth widget + open-events list.
- `invites/event.html` / `js/event.js` — event details (public) + RSVP (quick or signed-in form).
- `invites/admin.html` / `js/admin.js` — admin dashboard: create events, manage invitees, view/export RSVPs.
- `invites/js/auth.js` — all Firebase Auth calls (sign up/in/out, Google, magic link, password linking) + the `users/{uid}` doc sync.
- `invites/js/auth-widget.js` — the shared sign-in/sign-up/magic-link/"set a password" UI component, mounted on all three pages.
- `invites/js/firebase-init.js` / `firebase-config.js` — SDK init; auto-connects to the local emulator suite on `localhost`/`127.0.0.1`.
- `invites/styles.css` — self-contained stylesheet (not shared with the main site's `style.css` — different origin/deploy target).
- `firestore.rules`, `firestore.indexes.json`, `firebase.json`, `.firebaserc` — Firebase project config, at repo root (not under `invites/`) since they configure the whole Firebase project, not just the hosted files.

## Deployment

- `.github/workflows/firebase-deploy.yml` deploys Hosting + Firestore rules
  on push to `main` touching `invites/**`, `firebase.json`, or
  `firestore.rules`, using a `FIREBASE_SERVICE_ACCOUNT` + `FIREBASE_PROJECT_ID`
  GitHub secret pair.
- Local dev/testing: `firebase emulators:start` (Auth + Firestore + Hosting,
  see `firebase.json`'s `emulators` block) — no cloud project needed to
  develop against.
- `playwright.invites.config.js` runs `tests/invites.spec.js` against a
  plain static server rooted at `invites/` (matches the Hosting public
  root, so absolute paths like `/styles.css` resolve the same way locally
  and in production).
