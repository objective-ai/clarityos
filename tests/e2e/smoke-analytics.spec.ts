/**
 * smoke-analytics.spec.ts — Phase 8: Analytics Dashboard E2E
 *
 * Suite A (Core):  analytics page loads, KPI cards visible, date range picker works.
 * Suite B (Charts): 7 chart sections visible, no "coming soon" placeholders (if entitlement granted).
 */
import { test, expect } from './fixtures';

const TENANT = 'sunview';

test.describe('Smoke Analytics — Suite A (Core) @smoke', () => {
  test('analytics page loads without redirect', async ({ page, apiCalls }) => {
    await page.goto(`/${TENANT}/analytics`, { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');

    const url = page.url();
    expect(url).toContain('/analytics');
  });

  test('date range picker shows all 4 buttons', async ({ page }) => {
    await page.goto(`/${TENANT}/analytics`, { waitUntil: 'networkidle' });

    // Wait for content or restricted gate
    const contentOrRestricted = await Promise.race([
      page.locator('[data-testid="kpi-card"]').waitFor({ state: 'visible', timeout: 10000 }).then(() => 'content'),
      page.locator('text=Access Restricted').waitFor({ state: 'visible', timeout: 10000 }).then(() => 'restricted'),
      page.locator('button:has-text("30d")').waitFor({ state: 'visible', timeout: 10000 }).then(() => 'content'),
    ]).catch(() => 'timeout');

    if (contentOrRestricted === 'restricted') {
      test.skip(true, 'Access Restricted — test user lacks VIEW_ANALYTICS permission');
      return;
    }

    const rangeButtons = [
      await page.locator('button:has-text("7d")').count(),
      await page.locator('button:has-text("30d")').count(),
      await page.locator('button:has-text("90d")').count(),
      await page.locator('button:has-text("6mo")').count(),
    ].filter(c => c > 0).length;

    expect(rangeButtons).toBeGreaterThanOrEqual(4);
  });

  test('KPI cards are visible (at least 3 of 4)', async ({ page }) => {
    await page.goto(`/${TENANT}/analytics`, { waitUntil: 'networkidle' });

    const contentOrRestricted = await Promise.race([
      page.locator('[data-testid="kpi-card"]').waitFor({ state: 'visible', timeout: 10000 }).then(() => 'content'),
      page.locator('text=Access Restricted').waitFor({ state: 'visible', timeout: 10000 }).then(() => 'restricted'),
      page.locator('button:has-text("30d")').waitFor({ state: 'visible', timeout: 10000 }).then(() => 'content'),
    ]).catch(() => 'timeout');

    if (contentOrRestricted === 'restricted') {
      test.skip(true, 'Access Restricted — test user lacks VIEW_ANALYTICS permission');
      return;
    }

    await page.waitForLoadState('networkidle');

    const kpiPatients = await page.locator('text=/Total Patients/i').count();
    const kpiExams = await page.locator('text=/Exams/i').count();
    const kpiDuration = await page.locator('text=/Exam Duration|Avg Duration/i').count();
    const kpiRevenue = await page.locator('text=/Revenue/i').count();

    const kpiCount = [kpiPatients, kpiExams, kpiDuration, kpiRevenue].filter(c => c > 0).length;
    expect(kpiCount).toBeGreaterThanOrEqual(3);
  });

  test('no hardcoded placeholder revenue value', async ({ page }) => {
    await page.goto(`/${TENANT}/analytics`, { waitUntil: 'networkidle' });

    const contentOrRestricted = await Promise.race([
      page.locator('[data-testid="kpi-card"]').waitFor({ state: 'visible', timeout: 10000 }).then(() => 'content'),
      page.locator('text=Access Restricted').waitFor({ state: 'visible', timeout: 10000 }).then(() => 'restricted'),
      page.locator('button:has-text("30d")').waitFor({ state: 'visible', timeout: 10000 }).then(() => 'content'),
    ]).catch(() => 'timeout');

    if (contentOrRestricted === 'restricted') {
      test.skip(true, 'Access Restricted — test user lacks VIEW_ANALYTICS permission');
      return;
    }

    const hardcodedRevenue = await page.locator('text=$48.2K').count();
    expect(hardcodedRevenue).toBe(0);
  });
});

test.describe('Smoke Analytics — Suite B (Charts) @smoke', () => {
  test('7 chart sections are visible (at least 5)', async ({ page, consoleErrors }) => {
    await page.goto(`/${TENANT}/analytics`, { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');

    // Check for upsell / feature gate
    const upsell = await page.locator('text=/upgrade|upsell|premium|advanced analytics/i').count();
    if (upsell > 0) {
      test.skip(true, 'Upsell card visible — test user does not have ADVANCED_ANALYTICS entitlement');
      return;
    }

    const chartLabels = [
      'Encounter Volume',
      'Revenue Trend',
      'Top Diagnoses',
      'Claims Pipeline',
      'Appointment Utilization',
      'Patient Growth',
      'Rx / Optical',
    ];

    const foundCharts: string[] = [];
    for (const label of chartLabels) {
      const count = await page.locator(`text=${label}`).count();
      if (count > 0) foundCharts.push(label);
    }

    expect(foundCharts.length).toBeGreaterThanOrEqual(5);
  });

  test('no "coming soon" placeholders when entitlement is granted', async ({ page }) => {
    await page.goto(`/${TENANT}/analytics`, { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');

    const upsell = await page.locator('text=/upgrade|upsell|premium|advanced analytics/i').count();
    if (upsell > 0) {
      test.skip(true, 'Upsell card visible — test user does not have ADVANCED_ANALYTICS entitlement');
      return;
    }

    const comingSoon = await page.locator('text=/coming soon/i').count();
    expect(comingSoon).toBe(0);
  });

  test('no console errors on analytics page', async ({ page, consoleErrors }) => {
    await page.goto(`/${TENANT}/analytics`, { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');

    expect(consoleErrors.length).toBe(0);
  });
});
