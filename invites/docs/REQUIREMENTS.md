# Invites — Requirements

Living document. Update this whenever the app's behavior changes — it should
always describe the app as it currently works, not a historical changelog.

## What this is

A small invitation-management app for a personal/family site
(`invites.yaduonline.com`), separate from the static games/blog site at
`www.yaduonline.com`. Any signed-in user can create an event, invite
people, and see who's coming; admin has full visibility across every
event and every response, regardless of who created it.

## Standing tenet: privacy

This is a personal site with no intention of harvesting user data.

- No analytics, tracking pixels, or third-party scripts beyond what Firebase's
  own SDK requires for core auth/data functionality.
- No library or plugin that collects/harvests user data gets added, ever,
  even if convenient.
- Collect only what a feature functionally needs: name, email, and RSVP
  details. Nothing else, no exceptions "just in case."

## Users

- **Guests**: anyone with an invite link. May or may not have an account yet.
- **Event creators**: any signed-in user. Creating an event makes you its
  owner — see "Creating and owning events" below.
- **Admins**: a fixed, hardcoded email allowlist (currently just
  `yaduonline@gmail.com`). Not a role users can grant themselves or each
  other. Admin sees and can manage *every* event and every RSVP, on top of
  (not instead of) the regular owner/guest capabilities below.

## Core features

### Creating and owning events
- **Any signed-in user can create an event** — title, date/time, location,
  description, host name, and whether it's **open** (anyone signed in may
  RSVP without being individually invited) or **invite-only** (only people
  the creator explicitly added may RSVP). Done from the dedicated
  `my-events.html` page (linked from the homepage), separate from the
  admin dashboard.
- Creators can optionally **upload a photo** for the event while creating
  it. It's resized in the browser before upload to keep it "reasonably
  sized" regardless of the original file, and shows on the event page and
  on the creator's/admin's management card. Entirely optional — most
  events won't have one.
- Creators can optionally turn on **"split guests into adults & children"**
  for an event, specifying the age below which a guest counts as a child.
  When on, RSVPing for that event asks for adult and child counts
  separately instead of one generic guest count; when off (the default),
  it's just a single guest-count number as before. This is entirely
  per-event — different events on the same site can use either mode.
- **Creating an event makes you its owner**, with the same management
  capabilities admin has for it: add/remove invitees, view its RSVP list,
  export its CSV, and **edit the event itself** (an "Edit event" button
  on its card reveals the same fields as creation, pre-filled, including
  replacing the photo) — all scoped to events you personally created, on
  your own `my-events.html` page. You only see/manage events you created
  (or ones you've RSVP'd to, via "Your RSVPs"/"Who's coming") — not other
  people's events, unless you're admin.
- **Non-admin users are capped at 10 event creations per rolling 24-hour
  window**, enforced server-side (not just a UI limit), to guard against
  runaway or accidental abuse. Admin has no limit.
- Event details (title/date/location/description) are visible to **anyone
  holding the direct link**, signed in or not — same model as any
  Evite/Google Calendar/Partiful invite link. The invite list (who was
  invited) is never public. RSVP responses are visible to admins, the
  event's creator, and anyone who has RSVP'd themselves (see "Who's
  coming" below) — not to the general public, and not to invitees who
  haven't responded yet.
- **The homepage's "Open events" browse list only ever shows
  admin-created open events.** A non-admin's open event still means
  "anyone with the link can RSVP without being individually invited" —
  it just isn't published to that shared, site-wide feed, so a regular
  user's events stay something only people they've actually shared the
  link with can find (matching "you should only see your own
  created/RSVP'd events").

### RSVPing — first-time guest, no account required up front
A guest who has never used the site before must **not** be forced to create
an account or sign in before they can RSVP. Opening an invite link shows the
event details and a ready-to-use RSVP form right away: First name, Last
name, Email, attending yes/no/maybe, guest count, comment.

Submitting it:
1. Sends the guest an email containing a one-click sign-in link (Firebase's
   built-in passwordless "magic link" — no typed code, no separate backend).
2. Once they click it and it's verified, their account is created
   automatically (using the name they gave) and their RSVP is saved — no
   further steps, no password required at any point.

If they open the RSVP form and never click the email, nothing is saved (by
design — an unverified email shouldn't be able to write data).

### Signing in — every other case
- Returning users, or first-timers who'd rather identify themselves before
  filling anything out, can use the sign-in options shown alongside the
  quick-RSVP form (or on the homepage): email + password, Google, or "email
  me a sign-in link" (the same passwordless magic-link mechanism as above).
- **The magic-link option is always available**, on every login screen, for
  every account — whether or not that account also has a password set.
  Firebase supports multiple sign-in methods per account simultaneously, so
  this isn't a fallback or a special mode, it just always works.
- Anyone who signed in without a password (i.e. via magic link only) sees a
  standing "Set a password" option once signed in, any time, not just once
  at signup. Setting one doesn't remove the magic-link option — both keep
  working afterward.
- Public sign-up (any email/password or Google account) is allowed — this
  may grow into more than just invitations someday. RSVPing to any specific
  *invite-only* event still requires being on that event's invite list,
  regardless of how the account was created.

### Editing an RSVP
- A guest can change their response (attending/guest count/comment) any time
  before the event starts, simply by returning to the same invite link and
  signing in again (any method — password, Google, or a fresh magic link).
  The form comes back pre-filled with their last answer; saving overwrites
  it. There's no separate "edit mode" — RSVPing and editing are the same
  form and the same action.
- The homepage also lists **"Your RSVPs"** for a signed-in user — every
  event they've responded to, each linking straight to that event's
  (editable) RSVP form — so a guest doesn't need to keep the original invite
  link around to go back and change their answer.
- **RSVPs close once the event's date/time has passed** — no new RSVPs and
  no edits after that point (enforced server-side, not just hidden in the
  UI). Events with no date set have no such cutoff.

### Who's coming
Once a guest has RSVP'd to an event themselves, they can see everyone
else's response on that same event page — name, attending/not/maybe, and
guest count (adult/child breakdown instead, for events using that split).
This only unlocks after responding (an invitee who hasn't RSVP'd yet
doesn't see it), and deliberately excludes email addresses and comments,
which stay visible to admins only.

### Admin dashboard
`admin.html` is admin-only and shows **every event from every creator**,
with the same per-event management as `my-events.html` (add/remove
invitees, view all RSVP responses in a table with adult/child columns
where applicable, export CSV) — just not limited to events admin
personally created, and with no daily creation limit.

### Event page layout
On the event page itself, sign-in isn't the main event — the event
details show first, and for a signed-out visitor the RSVP form is what's
front and center. A small "Sign in for quick RSVP" link (collapsed by
default) reveals the full sign-in options for anyone who'd rather
identify themselves first or already has an account; once signed in, a
compact status bar replaces it.

## Out of scope (for now)
- Email notifications beyond the sign-in link itself (e.g. RSVP reminders,
  confirmation emails) — would need a paid backend (Cloud Functions), not
  built.
- **Canceling/deleting** an event after creation — editing is supported
  (see "Creating and owning events" above), but there's no delete button
  anywhere yet, even though Firestore rules already permit it.
- Waitlists, plus-one management beyond a numeric guest count.
- Any role system beyond the fixed admin allowlist (e.g. no way to make
  someone a "co-host" of another user's event).
