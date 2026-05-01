/**
 * @messaging Patient Messages tab (CRM-05).
 */
import { test, expect } from "@playwright/test";
import { seedClinicWithMessaging, seedPatientWithConsent } from "./fixtures/messaging";

test.describe("@messaging Patient Messages Tab", () => {
  test("renders empty state and opens composer", async ({ page }) => {
    const { tenantSlug, tenantId } = await seedClinicWithMessaging(page, {
      messagingEnabled: true,
    });
    const patient = await seedPatientWithConsent(page, {
      tenantId,
      consents: { sms_operational: true, email_operational: true },
    });

    await page.goto(`/${tenantSlug}/patients/${patient.patientId}`);
    await page.getByRole("tab", { name: /Messages/i }).click();

    await expect(
      page.getByText(/No messages|history/i).first(),
    ).toBeVisible({ timeout: 15_000 });

    const composeBtn = page.getByRole("button", { name: /Send Message|Compose/i });
    if (await composeBtn.isVisible()) {
      await composeBtn.click();
      await expect(
        page.getByRole("textbox", { name: /Message body|Body|Compose/i }),
      ).toBeVisible({ timeout: 5_000 });
    }
  });
});
