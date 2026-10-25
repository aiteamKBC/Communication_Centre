import { defineConfig, devices } from '@playwright/test';
const root = 'E:/Kent/LMS_v2/Communication_Centre/frontend';
export default defineConfig({
  testDir: `${root}/tests/ui`, timeout: 45_000, expect: { timeout: 10_000 },
  outputDir: 'C:/Users/khalil/AppData/Local/Temp/claude/E--Kent-LMS-v2-Communication-Centre/f04156ee-649d-48a4-81c3-45fa189bc6f9/scratchpad/pw-results',
  use: { baseURL: 'http://127.0.0.1:3107', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: {
    command: 'cmd /c "set VITE_ENABLE_ACTIVITY_TRACKING=false&& set VITE_ENABLE_REALTIME=false&& npm.cmd run dev -- --host 127.0.0.1 --port 3107 --strictPort"',
    cwd: root, url: 'http://127.0.0.1:3107', reuseExistingServer: false, timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
