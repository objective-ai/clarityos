/**
 * types/optical.ts
 *
 * TypeScript types for the Optical Handoff module.
 *
 * These mirror the Python backend schemas in backend/schemas/optical.py.
 * All field names are camelCase (the api-client handles snake_case conversion).
 */

// ---------------------------------------------------------------------------
// Optical order status
// ---------------------------------------------------------------------------

export type OpticalStatus = "waiting" | "in_progress" | "dispensed";

// ---------------------------------------------------------------------------
// Eye Rx summary (flat, for queue display)
// ---------------------------------------------------------------------------

export interface EyeRxSummary {
  sphere: number | null;
  cylinder: number | null;
  axis: number | null;
  add: number | null;
  prism: number | null;
  prismBase: string | null;
  visualAcuity: string | null;
}

// ---------------------------------------------------------------------------
// Rx Change Alert
// ---------------------------------------------------------------------------

export interface RxChangeAlert {
  hasChange: boolean;
  odPreviousSe: number | null;
  odCurrentSe: number | null;
  odDelta: number | null;
  osPreviousSe: number | null;
  osCurrentSe: number | null;
  osDelta: number | null;
  message: string | null;
}

// ---------------------------------------------------------------------------
// Optical Queue Item
// ---------------------------------------------------------------------------

export interface OpticalQueueItem {
  encounterId: string;
  patientId: string;
  patientFirstName: string;
  patientLastName: string;
  patientDob: string;

  providerId: string;
  providerName: string;
  providerLicenseNumber: string | null;

  finalizedAt: string;
  encounterDate: string;

  od: EyeRxSummary;
  os: EyeRxSummary;
  pdDistance: number | null;
  pdNear: number | null;
  pdOd: number | null;
  pdOs: number | null;

  rxChangeAlert: RxChangeAlert;
  status: OpticalStatus;
}

// ---------------------------------------------------------------------------
// Queue Response
// ---------------------------------------------------------------------------

export interface OpticalQueueResponse {
  items: OpticalQueueItem[];
  total: number;
  date: string;
}

// ---------------------------------------------------------------------------
// Status Update
// ---------------------------------------------------------------------------

export interface OpticalStatusUpdateRequest {
  status: OpticalStatus;
}

export interface OpticalStatusUpdateResponse {
  encounterId: string;
  status: OpticalStatus;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Rx PDF Data
// ---------------------------------------------------------------------------

export interface RxPdfData {
  clinicName: string;
  clinicAddress: string | null;
  clinicPhone: string | null;

  patientFirstName: string;
  patientLastName: string;
  patientDob: string;

  encounterDate: string;
  encounterId: string;

  od: EyeRxSummary;
  os: EyeRxSummary;
  pdDistance: number | null;
  pdNear: number | null;
  pdOd: number | null;
  pdOs: number | null;

  providerName: string;
  providerLicenseNumber: string | null;
  providerNpi: string | null;

  expirationDate: string;
  expirationMonths: number;

  rxChangeAlert: RxChangeAlert;
}
