import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  retries: 0,
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: false,
    timeout: 120000,
  },
  use: {
    baseURL: 'http://localhost:3000',
    headless: false,
    launchOptions: {
      slowMo: 300,
    },
    trace: 'on-first-retry',
    permissions: ['geolocation'],
    geolocation: {
      latitude: 10.7769,
      longitude: 106.7009,
    },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        browserName: 'chromium',
      },
    },
  ],
});
