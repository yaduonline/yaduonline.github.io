// Tallying RSVPs for the organizer-facing totals, shared by the event page's
// "Who's coming" section (event.js) and the management card's RSVP table
// (events.js). Pure functions with no Firebase imports - the event page is
// guest-facing and shouldn't pull in the heavier events.js module (and its
// Cloud Storage dependency) just to add up some numbers.

// Headcount counts only people who said yes. "maybe" deliberately doesn't
// inflate the number an organizer would cater for; it's reported separately
// in the response breakdown so it isn't lost either.
export function summarizeRsvps(rsvps) {
  const s = {
    responses: 0,
    yes: 0,
    no: 0,
    maybe: 0,
    attendingGuests: 0,
    attendingAdults: 0,
    attendingChildren: 0,
  };
  for (const r of rsvps) {
    s.responses += 1;
    if (r.status === "yes") s.yes += 1;
    else if (r.status === "no") s.no += 1;
    else if (r.status === "maybe") s.maybe += 1;

    if (r.status !== "yes") continue;
    s.attendingGuests += Number(r.guestCount) || 0;
    s.attendingAdults += Number(r.adultCount) || 0;
    s.attendingChildren += Number(r.childCount) || 0;
  }
  return s;
}

// `splitGuestsByAge` comes from the event, not the RSVPs: an event can use
// the split while still holding older responses that predate it and only
// carry a plain guestCount. The adult/child breakdown is therefore only
// shown when it actually accounts for the whole headcount, so the numbers
// can never appear not to add up.
export function describeTotals(s, splitGuestsByAge) {
  const breakdownAddsUp =
    s.attendingAdults + s.attendingChildren === s.attendingGuests;
  const head =
    splitGuestsByAge && breakdownAddsUp
      ? `${s.attendingGuests} attending (${s.attendingAdults} adult(s), ${s.attendingChildren} child(ren))`
      : `${s.attendingGuests} attending`;
  return `${head} — ${s.yes} yes, ${s.no} no, ${s.maybe} maybe`;
}
