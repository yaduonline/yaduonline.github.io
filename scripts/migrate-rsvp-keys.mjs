#!/usr/bin/env node
// ONE-OFF MIGRATION - safe to delete once it has been run successfully.
//
// RSVP documents used to be keyed by Firebase Auth uid. They are now keyed
// by lowercased email, so that a guest can RSVP to an open event without an
// account at all (see invites/docs/DESIGN.md, "No-account RSVP"). This moves
// any remaining uid-keyed RSVP onto its email key.
//
// For each RSVP it: copies the document to the new key, reads it back to
// verify the copy landed, and only then deletes the original. Documents that
// already look email-keyed are skipped, so re-running it is harmless.
//
// Auth: reuses the local firebase-tools login (`npx firebase-tools login`),
// which must be an owner/editor on the project. No credential is read,
// printed, or stored by this script beyond passing the token to Google.
//
//   node scripts/migrate-rsvp-keys.mjs            # dry run, changes nothing
//   node scripts/migrate-rsvp-keys.mjs --apply    # perform the migration

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PROJECT = "events-45ce5";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const APPLY = process.argv.includes("--apply");

const cfgPath = path.join(os.homedir(), ".config/configstore/firebase-tools.json");
if (!fs.existsSync(cfgPath)) {
  console.error("No firebase-tools login found. Run: npx firebase-tools login");
  process.exit(1);
}
const token = JSON.parse(fs.readFileSync(cfgPath, "utf8")).tokens?.access_token;
if (!token) {
  console.error("No access token in firebase-tools config. Run: npx firebase-tools login --reauth");
  process.exit(1);
}

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

const events = await api("GET", `${BASE}/events?pageSize=300`);
let moved = 0;
let skipped = 0;

for (const ev of events.documents ?? []) {
  const eventId = ev.name.split("/").pop();
  const rsvps = await api("GET", `${BASE}/events/${eventId}/rsvps?pageSize=300`);

  for (const doc of rsvps.documents ?? []) {
    const oldId = doc.name.split("/").pop();
    if (oldId.includes("@")) {
      skipped++;
      continue;
    }
    const email = doc.fields?.email?.stringValue?.trim().toLowerCase();
    if (!email) {
      console.warn(`  !! ${eventId}/${oldId} has no email field - SKIPPING, migrate by hand`);
      skipped++;
      continue;
    }
    const enc = encodeURIComponent(email);

    if (!APPLY) {
      console.log(`  would move ${eventId}/${oldId} -> ${email}`);
      moved++;
      continue;
    }

    await api("PATCH", `${BASE}/events/${eventId}/rsvps/${enc}`, { fields: doc.fields });
    const check = await api("GET", `${BASE}/events/${eventId}/rsvps/${enc}`);
    if (check.fields?.email?.stringValue?.trim().toLowerCase() !== email) {
      throw new Error(`copy verification failed for ${eventId}/${oldId} - original left in place`);
    }
    await api("DELETE", `${BASE}/events/${eventId}/rsvps/${oldId}`);
    console.log(`  moved ${eventId}/${oldId} -> ${email}`);
    moved++;
  }
}

console.log(
  APPLY
    ? `\nDone. ${moved} migrated, ${skipped} already email-keyed.`
    : `\nDry run: ${moved} would migrate, ${skipped} already email-keyed. Re-run with --apply.`
);
