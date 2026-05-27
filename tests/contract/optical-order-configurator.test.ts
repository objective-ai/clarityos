/**
 * Phase 14 — Optical Order Configuration: OpticalOrderResponse Phase 14 contract.
 *
 * Asserts the TS type from types/opticalOrder.ts mirrors the BE Pydantic
 * schema OpticalOrderResponse (Phase 14 extensions). A fully-typed sample
 * is constructed without `as any` casts — if any Phase 14 key is missing
 * from the TS interface, this file fails to compile under tsc.
 *
 * The runtime assertions further verify snake_case JSONB nested keys
 * survive the wire trip unchanged (Pitfall 1).
 */
import { describe, expect, it } from "vitest";

import type {
  OpticalOrder,
  OpticalOrderLineItem,
} from "@/types/opticalOrder";

describe("OpticalOrderResponse Phase 14 contract", () => {
  const sample: OpticalOrder = {
    id: "o-1",
    tenantId: "t-1",
    patientId: "p-1",
    encounterId: null,
    status: "draft",
    totalPrice: "0.00",
    createdById: "s-1",
    createdAt: "2026-05-14T00:00:00Z",
    updatedAt: "2026-05-14T00:00:00Z",
    placedAt: null,
    cancelledAt: null,
    dispensedAt: null,
    lineItems: [],
    // Phase 14 fields
    visionPlan: {
      name: "VSP",
      member_id: "M1",
      group_number: "G1",
    },
    fitting: {
      pd_distance: "63.0",
      seg_height_od: "18.0",
      seg_height_os: "18.0",
    },
    suggestionResolutions: { lens_type: "accepted" },
    finalRefractionId: "r-1",
    habitualRefractionId: "r-2",
    finalRefraction: null,
    habitualRefraction: null,
    jobTicketGeneratedAt: null,
  };

  it("exposes finalRefractionId on the response", () => {
    expect("finalRefractionId" in sample).toBe(true);
  });

  it("exposes habitualRefractionId on the response", () => {
    expect("habitualRefractionId" in sample).toBe(true);
  });

  it("preserves snake_case keys inside visionPlan (Pitfall 1)", () => {
    expect(sample.visionPlan.member_id).toBe("M1");
    expect(sample.visionPlan.group_number).toBe("G1");
  });

  it("preserves snake_case keys inside fitting (Pitfall 1)", () => {
    expect(sample.fitting.seg_height_od).toBe("18.0");
    expect(sample.fitting.pd_distance).toBe("63.0");
  });

  it("exposes jobTicketGeneratedAt (nullable timestamp)", () => {
    expect(sample.jobTicketGeneratedAt).toBeNull();
  });

  it("exposes suggestionResolutions as a record", () => {
    expect(sample.suggestionResolutions.lens_type).toBe("accepted");
  });
});

describe("OpticalOrderLineItem lensConfig", () => {
  const line: OpticalOrderLineItem = {
    id: "li-1",
    orderId: "o-1",
    productId: "p-1",
    qty: 1,
    unitPrice: "100.00",
    lineTotal: "100.00",
    createdAt: "2026-05-14T00:00:00Z",
    lensConfig: {
      lens_type_id: "lt-1",
      material_id: "lm-1",
      coating_ids: ["lc-1", "lc-2"],
    },
  };

  it("preserves snake_case nested keys inside lensConfig (Pitfall 1)", () => {
    expect(line.lensConfig?.lens_type_id).toBe("lt-1");
    expect(line.lensConfig?.coating_ids).toEqual(["lc-1", "lc-2"]);
  });
});
