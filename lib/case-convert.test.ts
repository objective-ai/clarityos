/**
 * lib/case-convert.test.ts
 *
 * Closes audit gap #5 (2026-05-01): the apiFetch case-conversion layer
 * sits between every BFF response and every store, so silent regressions
 * here mangle data across the entire app. Notably, `camelizeKeys` will
 * recurse INTO JSONB columns and rewrite domain keys (lids_lashes →
 * lidsLashes), which is intentional behavior the stores work around with
 * a defensive `snakifyKeys()` on load (see examFindingsStore.ts:219).
 *
 * Test groups:
 *   1. toCamel / toSnake — single-string conversion, edge cases, round-trip
 *   2. camelizeKeys — top-level, nested, arrays, primitives, JSONB gotcha
 *   3. snakifyKeys — same axes, plus the on-load defensive use case
 *   4. Round-trip — JSON round-trips through both directions cleanly when
 *      keys are simple; documents where it does NOT (numeric, mixed case)
 *   5. Real-world payload shapes — patient_insurance, exam_findings JSONB,
 *      ISO date strings, UUIDs, nested arrays of objects
 *
 * Run: npx vitest run lib/case-convert.test.ts --reporter=verbose
 */

import { describe, it, expect } from "vitest";
import {
  camelizeKeys,
  snakifyKeys,
  toCamel,
  toSnake,
} from "./case-convert";

// ---------------------------------------------------------------------------
// 1. toCamel / toSnake — single-string conversion
// ---------------------------------------------------------------------------

describe("toCamel", () => {
  it("converts single underscore", () => {
    expect(toCamel("patient_id")).toBe("patientId");
  });

  it("converts multiple underscores", () => {
    expect(toCamel("first_visit_at")).toBe("firstVisitAt");
  });

  it("preserves already-camelCase strings", () => {
    expect(toCamel("patientId")).toBe("patientId");
  });

  it("preserves single words", () => {
    expect(toCamel("patient")).toBe("patient");
  });

  it("preserves empty string", () => {
    expect(toCamel("")).toBe("");
  });

  it("does not capitalize letters following an uppercase character", () => {
    // The regex matches `_[a-z]` only — so `_Id` won't be touched, leaving
    // mixed-case keys like `patient_Id` slightly broken. Pinning this so a
    // future regex tweak is intentional.
    expect(toCamel("patient_Id")).toBe("patient_Id");
  });

  it("preserves numeric segments", () => {
    expect(toCamel("v2_endpoint")).toBe("v2Endpoint");
    expect(toCamel("fee_99213")).toBe("fee_99213"); // digits aren't [a-z]
  });

  it("strips a single leading underscore by promoting nothing", () => {
    // A leading `_` followed by a lowercase letter capitalizes that letter,
    // dropping the underscore — `_private` → `Private`. Real Python conv-
    // ention rarely produces this, but worth pinning.
    expect(toCamel("_private")).toBe("Private");
  });
});

describe("toSnake", () => {
  it("converts single uppercase", () => {
    expect(toSnake("patientId")).toBe("patient_id");
  });

  it("converts multiple uppercase", () => {
    expect(toSnake("firstVisitAt")).toBe("first_visit_at");
  });

  it("preserves already-snake_case strings", () => {
    expect(toSnake("patient_id")).toBe("patient_id");
  });

  it("preserves single lowercase words", () => {
    expect(toSnake("patient")).toBe("patient");
  });

  it("preserves empty string", () => {
    expect(toSnake("")).toBe("");
  });

  it("prefixes leading capital with underscore", () => {
    // PascalCase input is unusual, but the regex prepends `_` to every
    // uppercase letter — so `PatientId` becomes `_patient_id` (leading
    // underscore!). Pin the behavior; real callers should already have
    // camelCase, but this surfaces if a TS type leaks PascalCase.
    expect(toSnake("PatientId")).toBe("_patient_id");
  });

  it("inserts underscore before consecutive uppercase", () => {
    // `URL` becomes `_u_r_l` — abbreviations are NOT preserved as a unit.
    // Worth knowing: snake_case payloads from the backend never have this
    // shape, but a frontend-originated key like `apiURL` becomes `api_u_r_l`.
    expect(toSnake("apiURL")).toBe("api_u_r_l");
  });
});

describe("toCamel/toSnake round-trip", () => {
  it("round-trips simple snake_case", () => {
    const original = "first_visit_at";
    expect(toSnake(toCamel(original))).toBe(original);
  });

  it("round-trips simple camelCase", () => {
    const original = "firstVisitAt";
    expect(toCamel(toSnake(original))).toBe(original);
  });

  it.each([
    ["patient_id", "patientId"],
    ["chart_number", "chartNumber"],
    ["eligibility_verified_date", "eligibilityVerifiedDate"],
    ["copay_amount", "copayAmount"],
    ["is_active", "isActive"],
  ])("snake %s ↔ camel %s round-trips", (snake, camel) => {
    expect(toCamel(snake)).toBe(camel);
    expect(toSnake(camel)).toBe(snake);
  });
});

// ---------------------------------------------------------------------------
// 2. camelizeKeys — recursive object conversion
// ---------------------------------------------------------------------------

describe("camelizeKeys", () => {
  it("converts top-level snake_case keys", () => {
    expect(camelizeKeys({ patient_id: "abc", chart_number: 123 })).toEqual({
      patientId: "abc",
      chartNumber: 123,
    });
  });

  it("recurses into nested objects", () => {
    const result = camelizeKeys({
      patient_id: "abc",
      address_info: { street_name: "Main St", postal_code: "94000" },
    });
    expect(result).toEqual({
      patientId: "abc",
      addressInfo: { streetName: "Main St", postalCode: "94000" },
    });
  });

  it("recurses into arrays of objects", () => {
    expect(
      camelizeKeys([{ first_name: "A" }, { first_name: "B" }])
    ).toEqual([{ firstName: "A" }, { firstName: "B" }]);
  });

  it("converts arrays of arrays of objects", () => {
    expect(
      camelizeKeys([[{ a_b: 1 }], [{ c_d: 2 }]])
    ).toEqual([[{ aB: 1 }], [{ cD: 2 }]]);
  });

  it("passes through primitives unchanged", () => {
    expect(camelizeKeys(null)).toBe(null);
    expect(camelizeKeys(undefined)).toBe(undefined);
    expect(camelizeKeys(42)).toBe(42);
    expect(camelizeKeys("snake_case_string_value")).toBe("snake_case_string_value");
    expect(camelizeKeys(true)).toBe(true);
  });

  it("preserves null values inside objects", () => {
    expect(camelizeKeys({ subscriber_dob: null })).toEqual({
      subscriberDob: null,
    });
  });

  it("preserves empty objects and arrays", () => {
    expect(camelizeKeys({})).toEqual({});
    expect(camelizeKeys([])).toEqual([]);
  });

  it("does NOT transform string values that look snake_case", () => {
    // Only KEYS are converted — values are passed through unchanged.
    // This pins the column/value boundary: a payload value of
    // "lids_lashes" (e.g. an enum string) survives the round trip.
    const result = camelizeKeys({ structure_key: "lids_lashes" });
    expect(result).toEqual({ structureKey: "lids_lashes" });
  });

  it("does NOT transform ISO date strings", () => {
    // `subscriber_dob: "1980-04-15"` — string passes through, only the
    // key changes. Important because PatientInsurance returns dates as
    // strings (not Date objects).
    const result = camelizeKeys({
      subscriber_dob: "1980-04-15",
      auth_expiry: "2026-12-31",
    });
    expect(result).toEqual({
      subscriberDob: "1980-04-15",
      authExpiry: "2026-12-31",
    });
  });

  it("does NOT transform UUID strings", () => {
    const id = "00000000-0000-0000-0000-000000000001";
    const result = camelizeKeys({ payer_id: id });
    expect(result).toEqual({ payerId: id });
  });
});

// ---------------------------------------------------------------------------
// 3. snakifyKeys — recursive object conversion
// ---------------------------------------------------------------------------

describe("snakifyKeys", () => {
  it("converts top-level camelCase keys", () => {
    expect(snakifyKeys({ patientId: "abc", chartNumber: 123 })).toEqual({
      patient_id: "abc",
      chart_number: 123,
    });
  });

  it("recurses into nested objects", () => {
    expect(
      snakifyKeys({ addressInfo: { streetName: "Main St" } })
    ).toEqual({
      address_info: { street_name: "Main St" },
    });
  });

  it("recurses into arrays of objects", () => {
    expect(snakifyKeys([{ firstName: "A" }, { firstName: "B" }])).toEqual([
      { first_name: "A" },
      { first_name: "B" },
    ]);
  });

  it("passes through primitives unchanged", () => {
    expect(snakifyKeys(null)).toBe(null);
    expect(snakifyKeys(undefined)).toBe(undefined);
    expect(snakifyKeys(42)).toBe(42);
    expect(snakifyKeys("camelCaseStringValue")).toBe("camelCaseStringValue");
    expect(snakifyKeys(true)).toBe(true);
  });

  it("preserves empty objects and arrays", () => {
    expect(snakifyKeys({})).toEqual({});
    expect(snakifyKeys([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. Object round-trip
// ---------------------------------------------------------------------------

describe("camelizeKeys ∘ snakifyKeys round-trip", () => {
  it("round-trips a simple flat snake_case payload", () => {
    const snake = { patient_id: "abc", is_active: true, copay_amount: 20 };
    expect(snakifyKeys(camelizeKeys(snake))).toEqual(snake);
  });

  it("round-trips a nested response payload", () => {
    const snake = {
      patient_id: "abc",
      insurance_records: [
        { payer_id: "p1", priority: "primary", is_active: true },
        { payer_id: "p2", priority: "secondary", is_active: false },
      ],
    };
    expect(snakifyKeys(camelizeKeys(snake))).toEqual(snake);
  });

  it("round-trips a request payload (camel → snake → camel)", () => {
    const camel = {
      payerId: "p1",
      subscriberDob: "1980-04-15",
      copayAmount: 20.0,
      isActive: true,
    };
    expect(camelizeKeys(snakifyKeys(camel))).toEqual(camel);
  });
});

// ---------------------------------------------------------------------------
// 5. JSONB nested-domain-key gotcha — INTENTIONAL behavior pin.
//
// `apiFetch` calls camelizeKeys recursively on the entire response, which
// also mangles snake_case keys INSIDE JSONB column values. Stores like
// examFindingsStore work around this by calling snakifyKeys() on the
// affected fields before storing. These tests pin the documented
// behavior so a future "smart" carve-out is intentional and reviewed.
// See: store/examFindingsStore.ts:219, memory feedback_camelizekeys_nested.md
// ---------------------------------------------------------------------------

describe("JSONB nested-domain-key gotcha (intentional)", () => {
  it("camelizeKeys mangles exam_findings JSONB structure keys", () => {
    // The mangling is the WHOLE point of this test — exam findings store
    // keys like `lids_lashes` as JSONB keys (not column names), and
    // camelizeKeys cannot tell the difference, so it rewrites them.
    const apiResponse = {
      findings_od: {
        lids_lashes: { abnormal: false, notes: "" },
        conjunctiva_sclera: { abnormal: false, notes: "" },
      },
    };
    const result = camelizeKeys(apiResponse) as {
      findingsOd: Record<string, unknown>;
    };
    // Components look up by snake_case key — these would now miss:
    expect(result.findingsOd.lids_lashes).toBeUndefined();
    expect(result.findingsOd.conjunctiva_sclera).toBeUndefined();
    // The keys WERE mangled to camelCase:
    expect(result.findingsOd.lidsLashes).toBeDefined();
    expect(result.findingsOd.conjunctivaSclera).toBeDefined();
  });

  it("snakifyKeys on the mangled response restores domain keys", () => {
    // The store-side fix (examFindingsStore.ts:219) — wrap the affected
    // field in snakifyKeys() to undo the mangling before commit to draft.
    const apiResponse = camelizeKeys({
      findings_od: {
        lids_lashes: { abnormal: true, notes: "ptosis" },
      },
    }) as { findingsOd: Record<string, unknown> };
    const restored = snakifyKeys(apiResponse.findingsOd) as Record<
      string,
      { abnormal: boolean; notes: string }
    >;
    expect(restored.lids_lashes).toEqual({ abnormal: true, notes: "ptosis" });
  });

  it("inventory product attributes JSONB suffers the same mangling", () => {
    // Phase 13 retail: Product.attributes JSONB carries domain keys like
    // `eye_size`, `bridge_size`, `temple_size`, `base_curve`. inventoryStore
    // relies on these staying snake_case. Pin the same behavior so the fix
    // pattern there (snakifyKeys on load) is non-optional.
    const apiResponse = {
      product_id: "abc",
      attributes: {
        eye_size: 52,
        bridge_size: 18,
        base_curve: 8.5,
      },
    };
    const result = camelizeKeys(apiResponse) as {
      productId: string;
      attributes: Record<string, number>;
    };
    expect(result.productId).toBe("abc");
    // Mangled — snake_case lookup fails:
    expect(result.attributes.eye_size).toBeUndefined();
    // Mangled to camelCase:
    expect(result.attributes.eyeSize).toBe(52);
    expect(result.attributes.bridgeSize).toBe(18);
    expect(result.attributes.baseCurve).toBe(8.5);
  });
});

// ---------------------------------------------------------------------------
// 6. Real-world payload shapes
//
// End-to-end pin: the case-conversion layer sits between BFF responses
// and stores, so the shapes here mirror actual API contracts. A regression
// in any of these would break a UI surface in production.
// ---------------------------------------------------------------------------

describe("real-world payload shapes", () => {
  it("converts a PatientInsuranceResponse end-to-end", () => {
    const fromBackend = {
      id: "00000000-0000-0000-0000-000000000001",
      patient_id: "00000000-0000-0000-0000-000000000002",
      payer_id: "00000000-0000-0000-0000-000000000003",
      payer_name: "Aetna",
      priority: "primary",
      plan_type: "medical",
      subscriber_id: "SUB-123",
      group_number: "GRP-456",
      plan_name: "Premier PPO",
      relationship_to_subscriber: "self",
      subscriber_name: "Jane Doe",
      subscriber_dob: "1980-04-15",
      copay_amount: 20.0,
      eligibility_status: "active",
      eligibility_verified_date: "2026-04-30",
      auth_number: "AUTH-789",
      auth_expiry: "2026-12-31",
      auth_services: "exam,refraction",
      is_active: true,
    };
    const result = camelizeKeys(fromBackend) as Record<string, unknown>;

    // Spot-check transformation
    expect(result.patientId).toBe(fromBackend.patient_id);
    expect(result.payerName).toBe("Aetna");
    expect(result.subscriberDob).toBe("1980-04-15"); // string passthrough
    expect(result.copayAmount).toBe(20.0);
    expect(result.isActive).toBe(true);

    // Snake_case keys gone
    expect(result.patient_id).toBeUndefined();
    expect(result.is_active).toBeUndefined();

    // Round-trip restores original
    expect(snakifyKeys(result)).toEqual(fromBackend);
  });

  it("converts a list of PatientInsuranceResponse", () => {
    const list = [
      { id: "1", patient_id: "p1", is_active: true, priority: "primary" },
      { id: "2", patient_id: "p1", is_active: false, priority: "secondary" },
    ];
    const result = camelizeKeys(list) as Array<Record<string, unknown>>;
    expect(result).toHaveLength(2);
    expect(result[0].patientId).toBe("p1");
    expect(result[0].isActive).toBe(true);
    expect(result[1].priority).toBe("secondary");
  });

  it("preserves null fields in the response", () => {
    // Pydantic returns `None` → JSON `null` for unset optional fields.
    // The store relies on receiving exactly `null` (not `undefined`).
    const fromBackend = {
      subscriber_id: null,
      auth_expiry: null,
      copay_amount: null,
    };
    const result = camelizeKeys(fromBackend) as Record<string, unknown>;
    expect(result.subscriberId).toBeNull();
    expect(result.authExpiry).toBeNull();
    expect(result.copayAmount).toBeNull();
  });

  it("preserves nested arrays in encounter response", () => {
    const fromBackend = {
      encounter_id: "e1",
      problem_list: [
        { problem_id: "pr1", icd_code: "H52.13" },
        { problem_id: "pr2", icd_code: "H35.81" },
      ],
    };
    const result = camelizeKeys(fromBackend) as {
      encounterId: string;
      problemList: Array<{ problemId: string; icdCode: string }>;
    };
    expect(result.encounterId).toBe("e1");
    expect(result.problemList).toHaveLength(2);
    expect(result.problemList[0].problemId).toBe("pr1");
    expect(result.problemList[0].icdCode).toBe("H52.13");
  });

  it("converts a request body (snakifyKeys) for PATCH", () => {
    const fromUI = {
      eligibilityStatus: "active",
      eligibilityVerifiedDate: "2026-04-30",
      copayAmount: 25,
      isActive: true,
    };
    const result = snakifyKeys(fromUI) as Record<string, unknown>;
    expect(result).toEqual({
      eligibility_status: "active",
      eligibility_verified_date: "2026-04-30",
      copay_amount: 25,
      is_active: true,
    });
  });
});
