import {
  watchAuth,
  isAdminUser,
  signUpWithEmail,
  signInWithEmail,
  signInWithGoogle,
  signOutUser,
  sendMagicLink,
  completeMagicLinkSignIn,
  hasPassword,
  setPassword,
} from "./auth.js";
import { auth } from "./firebase-init.js";

const SIGNED_OUT_HTML = `
  <div class="auth-forms">
    <form class="auth-form" data-mode="signin">
      <h3>Sign in</h3>
      <p class="error" hidden></p>
      <label>Email <input type="email" name="email" required autocomplete="email"></label>
      <label>Password <input type="password" name="password" required autocomplete="current-password"></label>
      <button type="submit">Sign in</button>
      <button type="button" class="link-btn" data-toggle="signup">Need an account? Sign up</button>
      <button type="button" class="link-btn" data-toggle="magiclink">Email me a sign-in link</button>
    </form>
    <form class="auth-form" data-mode="signup" hidden>
      <h3>Create account</h3>
      <p class="error" hidden></p>
      <label>First name <input type="text" name="firstName" required autocomplete="given-name"></label>
      <label>Last name <input type="text" name="lastName" required autocomplete="family-name"></label>
      <label>Email <input type="email" name="email" required autocomplete="email"></label>
      <label>Password <input type="password" name="password" required minlength="6" autocomplete="new-password"></label>
      <button type="submit">Sign up</button>
      <button type="button" class="link-btn" data-toggle="signin">Already have an account? Sign in</button>
    </form>
    <form class="auth-form" data-mode="magiclink" hidden>
      <h3>Email me a sign-in link</h3>
      <p class="error" hidden></p>
      <p class="status-msg success" hidden></p>
      <label>Email <input type="email" name="email" required autocomplete="email"></label>
      <button type="submit">Send link</button>
      <button type="button" class="link-btn" data-toggle="signin">Back to sign in</button>
    </form>
    <button type="button" class="google-btn">Sign in with Google</button>
  </div>
`;

function signedInHtml(user, admin, needsPassword) {
  const name = user.displayName || user.email;
  return `
    <div class="auth-status">
      <span>Signed in as <strong>${escapeHtml(name)}</strong></span>
      ${admin ? '<a href="/admin.html" class="admin-link">Admin dashboard</a>' : ""}
      ${needsPassword ? '<button type="button" class="link-btn set-password-btn">Set a password</button>' : ""}
      <button type="button" class="sign-out-btn">Sign out</button>
    </div>
    ${needsPassword ? `
      <form class="auth-form set-password-form" hidden>
        <h3>Set a password</h3>
        <p class="error" hidden></p>
        <p class="status-msg success" hidden></p>
        <label>New password <input type="password" name="password" required minlength="6" autocomplete="new-password"></label>
        <button type="submit">Save password</button>
      </form>
    ` : ""}
  `;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function showError(form, message) {
  const err = form.querySelector(".error");
  err.textContent = message;
  err.hidden = false;
}

/**
 * Renders a sign-in/sign-up widget into `container` and keeps it in sync
 * with Firebase Auth state. `onChange(user)` fires on every auth state
 * change (including the initial one) so pages can react (e.g. load data).
 * If the current URL is a magic-link callback, completes that sign-in
 * first so the very first render already reflects it.
 */
export async function mountAuthWidget(container, onChange) {
  try {
    await completeMagicLinkSignIn();
  } catch (err) {
    console.warn("Magic link sign-in failed:", err);
  }
  watchAuth((user) => {
    render(container, user);
    if (onChange) onChange(user);
  });
}

// `onAuthStateChanged` only fires on sign-in/out transitions, not when a
// signed-in user's profile fields change (e.g. displayName via
// updateProfile) - so anything that mutates the current user's profile
// (signup, applyProfileName after a quick-RSVP) should call this afterward
// to reflect the fresh data immediately, rather than waiting on a listener
// that may never re-fire for that change.
export function refreshAuthWidget(container) {
  if (auth.currentUser) {
    render(container, auth.currentUser);
  }
}

async function render(container, user) {
  if (!user) {
    container.innerHTML = SIGNED_OUT_HTML;
    wireSignedOut(container);
    return;
  }
  let needsPassword = true;
  try {
    needsPassword = !(await hasPassword(user.uid));
  } catch (err) {
    console.warn("Could not check password status:", err);
  }
  container.innerHTML = signedInHtml(user, isAdminUser(user), needsPassword);
  wireSignedIn(container);
}

function wireSignedOut(container) {
  const signinForm = container.querySelector('form[data-mode="signin"]');
  const signupForm = container.querySelector('form[data-mode="signup"]');
  const magicForm = container.querySelector('form[data-mode="magiclink"]');
  const forms = { signin: signinForm, signup: signupForm, magiclink: magicForm };

  container.querySelectorAll("[data-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.toggle;
      Object.entries(forms).forEach(([mode, form]) => {
        form.hidden = mode !== target;
      });
    });
  });

  signinForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(signinForm);
    try {
      await signInWithEmail(fd.get("email"), fd.get("password"));
    } catch (err) {
      showError(signinForm, err.message);
    }
  });

  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(signupForm);
    try {
      await signUpWithEmail(fd.get("firstName"), fd.get("lastName"), fd.get("email"), fd.get("password"));
      refreshAuthWidget(container);
    } catch (err) {
      showError(signupForm, err.message);
    }
  });

  magicForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(magicForm);
    try {
      await sendMagicLink(fd.get("email"));
      const status = magicForm.querySelector(".status-msg");
      status.textContent = "Check your email for a sign-in link.";
      status.hidden = false;
      magicForm.querySelector(".error").hidden = true;
      magicForm.querySelector('input[name="email"]').disabled = true;
      magicForm.querySelector('button[type="submit"]').disabled = true;
    } catch (err) {
      showError(magicForm, err.message);
    }
  });

  container.querySelector(".google-btn").addEventListener("click", async () => {
    try {
      await signInWithGoogle();
    } catch (err) {
      console.warn(err);
    }
  });
}

function wireSignedIn(container) {
  container.querySelector(".sign-out-btn").addEventListener("click", () => {
    signOutUser();
  });

  const setPasswordBtn = container.querySelector(".set-password-btn");
  const setPasswordForm = container.querySelector(".set-password-form");
  if (!setPasswordBtn || !setPasswordForm) return;

  setPasswordBtn.addEventListener("click", () => {
    setPasswordForm.hidden = !setPasswordForm.hidden;
  });

  setPasswordForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(setPasswordForm);
    try {
      await setPassword(fd.get("password"));
      const status = setPasswordForm.querySelector(".status-msg");
      status.textContent = "Password set. You can now sign in with it too.";
      status.hidden = false;
      setPasswordForm.querySelector(".error").hidden = true;
      setPasswordBtn.hidden = true;
      setPasswordForm.querySelector('button[type="submit"]').disabled = true;
    } catch (err) {
      showError(setPasswordForm, err.message);
    }
  });
}
