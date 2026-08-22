// @ts-check
import { defineConfig, devices } from '@playwright/test';

// Separate config for the invites/ app: it's deployed to Firebase Hosting
// with invites/ as the web root (so /styles.css, /js/app.js etc. resolve
// relative to that directory), which differs from the root site's
// playwright.config.js webServer (which serves the whole repo as root).
export default defineConfig({
  testDir: './tests',
  testMatch: 'invites.spec.js',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://127.0.0.1:8001',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'python3 -m http.server 8001 --directory invites',
    url: 'http://127.0.0.1:8001',
    reuseExistingServer: !process.env.CI,
  },
});
