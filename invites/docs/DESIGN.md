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
                              ↳ Cloud Storage (one photo per event)
```

Same repo as the main site. `invites/` is the Firebase Hosting public root —
entirely separate deploy target from GitHub Pages (excluded from Pages via
the root `_config.yml`). No bundler: plain HTML + `<script type="module">`,
Firebase JS SDK loaded straight from `gstatic.com`. No backend/Cloud
Functions — everything is client SDK calls against Firebase Auth/Firestore,
authorized by Firestore Security Rules. The project runs on Firebase's
Blaze (pay-as-you-go) plan, required for Cloud Storage (event photos —
see "Deployment" below); actual usage should stay $0 given the app's
size caps and low expected traffic. Everything besides Storage would
still fit comfortably on the free Spark plan.

## Data model (Firestore)

- `users/{uid}` — `{ email, displayName, firstName, lastName, createdAt }`
- `events/{eventId}` — `{ title, description, date, location, hostName, isOpen, splitGuestsByAge, childAgeThreshold, photoUrl, createdBy, createdByUid, createdAt }`. `splitGuestsByAge` is a per-event opt-in; `childAgeThreshold` (a plain number, e.g. `13`) only means anything when it's `true`. `createdByUid` is the ownership field rules check; `createdBy` (the creator's email) is kept alongside it purely for display (event cards, "created by"). `photoUrl` is only present if a photo was uploaded - see "Event photos" below.
- `events/{eventId}/invitees/{lowercasedEmail}` — `{ name, maxGuests, invitedAt }` (owner/admin-managed guest list for invite-only events)
- `events/{eventId}/rsvps/{uid}` — `{ email, name, firstName, lastName, status: yes|no|maybe, guestCount, adultCount, childCount, comment, respondedAt }`. `guestCount` is always populated (as `adultCount + childCount` for events using the split) so every consumer that only cares about a total - CSV export's default header, `userRsvps`, older events predating this feature - keeps working unchanged; `adultCount`/`childCount` are `null` for events not using the split.
- `openEvents/{eventId}` — denormalized copy of **admin-created** `isOpen: true` events (title/date/location only), kept in sync by `createEvent()` in `events.js`. Exists purely so signed-in users can browse open events without a `list` query against `events` (Firestore rules can't grant `list` on a collection whose per-document access depends on document content). Deliberately admin-only, even though any user can create an open event now — see "Creating and owning events" in REQUIREMENTS.md for why.
- `userRsvps/{uid}/items/{eventId}` — `{ eventTitle, eventDate, status, guestCount, respondedAt }`, a per-user denormalized index written alongside every RSVP so a signed-in guest can see and revisit everything they've RSVP'd to (the "Your RSVPs" list on the homepage) without needing the original invite link again — same rationale as `openEvents`: Firestore rules can't grant `list` on `events/*/rsvps` scoped to "docs belonging to me" since that's a collection-group concern, but a plain per-uid collection like this one is trivially listable by its own path.
- `userEvents/{uid}/items/{eventId}` — `{ createdAt }`. The equivalent index for events a user *created* (powers "Your events" on `my-events.html`). Deliberately minimal - unlike `userRsvps`, it doesn't duplicate title/date/etc., since `events/{eventId}` `get` is already public; `my-events.js` just re-fetches the full doc per ID rather than risk a second, potentially-stale copy of the same fields.
- `eventCounts/{uid}` — `{ count, windowStart }`, one doc per user, the rolling-24h rate-limit counter for non-admin event creation. See "Rate-limited event creation" below.

## Security model (`firestore.rules`)

- **Admins**: a hardcoded email allowlist in the rules file (`isAdmin()`).
  No custom claims, no Cloud Functions — editing the allowlist requires a
  rules redeploy (`firebase deploy --only firestore:rules`).
- **`events/{eventId}` get**: public (`allow get: if true`) — the event's
  own descriptive fields are readable by anyone with the direct link, by
  design (see REQUIREMENTS.md). `list` stays admin-only, so events can't be
  enumerated without a link; regular users rely on `userEvents`/`userRsvps`
  instead (see below).
- **`events/{eventId}` create**: any signed-in user, not just admin. Must
  self-attribute (`createdByUid == request.auth.uid`,
  `createdBy == request.auth.token.email` — the client can't create an
  event "as" someone else), and if not admin, must pass
  `underDailyEventLimit()` (see "Rate-limited event creation" below).
- **`events/{eventId}` update/delete**: `isAdmin()` or
  `resource.data.createdByUid == request.auth.uid`. No UI calls this yet
  (no edit/delete button exists anywhere), but the rule already reflects
  "owners manage their own event" for whenever that UI gets built.
- **`invitees` subcollection**: `isAdmin()` or `isEventOwner(eventId)` (a
  `get()` on the parent event's `createdByUid`) — never exposed to guests;
  a guest can't tell who else is invited or check membership directly,
  access is inferred server-side via `isInvited()`.
- **`rsvps` subcollection**: a signed-in user can create/update only their
  own doc (`request.auth.uid == uid`), and only if (`isRsvpAllowed()`): the
  event is `isOpen` or their email is in that event's `invitees`, **and**
  the event's `date` is either unset or still in the future
  (`event.date > request.time`) — this is what actually closes RSVPs once
  an event starts; the client also hides the form at that point, but this
  rule is what makes it real. `list` (reading everyone's response) is
  allowed for admins, the event's owner (`isEventOwner()`), **or** anyone
  who's RSVP'd themselves (`hasRsvpd()`, an `exists()` check on their own
  doc at a fixed path — content-independent, so it's a valid `list`
  condition, same reasoning as `isAdmin()`). The last one is the "Who's
  coming" feature: RSVPing unlocks seeing everyone else's response on that
  event, not just your own.
- **`userRsvps/{uid}/items/{eventId}`** and **`userEvents/{uid}/items/{eventId}`**:
  readable/writable only by that uid (`request.auth.uid == uid`) — this
  check is on a path segment, not document content, so unlike
  `events`/`rsvps` it's a plain, always-safe `list` grant.
- **`eventCounts/{uid}`**: caller can only touch their own doc; see
  "Rate-limited event creation" below for the increment/reset rule.
- **`users/{uid}`**: readable/writable by that user or an admin.

## Storage security model (`storage.rules`)
A separate rules engine from Firestore (its own file, deployed with
`firebase deploy --only storage`), so nothing above is shared with it
automatically:
- `eventPhotos/{eventId}/{ownerUid}/{fileName}`: `read` is public, same
  reasoning as `events/{eventId}` `get` in Firestore. `write` requires the
  caller to be signed in and either on the same hardcoded admin allowlist
  (duplicated here by necessity - Storage rules can't call a Firestore
  rules function - and must be kept in sync by hand if it ever changes)
  or `request.auth.uid == ownerUid`, a plain path-segment check. Ownership
  is embedded in the *path* rather than checked via `firestore.get()`
  against `events/{eventId}.createdByUid`: an early version tried the
  cross-service lookup and it worked in the Firebase Rules Playground but
  reliably failed (`Null value error`) against the local Storage
  emulator's cross-service `firestore.get()`, even though the referenced
  document genuinely existed with the right data - a self-contained path
  check sidesteps that fragility entirely (and is simpler to reason
  about besides). `uploadEventPhoto()` in `events.js` builds the path from
  `auth.currentUser.uid` at upload time, which is always the event's own
  creator (photo upload only ever happens inline during `createEvent()`).
  Also caps `request.resource.size` under 5MB and requires `image/*`
  `contentType`, as defense in depth behind the client-side resize (see
  below).

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
whether to show the standing "Set a password" control - except for Google
sign-in, which is checked first via `user.providerData` (reliably reports
`providerId: "google.com"`, unlike the password/email-link ambiguity
above) and skips the `hasPassword` lookup entirely. A Google account is
already a complete, independent credential, so "you're passwordless, add
a password" never applies to it - `signInWithGoogle()` never sets
`hasPassword`, so without this check a Google user would incorrectly be
shown the prompt every time.

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

### Who's coming
`event.js`'s `loadGuestList()` runs whenever the signed-in user has an
existing RSVP for this event (checked right after loading/saving their own
response) — a plain `getDocs` over `events/{id}/rsvps`, allowed by the
`hasRsvpd()` rule above. Renders name + status + guest count only (adult/
child breakdown instead, for events using that split - see below); email
and comment are deliberately left out of this view (they're for admins,
via the dashboard's RSVP table/CSV export, not for other guests).

### Splitting guests into adults & children
Purely a per-event flag (`events/{id}.splitGuestsByAge` +
`childAgeThreshold`), set on the admin's create-event form
([admin.html](../admin.html)/[js/admin.js](../js/admin.js)) - no rules
change needed since it's just more fields on documents already governed by
the existing admin/owner rules.

`event.js` loads it alongside the rest of the event doc in
`loadEventDetails()` and calls `applyGuestCountMode()` for both the quick
and signed-in RSVP forms, which toggles between two mutually-exclusive
field groups already present in `event.html` (`.guest-count-generic` = the
original single "Number of guests" input, `.guest-count-split` = separate
Adults/Children inputs) rather than building either variant dynamically.
`readGuestCounts(form)` is the single place that turns whichever fields are
active into the RSVP payload — always including a `guestCount` total (the
adult+child sum when split), so `writeRsvp()`, the `userRsvps` mirror, and
anything else that only wants a headcount don't need to know which mode an
event is in. `describeGuestCount()` is the equivalent for *display* (event-
closed message, "Who's coming"), picking adult/child wording only when both
the event is split-mode and the RSVP actually has that data (so older
RSVPs from before this feature, or non-split events, still render fine).

`events.js`'s shared `renderEventCard()` (used by both `admin.js` and
`my-events.js` - see below) does the same per-event branch for the RSVP
table and CSV export: an Adults/Children column pair instead of a single
Guests column, and a different CSV header list, chosen from
`event.splitGuestsByAge` each time a card is rendered.

### Any user can create and own events
Extracted into a shared module, **`invites/js/events.js`**, imported by
both `admin.js` and the new `my-events.js` so the "manage your own event"
UI (invitee add/remove, RSVP table, CSV export) is *identical* to admin's
by construction, not a parallel reimplementation:
- `renderEventCard(id, e)` — the event card (invite link, invitee
  management, RSVP table/CSV, split-guest-aware) that both pages render
  into their event list. Access to what its buttons can actually do is
  entirely governed by the rules above (`isAdmin()` vs `isEventOwner()`),
  not by which page rendered it - the same button code just succeeds or
  fails differently depending on who's clicking it.
- `loadInvitees()`, `downloadCsv()` — helpers used by the card, also moved
  here so they're not duplicated between the two pages.
- `createEvent(data)` — see below.

`admin.js` keeps its `isAdminUser()` gate and its `events` collection
`list` query (admin-only, unchanged) — it just renders cards and creates
events via the shared functions now instead of inline logic.

`my-events.js` (new) gates on **any signed-in user**. It queries
`userEvents/{uid}/items` for the list of event IDs the user created,
`getDoc`s each one for full data, and renders each via the same
`renderEventCard()`.

### Rate-limited event creation
`createEvent()` in `events.js` is the single place events get written.
For an admin, it's a plain `setDoc` — no limit, no counter ever touched.
For anyone else, it wraps the write in a Firestore `runTransaction`
against `eventCounts/{uid}`:
1. Read the counter. If it doesn't exist, or the existing window has
   expired (`now - windowStart > 24h`), this is a fresh window: write
   `count: 1`.
2. Otherwise, if `count >= 10`, throw a friendly error client-side before
   ever attempting the write (fast feedback, no round trip needed to know
   you're capped).
3. Otherwise increment `count` by 1, keeping the same `windowStart`.
4. Write the event doc and the counter update in the same transaction.

The transaction is what makes this race-free under concurrent submissions
(a plain "read-then-write" from two tabs could otherwise both pass a
stale check) - Firestore transactions guarantee the read and both writes
are atomic and see a consistent snapshot. The client-side check above is
just a fast path for a good error message; the *real* boundary is
`underDailyEventLimit()` in `firestore.rules`, which independently
re-checks the same counter doc and would reject the write even if a
client skipped or lied about the pre-check (verified by calling `addDoc`
directly, bypassing `createEvent()`, in testing).

A rolling 24h window rather than a calendar day: Firestore rules can't
format `request.time` into a date string, so there's no clean way to
validate a client-supplied "YYYY-MM-DD" key server-side. A single
per-user counter with a rolling window sidesteps that entirely and is
arguably more correct anyway.

`createEvent()` always also writes the `userEvents/{uid}/items/{eventId}`
marker (both admin and non-admin), and — **only when the caller is admin
and the event is `isOpen`** — the `openEvents` mirror, matching the
browse-feed decision in REQUIREMENTS.md.

### Event photos
`resizeImage()` in `events.js` downscales the chosen file client-side
before it ever leaves the browser (`<canvas>`, longest side capped at
1600px, re-encoded as JPEG at 0.82 quality) - this is what makes
"reasonably sized" real regardless of the original phone-camera file size,
not just the 5MB `storage.rules` cap. `uploadEventPhoto(eventId, ownerUid, file)`
uploads the resized blob to a fixed path,
`eventPhotos/{eventId}/{ownerUid}/photo.jpg` - one photo per event, so
re-uploading (no UI for that yet, but the path scheme already supports
it) simply overwrites. `ownerUid` is part of the path so `storage.rules`
can authorize the write with a plain path-segment check - see "Storage
security model" above.

`createEvent()` uploads the photo (if given) *after* the event doc is
written, purely so it can attach the resulting `photoUrl` back onto that
doc via `updateDoc` in the same call. A photo-upload failure doesn't undo
the event creation; it's reported back as `photoError` on the return
value so `admin.js`/`my-events.js` can show it as a non-fatal warning
("Event created, but the photo couldn't be uploaded: ...") rather than
implying the whole submission failed.

`photoUrl` (a Firebase Storage download URL, which embeds its own access
token) is stored directly on the event doc once upload succeeds, and
rendered as an `<img>` wherever event data already gets displayed:
`event.js`'s `loadEventDetails()` (the main event page) and `events.js`'s
shared `renderEventCard()` (admin/owner management cards). Not currently
shown in the more compact "Your RSVPs"/"Open events" list items on the
homepage - could be added the same way if wanted later.

## File map

- `invites/index.html` / `js/app.js` — home: auth widget, "Your RSVPs",
  open-events list (admin-created open events only), link to `my-events.html`.
- `invites/event.html` / `js/event.js` — event details (public) + RSVP
  (quick or signed-in form); sign-in is collapsed behind a small toggle
  link for signed-out visitors (see "Event page layout" below).
- `invites/admin.html` / `js/admin.js` — admin dashboard: every event from
  every creator, full management, no creation limit.
- `invites/my-events.html` / `js/my-events.js` — any signed-in user: create
  events (rate-limited if non-admin) and manage the ones they created.
- `invites/js/events.js` — shared event creation/rendering logic used by
  both dashboard pages (see "Any user can create and own events" above).
- `invites/js/auth.js` — all Firebase Auth calls (sign up/in/out, Google, magic link, password linking) + the `users/{uid}` doc sync.
- `invites/js/auth-widget.js` — the shared sign-in/sign-up/magic-link/"set a password" UI component, mounted on all pages.
- `invites/js/firebase-init.js` / `firebase-config.js` — SDK init; auto-connects to the local emulator suite on `localhost`/`127.0.0.1`.
- `invites/styles.css` — self-contained stylesheet (not shared with the main site's `style.css` — different origin/deploy target).
- `firestore.rules`, `firestore.indexes.json`, `storage.rules`, `firebase.json`, `.firebaserc` — Firebase project config, at repo root (not under `invites/`) since they configure the whole Firebase project, not just the hosted files.

## Event page layout
On `event.html` (only - `index.html`/`admin.html`/`my-events.html` keep
the widget prominent, since being signed-in-focused makes sense there),
`#auth-widget` moved out of its old top-of-`<main>` position to sit
*inside* `#event-section`, after the event details. For a signed-out
visitor it starts `hidden`, with a small "Sign in for quick RSVP"
(`#signin-toggle-link`) button revealing it on click - can't nest it
inside the `quick-rsvp-form` `<form>` itself, since `auth-widget.js`
renders its own `<form>` elements for sign-in/sign-up, and nested forms
aren't valid HTML. Once signed in, the toggle link hides and
`#auth-widget` (now just the compact "Signed in as X / Sign out" bar)
shows directly - no `auth-widget.js` changes needed, `event.js`'s
`mountAuthWidget` callback just toggles which one is visible based on the
same signed-in/out state it already branches on.

## Deployment

- `.github/workflows/firebase-deploy.yml` deploys Hosting + Firestore rules
  + Storage rules on push to `main` touching `invites/**`, `firebase.json`,
  `firestore.rules`, or `storage.rules`, using a `FIREBASE_SERVICE_ACCOUNT`
  + `FIREBASE_PROJECT_ID` GitHub secret pair.
- **The project has to be on the Blaze (pay-as-you-go) plan for Storage to
  work**, set up once in the Firebase console (Usage and billing → Modify
  plan → Blaze), with Cloud Storage itself enabled after that (Build →
  Storage → "Get started"). Unlike Firestore/Auth, Google requires a
  linked billing account to use Cloud Storage for Firebase at all - even
  a brand-new project on the free Spark plan can't provision a default
  Storage bucket without upgrading first (a change from late 2024).
  Actual cost should stay $0 given this app's usage (5MB hard cap per
  photo, client-side resize to ~1600px JPEG, one photo per event) - it's
  a Google requirement to *use* Storage, not a cost driver by itself -
  but it does remove Spark's hard $0 ceiling, so a billing budget alert
  is worth setting. Nothing in this repo can do either of these steps;
  the emulator doesn't need them.
- Local dev/testing: `firebase emulators:start` (Auth + Firestore +
  Storage + Hosting, see `firebase.json`'s `emulators` block) — no cloud
  project needed to develop against.
- `playwright.invites.config.js` runs `tests/invites.spec.js` against a
  plain static server rooted at `invites/` (matches the Hosting public
  root, so absolute paths like `/styles.css` resolve the same way locally
  and in production).
