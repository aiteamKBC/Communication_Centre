import { defineConfig, devices } from '@playwright/test';
import audit from './playwright.audit.config';

export default defineConfig({
  ...audit,
  testMatch: ['administration.spec.ts', 'permissions.spec.ts'],
  outputDir: './test-results/audit/administration',
  projects: [{
    name: 'chromium',
    use: { ...devices['Desktop Chrome'], ...(process.platform === 'win32' ? { channel: 'msedge' } : {}) },
  }],
});
