// E2E smoke — Patient Billing tab (INS-07, plan 09-05)
// Navigates to a patient detail page, clicks the Billing tab, and asserts
// the tab content is visible (either a superbill table or empty state).
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

  // Click Billing tab
  await page.click('button:has-text("Billing")');

  // Wait for tab content to render
  await page.waitForTimeout(500);

  // Assert: Billing tab shows either the heading + table or empty state
  const hasHeading = await page.locator('text="Billing History"').isVisible().catch(() => false);
  const hasEmpty = await page.locator('text="No superbills on file"').isVisible().catch(() => false);
  const hasTable = await page.locator('table').isVisible().catch(() => false);

  if (hasHeading && (hasEmpty || hasTable)) {
    console.log("PASS — Billing tab rendered correctly");
  } else {
    console.error("FAIL — Billing tab content not found");
    process.exit(1);
  }

  await browser.close();
})();
