// @ts-check
import { test, expect } from '@playwright/test';

// These smoke tests only cover markup/DOM behavior that doesn't require a
// live Firebase project or the local emulator suite (the Firebase SDK
// initializes fine offline; only actual sign-in/RSVP calls need the
// emulator or a real project - see the "Local dev" notes for those).

test('index page shows the sign-in form by default', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page).toHaveTitle(/Invites/);
  await expect(page.locator('form[data-mode="signin"]')).toBeVisible();
  await expect(page.locator('form[data-mode="signup"]')).toBeHidden();
  await expect(page.getByText('Sign in above to view events and RSVP.')).toBeVisible();
});

test('index page can toggle to the sign-up form', async ({ page }) => {
  await page.goto('/index.html');
  await page.getByRole('button', { name: 'Need an account? Sign up' }).click();
  await expect(page.locator('form[data-mode="signup"]')).toBeVisible();
  await expect(page.locator('form[data-mode="signin"]')).toBeHidden();
});

test('event page without an id shows the missing-link hint', async ({ page }) => {
  await page.goto('/event.html');
  await expect(page.getByText('No event was specified. Use the link you were sent.')).toBeVisible();
});

test('admin page prompts sign-in when signed out', async ({ page }) => {
  await page.goto('/admin.html');
  await expect(page.getByText("Sign in above to access the admin dashboard.")).toBeVisible();
});
