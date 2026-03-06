import type {
  Superbill,
  SuperbillLineItem,
  MdmCalculationResult,
  CptIcdWarning,
} from "@/types/billing";

export function makeLineItem(
  overrides?: Partial<SuperbillLineItem>
): SuperbillLineItem {
  return {
    id: "li-1",
    superbillId: "sb-1",
    cptCode: "92014",
    description: "Comprehensive established patient eye exam",
    fee: 175.0,
    units: 1,
    diagnosisPointers: ["H52.13"],
    modifiers: [],
    createdAt: "2026-03-01T10:00:00Z",
    updatedAt: "2026-03-01T10:00:00Z",
    ...overrides,
  };
}

export function makeSuperbill(overrides?: Partial<Superbill>): Superbill {
  return {
    id: "sb-1",
    encounterId: "enc-1",
    patientId: "pat-1",
    providerId: "prov-1",
    claimStatus: "draft",
    mdmLevel: null,
    mdmReasoning: null,
    suggestedEmCode: null,
    totalFee: 175.0,
    notes: null,
    createdById: null,
    lineItems: [makeLineItem()],
    warnings: [],
    createdAt: "2026-03-01T10:00:00Z",
    updatedAt: "2026-03-01T10:00:00Z",
    ...overrides,
  };
}

export function makeMdmResult(
  overrides?: Partial<MdmCalculationResult>
): MdmCalculationResult {
  return {
    mdmLevel: "moderate",
    suggestedEmCode: "99214",
    reasoning: "2-of-3 criteria met",
    problemPoints: 3,
    dataPoints: 2,
    riskLevel: "moderate",
    ...overrides,
  };
}

export function makeWarning(
  overrides?: Partial<CptIcdWarning>
): CptIcdWarning {
  return {
    cptCode: "92014",
    description: "Comprehensive exam",
    warning: "Missing primary diagnosis pointer",
    ...overrides,
  };
}
