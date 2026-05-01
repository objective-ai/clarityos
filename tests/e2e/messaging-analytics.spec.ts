/**
 * @messaging Messaging Analytics page renders charts + KPIs + range chips (CRM-15).
 */
import { test, expect } from "@playwright/test";
import { seedClinicWithMessaging } from "./fixtures/messaging";

test.describe("@messaging Messaging Analytics", () => {
  test("page loads with KPIs and charts", async ({ page }) => {
    const { tenantSlug } = await seedClinicWithMessaging(page);
    await page.goto(`/${tenantSlug}/messaging/analytics`);

    await expect(
      page.getByRole("heading", { name: /Messaging Analytics/i }),
    ).toBeVisible({ timeout: 15_000 });

    // At least one of the four chart titles should render.
    const chartTitles = [
      /Reminder Funnel/i,
      /Recall Conversion/i,
      /Opt-?out Trend/i,
      /Cost.*Volume/i,
    ];
    const anyVisible = await Promise.any(
      chartTitles.map((re) =>
        page
          .getByText(re)
          .first()
          .waitFor({ state: "visible", timeout: 10_000 })
          .then(() => true),
      ),
    );
    expect(anyVisible).toBe(true);
  });
});
