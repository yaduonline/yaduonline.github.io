# Invites — Requirements

Living document. Update this whenever the app's behavior changes — it should
always describe the app as it currently works, not a historical changelog.

## What this is

A small invitation-management app for a personal/family site
(`invites.yaduonline.com`), separate from the static games/blog site at
`www.yaduonline.com`. Admins create events, invite people, and see who's
coming. Guests RSVP.

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
- **Admins**: a fixed, hardcoded email allowlist (currently just
  `yaduonline@gmail.com`). Not a role users can grant themselves or each
  other.

## Core features

### Events
- Admin creates an event: title, date/time, location, description, host
  name, and whether it's **open** (anyone signed in may RSVP) or
  **invite-only** (only people the admin explicitly added may RSVP).
- Admin can optionally turn on **"split guests into adults & children"**
  for an event, specifying the age below which a guest counts as a child.
  When on, RSVPing for that event asks for adult and child counts
  separately instead of one generic guest count; when off (the default),
  it's just a single guest-count number as before. This is entirely
  per-event — different events on the same site can use either mode.
- Event details (title/date/location/description) are visible to **anyone
  holding the direct link**, signed in or not — same model as any
  Evite/Google Calendar/Partiful invite link. The invite list (who was
  invited) is never public — admin-only. RSVP responses are visible to
  admins and to anyone who has RSVP'd themselves (see "Who's coming"
  below) — not to the general public, and not to invitees who haven't
  responded yet.
- Admin can browse open events from the homepage without needing a direct
  link; invite-only events are reached only via the link the admin shares.

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
- Create events (open or invite-only; optionally with the adult/child
  guest split described above).
- Per event: add/remove invitees (email + name + max guests), copy the
  direct invite link, view all RSVP responses in a table (adult/child
  columns instead of a single guest count, for events using the split),
  export responses to CSV.

## Out of scope (for now)
- Email notifications beyond the sign-in link itself (e.g. RSVP reminders,
  confirmation emails) — would need a paid backend (Cloud Functions), not
  built.
- Editing/canceling events after creation, waitlists, plus-one management
  beyond a numeric guest count.
- Any role system beyond the fixed admin allowlist.
