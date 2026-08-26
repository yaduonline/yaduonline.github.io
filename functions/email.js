// Pure helpers for RSVP notification emails: deciding *whether* to notify
// and building the message bodies. Deliberately free of any Firebase or
// nodemailer imports so the logic can be exercised directly (see
// test-email.js) without a project, credentials, or an emulator.

export const SITE_ORIGIN = "https://invites.yaduonline.com";

// Cloud Functions run in UTC, but an event's date was entered by its
// creator in their own local time, so formatting server-side would
// otherwise show a wrong-looking hour. Events on this site are local
// family gatherings, so a single fixed display zone is right - change
// this one constant if that stops being true. The zone abbreviation is
// always printed alongside the time so it can't be misread either way.
export const DISPLAY_TIME_ZONE = "America/Los_Angeles";

export function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// `date` is a JS Date (already converted from a Firestore Timestamp) or
// null for events with no date set.
export function formatEventDate(date) {
  if (!date) return "";
  // Spelled out as individual components rather than dateStyle/timeStyle:
  // Intl rejects combining those shorthands with timeZoneName, and the
  // zone abbreviation is the whole point of formatting here.
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: DISPLAY_TIME_ZONE,
    timeZoneName: "short",
  }).format(date);
}

// Mirrors describeGuestCount() in invites/js/event.js: adult/child wording
// only when the event actually uses the split *and* the RSVP carries that
// data (older RSVPs predate the feature and only have guestCount).
export function describeResponse(rsvp, event) {
  const status = rsvp.status || "no response";
  const split =
    event.splitGuestsByAge &&
    (rsvp.adultCount != null || rsvp.childCount != null);
  if (split) {
    return `${status} - ${rsvp.adultCount ?? 0} adult(s), ${rsvp.childCount ?? 0} child(ren)`;
  }
  return rsvp.guestCount ? `${status} - ${rsvp.guestCount} guest(s)` : status;
}

// The host is notified about a *new* RSVP or a change to who's actually
// coming - not about someone fixing a typo in their comment, which would
// otherwise fill the host's inbox with noise. The guest, by contrast, gets
// a confirmation on every save (see index.js), because that's the receipt
// for an action they just took.
export function hasAttendanceChanged(before, after) {
  if (!before) return true;
  const fields = ["status", "guestCount", "adultCount", "childCount"];
  return fields.some((f) => (before[f] ?? null) !== (after[f] ?? null));
}

function eventWhenWhere(event) {
  const lines = [];
  const when = formatEventDate(event.date);
  if (when) lines.push(`When: ${when}`);
  if (event.location) lines.push(`Where: ${event.location}`);
  return lines;
}

// A plain, self-contained message - no tracking pixels, no remote images,
// no analytics links, per the site's standing privacy tenet (see
// docs/REQUIREMENTS.md). The only link is back to the event page itself.
function wrapHtml(heading, paragraphs, linkUrl, linkLabel) {
  const body = paragraphs
    .map((p) => `<p style="margin:0 0 12px">${p}</p>`)
    .join("\n    ");
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#333;max-width:520px">
    <h2 style="font-size:1.3rem;margin:0 0 16px">${escapeHtml(heading)}</h2>
    ${body}
    <p style="margin:20px 0 0"><a href="${escapeHtml(linkUrl)}" style="color:#0066cc">${escapeHtml(linkLabel)}</a></p>
  </div>`;
}

export function buildGuestEmail({ event, eventId, rsvp, isNew }) {
  const title = event.title || "Untitled event";
  const url = `${SITE_ORIGIN}/event?id=${encodeURIComponent(eventId)}`;
  const response = describeResponse(rsvp, event);
  const detailLines = eventWhenWhere(event);

  const subject = isNew
    ? `Your RSVP for ${title}`
    : `Your updated RSVP for ${title}`;

  const opening = isNew
    ? `Thanks for responding to ${title}. Here's what we recorded:`
    : `Your RSVP for ${title} has been updated. Here's what we now have:`;

  const text = [
    opening,
    "",
    `Your response: ${response}`,
    ...detailLines,
    event.hostName ? `Hosted by: ${event.hostName}` : "",
    "",
    "You can change your response any time before the event starts:",
    url,
  ]
    .filter((line) => line !== "")
    .join("\n");

  const html = wrapHtml(
    title,
    [
      escapeHtml(opening),
      `<strong>Your response:</strong> ${escapeHtml(response)}`,
      ...detailLines.map((l) => escapeHtml(l)),
      event.hostName ? `Hosted by ${escapeHtml(event.hostName)}` : "",
      "You can change your response any time before the event starts.",
    ].filter(Boolean),
    url,
    "View or change your RSVP"
  );

  return { subject, text, html };
}

export function buildHostEmail({ event, eventId, rsvp, isNew }) {
  const title = event.title || "Untitled event";
  const url = `${SITE_ORIGIN}/event?id=${encodeURIComponent(eventId)}`;
  const who = rsvp.name || rsvp.email || "Someone";
  const response = describeResponse(rsvp, event);

  const subject = isNew
    ? `New RSVP for ${title}: ${who}`
    : `Updated RSVP for ${title}: ${who}`;

  const opening = isNew
    ? `${who} just responded to ${title}.`
    : `${who} changed their response to ${title}.`;

  const text = [
    opening,
    "",
    `Response: ${response}`,
    rsvp.comment ? `Comment: ${rsvp.comment}` : "",
    "",
    "See everyone's responses:",
    url,
  ]
    .filter((line) => line !== "")
    .join("\n");

  const html = wrapHtml(
    title,
    [
      escapeHtml(opening),
      `<strong>Response:</strong> ${escapeHtml(response)}`,
      rsvp.comment ? `<strong>Comment:</strong> ${escapeHtml(rsvp.comment)}` : "",
    ].filter(Boolean),
    url,
    "See everyone's responses"
  );

  return { subject, text, html };
}
