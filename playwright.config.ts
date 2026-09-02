import { defineConfig, devices } from '@playwright/test';

/* Point at an already-running server to test something else — e.g.
   the built output:  node tools/serve.js 5174 dist
                      BASE_URL=http://localhost:5174 npx playwright test */
const BASE_URL = process.env.BASE_URL;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'line',
  use: {
    baseURL: BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile',   use: { ...devices['Pixel 7'] } },
  ],
  // when BASE_URL is set the server is managed outside of Playwright
  webServer: BASE_URL ? undefined : {
    command: 'node tools/serve.js 5173',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 20_000,
  },
});
