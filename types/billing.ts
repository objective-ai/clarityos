// ---------------------------------------------------------------------------
// Types -- mirrors Python billing schemas
// ---------------------------------------------------------------------------

export type ClaimStatus =
  | "draft"
  | "ready_to_bill"
  | "submitted"
  | "accepted"
  | "rejected";

export type MdmLevel =
  | "straightforward"
  | "low"
  | "moderate"
  | "high";

// ---------------------------------------------------------------------------
// Line Item
// ---------------------------------------------------------------------------

export interface SuperbillLineItem {
  id: string;
  superbillId: string;
  cptCode: string;
  description: string;
  fee: number;
  units: number;
  diagnosisPointers: string[];
  modifiers: string[];
  createdAt: string;
  updatedAt: string;
}

export interface LineItemCreateRequest {
  cptCode: string;
  description: string;
  fee?: number;
  units?: number;
  diagnosisPointers?: string[];
  modifiers?: string[];
}

export interface LineItemUpdateRequest {
  fee?: number;
  units?: number;
  diagnosisPointers?: string[];
  modifiers?: string[];
}

// ---------------------------------------------------------------------------
// CPT-ICD Warning
// ---------------------------------------------------------------------------

export interface CptIcdWarning {
  cptCode: string;
  description: string;
  warning: string;
}

// ---------------------------------------------------------------------------
// Superbill
// ---------------------------------------------------------------------------

export interface Superbill {
  id: string;
  encounterId: string;
  patientId: string;
  providerId: string;
  claimStatus: ClaimStatus;
  mdmLevel: MdmLevel | null;
  mdmReasoning: string | null;
  suggestedEmCode: string | null;
  totalFee: number;
  notes: string | null;
  createdById: string | null;
  lineItems: SuperbillLineItem[];
  warnings: CptIcdWarning[];
  createdAt: string;
  updatedAt: string;
}

export interface SuperbillCreateRequest {
  lineItems?: LineItemCreateRequest[];
  notes?: string;
}

export interface SuperbillUpdateRequest {
  claimStatus?: ClaimStatus;
  notes?: string;
}

// ---------------------------------------------------------------------------
// MDM Calculation
// ---------------------------------------------------------------------------

export interface MdmCalculationResult {
  mdmLevel: MdmLevel;
  suggestedEmCode: string;
  reasoning: string;
  problemPoints: number;
  dataPoints: number;
  riskLevel: string;
}

// ---------------------------------------------------------------------------
// CPT Catalog (hardcoded optometry codes)
// ---------------------------------------------------------------------------

export interface CptEntry {
  code: string;
  description: string;
  defaultFee: number;
  category: "exam" | "em" | "diagnostic" | "procedure";
}

export const CPT_CATALOG: CptEntry[] = [
  { code: "92004", description: "Comprehensive new patient eye exam", defaultFee: 250.00, category: "exam" },
  { code: "92014", description: "Comprehensive established patient eye exam", defaultFee: 175.00, category: "exam" },
  { code: "92002", description: "Intermediate new patient eye exam", defaultFee: 150.00, category: "exam" },
  { code: "92012", description: "Intermediate established patient eye exam", defaultFee: 100.00, category: "exam" },
  { code: "99213", description: "Office visit E&M Level 3 (straightforward MDM)", defaultFee: 110.00, category: "em" },
  { code: "99214", description: "Office visit E&M Level 4 (moderate MDM)", defaultFee: 165.00, category: "em" },
  { code: "99215", description: "Office visit E&M Level 5 (high MDM)", defaultFee: 225.00, category: "em" },
  { code: "92015", description: "Refraction", defaultFee: 45.00, category: "procedure" },
  { code: "92083", description: "Visual field test", defaultFee: 85.00, category: "diagnostic" },
  { code: "92250", description: "Fundus photography", defaultFee: 65.00, category: "diagnostic" },
  { code: "92134", description: "OCT retina scan", defaultFee: 75.00, category: "diagnostic" },
];

// ---------------------------------------------------------------------------
// Superbill List (dashboard)
// ---------------------------------------------------------------------------

export interface SuperbillListItem {
  id: string;
  encounterId: string;
  patientId: string;
  patientName: string;
  providerName: string;
  claimStatus: ClaimStatus;
  cptCodes: string[];
  totalFee: number;
  createdAt: string;
}
