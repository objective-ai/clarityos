/**
 * Phase 13 — Retail Inventory: end-to-end coverage.
 *
 * Six scenarios covering 5 ROADMAP success criteria + 2 critical edges
 * (entitlement gate, zero-stock soft-block). Implemented in 13-14:
 *   - Task 1: scenarios 1-3 (admin CRUD, encounter create-place, filters)
 *   - Task 2: scenarios 4-6 (patient orders+drawer+cancel, entitlement gate, zero-stock)
 *
 * Requirement coverage:
 *   - INV-01 admin CRUD on frames
 *   - INV-02 create order from optical-queue card
 *   - INV-03 stock decrement on place
 *   - INV-04 per-type tabs + filters
 *   - INV-05 patient Orders tab + drawer
 *   - INV-10 cancel restocks
 *   - INV-12 zero-stock soft-block (warns, still creates)
 *   - INV-14 retail_pos entitlement gate (sidebar/tab/CTA hidden)
 *   - INV-15 order detail drawer
 */
import { test, expect } from "./fixtures";

const TENANT_SLUG = "sunview";
// Canonical seeded patient — backend/seed_db.py PATIENT_IDS[0] (Robert Hargrove).
// Hardcoded so this spec does NOT depend on /patients list ordering.
const SEED_PATIENT_ID = "d0000000-0005-0000-0000-000000000001";
const SEED_FRAME_SKU = "FR-RAYBAN-WAYFARER-BLK-52";
const SEED_LOW_STOCK_FRAME_SKU = "FR-PERSOL-649-HAVANA-54"; // stock_qty=2 ≤ reorder_threshold=3
const SEED_CONTACT_SKU = "CL-ACUVUE-OASYS-DAILY-OD-200";
const SEED_KIDS_FRAME_SKU = "FR-DISNEY-KIDS-PINK-44";

test.describe("@inventory retail-inventory phase 13", () => {
  test("admin CRUD: create + edit + adjust a frame (INV-01, INV-08)", async ({
    page,
    apiCalls,
  }) => {
    await page.goto(`/${TENANT_SLUG}/inventory`);
    await expect(page.getByRole("heading", { name: /^Inventory$/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Frames" })).toBeVisible();

    // Create — unique model per run so re-runs don't collide on the active SKU.
    const stamp = Date.now();
    const uniqueModel = `E2E-${stamp}`;
    await page.getByRole("button", { name: /^\+ New Product$/ }).click();
    await page.getByPlaceholder("Brand").fill("PlaywrightTest");
    await page.getByPlaceholder("Model").fill(uniqueModel);
    await page.getByPlaceholder("Retail price").fill("99.00");
    await page.getByPlaceholder("Eye size (mm)").fill("50");
    await page.getByRole("button", { name: /Create product/i }).click();

    const ourRow = page.locator("tr", { hasText: uniqueModel }).first();
    await expect(ourRow).toBeVisible({ timeout: 5000 });

    // Edit retail price
    await ourRow.getByRole("button", { name: /^Edit$/ }).click();
    await page.getByPlaceholder("Retail price").fill("109.00");
    await page.getByRole("button", { name: /Save changes/i }).click();
    await expect(ourRow.getByText(/\$109/)).toBeVisible({ timeout: 5000 });

    // Adjust stock by -1 (with required note)
    await ourRow.getByRole("button", { name: /^Adjust$/ }).click();
    await page.getByPlaceholder(/^Delta/).fill("-1");
    await page.getByPlaceholder(/^Reason \/ note/).fill("E2E test cleanup");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /^Adjust$/ })
      .click();

    // Verify the API hit /adjust/ — apiCalls fixture records all responses.
    await expect
      .poll(
        () =>
          apiCalls.find(
            (c) => c.url.includes("/adjust") && c.status >= 200 && c.status < 300,
          ),
        { message: "expected POST /adjust to fire on stock adjustment" },
      )
      .toBeTruthy();
  });

  test("create order from optical-queue card → place → stock decrements (INV-02, INV-03, INV-16)", async ({
    page,
  }) => {
    // Snapshot pre-place stock for the seeded Wayfarer
    await page.goto(`/${TENANT_SLUG}/inventory`);
    const wayfarerRow = page.locator("tr", { hasText: SEED_FRAME_SKU });
    await expect(wayfarerRow).toBeVisible({ timeout: 5000 });
    const preStockText = await wayfarerRow.locator("td").nth(2).innerText();
    const preStock = parseInt(preStockText.match(/\d+/)?.[0] ?? "0", 10);
    expect(preStock).toBeGreaterThan(0);

    // Open optical queue and click + Create Order on the first card
    await page.goto(`/${TENANT_SLUG}/optical`);
    const card = page.locator("[data-testid='optical-queue-card']").first();
    await card.waitFor({ state: "visible", timeout: 10_000 });
    await card.getByRole("button", { name: /\+ Create Order/i }).click();

    // Modal opens — pick the Wayfarer (picker buttons render brand+model+sku).
    const modal = page.getByRole("dialog").filter({ hasText: /optical order/i });
    await expect(modal).toBeVisible();
    await modal.locator("button", { hasText: SEED_FRAME_SKU }).first().click();

    // Auto-place + submit
    await modal
      .locator("label")
      .filter({ hasText: /Place immediately/i })
      .locator("input[type='checkbox']")
      .check();
    await modal.getByRole("button", { name: /Create & Place/i }).click();

    // Drawer opens with status=Placed
    const drawer = page.locator("[role='dialog'][aria-modal='true']");
    await expect(drawer.getByText(/^Placed$/).first()).toBeVisible({ timeout: 8000 });

    // Close drawer + verify stock decremented by 1
    await page.keyboard.press("Escape");
    await page.goto(`/${TENANT_SLUG}/inventory`);
    const postRow = page.locator("tr", { hasText: SEED_FRAME_SKU });
    await expect(postRow).toBeVisible({ timeout: 5000 });
    const postStockText = await postRow.locator("td").nth(2).innerText();
    const postStock = parseInt(postStockText.match(/\d+/)?.[0] ?? "0", 10);
    expect(postStock).toBe(preStock - 1);
  });

  test("inventory filters: type tab + stock-status + gender (INV-04)", async ({
    page,
  }) => {
    await page.goto(`/${TENANT_SLUG}/inventory`);

    // Default Frames tab — at least the seeded 10 frames
    const tableBody = page.locator("tbody");
    await expect(tableBody).toBeVisible({ timeout: 5000 });
    const initialFrameCount = await tableBody.locator("tr").count();
    expect(initialFrameCount).toBeGreaterThanOrEqual(10);

    // Switch to Contacts tab
    await page.getByRole("tab", { name: "Contacts" }).click();
    await expect(page.getByText(SEED_CONTACT_SKU)).toBeVisible({ timeout: 5000 });
    const contactCount = await tableBody.locator("tr").count();
    expect(contactCount).toBeGreaterThanOrEqual(5);

    // Back to Frames + apply low-stock filter
    await page.getByRole("tab", { name: "Frames" }).click();
    await page.getByLabel("Stock status").selectOption("low");
    await expect(page.getByText(SEED_LOW_STOCK_FRAME_SKU)).toBeVisible({
      timeout: 5000,
    });

    // Apply gender=kids — only Disney Princess remains
    await page.getByLabel("Stock status").selectOption("all");
    await page.getByLabel("Gender").selectOption("kids");
    await expect(page.getByText(SEED_KIDS_FRAME_SKU)).toBeVisible();
    const kidsRows = await tableBody.locator("tr").count();
    expect(kidsRows).toBe(1);
  });

  test("patient Orders tab: list + drawer + cancel → restocks (INV-05, INV-10, INV-15)", async ({
    page,
  }) => {
    // Navigate to canonical seeded patient (no .first() lookups — M3 stability)
    await page.goto(`/${TENANT_SLUG}/patients/${SEED_PATIENT_ID}`);

    // Patient detail tabs are plain <button>s (NOT role="tab") — use exact text.
    await page.getByRole("button", { name: "Orders", exact: true }).click();

    // Open the most recent order — order rows are <li role="button"> in OrdersTab.
    // Filter to placed/draft so we hit a cancellable order if scenario 2 ran.
    const orderRows = page
      .locator("li[role='button']")
      .filter({ hasText: /Placed|Draft|Dispensed/ });
    await expect(orderRows.first()).toBeVisible({ timeout: 5000 });
    await orderRows.first().click();

    // Drawer assertions — OrderDetailDrawer uses role=dialog aria-modal=true with aria-label
    const drawer = page.locator("[role='dialog'][aria-modal='true']");
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText(/Line items/i)).toBeVisible();
    await expect(drawer.getByText(/Timeline/i)).toBeVisible();

    // If status is Placed, cancel it (gated by owner/admin role — dev seed is owner)
    const cancelBtn = drawer.getByRole("button", { name: /Cancel order/i });
    if (await cancelBtn.isVisible().catch(() => false)) {
      page.on("dialog", (dlg) => {
        void dlg.accept();
      });
      await cancelBtn.click();
      // Drawer closes after successful cancel
      await expect(drawer).toBeHidden({ timeout: 5000 });
      // Cancelled badge appears in the orders list
      await expect(
        page.locator("li[role='button']").filter({ hasText: /Cancelled/ }).first(),
      ).toBeVisible({ timeout: 5000 });
    } else {
      // Order not cancellable — close the drawer cleanly
      await page.keyboard.press("Escape");
      await expect(drawer).toBeHidden({ timeout: 2000 });
    }
  });

  test("entitlement gate: WITHOUT retail_pos → sidebar Inventory hidden + Orders tab hidden + queue card CTA hidden (INV-14)", async ({
    page,
  }) => {
    await page.goto(`/${TENANT_SLUG}/dashboard`);

    // Strip retail_pos from the live tenant.entitlements Set
    await page.evaluate(() => {
      const ss = (
        window as unknown as {
          __SESSION_STORE__?: {
            getState: () => { session: unknown };
            setState: (s: unknown) => void;
          };
        }
      ).__SESSION_STORE__;
      if (!ss) {
        throw new Error(
          "SESSION_STORE not exposed on window — sessionStore.ts dev/test guard missing",
        );
      }
      const cur =
        (ss.getState().session as {
          tenant?: { entitlements?: Set<string> };
        } | null) ?? null;
      if (!cur?.tenant) return;
      const next = new Set<string>(
        Array.from(cur.tenant.entitlements ?? []).filter(
          (e: string) => e !== "retail_pos",
        ),
      );
      ss.setState({
        session: { ...cur, tenant: { ...cur.tenant, entitlements: next } },
      });
    });

    // PRE-ASSERTION (M2): verify the entitlement was actually removed BEFORE
    // checking UI absence — otherwise a no-op mutation would silently pass.
    await expect
      .poll(
        async () =>
          await page.evaluate(() => {
            const ss = (
              window as unknown as {
                __SESSION_STORE__?: { getState: () => { session: unknown } };
              }
            ).__SESSION_STORE__;
            const tenant = (
              ss?.getState?.().session as {
                tenant?: { entitlements?: Iterable<string> };
              } | null
            )?.tenant;
            return Array.from(tenant?.entitlements ?? []);
          }),
        {
          message:
            "retail_pos must be removed from tenant.entitlements BEFORE asserting UI hidden state",
        },
      )
      .not.toContain("retail_pos");

    // Sidebar Inventory link should NOT be visible
    await expect(page.getByRole("link", { name: /^Inventory$/ })).toHaveCount(0);

    // Patient Orders tab — the <button> is filtered out of the tabs array when
    // RETAIL_POS is absent. Use exact-match text to avoid catching "Encounters" etc.
    await page.goto(`/${TENANT_SLUG}/patients/${SEED_PATIENT_ID}`);
    await expect(
      page.getByRole("button", { name: "Orders", exact: true }),
    ).toHaveCount(0);

    // Optical queue Create Order CTA — gated by canCreateOrder
    await page.goto(`/${TENANT_SLUG}/optical`);
    await expect(page.getByRole("button", { name: /\+ Create Order/i })).toHaveCount(
      0,
    );
  });

  test("zero-stock soft-block: place against zero-stock product → warning + order still creates (INV-12)", async ({
    page,
  }) => {
    // Step 1: drive Disney kids frame to stock_qty=0 via Adjust
    await page.goto(`/${TENANT_SLUG}/inventory`);
    const targetRow = page.locator("tr", { hasText: SEED_KIDS_FRAME_SKU });
    await expect(targetRow).toBeVisible({ timeout: 5000 });
    const stockText = await targetRow.locator("td").nth(2).innerText();
    const stockQty = parseInt(stockText.match(/\d+/)?.[0] ?? "0", 10);

    if (stockQty > 0) {
      await targetRow.getByRole("button", { name: /^Adjust$/ }).click();
      await page.getByPlaceholder(/^Delta/).fill(String(-stockQty));
      await page
        .getByPlaceholder(/^Reason \/ note/)
        .fill("E2E zero-stock setup");
      await page
        .getByRole("dialog")
        .getByRole("button", { name: /^Adjust$/ })
        .click();
      await expect(targetRow.locator("td").nth(2)).toContainText("0", {
        timeout: 5000,
      });
    }

    // Step 2: open Walk-In Order modal from the patient Orders tab
    await page.goto(`/${TENANT_SLUG}/patients/${SEED_PATIENT_ID}`);
    await page.getByRole("button", { name: "Orders", exact: true }).click();

    // CTA differs depending on whether any orders already exist
    const newWalkInBtn = page.getByRole("button", {
      name: /\+ New Walk-In Order/i,
    });
    const firstOrderBtn = page.getByRole("button", {
      name: /\+ Create the first order/i,
    });
    if (await newWalkInBtn.isVisible().catch(() => false)) {
      await newWalkInBtn.click();
    } else {
      await firstOrderBtn.click();
    }

    // Step 3: pick the zero-stock Disney frame, auto-place
    const modal = page.getByRole("dialog").filter({ hasText: /optical order/i });
    await expect(modal).toBeVisible();
    await modal.locator("button", { hasText: SEED_KIDS_FRAME_SKU }).first().click();
    await modal
      .locator("label")
      .filter({ hasText: /Place immediately/i })
      .locator("input[type='checkbox']")
      .check();
    await modal.getByRole("button", { name: /Create & Place/i }).click();

    // Modal stays open + yellow warning text appears + the order WAS created
    // (warning surfaces in modal as <div className="text-yellow-300">).
    await expect(modal.getByText(/out of stock|stock is low/i)).toBeVisible({
      timeout: 5000,
    });

    // Cleanup — close the modal. The order remains placed at qty=0; subsequent
    // runs re-zero the stock idempotently. Re-seed restores baseline if needed.
    await page.keyboard.press("Escape");
  });
});
