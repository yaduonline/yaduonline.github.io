import { mountAuthWidget } from "./auth-widget.js";
import { db } from "./firebase-init.js";
import { createEvent, renderEventCard } from "./events.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  orderBy,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const authContainer = document.getElementById("auth-widget");
const signedOutHint = document.getElementById("signed-out-hint");
const myEventsSection = document.getElementById("my-events-section");
const createForm = document.getElementById("create-event-form");
const createError = document.getElementById("create-error");
const eventListEl = document.getElementById("event-list");
const myEventsEmpty = document.getElementById("my-events-empty");
const splitGuestsCheckbox = document.getElementById("split-guests-checkbox");
const childAgeLabel = document.getElementById("child-age-label");

splitGuestsCheckbox.addEventListener("change", () => {
  childAgeLabel.hidden = !splitGuestsCheckbox.checked;
});

let currentUser = null;

mountAuthWidget(authContainer, async (user) => {
  currentUser = user;
  if (!user) {
    myEventsSection.hidden = true;
    signedOutHint.hidden = false;
    return;
  }
  signedOutHint.hidden = true;
  myEventsSection.hidden = false;
  await loadMyEvents();
});

createForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  createError.hidden = true;
  const fd = new FormData(createForm);
  const isOpen = fd.get("isOpen") === "on";
  const splitGuestsByAge = fd.get("splitGuestsByAge") === "on";
  const dateVal = fd.get("date");
  const date = dateVal ? Timestamp.fromDate(new Date(dateVal)) : null;
  try {
    await createEvent({
      title: fd.get("title").trim(),
      description: (fd.get("description") || "").trim(),
      location: (fd.get("location") || "").trim(),
      hostName: (fd.get("hostName") || "").trim(),
      isOpen,
      date,
      splitGuestsByAge,
      childAgeThreshold: splitGuestsByAge ? Number(fd.get("childAgeThreshold")) || 13 : null,
    });
    createForm.reset();
    childAgeLabel.hidden = true;
    await loadMyEvents();
  } catch (err) {
    createError.textContent = err.message;
    createError.hidden = false;
  }
});

async function loadMyEvents() {
  eventListEl.innerHTML = "Loading...";
  myEventsEmpty.hidden = true;
  const snap = await getDocs(query(collection(db, "userEvents", currentUser.uid, "items"), orderBy("createdAt", "desc")));
  eventListEl.innerHTML = "";
  if (snap.empty) {
    myEventsEmpty.hidden = false;
    return;
  }
  const events = await Promise.all(
    snap.docs.map(async (itemDoc) => {
      const eventSnap = await getDoc(doc(db, "events", itemDoc.id));
      return eventSnap.exists() ? { id: itemDoc.id, data: eventSnap.data() } : null;
    })
  );
  events.filter(Boolean).forEach(({ id, data }) => {
    eventListEl.appendChild(renderEventCard(id, data));
  });
}
