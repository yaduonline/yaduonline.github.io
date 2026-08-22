import {
  watchAuth,
  isAdminUser,
  signUpWithEmail,
  signInWithEmail,
  signInWithGoogle,
  signOutUser,
} from "./auth.js";

const SIGNED_OUT_HTML = `
  <div class="auth-forms">
    <form class="auth-form" data-mode="signin">
      <h3>Sign in</h3>
      <p class="error" hidden></p>
      <label>Email <input type="email" name="email" required autocomplete="email"></label>
      <label>Password <input type="password" name="password" required autocomplete="current-password"></label>
      <button type="submit">Sign in</button>
      <button type="button" class="link-btn" data-toggle="signup">Need an account? Sign up</button>
    </form>
    <form class="auth-form" data-mode="signup" hidden>
      <h3>Create account</h3>
      <p class="error" hidden></p>
      <label>Name <input type="text" name="name" required autocomplete="name"></label>
      <label>Email <input type="email" name="email" required autocomplete="email"></label>
      <label>Password <input type="password" name="password" required minlength="6" autocomplete="new-password"></label>
      <button type="submit">Sign up</button>
      <button type="button" class="link-btn" data-toggle="signin">Already have an account? Sign in</button>
    </form>
    <button type="button" class="google-btn">Sign in with Google</button>
  </div>
`;

function signedInHtml(user, admin) {
  const name = user.displayName || user.email;
  return `
    <div class="auth-status">
      <span>Signed in as <strong>${escapeHtml(name)}</strong></span>
      ${admin ? '<a href="/admin.html" class="admin-link">Admin dashboard</a>' : ""}
      <button type="button" class="sign-out-btn">Sign out</button>
    </div>
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
 */
export function mountAuthWidget(container, onChange) {
  watchAuth((user) => {
    if (!user) {
      container.innerHTML = SIGNED_OUT_HTML;
      wireSignedOut(container);
    } else {
      container.innerHTML = signedInHtml(user, isAdminUser(user));
      container.querySelector(".sign-out-btn").addEventListener("click", () => {
        signOutUser();
      });
    }
    if (onChange) onChange(user);
  });
}

function wireSignedOut(container) {
  const signinForm = container.querySelector('form[data-mode="signin"]');
  const signupForm = container.querySelector('form[data-mode="signup"]');

  container.querySelectorAll("[data-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.toggle;
      signinForm.hidden = target !== "signin";
      signupForm.hidden = target !== "signup";
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
      await signUpWithEmail(fd.get("name"), fd.get("email"), fd.get("password"));
    } catch (err) {
      showError(signupForm, err.message);
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
