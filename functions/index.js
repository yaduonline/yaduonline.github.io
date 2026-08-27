// RSVP confirmation emails. A Firestore trigger, not a callable/HTTP
// endpoint: it fires on the RSVP document that event.js already writes, so
// the client never asks for an email to be sent and therefore can't forge
// one, address one at an arbitrary recipient, or spam a host beyond
// actually RSVPing (which firestore.rules already governs). See
// invites/docs/DESIGN.md "RSVP emails".

import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import { setGlobalOptions } from "firebase-functions/v2";
import { logger } from "firebase-functions";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import nodemailer from "nodemailer";

import { buildGuestEmail, buildHostEmail, hasAttendanceChanged } from "./email.js";

initializeApp();

// Blaze has no hard spending ceiling, so cap concurrency rather than
// relying on the free tier alone - this workload is a handful of sends per
// event, and a runaway loop should stay cheap even if one ever happened.
setGlobalOptions({ maxInstances: 10 });

// Sender identity. The address is not a secret (it's already the admin
// allowlist entry in firestore.rules); only the Gmail app password is, and
// it lives in Secret Manager, never in this repo. Set it once with:
//   firebase functions:secrets:set GMAIL_APP_PASSWORD
const SENDER_ADDRESS = "yaduonline@gmail.com";
const SENDER_NAME = "Family Invites";
const GMAIL_APP_PASSWORD = defineSecret("GMAIL_APP_PASSWORD");

async function deliver({ to, subject, text, html }) {
  // In the emulator there's no real credential and we must never actually
  // send: log what would have gone out so the trigger's decisions are
  // still fully observable while testing.
  if (process.env.FUNCTIONS_EMULATOR === "true") {
    logger.info("[emulator] would send email", { to, subject, text });
    return;
  }
  const transport = nodemailer.createTransport({
    service: "gmail",
    auth: { user: SENDER_ADDRESS, pass: GMAIL_APP_PASSWORD.value() },
  });
  await transport.sendMail({
    from: `${SENDER_NAME} <${SENDER_ADDRESS}>`,
    to,
    subject,
    text,
    html,
  });
}

// Open events accept RSVPs from anyone, with no account and no verified
// address (see firestore.rules), so the guest confirmation is the one thing
// here that could be turned into a way to mail strangers. A rules-level
// volume cap can't help - with no uid to key on, the counter would be
// writable by anyone and could be inflated to lock the event's own guests
// out. This throttle lives server-side instead, where the count is read
// with admin privileges from the RSVPs themselves and no client can forge
// or exhaust it. Above the cap the host is still notified; only the
// outbound-to-strangers half stops.
const GUEST_EMAIL_WINDOW_MS = 60 * 60 * 1000;
const GUEST_EMAILS_PER_WINDOW = 25;

async function recentRsvpCount(eventId) {
  const since = new Date(Date.now() - GUEST_EMAIL_WINDOW_MS);
  const snap = await getFirestore()
    .collection(`events/${eventId}/rsvps`)
    .where("respondedAt", ">", since)
    .count()
    .get();
  return snap.data().count;
}

export const onRsvpWritten = onDocumentWritten(
  {
    document: "events/{eventId}/rsvps/{emailKey}",
    secrets: [GMAIL_APP_PASSWORD],
  },
  async (firestoreEvent) => {
    const beforeSnap = firestoreEvent.data?.before;
    const afterSnap = firestoreEvent.data?.after;
    const before = beforeSnap?.exists ? beforeSnap.data() : null;
    const rsvp = afterSnap?.exists ? afterSnap.data() : null;

    // Deletion - the host removed a guest's response. Nothing to confirm.
    if (!rsvp) return;

    const { eventId } = firestoreEvent.params;
    const eventSnap = await getFirestore().doc(`events/${eventId}`).get();
    if (!eventSnap.exists) {
      logger.warn("RSVP written for a missing event; no email sent", { eventId });
      return;
    }
    const eventData = eventSnap.data();
    const event = {
      ...eventData,
      // Timestamp -> Date once, here, so email.js stays free of Firebase types.
      date: eventData.date?.toDate ? eventData.date.toDate() : null,
    };

    const isNew = !before;
    const notifyHost = isNew || hasAttendanceChanged(before, rsvp);
    const hostEmail = eventData.createdBy;

    // Each send is isolated: the RSVP is already saved by the time this
    // runs, so a mail failure must never surface to the guest or block the
    // other recipient's email. Log and carry on rather than throwing.
    if (rsvp.email) {
      try {
        const recent = await recentRsvpCount(eventId);
        if (recent > GUEST_EMAILS_PER_WINDOW) {
          logger.warn("Guest confirmation suppressed - unusual RSVP volume", {
            eventId,
            recent,
            cap: GUEST_EMAILS_PER_WINDOW,
          });
        } else {
          await deliver({ to: rsvp.email, ...buildGuestEmail({ event, eventId, rsvp, isNew }) });
        }
      } catch (err) {
        logger.error("Guest confirmation failed", { eventId, error: err.message });
      }
    }

    // Skip the host copy when the host is the one who just RSVP'd - they
    // don't need to be told what they just did.
    const hostIsGuest =
      hostEmail && rsvp.email &&
      hostEmail.toLowerCase() === rsvp.email.toLowerCase();

    if (notifyHost && hostEmail && !hostIsGuest) {
      try {
        await deliver({ to: hostEmail, ...buildHostEmail({ event, eventId, rsvp, isNew }) });
      } catch (err) {
        logger.error("Host notification failed", { eventId, error: err.message });
      }
    }
  }
);
