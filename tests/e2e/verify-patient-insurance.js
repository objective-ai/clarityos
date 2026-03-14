// E2E smoke — Patient Insurance tab (INS-04, plan 09-05)
// Navigates to a patient detail page, clicks the Insurance tab, and asserts
// the tab content is visible (either a primary insurance card or empty state).
const { chromium } = require("playwright");
const { loginOrRestore } = require("./helpers/test-utils");

const TENANT = "sunview";
// Margaret Chen — d0000000-0000-0000-0000-000000000001
const PATIENT_ID = "d0000000-0000-0000-0000-000000000001";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await loginOrRestore(context, page);

  // Navigate to patient detail
  await page.goto(`/${TENANT}/patients/${PATIENT_ID}`, { waitUntil: "networkidle" });

  // Click Insurance tab
  await page.click('button:has-text("Insurance")');

  // Wait for tab content to render
  await page.waitForTimeout(500);

  // Assert: Insurance tab shows primary card or empty state
  const hasCard = await page.locator('text="Primary Insurance"').isVisible().catch(() => false);
  const hasEmpty = await page.locator('text="No Primary Insurance on file"').isVisible().catch(() => false);
  const hasPrimaryBadge = await page.locator('text="Primary"').isVisible().catch(() => false);

  if (hasCard || hasEmpty || hasPrimaryBadge) {
    console.log("PASS — Insurance tab rendered correctly");
  } else {
    console.error("FAIL — Insurance tab content not found");
    process.exit(1);
  }

  await browser.close();
})();
