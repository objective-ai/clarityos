/**
 * lib/utils/cms1500.ts
 *
 * CMS-1500 export utility — maps billing store data to standard
 * clearinghouse JSON schema for electronic claim submission.
 *
 * The CMS-1500 is the universal professional claim form used by
 * healthcare providers to bill insurance companies. This utility
 * produces a JSON representation compatible with common clearinghouse
 * APIs (e.g., Change Healthcare, Availity, Trizetto).
 *
 * Reference: CMS-1500 form fields (02/12 revision)
 * https://www.cms.gov/medicare/cms-forms/cms-forms/cms-forms-items/cms012949
 */

import type { Superbill, SuperbillLineItem } from "@/types/billing";

// ---------------------------------------------------------------------------
// CMS-1500 JSON Schema Types
// ---------------------------------------------------------------------------

/** Box 21: ICD-10 diagnosis codes (up to 12) */
export interface Cms1500Diagnosis {
  /** Position letter A-L */
  pointer: string;
  /** ICD-10-CM code */
  code: string;
}

/** Box 24: Service line (one per CPT code) */
export interface Cms1500ServiceLine {
  /** Line number (1-6 per page) */
  lineNumber: number;
  /** Date of service (MMDDYYYY) */
  dateOfServiceFrom: string;
  /** Date of service end (same as from for single-day) */
  dateOfServiceTo: string;
  /** Place of service code (11 = office) */
  placeOfService: string;
  /** CPT/HCPCS code */
  procedureCode: string;
  /** Modifier codes */
  modifiers: string[];
  /** Diagnosis pointer letters (A-L) referencing Box 21 */
  diagnosisPointers: string[];
  /** Charges in cents (avoids floating point) */
  chargesInCents: number;
  /** Units of service */
  units: number;
}

/** Full CMS-1500 claim payload */
export interface Cms1500Claim {
  /** Claim metadata */
  meta: {
    formVersion: "02/12";
    generatedAt: string;
    sourceSystem: "ClarityOS EHR";
    sourceVersion: string;
    claimId: string;
    encounterId: string;
  };

  /** Box 1: Insurance type (always "other" for optometry) */
  insuranceType: string;

  /** Box 2: Patient name */
  patientName: {
    lastName: string;
    firstName: string;
    middleInitial?: string;
  };

  /** Box 3: Patient DOB and sex */
  patientDob: string;
  patientSex: string;

  /** Box 21: Diagnosis codes */
  diagnoses: Cms1500Diagnosis[];

  /** Box 24: Service lines */
  serviceLines: Cms1500ServiceLine[];

  /** Box 25: Provider tax ID / EIN */
  providerTaxId: string;

  /** Box 28: Total charges in cents */
  totalChargesInCents: number;

  /** Box 31: Signature of provider */
  providerSignature: {
    name: string;
    date: string;
    npi: string;
  };

  /** Box 32: Service facility */
  serviceFacility: {
    name: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    npi: string;
  };

  /** Box 33: Billing provider */
  billingProvider: {
    name: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    phone: string;
    npi: string;
  };
}

// ---------------------------------------------------------------------------
// Provider / Facility info (to be filled from tenant settings)
// ---------------------------------------------------------------------------

export interface Cms1500ProviderInfo {
  providerName: string;
  providerNpi: string;
  providerTaxId: string;
  facilityName: string;
  facilityAddress: string;
  facilityCity: string;
  facilityState: string;
  facilityZip: string;
  facilityNpi: string;
  billingPhone: string;
}

export interface Cms1500PatientInfo {
  firstName: string;
  lastName: string;
  middleInitial?: string;
  dob: string; // ISO date string
  sex: string;
}

// ---------------------------------------------------------------------------
// Export function
// ---------------------------------------------------------------------------

/**
 * Build a CMS-1500 compliant JSON claim from a superbill.
 *
 * @param superbill - The superbill with line items from billingStore
 * @param patient - Patient demographics
 * @param provider - Provider and facility information
 * @param encounterDate - Date of service (ISO string)
 * @returns CMS-1500 JSON payload ready for clearinghouse submission
 */
export function buildCms1500Claim(
  superbill: Superbill,
  patient: Cms1500PatientInfo,
  provider: Cms1500ProviderInfo,
  encounterDate: string,
): Cms1500Claim {
  // Collect unique ICD-10 codes from all line items and assign pointer letters
  const uniqueIcdCodes = new Set<string>();
  for (const li of superbill.lineItems) {
    for (const code of li.diagnosisPointers) {
      uniqueIcdCodes.add(code);
    }
  }

  const icdCodeList = Array.from(uniqueIcdCodes).slice(0, 12); // CMS-1500 max 12
  const pointerLetters = "ABCDEFGHIJKL";
  const codeToPointer: Record<string, string> = {};
  const diagnoses: Cms1500Diagnosis[] = icdCodeList.map((code, idx) => {
    const letter = pointerLetters[idx];
    codeToPointer[code] = letter;
    return { pointer: letter, code };
  });

  // Format date as MMDDYYYY
  const dosFormatted = formatDateCms(encounterDate);

  // Build service lines
  const serviceLines: Cms1500ServiceLine[] = superbill.lineItems.map(
    (li, idx) => ({
      lineNumber: idx + 1,
      dateOfServiceFrom: dosFormatted,
      dateOfServiceTo: dosFormatted,
      placeOfService: "11", // Office
      procedureCode: li.cptCode,
      modifiers: li.modifiers ?? [],
      diagnosisPointers: (li.diagnosisPointers ?? [])
        .map((code) => codeToPointer[code])
        .filter(Boolean),
      chargesInCents: Math.round(li.fee * li.units * 100),
      units: li.units,
    }),
  );

  // Total charges
  const totalChargesInCents = serviceLines.reduce(
    (sum, sl) => sum + sl.chargesInCents,
    0,
  );

  // Format patient DOB
  const patientDob = formatDateCms(patient.dob);

  return {
    meta: {
      formVersion: "02/12",
      generatedAt: new Date().toISOString(),
      sourceSystem: "ClarityOS EHR",
      sourceVersion: "0.1.0",
      claimId: superbill.id,
      encounterId: superbill.encounterId,
    },
    insuranceType: "other",
    patientName: {
      lastName: patient.lastName,
      firstName: patient.firstName,
      middleInitial: patient.middleInitial,
    },
    patientDob,
    patientSex: patient.sex,
    diagnoses,
    serviceLines,
    providerTaxId: provider.providerTaxId,
    totalChargesInCents,
    providerSignature: {
      name: provider.providerName,
      date: dosFormatted,
      npi: provider.providerNpi,
    },
    serviceFacility: {
      name: provider.facilityName,
      address: provider.facilityAddress,
      city: provider.facilityCity,
      state: provider.facilityState,
      zip: provider.facilityZip,
      npi: provider.facilityNpi,
    },
    billingProvider: {
      name: provider.providerName,
      address: provider.facilityAddress,
      city: provider.facilityCity,
      state: provider.facilityState,
      zip: provider.facilityZip,
      phone: provider.billingPhone,
      npi: provider.providerNpi,
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format an ISO date string to MMDDYYYY (CMS-1500 date format).
 */
function formatDateCms(isoDate: string): string {
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return "00000000";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${mm}${dd}${yyyy}`;
}

/**
 * Format cents to USD display string.
 */
export function formatCentsToUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Validate that a CMS-1500 claim has minimum required fields.
 */
export function validateCms1500Claim(
  claim: Cms1500Claim,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!claim.patientName.lastName || !claim.patientName.firstName) {
    errors.push("Patient name is required (Box 2).");
  }
  if (claim.diagnoses.length === 0) {
    errors.push("At least one diagnosis code is required (Box 21).");
  }
  if (claim.serviceLines.length === 0) {
    errors.push("At least one service line is required (Box 24).");
  }
  if (!claim.providerSignature.npi) {
    errors.push("Provider NPI is required (Box 31).");
  }

  // Check that every service line has at least one diagnosis pointer
  for (const sl of claim.serviceLines) {
    if (sl.diagnosisPointers.length === 0) {
      errors.push(
        `Service line ${sl.lineNumber} (CPT ${sl.procedureCode}) has no diagnosis pointer.`,
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Export claim as downloadable JSON file.
 */
export function downloadCms1500Json(claim: Cms1500Claim): void {
  const json = JSON.stringify(claim, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cms1500-${claim.meta.encounterId}-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
