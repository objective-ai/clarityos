// E2E smoke — Patient Billing tab (INS-07, plan 09-05)
import { test, expect } from './fixtures';

const TENANT = 'sunview';
// Margaret Chen — d0000000-0000-0000-0000-000000000001
const PATIENT_ID = 'd0000000-0000-0000-0000-000000000001';

test('billing tab renders correctly @smoke', async ({ page }) => {
  await page.goto(`/${TENANT}/patients/${PATIENT_ID}`, { waitUntil: 'networkidle' });
  await page.click('button:has-text("Billing")');
  await page.waitForLoadState('networkidle');

  const hasHeading = await page.locator('text="Billing History"').isVisible().catch(() => false);
  const hasEmpty = await page.locator('text="No superbills on file"').isVisible().catch(() => false);
  const hasTable = await page.locator('table').isVisible().catch(() => false);

  expect(hasHeading, 'Billing History heading should be visible').toBe(true);
  expect(hasEmpty || hasTable, 'Table or empty state should be visible').toBe(true);
});
