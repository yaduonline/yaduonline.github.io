import { mountAuthWidget } from "./auth-widget.js";
import { db } from "./firebase-init.js";
import { isAdminUser } from "./auth.js";
import { createEvent, renderEventCard } from "./events.js";
import {
  collection,
  getDocs,
  query,
  orderBy,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const authContainer = document.getElementById("auth-widget");
const signedOutHint = document.getElementById("signed-out-hint");
const notAdminHint = document.getElementById("not-admin-hint");
const adminSection = document.getElementById("admin-section");
const createForm = document.getElementById("create-event-form");
const eventListEl = document.getElementById("event-list");
const splitGuestsCheckbox = document.getElementById("split-guests-checkbox");
const childAgeLabel = document.getElementById("child-age-label");

splitGuestsCheckbox.addEventListener("change", () => {
  childAgeLabel.hidden = !splitGuestsCheckbox.checked;
});

function showOnly(el) {
  [signedOutHint, notAdminHint, adminSection].forEach((e) => {
    e.hidden = e !== el;
  });
}

mountAuthWidget(authContainer, async (user) => {
  if (!user) {
    showOnly(signedOutHint);
    return;
  }
  if (!isAdminUser(user)) {
    showOnly(notAdminHint);
    return;
  }
  showOnly(adminSection);
  await loadEvents();
});

createForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(createForm);
  const isOpen = fd.get("isOpen") === "on";
  const splitGuestsByAge = fd.get("splitGuestsByAge") === "on";
  const dateVal = fd.get("date");
  const date = dateVal ? Timestamp.fromDate(new Date(dateVal)) : null;
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
  await loadEvents();
});

async function loadEvents() {
  eventListEl.innerHTML = "Loading...";
  const snap = await getDocs(query(collection(db, "events"), orderBy("createdAt", "desc")));
  eventListEl.innerHTML = "";
  if (snap.empty) {
    eventListEl.innerHTML = '<p class="hint">No events yet.</p>';
    return;
  }
  snap.forEach((docSnap) => {
    eventListEl.appendChild(renderEventCard(docSnap.id, docSnap.data()));
  });
}
