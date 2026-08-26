// Unit tests for the RSVP email logic. Uses Node's built-in test runner
// (`npm test` in this directory) - no test framework dependency, matching
// the rest of the repo's no-build-step approach. These cover the parts
// worth pinning down: exactly when the host gets notified, and that guest
// content never leaks into the wrong message.

import test from "node:test";
import assert from "node:assert/strict";

import {
  buildGuestEmail,
  buildHostEmail,
  describeResponse,
  escapeHtml,
  formatEventDate,
  hasAttendanceChanged,
} from "./email.js";

const baseEvent = {
  title: "Diwali Celebration",
  location: "742 Evergreen Terrace",
  hostName: "The Joshi Family",
  date: new Date("2027-11-05T18:30:00-07:00"),
};

const baseRsvp = {
  name: "Casey Morgan",
  email: "casey@example.com",
  status: "yes",
  guestCount: 2,
  adultCount: null,
  childCount: null,
  comment: "",
};

test("host is notified for a brand-new RSVP", () => {
  assert.equal(hasAttendanceChanged(null, baseRsvp), true);
});

test("host is notified when attendance details change", () => {
  assert.equal(
    hasAttendanceChanged(baseRsvp, { ...baseRsvp, status: "no" }),
    true,
    "status change"
  );
  assert.equal(
    hasAttendanceChanged(baseRsvp, { ...baseRsvp, guestCount: 3 }),
    true,
    "guest count change"
  );
  assert.equal(
    hasAttendanceChanged(
      { ...baseRsvp, adultCount: 2, childCount: 0 },
      { ...baseRsvp, adultCount: 2, childCount: 1 }
    ),
    true,
    "child count change on a split-guest event"
  );
});

test("host is NOT notified for a comment-only edit", () => {
  assert.equal(
    hasAttendanceChanged(baseRsvp, { ...baseRsvp, comment: "running late!" }),
    false
  );
});

test("host is NOT notified when nothing relevant changed", () => {
  assert.equal(hasAttendanceChanged(baseRsvp, { ...baseRsvp }), false);
});

test("null and undefined counts are treated as equivalent", () => {
  // Older RSVPs predate the adult/child split and simply omit those fields;
  // newer ones write explicit nulls. That difference must not read as a
  // change and spam the host.
  const older = { status: "yes", guestCount: 2 };
  const newer = { status: "yes", guestCount: 2, adultCount: null, childCount: null };
  assert.equal(hasAttendanceChanged(older, newer), false);
});

test("describeResponse uses adult/child wording only for split events", () => {
  assert.equal(describeResponse(baseRsvp, baseEvent), "yes - 2 guest(s)");
  assert.equal(
    describeResponse(
      { ...baseRsvp, adultCount: 2, childCount: 1 },
      { ...baseEvent, splitGuestsByAge: true }
    ),
    "yes - 2 adult(s), 1 child(ren)"
  );
  // Split event, but an RSVP from before the feature existed.
  assert.equal(
    describeResponse(baseRsvp, { ...baseEvent, splitGuestsByAge: true }),
    "yes - 2 guest(s)"
  );
});

test("event date renders in the display timezone, not UTC", () => {
  const formatted = formatEventDate(baseEvent.date);
  // 18:30 Pacific must not render as the following day's 01:30 UTC.
  assert.match(formatted, /6:30/);
  assert.match(formatted, /November 5, 2027/);
  assert.doesNotMatch(formatted, /November 6/);
});

test("formatEventDate tolerates events with no date", () => {
  assert.equal(formatEventDate(null), "");
});

test("escapeHtml neutralizes markup in user-supplied values", () => {
  assert.equal(
    escapeHtml('<script>alert("x")</script>'),
    "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"
  );
});

test("guest email confirms their own response and links back", () => {
  const mail = buildGuestEmail({
    event: baseEvent,
    eventId: "abc123",
    rsvp: baseRsvp,
    isNew: true,
  });
  assert.match(mail.subject, /Your RSVP for Diwali Celebration/);
  assert.match(mail.text, /Your response: yes - 2 guest\(s\)/);
  assert.match(mail.text, /event\?id=abc123/);
  assert.match(mail.text, /Hosted by: The Joshi Family/);
});

test("guest email wording differs for an update", () => {
  const mail = buildGuestEmail({
    event: baseEvent,
    eventId: "abc123",
    rsvp: baseRsvp,
    isNew: false,
  });
  assert.match(mail.subject, /Your updated RSVP/);
  assert.match(mail.text, /has been updated/);
});

test("host email identifies the guest and carries their comment", () => {
  const mail = buildHostEmail({
    event: baseEvent,
    eventId: "abc123",
    rsvp: { ...baseRsvp, comment: "Bringing dessert" },
    isNew: true,
  });
  assert.match(mail.subject, /New RSVP for Diwali Celebration: Casey Morgan/);
  assert.match(mail.text, /Response: yes - 2 guest\(s\)/);
  assert.match(mail.text, /Comment: Bringing dessert/);
});

test("guest email never carries the guest's own comment back to them", () => {
  // The comment is a note to the host; echoing it adds nothing and would be
  // surprising if it were ever edited to something private.
  const mail = buildGuestEmail({
    event: baseEvent,
    eventId: "abc123",
    rsvp: { ...baseRsvp, comment: "Bringing dessert" },
    isNew: true,
  });
  assert.doesNotMatch(mail.text, /Bringing dessert/);
});

test("malicious event/RSVP content cannot inject markup into the HTML body", () => {
  const mail = buildHostEmail({
    event: { ...baseEvent, title: '<img src=x onerror="alert(1)">' },
    eventId: "abc123",
    rsvp: { ...baseRsvp, name: "<b>Bold</b>", comment: "<script>bad()</script>" },
    isNew: true,
  });
  // The point is that no *live* tag or attribute can form. The literal
  // text "onerror=" still appears, but only inside escaped content where
  // the surrounding < and " are already entities, so it can never be
  // parsed as an attribute.
  assert.doesNotMatch(mail.html, /<script/);
  assert.doesNotMatch(mail.html, /<img/);
  assert.doesNotMatch(mail.html, /onerror="/);
  assert.match(mail.html, /&lt;script&gt;/);
  assert.match(mail.html, /&lt;img src=x onerror=&quot;/);
});
