import { mountAuthWidget } from "./auth-widget.js";
import { db } from "./firebase-init.js";
import { createEvent, renderEventCard, wirePhotoPreview } from "./events.js";
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
const createPhotoPreview = document.getElementById("create-photo-preview");
const createPhotoStatus = document.getElementById("create-photo-status");

splitGuestsCheckbox.addEventListener("change", () => {
  childAgeLabel.hidden = !splitGuestsCheckbox.checked;
});
wirePhotoPreview(createForm.querySelector('[name="photo"]'), createPhotoPreview);

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
  const photoFile = fd.get("photo");
  const hasPhoto = photoFile && photoFile.size > 0;
  const submitBtn = createForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  if (hasPhoto) {
    createPhotoStatus.textContent = "Uploading photo…";
    createPhotoStatus.hidden = false;
  }
  try {
    const { photoError } = await createEvent(
      {
        title: fd.get("title").trim(),
        description: (fd.get("description") || "").trim(),
        location: (fd.get("location") || "").trim(),
        hostName: (fd.get("hostName") || "").trim(),
        isOpen,
        date,
        splitGuestsByAge,
        childAgeThreshold: splitGuestsByAge ? Number(fd.get("childAgeThreshold")) || 13 : null,
      },
      hasPhoto ? photoFile : null
    );
    if (photoError) {
      createError.textContent = "Event created, but the photo couldn't be uploaded: " + photoError;
      createError.hidden = false;
    }
    createForm.reset();
    childAgeLabel.hidden = true;
    createPhotoPreview.hidden = true;
    await loadMyEvents();
  } catch (err) {
    createError.textContent = err.message;
    createError.hidden = false;
  } finally {
    submitBtn.disabled = false;
    createPhotoStatus.hidden = true;
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
