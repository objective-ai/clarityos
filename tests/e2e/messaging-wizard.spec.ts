/**
 * @messaging Onboarding Wizard happy path (CRM-13).
 *
 * Skips when TWILIO/POSTMARK are not configured — provisioning + test-send
 * call real providers. Use staging credentials for the full run.
 */
import { test, expect } from "@playwright/test";
import { seedClinicWithMessaging } from "./fixtures/messaging";

const REQUIRES_LIVE = !process.env.TWILIO_ACCOUNT_SID || !process.env.POSTMARK_SERVER_TOKEN;

test.describe("@messaging Messaging Onboarding Wizard", () => {
  test.skip(REQUIRES_LIVE, "Live Twilio + Postmark credentials required");

  test("walks all 7 steps and activates messaging", async ({ page }) => {
    const { tenantSlug } = await seedClinicWithMessaging(page, {
      messagingEnabled: false,
    });
    await page.goto(`/${tenantSlug}/settings/messaging/onboarding`);

    await expect(page.getByRole("progressbar")).toBeVisible();

    // Step 1 — Compliance acknowledgment
    await page
      .getByRole("checkbox", { name: /Acknowledge BAA and TCPA compliance/i })
      .check();
    await page.getByRole("button", { name: /Continue/i }).click();

    // Step 2 — clinic info
    await page.getByLabel(/Owner phone/i).fill(process.env.E2E_OWNER_PHONE ?? "+15555550100");
    await page
      .getByLabel(/Owner email/i)
      .fill(process.env.E2E_OWNER_EMAIL ?? "duytran@yahoo.com");
    await page.getByRole("button", { name: /Continue/i }).click();

    // Step 3 — provision number
    await page.getByLabel(/area code/i).fill(process.env.E2E_AREA_CODE ?? "415");
    await page.getByRole("button", { name: /Provision Number/i }).click();
    await expect(page.getByText(/^\+1\d{10}$/)).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: /Continue/i }).click();

    // Steps 4 + 5 — preset radios (default selected)
    await page.getByRole("button", { name: /Continue/i }).click();
    await page.getByRole("button", { name: /Continue/i }).click();

    // Step 6 — pick optometry pack and seed
    await page.getByLabel(/practice type/i).selectOption("optometry");
    await page.getByRole("button", { name: /Seed Templates/i }).click();
    await expect(page.getByText(/Seeded \d+ default templates/i)).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("button", { name: /Continue/i }).click();

    // Step 7 — test send + activate
    await page.getByRole("button", { name: /Send Test Message/i }).click();
    await expect(
      page.getByRole("button", { name: /I Received Them/i }),
    ).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: /I Received Them/i }).click();
    await expect(page.getByText(/You're all set/i)).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByText(/appointment reminders automatically/i),
    ).toBeVisible();
  });
});
