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
  own doc (`request.auth.uid == uid`), and only if the event is `isOpen` or
  their email is in that event's `invitees`. Reading the full collection
  (for the admin dashboard) is admin-only.
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
   doc, and clears the pending entry — the guest never has to fill anything
   in twice. If the write fails with `permission-denied` (email wasn't
   actually on that event's invite list), that's surfaced as a plain
   message instead of a raw Firebase error.
5. **Cross-device fallback**: if there's no local pending payload (e.g. the
   link was opened on a different device than the one that submitted the
   form), sign-in still completes; the guest just sees the normal
   already-signed-in RSVP form instead of an auto-filled one.

### "Email me a sign-in link" (returning users, any page)
Same `sendMagicLink`/`completeMagicLinkSignIn` pair, exposed as a form in
`auth-widget.js`'s signed-out state on every page (home, event, admin). No
pending-RSVP payload involved — just a plain sign-in.

### Setting a password after a passwordless sign-in
`auth-widget.js`'s signed-in state checks `hasPasswordProvider(user)`
(looks at `user.providerData`). If false, it shows a standing "Set a
password" control that calls `linkWithCredential` with an
`EmailAuthProvider` credential — adds password as an *additional* sign-in
method without touching the magic-link one.

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
