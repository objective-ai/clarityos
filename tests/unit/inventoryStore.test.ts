/**
 * Phase 13 — Retail Inventory: inventoryStore happy-path stubs (Wave 0).
 *
 * Wave 3 (13-07) replaces `expect.fail` lines with real assertions against the
 * Zustand store that lands in store/inventoryStore.ts.
 */
import { describe, it, expect } from "vitest";

describe("inventoryStore", () => {
  it("loads products with filters serialized to query string", () => {
    expect.fail("Wave 3 (13-07) — implement after inventoryStore lands");
  });

  it("createProduct posts and prepends to products list", () => {
    expect.fail("Wave 3 (13-07)");
  });

  it("receiveStock posts qty and refreshes affected product", () => {
    expect.fail("Wave 3 (13-07)");
  });

  it("retail_pos entitlement gate hides createProduct calls when add-on absent", () => {
    // INV-14 — referenced by 13-VALIDATION.md (`-t retail_pos`).
    expect.fail("Wave 3 (13-07)");
  });
});
