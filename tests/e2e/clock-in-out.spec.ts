import { test, expect } from "./fixtures";

const TENANT = "sunview";

test.describe("TopNav clock-in/out", () => {
  test("staff can clock in and clock out", async ({ page }) => {
    await page.goto(`/${TENANT}/dashboard`);

    const clockButton = page.locator('[data-testid="topnav-clock-button"]');
    await expect(clockButton).toBeVisible({ timeout: 10000 });

    // Reset to clocked-out state: if elapsed timer is visible we are already clocked in — clock out first.
    const elapsed = page.locator('[data-testid="topnav-clock-elapsed"]');
    if ((await elapsed.count()) > 0) {
      await clockButton.click();
      await expect(elapsed).toHaveCount(0, { timeout: 5000 });
    }

    // Clock in
    await clockButton.click();
    // Elapsed display appears once clocked in
    await expect(elapsed).toBeVisible({ timeout: 5000 });
    // Text format contains HH:MM digits
    await expect(elapsed).toHaveText(/\d{2}:\d{2}/);

    // Clock out
    await clockButton.click();
    await expect(elapsed).toHaveCount(0, { timeout: 5000 });
  });
});
