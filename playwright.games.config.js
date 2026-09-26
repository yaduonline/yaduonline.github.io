// @ts-check
import { defineConfig, devices } from '@playwright/test';

// Separate config for the game specs, on a port of their own. The root
// config reuses whatever is already listening on 8000, which on a machine with
// another project's server running means testing the wrong site; this one
// always starts its own server, so a clash fails loudly instead.
//
//   npx playwright test -c playwright.games.config.js
export default defineConfig({
  testDir: './tests',
  testMatch: 'unjam.spec.js',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://127.0.0.1:8002',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'python3 -m http.server 8002 --bind 127.0.0.1',
    url: 'http://127.0.0.1:8002',
    reuseExistingServer: false,
  },
});
