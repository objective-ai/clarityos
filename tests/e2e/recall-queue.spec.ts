/**
 * @messaging Recall Queue rendering + Send All flow (CRM-03 + CRM-18).
 */
import { test, expect } from "@playwright/test";
import { seedClinicWithMessaging } from "./fixtures/messaging";

test.describe("@messaging Recall Queue", () => {
  test("page loads with header + Send All control", async ({ page }) => {
    const { tenantSlug } = await seedClinicWithMessaging(page, {
      messagingEnabled: true,
    });
    await page.goto(`/${tenantSlug}/messaging/recall-queue`);

    await expect(
      page.getByRole("heading", { name: /Recall Queue/i }),
    ).toBeVisible({ timeout: 15_000 });

    // The button is present whether or not there are candidates today —
    // it'll be disabled in the empty state.
    const sendAll = page.getByRole("button", { name: /Send All Recalls/i });
    await expect(sendAll).toBeVisible();
  });
});
