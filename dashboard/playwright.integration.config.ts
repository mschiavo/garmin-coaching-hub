import {defineConfig} from '@playwright/test';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (url !== 'http://127.0.0.1:54321' || !key) {
  throw new Error('Refusing non-local Supabase integration target');
}

export default defineConfig({
  testDir: './tests',
  testMatch: '**/supabase.integration.spec.ts',
  timeout: 90000,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:4179',
    browserName: 'chromium',
    viewport: {width: 1440, height: 1000},
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4179 --strictPort',
    env: {
      VITE_SUPABASE_URL: url,
      VITE_SUPABASE_PUBLISHABLE_KEY: key,
      VITE_GARMIN_TIMEZONE: 'Europe/Rome',
    },
    url: 'http://127.0.0.1:4179/',
    reuseExistingServer: false,
    timeout: 60000,
  },
});
