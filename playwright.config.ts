import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts', // .js files excluded until migrated
  timeout: 30_000,
  expect: { timeout: 5_000 },
  workers: 1, // sequential — avoids Supabase session conflicts
  retries: 1,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report' }]],
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL: process.env.TARGET_URL || 'http://localhost:3001',
    viewport: { width: 1920, height: 1080 },
    storageState: '.playwright/.auth/user.json',
    video: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium' },
    {
      // Tests that need an unauthenticated browser context — tagged @auth
      name: 'auth-flows',
      use: { storageState: undefined },
      grep: /@auth/,
    },
  ],
});
