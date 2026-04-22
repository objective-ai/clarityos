/**
 * system-status.spec.ts — Phase 10.3 Plan 07
 *
 * E2E coverage for OWNER-only Admin > System section + TopNav HealthDot.
 *
 * Suite A (OWNER) — runs with the default storageState (duytran@yahoo.com, OWNER of sunview):
 *   1. OWNER sees System section in /admin sidebar, three panels render
 *   2. TopNav health-dot visible for OWNER
 *   3. Dot color reflects mocked green health response
 *   4. Dot color reflects mocked red health response (postgres down)
 *   5. Recent Errors table renders mocked Sentry issues
 *
 * Suite B (non-OWNER) — attempts to use tests/e2e/.auth/doctor.json if present.
 *   If that storageState does not exist yet, the doctor tests are skipped with a
 *   clear note so the spec still passes. Creating that state is a one-time setup
 *   that can be added later without touching this file. See README note below.
 *
 *   6. Non-OWNER deep-linking ?section=system gets "Not available" (no section leak)
 *   7. TopNav health-dot absent for non-OWNER
 *
 * Selectors verified against:
 *   - components/topnav/HealthDot.tsx          data-testid="health-dot", span with bg-* class
 *   - components/admin/SystemStatusSection.tsx "System Status" title
 *   - components/admin/system/ServiceHealthPanel.tsx  "Service Health" heading
 *   - components/admin/system/RecentErrorsPanel.tsx   "Recent Errors" heading
 *   - components/admin/system/UptimePanel.tsx         "Uptime & Deploy" heading
 *   - app/(tenant)/[tenant]/admin/page.tsx             "Not available" soft-deny card
 */
import * as fs from 'fs';
import * as path from 'path';
import { type Page, type Route } from '@playwright/test';
import { test, expect } from './fixtures';

const TENANT = 'sunview';
const DOCTOR_AUTH_FILE = path.resolve(
  __dirname,
  '../../tests/e2e/.auth/doctor.json'
);
const doctorAuthExists = fs.existsSync(DOCTOR_AUTH_FILE);

// Helper: mock the health endpoint with a given response body
async function mockHealth(page: Page, body: unknown): Promise<void> {
  await page.route('**/api/system/health', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    })
  );
}

async function mockErrors(
  page: Page,
  issues: Array<Record<string, unknown>>
): Promise<void> {
  await page.route('**/api/system/errors', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        issues,
        fetchedAt: new Date().toISOString(),
        cached: false,
      }),
    })
  );
}

async function mockUptime(page: Page): Promise<void> {
  await page.route('**/api/system/uptime', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        uptimePct: 99.9,
        samplesTotal: 1000,
        samplesGreen: 999,
        windowStart: new Date(Date.now() - 7 * 86_400_000).toISOString(),
        windowEnd: new Date().toISOString(),
        deploySha: 'abc1234',
      }),
    })
  );
}

function okHealthBody() {
  return {
    api: 'ok' as const,
    postgres: { status: 'ok' as const, latencyMs: 2 },
    supabaseAuth: { status: 'ok' as const, latencyMs: 40 },
    version: 'abc1234',
    checkedAt: new Date().toISOString(),
  };
}

function pgDownHealthBody() {
  return {
    api: 'ok' as const,
    postgres: { status: 'down' as const, latencyMs: 2 },
    supabaseAuth: { status: 'ok' as const, latencyMs: 40 },
    version: 'abc1234',
    checkedAt: new Date().toISOString(),
  };
}

test.describe('System Status — OWNER', () => {
  test('owner sees System section with three panels', async ({ page }) => {
    await mockHealth(page, okHealthBody());
    await mockErrors(page, []);
    await mockUptime(page);

    await page.goto(`/${TENANT}/admin?section=system`, {
      waitUntil: 'networkidle',
    });

    // Section header present
    await expect(
      page.getByRole('heading', { name: /System Status/i })
    ).toBeVisible();

    // All three panel headings present
    await expect(
      page.getByRole('heading', { name: /Service Health/i })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /Recent Errors/i })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /Uptime & Deploy/i })
    ).toBeVisible();
  });

  test('topnav health-dot visible for OWNER', async ({ page }) => {
    await mockHealth(page, okHealthBody());

    await page.goto(`/${TENANT}/admin`, { waitUntil: 'networkidle' });
    await expect(page.getByTestId('health-dot')).toBeVisible();
  });

  test('topnav dot color — mocked green', async ({ page }) => {
    await mockHealth(page, okHealthBody());

    await page.goto(`/${TENANT}/admin`, { waitUntil: 'networkidle' });
    const dot = page.getByTestId('health-dot');
    await expect(dot).toBeVisible();

    const span = dot.locator('span').first();
    // Wait until the 60s poll's initial load() resolves and paints the class
    await expect(span).toHaveClass(/bg-\[#2DD4BF\]/, { timeout: 10_000 });
  });

  test('topnav dot color — mocked red when postgres down', async ({ page }) => {
    await mockHealth(page, pgDownHealthBody());

    await page.goto(`/${TENANT}/admin`, { waitUntil: 'networkidle' });
    const dot = page.getByTestId('health-dot');
    await expect(dot).toBeVisible();

    const span = dot.locator('span').first();
    await expect(span).toHaveClass(/bg-red-500/, { timeout: 10_000 });
  });

  test('recent errors table renders mocked Sentry issues', async ({
    page,
  }) => {
    await mockHealth(page, okHealthBody());
    await mockUptime(page);
    await mockErrors(page, [
      {
        id: '1',
        title: 'TypeError: foo is not a function',
        count: 5,
        userCount: 2,
        lastSeen: new Date().toISOString(),
        firstSeen: new Date().toISOString(),
        permalink: 'https://sentry.io/issues/1/',
        environment: 'production',
      },
      {
        id: '2',
        title: 'ValueError: bar out of range',
        count: 1,
        userCount: 1,
        lastSeen: new Date().toISOString(),
        firstSeen: new Date().toISOString(),
        permalink: 'https://sentry.io/issues/2/',
        environment: 'production',
      },
    ]);

    await page.goto(`/${TENANT}/admin?section=system`, {
      waitUntil: 'networkidle',
    });

    await expect(
      page.getByText('TypeError: foo is not a function')
    ).toBeVisible();
    await expect(
      page.getByText('ValueError: bar out of range')
    ).toBeVisible();
  });
});

test.describe('System Status — non-OWNER', () => {
  // This block requires a non-OWNER storageState at tests/e2e/.auth/doctor.json.
  // If that file is not yet generated, skip these tests with a clear note.
  // One-time setup: run a Playwright setup that logs in as a doctor
  // (duytran@yahoo.com after switchDevRole('premium_doctor')) and writes
  // tests/e2e/.auth/doctor.json. Until then, these checks are covered by the
  // vitest unit tests in tests/unit/entitlements.test.ts + topnav-health-dot.test.tsx.
  test.skip(
    !doctorAuthExists,
    'Non-OWNER storageState tests/e2e/.auth/doctor.json not present. ' +
      'Non-OWNER behavior is covered by tests/unit/entitlements.test.ts + topnav-health-dot.test.tsx ' +
      'until a doctor storageState is generated.'
  );

  test.use({ storageState: DOCTOR_AUTH_FILE });

  test('non-owner ?section=system shows "Not available"', async ({ page }) => {
    await page.goto(`/${TENANT}/admin?section=system`, {
      waitUntil: 'networkidle',
    });

    // Soft-deny card (no leak of section existence)
    await expect(page.getByText(/Not available/i)).toBeVisible();

    // The three panel headings must NOT render
    await expect(
      page.getByRole('heading', { name: /Service Health/i })
    ).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: /Recent Errors/i })
    ).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: /Uptime & Deploy/i })
    ).toHaveCount(0);
  });

  test('topnav health-dot hidden for non-owner', async ({ page }) => {
    await page.goto(`/${TENANT}/admin`, { waitUntil: 'networkidle' });
    await expect(page.getByTestId('health-dot')).toHaveCount(0);
  });
});
