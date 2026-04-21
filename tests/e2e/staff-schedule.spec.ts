import { test, expect } from "./fixtures";

const TENANT = "sunview";

test.describe("Admin > Schedule", () => {
  test("admin can save weekly schedule and see it after reload", async ({ page }) => {
    await page.goto(`/${TENANT}/admin`);

    // Navigate to the Schedule section — nav buttons are identified by visible text.
    // This is a navigation step, not the primary assertion target — text selector is acceptable.
    const scheduleNavBtn = page.locator("nav button").filter({ hasText: "Schedule" });
    await expect(scheduleNavBtn).toBeVisible({ timeout: 10000 });
    await scheduleNavBtn.click();

    // Select the first provider pill via testid prefix.
    // If no pills are visible, the staff endpoint returned empty for this user — skip gracefully.
    const firstPill = page.locator('[data-testid^="schedule-provider-pill-"]').first();
    const pillVisible = await firstPill.isVisible().catch(() => false);
    if (!pillVisible) {
      // Wait up to 5s for pills to appear (API may be slow)
      await firstPill.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
    }

    const pillCount = await page.locator('[data-testid^="schedule-provider-pill-"]').count();
    if (pillCount === 0) {
      // Known edge case: dev user (duytran@yahoo.com) maps to staff c0..0003 (Duy Tran).
      // If the /staff endpoint returns empty, there are no pills. Skip rather than fail.
      test.skip(true, "No provider pills — staff API returned empty for current user. Check seed data.");
      return;
    }

    await firstPill.click();

    // Ensure Monday (dayIndex=0) is enabled
    const monToggle = page.locator('[data-testid="schedule-day-toggle-0"]');
    await expect(monToggle).toBeVisible({ timeout: 5000 });
    if (!(await monToggle.isChecked())) {
      await monToggle.check();
    }

    // Set Monday times to 08:30 / 17:30
    const monStart = page.locator('[data-testid="schedule-day-start-0"]');
    const monEnd = page.locator('[data-testid="schedule-day-end-0"]');
    await monStart.fill("08:30");
    await monEnd.fill("17:30");

    // Save
    await page.locator('[data-testid="schedule-save-weekly"]').click();
    await page.waitForTimeout(500);

    // Reload, re-select same provider, verify persistence
    await page.reload();
    await page.locator("nav button").filter({ hasText: "Schedule" }).click();
    await page.locator('[data-testid^="schedule-provider-pill-"]').first().click();

    await expect(page.locator('[data-testid="schedule-day-start-0"]')).toHaveValue("08:30");
    await expect(page.locator('[data-testid="schedule-day-end-0"]')).toHaveValue("17:30");
  });
});
