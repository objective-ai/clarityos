/**
 * Phase 13 — Retail Inventory: end-to-end coverage (Wave 0 stub).
 *
 * Six scenarios — five from 13-VALIDATION.md plus the zero-stock soft-block
 * variant. All `test.skip` until Wave 4 (13-10) wires the Inventory page,
 * patient Orders tab, and order-create CTAs.
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

test.describe("@inventory retail-inventory phase 13", () => {
  test.skip("admin CRUD: create + edit + soft-delete a frame (INV-01)", async ({ page }) => {
    // Wave 4 (13-10) — implement after Inventory page lands
  });

  test.skip("create order from optical-queue card → place → stock decrements + alert badge (INV-02, INV-03)", async ({ page }) => {
    // Wave 4 (13-10)
  });

  test.skip("inventory filters: type tab + stock-status + gender (INV-04)", async ({ page }) => {
    // Wave 4 (13-10)
  });

  test.skip("patient Orders tab: chronological list + click → drawer + cancel → stock restores (INV-05, INV-10, INV-15)", async ({ page }) => {
    // Wave 4 (13-10)
  });

  test.skip("entitlement gate: WITHOUT retail_pos → sidebar Inventory hidden + patient Orders tab hidden + queue card CTA hidden (INV-14)", async ({ page }) => {
    // Wave 4 (13-10)
  });

  test.skip("zero-stock soft-block: place order against zero-stock product → toast warning + order still creates (INV-12)", async ({ page }) => {
    // Wave 4 (13-10)
  });
});
