/**
 * fixtures.ts — Shared Playwright test fixtures
 *
 * Provides:
 *   - page: pre-authenticated (uses storageState from playwright.config.ts)
 *   - apiCalls: array of { url, status } for all network responses
 *   - consoleErrors: array of console error message strings (filtered)
 */
import { test as base } from '@playwright/test';

interface ApiCall {
  url: string;
  status: number;
}

interface TestFixtures {
  apiCalls: ApiCall[];
  consoleErrors: string[];
}

const IGNORED_CONSOLE_PATTERNS = [
  'data-theme',
  'Extra attributes from the server',
  'Failed to load resource',
];

export const test = base.extend<TestFixtures>({
  apiCalls: async ({ page }, use) => {
    const calls: ApiCall[] = [];
    page.on('response', (response) => {
      calls.push({ url: response.url(), status: response.status() });
    });
    await use(calls);
  },

  consoleErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        const ignored = IGNORED_CONSOLE_PATTERNS.some((p) => text.includes(p));
        if (!ignored) errors.push(text);
      }
    });
    await use(errors);
  },
});

export { expect } from '@playwright/test';

/** Filter out expected API failures (exam-findings 204s etc.) */
export function getFailedApiCalls(apiCalls: ApiCall[]): ApiCall[] {
  return apiCalls.filter(
    (c) => c.status >= 400 && !c.url.includes('/exam-findings/')
  );
}
