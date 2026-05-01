/**
 * Phase 13 — Retail Inventory: Product.attributes JSONB round-trip (Wave 0 stub).
 *
 * INV-06 / INV-13 + Pitfall 1 (13-RESEARCH.md lines 307-313):
 * apiFetch's recursive camelizeKeys would mangle nested JSONB domain keys
 * (eye_size → eyeSize, base_curve → baseCurve, …). The Wave 3 (13-07)
 * inventoryStore must therefore load via raw fetch + getAuthHeaders so the
 * snake_case JSONB blob survives end-to-end.
 *
 * These tests use `expect.fail` so they parse + collect cleanly today and
 * fail loudly until Wave 3 implements them — no silent passes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("Product.attributes JSONB round-trip", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("preserves snake_case keys (eye_size, bridge_size, base_curve) end-to-end", () => {
    // PENDING — Wave 3 (13-07): implement against inventoryStore.loadProducts()
    // Must assert that a fetch returning {"attributes":{"eye_size":52,"bridge_size":18}}
    // produces a store value with `attributes.eye_size === 52` (NOT eyeSize).
    expect.fail("Wave 3 (13-07) — implement after inventoryStore lands with raw fetch");
  });

  it("save round-trip does not mutate JSONB key casing", () => {
    expect.fail("Wave 3 (13-07)");
  });
});
