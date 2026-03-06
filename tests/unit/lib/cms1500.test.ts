import { describe, test, expect } from "vitest";
import {
  buildCms1500Claim,
  validateCms1500Claim,
  formatCentsToUsd,
  type Cms1500PatientInfo,
  type Cms1500ProviderInfo,
} from "@/lib/utils/cms1500";
import { makeSuperbill, makeLineItem } from "../../helpers/fixtures/billing";

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const patient: Cms1500PatientInfo = {
  firstName: "Jane",
  lastName: "Doe",
  middleInitial: "M",
  dob: "1990-05-15",
  sex: "female",
};

const provider: Cms1500ProviderInfo = {
  providerName: "Dr. Smith",
  providerNpi: "1234567890",
  providerTaxId: "12-3456789",
  facilityName: "ClarityOS Eye Care",
  facilityAddress: "123 Main St",
  facilityCity: "Springfield",
  facilityState: "IL",
  facilityZip: "62701",
  facilityNpi: "9876543210",
  billingPhone: "555-0200",
};

const encounterDate = "2026-03-10T09:00:00Z";

// ---------------------------------------------------------------------------
// buildCms1500Claim
// ---------------------------------------------------------------------------

describe("buildCms1500Claim", () => {
  test("maps patient demographics correctly", () => {
    const superbill = makeSuperbill();
    const claim = buildCms1500Claim(superbill, patient, provider, encounterDate);

    expect(claim.patientName).toEqual({
      lastName: "Doe",
      firstName: "Jane",
      middleInitial: "M",
    });
    expect(claim.patientSex).toBe("female");
  });

  test("formats date of service as MMDDYYYY", () => {
    const superbill = makeSuperbill();
    const claim = buildCms1500Claim(superbill, patient, provider, encounterDate);

    // Month 03, day depends on timezone but the format should be 8 digits
    expect(claim.serviceLines[0].dateOfServiceFrom).toMatch(/^\d{8}$/);
  });

  test("assigns diagnosis pointer letters (A, B, C...)", () => {
    const superbill = makeSuperbill({
      lineItems: [
        makeLineItem({ diagnosisPointers: ["H52.13", "H40.001"] }),
        makeLineItem({
          id: "li-2",
          cptCode: "92015",
          diagnosisPointers: ["H52.13"],
        }),
      ],
    });
    const claim = buildCms1500Claim(superbill, patient, provider, encounterDate);

    expect(claim.diagnoses).toHaveLength(2);
    expect(claim.diagnoses[0]).toEqual({ pointer: "A", code: "H52.13" });
    expect(claim.diagnoses[1]).toEqual({ pointer: "B", code: "H40.001" });

    // First service line should have pointers A and B
    expect(claim.serviceLines[0].diagnosisPointers).toEqual(["A", "B"]);
    // Second service line should have pointer A only
    expect(claim.serviceLines[1].diagnosisPointers).toEqual(["A"]);
  });

  test("limits diagnoses to 12 (CMS-1500 max)", () => {
    const codes = Array.from({ length: 15 }, (_, i) => `H52.${String(i).padStart(2, "0")}`);
    const superbill = makeSuperbill({
      lineItems: [makeLineItem({ diagnosisPointers: codes })],
    });
    const claim = buildCms1500Claim(superbill, patient, provider, encounterDate);

    expect(claim.diagnoses.length).toBeLessThanOrEqual(12);
  });

  test("calculates chargesInCents correctly (fee * units * 100)", () => {
    const superbill = makeSuperbill({
      lineItems: [makeLineItem({ fee: 175.0, units: 2 })],
    });
    const claim = buildCms1500Claim(superbill, patient, provider, encounterDate);

    expect(claim.serviceLines[0].chargesInCents).toBe(35000); // 175 * 2 * 100
  });

  test("sums totalChargesInCents across all service lines", () => {
    const superbill = makeSuperbill({
      lineItems: [
        makeLineItem({ fee: 175.0, units: 1 }),
        makeLineItem({ id: "li-2", cptCode: "92015", fee: 45.0, units: 1 }),
      ],
    });
    const claim = buildCms1500Claim(superbill, patient, provider, encounterDate);

    expect(claim.totalChargesInCents).toBe(22000); // (175 + 45) * 100
  });

  test("sets meta fields correctly", () => {
    const superbill = makeSuperbill({ id: "sb-99", encounterId: "enc-42" });
    const claim = buildCms1500Claim(superbill, patient, provider, encounterDate);

    expect(claim.meta.formVersion).toBe("02/12");
    expect(claim.meta.sourceSystem).toBe("ClarityOS EHR");
    expect(claim.meta.claimId).toBe("sb-99");
    expect(claim.meta.encounterId).toBe("enc-42");
  });

  test("sets place of service to 11 (office)", () => {
    const superbill = makeSuperbill();
    const claim = buildCms1500Claim(superbill, patient, provider, encounterDate);

    expect(claim.serviceLines[0].placeOfService).toBe("11");
  });
});

// ---------------------------------------------------------------------------
// validateCms1500Claim
// ---------------------------------------------------------------------------

describe("validateCms1500Claim", () => {
  test("valid claim passes validation", () => {
    const superbill = makeSuperbill();
    const claim = buildCms1500Claim(superbill, patient, provider, encounterDate);
    const result = validateCms1500Claim(claim);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("rejects missing patient name", () => {
    const superbill = makeSuperbill();
    const claim = buildCms1500Claim(
      superbill,
      { ...patient, firstName: "", lastName: "" },
      provider,
      encounterDate,
    );
    const result = validateCms1500Claim(claim);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Patient name is required (Box 2).");
  });

  test("rejects empty diagnoses", () => {
    const superbill = makeSuperbill({
      lineItems: [makeLineItem({ diagnosisPointers: [] })],
    });
    const claim = buildCms1500Claim(superbill, patient, provider, encounterDate);
    const result = validateCms1500Claim(claim);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "At least one diagnosis code is required (Box 21).",
    );
  });

  test("rejects empty service lines", () => {
    const superbill = makeSuperbill({ lineItems: [] });
    const claim = buildCms1500Claim(superbill, patient, provider, encounterDate);
    const result = validateCms1500Claim(claim);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "At least one service line is required (Box 24).",
    );
  });

  test("rejects missing provider NPI", () => {
    const superbill = makeSuperbill();
    const claim = buildCms1500Claim(
      superbill,
      patient,
      { ...provider, providerNpi: "" },
      encounterDate,
    );
    const result = validateCms1500Claim(claim);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Provider NPI is required (Box 31).");
  });
});

// ---------------------------------------------------------------------------
// formatCentsToUsd
// ---------------------------------------------------------------------------

describe("formatCentsToUsd", () => {
  test("formats whole dollar amount", () => {
    expect(formatCentsToUsd(10000)).toBe("$100.00");
  });

  test("formats zero", () => {
    expect(formatCentsToUsd(0)).toBe("$0.00");
  });

  test("formats cents correctly", () => {
    expect(formatCentsToUsd(1)).toBe("$0.01");
    expect(formatCentsToUsd(99)).toBe("$0.99");
    expect(formatCentsToUsd(9999)).toBe("$99.99");
  });
});
