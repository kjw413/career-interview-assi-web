import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
const executable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '/usr/bin/chromium';
export default defineConfig({
  testDir: './tests', testMatch: 'cloud.spec.ts', timeout: 45_000, workers: 2,
  expect: { timeout: 10_000 }, reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5174', launchOptions: { ...(existsSync(executable) ? { executablePath: executable } : {}), args: ['--no-sandbox'] }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'npm run dev -- --port 5174', url: 'http://127.0.0.1:5174', reuseExistingServer: false, timeout: 120_000, env: { VITE_SUPABASE_URL: 'https://folio-cloud-test.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_folio_browser_test' } },
});
