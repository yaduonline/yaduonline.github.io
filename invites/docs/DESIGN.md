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
                              ↳ Cloud Functions (RSVP confirmation emails)
```

Same repo as the main site. `invites/` is the Firebase Hosting public root —
entirely separate deploy target from GitHub Pages (excluded from Pages via
the root `_config.yml`). No bundler: plain HTML + `<script type="module">`,
Firebase JS SDK loaded straight from `gstatic.com`. The site itself is
still entirely client SDK calls against Firebase Auth/Firestore/Storage,
authorized by security rules — the one piece of server-side code is a
single Cloud Function that sends RSVP emails (see "RSVP emails" below),
which nothing in the browser calls directly. The project runs on Firebase's
Blaze (pay-as-you-go) plan, required for Cloud Storage (event photos —
see "Deployment" below); actual usage should stay $0 given the app's
size caps and low expected traffic. Everything besides Storage would
still fit comfortably on the free Spark plan.

## Data model (Firestore)

- `users/{uid}` — `{ email, displayName, firstName, lastName, createdAt }`
- `events/{eventId}` — `{ title, description, date, location, hostName, isOpen, splitGuestsByAge, childAgeThreshold, photoUrl, createdBy, createdByUid, createdAt }`. `splitGuestsByAge` is a per-event opt-in; `childAgeThreshold` (a plain number, e.g. `13`) only means anything when it's `true`. `createdByUid` is the ownership field rules check; `createdBy` (the creator's email) is kept alongside it purely for display (event cards, "created by"). `photoUrl` is only present if a photo was uploaded - see "Event photos" below.
- `events/{eventId}/invitees/{lowercasedEmail}` — `{ name, maxGuests, invitedAt }` (owner/admin-managed guest list for invite-only events)
- `events/{eventId}/rsvps/{lowercasedEmail}` — `{ email, name, firstName, lastName, status: yes|no|maybe, guestCount, adultCount, childCount, comment, respondedAt }`. Keyed by lowercased email rather than uid, since an RSVP can now be made with no account at all (see "No-account RSVP" below); `email` keeps the address as the guest typed it, the document id is the normalized form. `guestCount` is always populated (as `adultCount + childCount` for events using the split) so every consumer that only cares about a total - CSV export's default header, `userRsvps`, older events predating this feature - keeps working unchanged; `adultCount`/`childCount` are `null` for events not using the split.
- `openEvents/{eventId}` — denormalized copy of **admin-created** `isOpen: true` events (title/date/location only), kept in sync by `createEvent()` in `events.js`. Exists purely so signed-in users can browse open events without a `list` query against `events` (Firestore rules can't grant `list` on a collection whose per-document access depends on document content). Deliberately admin-only, even though any user can create an open event now — see "Creating and owning events" in REQUIREMENTS.md for why.
- `userRsvps/{uid}/items/{eventId}` — `{ eventTitle, eventDate, status, guestCount, respondedAt }`, a per-user denormalized index written alongside every RSVP made while signed in (and backfilled on next sign-in for RSVPs made without an account) so a signed-in guest can see and revisit everything they've RSVP'd to (the "Your RSVPs" list on the homepage) without needing the original invite link again — same rationale as `openEvents`: Firestore rules can't grant `list` on `events/*/rsvps` scoped to "docs belonging to me" since that's a collection-group concern, but a plain per-uid collection like this one is trivially listable by its own path.
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
  `resource.data.createdByUid == request.auth.uid`. `update` is used by
  the "Edit event" feature (see "Any user can create and own events"
  below); `delete` has no UI yet, but the rule already reflects "owners
  manage their own event" for whenever that gets built.
- **`invitees` subcollection**: `isAdmin()` or `isEventOwner(eventId)` (a
  `get()` on the parent event's `createdByUid`) — never exposed to guests;
  a guest can't tell who else is invited or check membership directly,
  access is inferred server-side via `isInvited()`.
- **`rsvps` subcollection**: documents are keyed by **lowercased email**,
  not uid — see "No-account RSVP" below for why, and for the
  create-vs-update distinction that enforces one RSVP per address.
  `create` is open to *anyone*, signed in or not, on an `isOpen` event;
  invite-only events additionally require the caller to own that address
  (`ownsRsvp()`) and be on the invitee list. `update` always requires
  `ownsRsvp()` (or admin/owner). Both paths require the event's `date` to
  be unset or still in the future (`rsvpWindowOpen()`) — this is what
  actually closes RSVPs once an event starts; the client also hides the
  form at that point, but this rule is what makes it real. Because
  unauthenticated callers can write here, `validRsvpPayload()` pins the
  exact field set, types, and size limits. `list` (reading everyone's
  response) is allowed for admins, the event's owner (`isEventOwner()`),
  **or** anyone who's RSVP'd themselves (`hasRsvpd()`, an `exists()` check
  at a fixed path derived from their verified email — content-independent,
  so it's a valid `list` condition, same reasoning as `isAdmin()`). The
  last one is the "Who's coming" feature: RSVPing *and signing in* unlocks
  seeing everyone else's response on that event.
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
   the visitor isn't signed in. Neither name field has the HTML `required`
   attribute; instead the submit handler in `event.js` rejects only when
   *both* are empty ("Enter your first name or last name.") - a guest known
   by a single name isn't blocked. Email keeps `required` - always
   mandatory. Once signed in, the equivalent fields on `#rsvp-form` are
   `disabled` and pre-filled from the account (`user.displayName` split via
   `splitDisplayName()`, `user.email`) rather than collected again - see
   "Who's coming"/"RSVP editing" below for how that form works.
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
4. Back in `event.js`'s auth-state callback (`handleSignedIn()`): it looks
   for the `pendingRsvp:<eventId>` entry and clears it immediately either
   way (a stale one should never linger). It's only *applied* if the
   pending payload's email matches the just-signed-in user's email - a
   guest can sign in on this same page by an unrelated method (e.g.
   password, or a different magic-link request) while an older, never-
   completed quick-RSVP payload for someone else's email still sits in
   localStorage for this `eventId`; without this check that stale payload
   would silently overwrite whoever signs in next via `applyProfileName()`
   (confirmed by reproducing it while testing - a real account's
   `displayName` got clobbered by an abandoned quick-RSVP attempt from a
   different email). When it does match, it applies the given name to the
   (possibly brand-new) account via `applyProfileName()`, writes the RSVP
   doc (`writeRsvp()`, which also mirrors a summary into
   `userRsvps/{uid}/items/{eventId}` — see Data model) — the guest never
   has to fill anything in twice. If the
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
pre-fills from the existing `rsvps/{lowercasedEmail}` doc if one exists, and saving
just overwrites it (`writeRsvp()`). The name/email fields at the top of
that form are always populated from the signed-in account itself
(`splitDisplayName(user.displayName)`, `user.email`) rather than from the
`rsvps/{lowercasedEmail}` doc, and are `disabled` - unlike the rest of the form, this
part isn't something a change re-fills differently, since it isn't
per-response data. The only thing that changes the *rest* of the form is
`rsvpWindowOpen()`'s date check (see Security model) — once
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

### Organizer totals
`invites/js/rsvp-summary.js` holds `summarizeRsvps()` and
`describeTotals()` as pure functions with no Firebase imports, shared by
`event.js` (the "Who's coming" line) and `events.js` (the RSVP table's
`<tfoot>` row). It's a separate module rather than living in `events.js`
because the guest-facing event page would otherwise have to import that
whole module - and its Cloud Storage dependency - just to add up numbers.

Headcount counts only `status === "yes"`; "maybe" is reported in the
response breakdown instead of inflating the number an organizer would
cater for. The adult/child breakdown is shown only when it actually
accounts for the whole headcount, so an event that switched on the split
after some responses came in can't display totals that don't add up.

On `event.html` the line renders only when
`isAdminUser(user) || user.uid === eventCreatedByUid`. That check is
**presentational, not a security boundary** - the guest list already shows
every individual response to anyone who has RSVP'd, so the total is just
arithmetic over data they can see. No rules change was needed. On the
management card the check is unnecessary: that card is only ever rendered
by `admin.js`/`my-events.js`, both already owner/admin-scoped.

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
  management, RSVP table/CSV, edit form, split-guest-aware) that both
  pages render into their event list. Access to what its buttons can
  actually do is entirely governed by the rules above (`isAdmin()` vs
  `isEventOwner()`), not by which page rendered it - the same button code
  just succeeds or fails differently depending on who's clicking it.
- `loadInvitees()`, `downloadCsv()` — helpers used by the card, also moved
  here so they're not duplicated between the two pages.
- `createEvent(data, photoFile)` — see "Rate-limited event creation" below.
- `updateEvent(eventId, existing, data, photoFile)` — see "Editing an
  event" below.

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

### Editing an event
The "Edit event" button on each `renderEventCard()` toggles a form with
the same fields as creation (title, date, location, host name,
description, photo, open/invite-only, adult/child split), pre-filled
from the card's current data - built from the same markup pattern as
`create-event-form` on `admin.html`/`my-events.html`, but rendered
per-card in JS rather than as a static page element, since there can be
many cards.

`updateEvent(eventId, existing, data, photoFile)` in `events.js` is
deliberately much simpler than `createEvent()`: a plain `updateDoc` with
the submitted fields (no rate limit applies to edits, only to creating
new events), then the same optional photo-upload-and-attach as creation
if a replacement file was chosen. `existing` (the event data the card was
last rendered with) is passed in rather than re-fetched, since the caller
already has it in hand; it's used for two things the submitted form data
doesn't carry: the photo upload path's `ownerUid` (always the event's
*original* creator, even if an admin is the one editing - so a re-upload
overwrites the one existing photo rather than creating a second one at a
different path) and deciding whether to sync the `openEvents` mirror
(based on whether `existing.createdBy`'s email is on the admin allowlist
- i.e. whether the event was *originally* admin-created - not whether
today's editor happens to be admin).

After a successful save, the card re-fetches the fresh event doc and
replaces itself wholesale (`card.replaceWith(renderEventCard(id, fresh))`)
rather than patching individual fields in place - simplest way to keep
every derived bit of the card (the open/invite-only label, the photo
thumbnail, the split-guest RSVP table headers) consistent with whatever
just changed, reusing the same render path as the initial list load
instead of a second, parallel "patch this card" implementation.

### No-account RSVP
On an `isOpen` event, a guest can RSVP with no sign-in and no email
verification. Three things make that work:

**Email as the document key.** RSVPs are keyed by lowercased email rather
than uid, because there is no uid to key on. This is what gives "one RSVP
per address" for free: Firestore applies `create` only when the document
doesn't exist, so a second attempt on the same address is evaluated as an
`update` instead, which requires `ownsRsvp()` and is refused. `event.js`
reads that `permission-denied` as "already responded" and says so — it
never needs to *read* the existing RSVP to detect the collision, which
matters because an anonymous caller has no right to read one.

**Signing in adopts the RSVP rather than creating a second one.** Because
the key is the address, `showSignedInForm()` finds an RSVP made earlier
without an account simply by looking it up under the signed-in user's own
email. Two wrinkles are handled there: an account created *after* a
no-account RSVP has no `displayName`, so the form falls back to the name
stored on the RSVP (otherwise editing would silently blank it) and adopts
that name onto the account; and `ensureUserRsvpIndex()` backfills the
`userRsvps` entry that couldn't be written at RSVP time for lack of a uid.

**Invite-only events are deliberately excluded.** Their gate is "is your
address on the invitee list", which is worthless if an anonymous caller
can just assert an address. Those keep the magic-link flow, enforced in
both `event.js` (which branches on `eventIsOpen`) and the rules (which
require `ownsRsvp() && isInvited()`).

**On rate limiting.** There is deliberately *no* rules-level volume cap on
anonymous creates. With no uid to key a counter on, the counter would have
to be per-event and writable by any anonymous caller — so an attacker
could inflate it to the cap and lock the event's real guests out of
RSVPing, turning a low-probability spam risk into a trivial
denial-of-service. The guards that *are* enforceable sit where they can't
be gamed: `validRsvpPayload()` in the rules (content), and a send throttle
inside the Cloud Function (the mail account) — see "RSVP emails". The
remaining backstop is that event IDs are random and `events` can't be
listed, so an unshared invite link is not discoverable.

### RSVP emails
The only server-side code in the project: `functions/index.js` exports
`onRsvpWritten`, an `onDocumentWritten` Firestore trigger on
`events/{eventId}/rsvps/{emailKey}`.

**Why a trigger rather than a callable/HTTP endpoint the client posts to:**
the client never asks for mail to be sent, so it cannot forge a message,
point one at an arbitrary recipient, or spam a host beyond genuinely
RSVPing - which `firestore.rules` already governs.
The recipients are derived server-side from data the function reads
itself: the guest from `rsvp.email`, the host from the parent event's
`createdBy`. Nothing about the email is client-supplied.

**Who gets what** (`hasAttendanceChanged()` in `functions/email.js`):
- The **guest** gets a receipt on every save, worded differently for a
  first response vs. an update.
- The **host** is emailed only when the RSVP is new or when `status`,
  `guestCount`, `adultCount`, or `childCount` changed - a comment-only
  edit is deliberately silent, so the host's inbox stays signal-heavy.
  `null` and `undefined` counts compare equal, so RSVPs predating the
  adult/child split don't read as a change on their next save.
- If the host *is* the guest (they RSVP'd to their own event) the host
  copy is skipped - they don't need telling what they just did.

**Structure.** `functions/email.js` holds the decision and content logic
as pure functions with no Firebase or nodemailer imports, so it's directly
unit-testable (`npm test` in `functions/`, using Node's built-in runner -
no test framework dependency, matching the repo's no-build-step habit).
`functions/index.js` is the thin trigger: read the event doc, convert the
Firestore `Timestamp` to a `Date` once at the boundary, decide, deliver.

**Time zones.** Cloud Functions run in UTC, but an event's date was
entered by its creator in *their* local time, so formatting server-side
would show a wrong-looking hour. `formatEventDate()` renders in a fixed
`DISPLAY_TIME_ZONE` (`America/Los_Angeles`) and always prints the zone
abbreviation, so the time can't be misread. One constant to change if the
family stops being Pacific-based. Note that `Intl.DateTimeFormat` refuses
to combine `dateStyle`/`timeStyle` with `timeZoneName`, hence the
spelled-out component options.

**Failure handling.** The RSVP is already committed by the time the
trigger runs, so email is strictly best-effort: each send is wrapped
individually and logs on failure rather than throwing. A guest never sees
a mail problem surface as an RSVP problem, and one failed recipient
doesn't block the other.

**Send throttle.** Since open events accept RSVPs from unverified
addresses, the guest confirmation is the one piece of this that could be
turned into a way to mail strangers. `recentRsvpCount()` counts RSVPs
written to the event in the last hour (a Firestore `count()` aggregation,
read with admin privileges) and suppresses the *guest* half above
`GUEST_EMAILS_PER_WINDOW`; the host is still notified either way. It lives
here rather than in the rules precisely because a client can neither forge
the count nor inflate it to lock anyone out — see "On rate limiting" above.

**Credentials.** Sent via Gmail SMTP (nodemailer) as
`yaduonline@gmail.com`. The address isn't secret - it's already the admin
allowlist entry in `firestore.rules` - but the Gmail **app password** is,
and lives in Secret Manager via `defineSecret("GMAIL_APP_PASSWORD")`,
never in this repo. Set it once with
`firebase functions:secrets:set GMAIL_APP_PASSWORD`.

**Emulator behaviour.** When `FUNCTIONS_EMULATOR === "true"` the function
logs the full message it *would* have sent instead of connecting to SMTP -
so trigger decisions stay fully observable locally with no real credential
and zero risk of mailing anyone during testing.

> **Emulator gotcha:** Firestore triggers are project-scoped, so the
> emulator must run with the *same* project id the client config uses
> (`firebase emulators:start --project events-45ce5`). Started under a
> different id (e.g. `demo-yaduonline-invites`), everything else still
> works - rules, auth, storage - but writes land in a different namespace
> than the trigger watches and the function silently never fires.

### Event photos
`resizeImage()` in `events.js` downscales the chosen file client-side
before it ever leaves the browser (`<canvas>`, longest side capped at
1600px, re-encoded as JPEG at 0.82 quality) - this is what makes
"reasonably sized" real regardless of the original phone-camera file size,
not just the 5MB `storage.rules` cap. `uploadEventPhoto(eventId, ownerUid, file)`
uploads the resized blob to a fixed path,
`eventPhotos/{eventId}/{ownerUid}/photo.jpg` - one photo per event, so
replacing one (via the "Edit event" form's "Replace photo" field - see
"Editing an event" above) simply overwrites it at the same path.
`ownerUid` is part of the path so `storage.rules` can authorize the write
with a plain path-segment check - see "Storage security model" above.

Both `createEvent()` and `updateEvent()` upload the photo (if given)
*after* the event doc write, purely so they can attach the resulting
`photoUrl` back onto that doc via `updateDoc` in the same call. A
photo-upload failure doesn't undo the rest of the create/update; it's
reported back as `photoError` on the return value so `admin.js`/
`my-events.js`/the edit form can show it as a non-fatal warning ("Event
created/updated, but the photo couldn't be uploaded: ...") rather than
implying the whole submission failed.

`photoUrl` (a Firebase Storage download URL, which embeds its own access
token) is stored directly on the event doc once upload succeeds, and
rendered as an `<img>` wherever event data already gets displayed:
`event.js`'s `loadEventDetails()` (the main event page) and `events.js`'s
shared `renderEventCard()` (admin/owner management cards). Not currently
shown in the more compact "Your RSVPs"/"Open events" list items on the
homepage - could be added the same way if wanted later.

`.event-photo`/`.event-card-photo` (`styles.css`) render at a portrait
`aspect-ratio: 3 / 4` with `object-fit: cover`, rather than a fixed,
low `max-height` on a full-width box - the earlier fixed-height approach
forced every photo into a short, wide (landscape) frame regardless of
the source image's own orientation, cropping a typical vertically-shot
phone photo hard. A portrait-shaped box matches that common case; a
genuinely landscape photo still displays fine, just cropped to fit the
portrait frame the same way `cover` always crops to fill its box.

Both create forms (`admin.html`/`my-events.html`) and the edit form show
an instant local preview of the chosen file the moment it's picked
(`wirePhotoPreview()` in `events.js`, wired to the same `<input
type="file">` + `<img class="form-photo-preview">` pair in each form) -
a plain `URL.createObjectURL(file)`, no network involved, so it's
immediate regardless of upload speed. The actual upload only happens at
submit time (inside `createEvent()`/`updateEvent()`, as described above);
during that `await`, the submit button disables and a "Uploading
photo…" message shows next to the preview
(`.photo-upload-status`), clearing once the whole create/update call
resolves - at which point the real event card re-renders with the
now-uploaded `photoUrl` (a fresh `getDocs`/`getDoc` + `renderEventCard()`
call, same as any other create/edit completion), so the on-page photo
updates to the server-hosted version right as the "uploading" state
clears.

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
- `functions/` — the only server-side code: `index.js` (the RSVP trigger), `email.js` (pure decision/content logic), `email.test.js` (`npm test`). Has its own `package.json`/`node_modules`, so it's the one part of the repo with a dependency install step; the hosted site under `invites/` stays build-free.

## Event page layout
On `event.html` (only - `index.html`/`admin.html`/`my-events.html` keep
the widget prominent, since being signed-in-focused makes sense there),
`#auth-widget` moved out of its old top-of-`<main>` position to sit
*inside* `#event-section`. For a signed-out visitor it starts `hidden`,
with a small "Sign in for quick RSVP" (`#signin-toggle-link`) button
revealing it on click - can't nest it inside the `quick-rsvp-form`
`<form>` itself, since `auth-widget.js` renders its own `<form>` elements
for sign-in/sign-up, and nested forms aren't valid HTML.

### Reading order
Within `.event-layout-content` the order is deliberately:

1. `#event-detail` — title, **description**, date/time, location, in that
   order (`loadEventDetails()` builds this markup). Description sits
   directly under the heading so the invite reads as prose first, with the
   logistics (when, then where) following.
2. `#event-closed-hint` / `#signin-toggle-link` / `#auth-slot-inline`
3. The RSVP forms (`#quick-rsvp-form` when signed out, `#rsvp-form` when
   signed in) — the point of the page, kept high.
4. `#event-host` — the "Hosted by X" line, split out of `#event-detail`'s
   markup into its own element specifically so it can sit *below* the RSVP
   rather than competing with the event's own details above it.
5. `#guest-list-section` — "Who's coming", once the user has RSVP'd.
6. `#auth-slot-bottom` — the signed-in status bar.

### Where `#auth-widget` renders
It does double duty, which is why it has two slots rather than one fixed
position:
- **Signed out** it renders the full sign-in/sign-up/magic-link forms,
  which only make sense adjacent to the `#signin-toggle-link` that reveals
  them — so it lives in `#auth-slot-inline`, above the RSVP form.
- **Signed in** it's just the compact "Signed in as X / Admin dashboard /
  Set a password / Sign out" bar, which is account chrome rather than
  anything the guest came to the page for — so `event.js`'s
  `mountAuthWidget` callback `appendChild`s it into `#auth-slot-bottom`
  at the very bottom instead.

`event.js` moves the same element between slots (rather than duplicating
it, or `auth-widget.js` learning about either slot) — `render()` only ever
sets `innerHTML` on the container it was handed, so moving the node itself
is invisible to it. The move happens on *every* auth-state change in both
directions, so signing out on a page that was signed-in correctly pulls
the widget back inline instead of leaving the sign-in forms stranded at the
bottom, far from the link that reveals them.

`.event-auth-bottom .auth-status` flips the shared status bar's divider
from a bottom border to a top one — the base `.auth-status` style assumes
it's sitting above content, which would otherwise leave a stray underline
across the last thing on the page.

### Responsive photo/content layout
`#event-section` wraps its photo and everything else in `.event-layout`,
a flex container with two children: `#event-photo-wrap` (just the `<img>`,
set separately from `#event-detail` by `loadEventDetails()` - see "Event
photos" in this doc) and `.event-layout-content` (event details text,
sign-in, both RSVP forms, host line, guest list, signed-in status bar -
everything that used to sit directly in `#event-section`; see "Reading
order" above for their sequence). Below 700px viewport width, `.event-layout`
stacks them in a column (photo above content, matching how it already
looked on mobile); at 700px and up it switches to a row, photo in a
fixed-width `280px` left column, content filling the rest. Splitting the
photo out of `#event-detail`'s own markup (rather than leaving it as the
first thing in that same `innerHTML` block) is what makes the two-column
split possible - flexbox lays out `#event-photo-wrap` and
`.event-layout-content` as independent columns, so the photo's height no
longer has to match its own caption text the way a photo sitting inline
above a paragraph would. `.event-photo` itself has no `max-width` or
centering of its own anymore - it's sized by whichever column it's in
(full width when stacked, the fixed `280px` column when side by side), so
it lines up flush with the text next to or below it instead of floating
narrower and off-center (the bug that prompted this - centering a
narrower image above full-width text left its edge visibly offset).
`#event-photo-wrap:empty { display: none }` collapses the column entirely
for events with no photo, so `.event-layout-content` gets the full width
instead of leaving a blank gap.

## Deployment

- `.github/workflows/firebase-deploy.yml` deploys Hosting + Firestore rules
  + Storage rules on push to `main` touching `invites/**`, `firebase.json`,
  `firestore.rules`, or `storage.rules`, using a `FIREBASE_SERVICE_ACCOUNT`
  + `FIREBASE_PROJECT_ID` GitHub secret pair.
- **Cloud Functions are deployed by hand**, not by CI:
  `npx firebase-tools deploy --only functions --project events-45ce5`.
  A 2nd-gen deploy needs `iam.serviceAccountUser`,
  `artifactregistry.writer`, `run.admin`, `cloudbuild.builds.editor`,
  `eventarc.developer` and `secretmanager.secretAccessor` on top of the
  roles the CI service account already has - i.e. the power to push
  container images, administer Cloud Run and impersonate other service
  accounts, granted to a key living in a GitHub secret. That's a poor
  trade for a function that changes a few times a year. Keeping functions
  out of the CI `--only` list also means a functions failure can't block a
  hosting or rules deploy, which is exactly what happened when they shared
  one list (run #18: the whole deploy aborted, shipping nothing).
- The **first** functions deploy on a fresh project also needs the Eventarc
  Service Agent to finish provisioning; it fails once with "Permission
  denied while using the Eventarc Service Agent" and succeeds on a retry a
  few minutes later. Expected, not a misconfiguration.
- **The Gmail app password must be set once** before RSVP emails work
  against the real project: `firebase functions:secrets:set
  GMAIL_APP_PASSWORD` (generate it at myaccount.google.com → Security →
  App passwords; requires 2-Step Verification on the account). It's stored
  in Secret Manager, never in this repo. The CI service account needs
  permission to read it at deploy time — see "RSVP emails" above.
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
- Local dev/testing: `firebase emulators:start --project events-45ce5`
  (Auth + Firestore + Storage + Hosting + Functions, see `firebase.json`'s
  `emulators` block) — no cloud project or credential needed to develop
  against. Pass the real project id even locally, or Firestore triggers
  won't fire; see the gotcha under "RSVP emails" above.
- `cd functions && npm test` runs the email unit tests (Node's built-in
  runner, no dependencies beyond what Functions already needs).
- `playwright.invites.config.js` runs `tests/invites.spec.js` against a
  plain static server rooted at `invites/` (matches the Hosting public
  root, so absolute paths like `/styles.css` resolve the same way locally
  and in production).
