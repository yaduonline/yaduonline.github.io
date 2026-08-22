import { auth, db } from "./firebase-init.js";
import {
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
  doc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

// Mirrors the admin allowlist in firestore.rules. This copy is UI-only
// (show/hide the admin link) - the real enforcement happens server-side.
export const ADMIN_EMAILS = ["yaduonline@gmail.com"];

export function isAdminUser(user) {
  return !!user && !!user.email && ADMIN_EMAILS.includes(user.email);
}

async function ensureUserDoc(user) {
  await setDoc(
    doc(db, "users", user.uid),
    {
      email: user.email,
      displayName: user.displayName || "",
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function signUpWithEmail(name, email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (name) {
    await updateProfile(cred.user, { displayName: name });
  }
  await ensureUserDoc(cred.user);
  return cred.user;
}

export async function signInWithEmail(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  await ensureUserDoc(cred.user);
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
