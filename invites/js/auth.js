import { auth, db } from "./firebase-init.js";
import {
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  linkWithCredential,
  EmailAuthProvider,
  updatePassword,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const EMAIL_FOR_SIGN_IN_KEY = "emailForSignIn";

// Mirrors the admin allowlist in firestore.rules. This copy is UI-only
// (show/hide the admin link) - the real enforcement happens server-side.
export const ADMIN_EMAILS = ["yaduonline@gmail.com"];

export function isAdminUser(user) {
  return !!user && !!user.email && ADMIN_EMAILS.includes(user.email);
}

async function ensureUserDoc(user, extra = {}) {
  await setDoc(
    doc(db, "users", user.uid),
    {
      email: user.email,
      displayName: user.displayName || "",
      createdAt: serverTimestamp(),
      ...extra,
    },
    { merge: true }
  );
}

export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function signUpWithEmail(firstName, lastName, email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  const displayName = [firstName, lastName].filter(Boolean).join(" ");
  if (displayName) {
    await updateProfile(cred.user, { displayName });
  }
  await ensureUserDoc(cred.user, { firstName: firstName || "", lastName: lastName || "", hasPassword: true });
  return cred.user;
}

// Applies a first/last name to the current user's profile (displayName) and
// Firestore user doc. Used after a quick-RSVP magic-link sign-in, where we
// only learn the guest's name from the RSVP form itself.
export async function applyProfileName(firstName, lastName) {
  const user = auth.currentUser;
  const displayName = [firstName, lastName].filter(Boolean).join(" ");
  if (displayName && displayName !== user.displayName) {
    await updateProfile(user, { displayName });
  }
  await ensureUserDoc(user, { firstName: firstName || "", lastName: lastName || "" });
}

export async function signInWithEmail(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  await ensureUserDoc(cred.user, { hasPassword: true });
  return cred.user;
}

export async function signInWithGoogle() {
  const cred = await signInWithPopup(auth, new GoogleAuthProvider());
  await ensureUserDoc(cred.user);
  return cred.user;
}

export function signOutUser() {
  return signOut(auth);
}

// Passwordless "magic link" sign-in. Works for both brand-new and existing
// accounts (Firebase supports multiple sign-in methods per account), so this
// doubles as an always-available login option even for users who also have
// a password set.
export function sendMagicLink(email) {
  window.localStorage.setItem(EMAIL_FOR_SIGN_IN_KEY, email);
  return sendSignInLinkToEmail(auth, email, {
    url: window.location.href,
    handleCodeInApp: true,
  });
}

// Call once on page load (before reacting to auth state). If the current
// URL is a magic-link callback, completes sign-in and cleans up the URL/
// localStorage. Returns the signed-in user, or null if this wasn't a
// magic-link callback.
export async function completeMagicLinkSignIn() {
  if (!isSignInWithEmailLink(auth, window.location.href)) {
    return null;
  }
  let email = window.localStorage.getItem(EMAIL_FOR_SIGN_IN_KEY);
  if (!email) {
    email = window.prompt("Please confirm the email address this link was sent to:");
  }
  if (!email) {
    return null;
  }
  const cred = await signInWithEmailLink(auth, email, window.location.href);
  window.localStorage.removeItem(EMAIL_FOR_SIGN_IN_KEY);
  await ensureUserDoc(cred.user);
  const url = new URL(window.location.href);
  ["apiKey", "oobCode", "mode", "lang", "continueUrl"].forEach((p) => url.searchParams.delete(p));
  window.history.replaceState({}, "", url.toString());
  return cred.user;
}

// Note: user.providerData reports providerId "password" for BOTH
// password-based AND email-link-based sign-in (a documented Firebase
// quirk), so it can't be used to tell them apart, and
// fetchSignInMethodsForEmail is unreliable if the project has Email
// Enumeration Protection on. So we track this ourselves in Firestore
// instead, set whenever a password is actually created or linked.
export async function hasPassword(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return !!snap.data()?.hasPassword;
}

export async function setPassword(newPassword) {
  const user = auth.currentUser;
  try {
    await linkWithCredential(user, EmailAuthProvider.credential(user.email, newPassword));
  } catch (err) {
    // Email-link sign-in already occupies the "password" provider slot in
    // Firebase's data model (a documented quirk), so linking a new one
    // conflicts even though no real password exists yet - update it instead.
    if (err.code === "auth/provider-already-linked") {
      await updatePassword(user, newPassword);
    } else {
      throw err;
    }
  }
  await ensureUserDoc(user, { hasPassword: true });
}
