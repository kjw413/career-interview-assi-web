import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

const executable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '/usr/bin/chromium';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5176';

export default defineConfig({
  testDir: './tests',
  testIgnore: 'cloud.spec.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 2,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
    launchOptions: {
      ...(existsSync(executable) ? { executablePath: executable } : {}),
      args: ['--no-sandbox'],
    },
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: 'npm run dev -- --port 5176',
    url: 'http://127.0.0.1:5176',
    reuseExistingServer: false,
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' },
    timeout: 120_000,
  },
});
