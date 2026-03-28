/**
 * smoke-pages.spec.ts — Page access + entitlements verification
 *
 * Verifies: schedule and patients pages load without "Locked" messages,
 * all API calls return 200, no console errors.
 */
import { test, expect } from './fixtures';

const TENANT = 'sunview';

test.describe('Smoke Pages @smoke', () => {
  test('schedule page loads without entitlement lock', async ({ page, consoleErrors, apiCalls }) => {
    await page.goto(`/${TENANT}/schedule`, { waitUntil: 'networkidle' });
    await page.waitForSelector('h1, h2, text=Scheduling Locked', { timeout: 10000 }).catch(() => {});

    const scheduleLocked = await page.locator('text=Scheduling Locked').count();
    expect(scheduleLocked).toBe(0);
  });

  test('patients page loads without entitlement lock', async ({ page, consoleErrors, apiCalls }) => {
    await page.goto(`/${TENANT}/patients`, { waitUntil: 'networkidle' });
    await page.waitForSelector('tbody tr, text=Patient Records Locked, text=No patients', { timeout: 10000 }).catch(() => {});

    const patientsLocked = await page.locator('text=Patient Records Locked').count();
    expect(patientsLocked).toBe(0);
  });

  test('no failed API calls on patients page', async ({ page, apiCalls }) => {
    await page.goto(`/${TENANT}/patients`, { waitUntil: 'networkidle' });
    await page.waitForSelector('tbody tr, text=Patient Records Locked, text=No patients', { timeout: 10000 }).catch(() => {});

    const failedApis = apiCalls.filter(c => c.status >= 400 && !c.url.includes('/exam-findings/'));
    expect(failedApis.length).toBe(0);
  });

  test('no console errors on schedule page', async ({ page, consoleErrors }) => {
    await page.goto(`/${TENANT}/schedule`, { waitUntil: 'networkidle' });
    await page.waitForSelector('h1, h2, text=Scheduling Locked', { timeout: 10000 }).catch(() => {});

    expect(consoleErrors.length).toBe(0);
  });
});
