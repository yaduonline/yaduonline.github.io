import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { initializeFirestore, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// Safari (and some privacy/ad-blocking extensions) can block Firestore's
// default fetch-streams transport with a CORS-looking "access control
// checks" error. Falling back to auto-detected long polling avoids it.
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
  useFetchStreams: false,
});

const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
if (isLocal) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}
