// E2E smoke — Patient Insurance tab (INS-04, plan 09-05)
import { test, expect } from './fixtures';

const TENANT = 'sunview';
// Margaret Chen — d0000000-0000-0000-0000-000000000001
const PATIENT_ID = 'd0000000-0000-0000-0000-000000000001';

test('insurance tab renders correctly @smoke', async ({ page }) => {
  await page.goto(`/${TENANT}/patients/${PATIENT_ID}`, { waitUntil: 'networkidle' });
  await page.click('button:has-text("Insurance")');
  await page.waitForLoadState('networkidle');

  const hasCard = await page.locator('text="Primary Insurance"').isVisible().catch(() => false);
  const hasEmpty = await page.locator('text="No Primary Insurance on file"').isVisible().catch(() => false);
  const hasPrimaryBadge = await page.locator('text="Primary"').isVisible().catch(() => false);

  expect(
    hasCard || hasEmpty || hasPrimaryBadge,
    'Insurance tab should show primary insurance card or empty state'
  ).toBe(true);
});
