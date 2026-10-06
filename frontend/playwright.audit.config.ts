import { defineConfig } from '@playwright/test';
import satisfaction from './playwright.satisfaction.config';

// Run every UI spec on a dedicated server, never on an existing LMS/dev server.
export default defineConfig({
  ...satisfaction,
  testMatch: '**/*.spec.ts',
  workers: 1,
  outputDir: './test-results/audit',
  use: { ...satisfaction.use, baseURL: 'http://127.0.0.1:3198' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 3198 --strictPort',
    url: 'http://127.0.0.1:3198',
    reuseExistingServer: false,
    timeout: 120_000,
    env: { VITE_ENABLE_ACTIVITY_TRACKING: 'false', VITE_ENABLE_REALTIME: 'false' },
  },
});
