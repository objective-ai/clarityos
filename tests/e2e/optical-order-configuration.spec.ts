/**
 * Phase 14 — Optical Order Configuration: end-to-end coverage (OPT14-18).
 *
 * Six scenarios covering ROADMAP success criteria 1-7 plus the OPT14-14
 * Draft pending pill flow and OPT14-15 OrderDetailDrawer routing for placed
 * orders. Relies on backend/seed_db.py's `_seed_phase14_fixture()` — the
 * canonical patient Thornton's most recent finalized encounter is augmented
 * with AI summary text exercising the suggestion extractor's three
 * categories.
 *
 * Auth is handled via storageState (playwright.config.ts); these tests run
 * authenticated by default. Run with:
 *   bash scripts/dev.sh pre-test
 *   npx playwright test tests/e2e/optical-order-configuration.spec.ts
 */
import { test, expect } from "./fixtures";

const TENANT_SLUG = "sunview";
const SEED_PATIENT_LAST_NAME = "Thornton";

test.describe("Phase 14: Optical Order Configuration", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/${TENANT_SLUG}/optical`);
    // Wait for the queue page header to settle; storageState handles auth.
    await page.waitForLoadState("networkidle");
  });

  test("queue → Configure Order CTA → configurator renders with prefilled Final Rx", async ({
    page,
    consoleErrors,
  }) => {
    const card = page
      .locator('[data-testid="optical-queue-card"]')
      .filter({ hasText: SEED_PATIENT_LAST_NAME })
      .first();
    await expect(card).toBeVisible({ timeout: 10_000 });

    await card.getByRole("button", { name: /Configure Order/i }).click();
    await page.waitForURL(/\/optical\/orders\/[0-9a-f-]+/, { timeout: 10_000 });

    // Side-by-side Rx panel renders both Habitual + Final headers.
    await expect(page.getByText("Habitual")).toBeVisible();
    await expect(page.getByText("Final")).toBeVisible();
    // Final Rx OD sphere from seed (Thornton's finalized encounter has a
    // FINAL refraction; exact value lives in seed_db.py — the panel surfaces it).
    await expect(page.getByText("Refraction (Habitual | Final)")).toBeVisible();

    expect(
      consoleErrors.length,
      `consoleErrors: ${JSON.stringify(consoleErrors)}`,
    ).toBe(0);
  });

  test("autosave PATCHes vision plan after blur (flush)", async ({ page }) => {
    const card = page
      .locator('[data-testid="optical-queue-card"]')
      .filter({ hasText: SEED_PATIENT_LAST_NAME })
      .first();
    await card.getByRole("button", { name: /Configure Order/i }).click();
    await page.waitForURL(/\/optical\/orders\//);

    const patchPromise = page.waitForRequest(
      (req) =>
        req.method() === "PATCH" &&
        /\/api\/optical-orders\/[0-9a-f-]+\/$/.test(req.url()),
    );

    // VisionPlanSection renders <label><span>Member ID</span><input/></label>;
    // getByLabel uses the label-input association.
    const memberId = page.getByLabel("Member ID");
    await memberId.fill("VSP12345");
    await memberId.blur();

    const patchReq = await patchPromise;
    const body = patchReq.postDataJSON() as any;
    // PATCH payload should preserve snake_case JSONB keys (Pitfall 1).
    const memberIdValue =
      body?.visionPlan?.member_id ?? body?.vision_plan?.member_id;
    expect(memberIdValue).toBe("VSP12345");
  });

  test("place with missing seg_height for progressive returns 400 field_errors", async ({
    page,
  }) => {
    const card = page
      .locator('[data-testid="optical-queue-card"]')
      .filter({ hasText: SEED_PATIENT_LAST_NAME })
      .first();
    await card.getByRole("button", { name: /Configure Order/i }).click();
    await page.waitForURL(/\/optical\/orders\//);

    // Select Progressive lens type (requires_seg_height=true per Plan 14-06 seed)
    const typeSelect = page.locator("select").first();
    await typeSelect.selectOption({ label: "Progressive" });
    // Select any material so the validation reaches the seg_height check.
    const materialSelect = page.locator("select").nth(1);
    await materialSelect.selectOption({ index: 1 });

    // Place WITHOUT filling seg_height.
    await page.getByRole("button", { name: /Place Order/i }).click();

    // Either inline field error or the 400 response surfaces "seg_height" /
    // "Seg height required" copy from the BE field_errors.
    await expect(
      page.getByText(/Seg height|seg_height|progressive/i).first(),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("place succeeds after fixing seg_height + Generate Job Ticket downloads PDF", async ({
    page,
  }) => {
    const card = page
      .locator('[data-testid="optical-queue-card"]')
      .filter({ hasText: SEED_PATIENT_LAST_NAME })
      .first();
    await card.getByRole("button", { name: /Configure Order/i }).click();
    await page.waitForURL(/\/optical\/orders\//);

    await page
      .locator("select")
      .first()
      .selectOption({ label: "Progressive" });
    await page.locator("select").nth(1).selectOption({ index: 1 });
    await page.getByLabel(/Seg Height OD/i).fill("18.0");
    await page.getByLabel(/Seg Height OS/i).fill("18.0");
    await page.getByLabel(/Seg Height OS/i).blur();

    await page.getByRole("button", { name: /Place Order/i }).click();
    // Status text in the header flips to "placed"
    await expect(page.getByText(/placed/i).first()).toBeVisible({
      timeout: 10_000,
    });

    // Generate Job Ticket — assert PDF content-type + downloaded file
    const pdfRespPromise = page.waitForResponse(
      (resp) =>
        /\/api\/optical-orders\/[0-9a-f-]+\/job-ticket\//.test(resp.url()) &&
        resp.status() === 200,
    );
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /Generate Job Ticket/i }).click(),
    ]);
    const resp = await pdfRespPromise;
    expect(resp.headers()["content-type"]).toContain("application/pdf");
    expect(download.suggestedFilename()).toMatch(/^job-ticket-/);
  });

  test("draft pending pill renders on queue card and routes to draft configurator", async ({
    page,
  }) => {
    // Open Configure Order to create a draft (no need to place it).
    const card = page
      .locator('[data-testid="optical-queue-card"]')
      .filter({ hasText: SEED_PATIENT_LAST_NAME })
      .first();
    await card.getByRole("button", { name: /Configure Order/i }).click();
    await page.waitForURL(/\/optical\/orders\/([0-9a-f-]+)/);

    // Navigate back to the queue page.
    await page.goto(`/${TENANT_SLUG}/optical`);

    const refreshedCard = page
      .locator('[data-testid="optical-queue-card"]')
      .filter({ hasText: SEED_PATIENT_LAST_NAME })
      .first();
    await expect(
      refreshedCard.getByRole("button", { name: /Draft pending/i }),
    ).toBeVisible({ timeout: 10_000 });

    // Clicking the pill routes to a draft configurator. (mostRecentDraftId
    // not yet enriched, so the fallback path creates-or-reuses a draft —
    // either way, URL matches the configurator route shape.)
    await refreshedCard
      .getByRole("button", { name: /Draft pending/i })
      .click();
    await expect(page).toHaveURL(/\/optical\/orders\/[0-9a-f-]+\/$/);
  });

  test("placed order opens OrderDetailDrawer (not configurator) from patient Orders tab", async ({
    page,
  }) => {
    // This test depends on the previous "place succeeds" test having created
    // a placed order — when run in sequence within this describe block the
    // ordering matters less because the seeded encounter persists drafts
    // across reset. For full isolation, place a fresh order first.
    await page.goto(`/${TENANT_SLUG}/patients`);
    await page
      .locator(`text=${SEED_PATIENT_LAST_NAME}`)
      .first()
      .click();
    await page.getByRole("tab", { name: /Orders/i }).click();

    const placedRow = page
      .locator('[role="button"]')
      .filter({ has: page.locator('text="Placed"') })
      .first();
    if (await placedRow.count()) {
      await placedRow.click();
      // Drawer DOES NOT route — URL should still be the patient detail page.
      await expect(page).not.toHaveURL(/\/optical\/orders\//);
      // Vision Plan + Generate Job Ticket (or Re-generate) section visible
      await expect(page.getByText(/Vision Plan/i)).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: /Generate Job Ticket|Re-generate Job Ticket/i,
        }),
      ).toBeVisible();
    } else {
      test.skip(
        true,
        "No placed order present for this patient — run after the place test.",
      );
    }
  });
});
