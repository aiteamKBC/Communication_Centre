import { defineConfig, devices } from '@playwright/test';

// Isolated port: the normal :3000 can belong to the user's separate LMS project.
export default defineConfig({
  testDir: './tests/ui',
  testMatch: 'learner-satisfaction.spec.ts',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: { baseURL: 'http://127.0.0.1:3197', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 3197 --strictPort',
    url: 'http://127.0.0.1:3197', reuseExistingServer: false, timeout: 120_000,
    env: { VITE_ENABLE_ACTIVITY_TRACKING: 'false', VITE_ENABLE_REALTIME: 'false' },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
