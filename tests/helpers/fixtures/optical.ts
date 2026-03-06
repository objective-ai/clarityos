import type {
  OpticalQueueItem,
  OpticalQueueResponse,
  OpticalStatusUpdateResponse,
  RxPdfData,
  EyeRxSummary,
  RxChangeAlert,
} from "@/types/optical";

export function makeEyeRx(
  overrides?: Partial<EyeRxSummary>
): EyeRxSummary {
  return {
    sphere: -2.0,
    cylinder: -0.5,
    axis: 90,
    add: null,
    prism: null,
    prismBase: null,
    visualAcuity: "20/20",
    ...overrides,
  };
}

export function makeRxChangeAlert(
  overrides?: Partial<RxChangeAlert>
): RxChangeAlert {
  return {
    hasChange: false,
    odPreviousSe: null,
    odCurrentSe: null,
    odDelta: null,
    osPreviousSe: null,
    osCurrentSe: null,
    osDelta: null,
    message: null,
    ...overrides,
  };
}

export function makeOpticalQueueItem(
  overrides?: Partial<OpticalQueueItem>
): OpticalQueueItem {
  return {
    encounterId: "enc-1",
    patientId: "pat-1",
    patientFirstName: "Jane",
    patientLastName: "Doe",
    patientDob: "1990-05-15",
    providerId: "prov-1",
    providerName: "Dr. Smith",
    providerLicenseNumber: "OD12345",
    finalizedAt: "2026-03-10T15:00:00Z",
    encounterDate: "2026-03-10",
    od: makeEyeRx(),
    os: makeEyeRx({ sphere: -1.75, cylinder: -0.25, axis: 85 }),
    pdDistance: 63,
    pdNear: 60,
    pdOd: null,
    pdOs: null,
    rxChangeAlert: makeRxChangeAlert(),
    status: "waiting",
    ...overrides,
  };
}

export function makeOpticalQueueResponse(
  items?: OpticalQueueItem[]
): OpticalQueueResponse {
  const list = items ?? [makeOpticalQueueItem()];
  return { items: list, total: list.length, date: "2026-03-10" };
}

export function makeRxPdfData(
  overrides?: Partial<RxPdfData>
): RxPdfData {
  return {
    clinicName: "ClarityOS Eye Care",
    clinicAddress: "123 Main St, Suite 100",
    clinicPhone: "555-0200",
    patientFirstName: "Jane",
    patientLastName: "Doe",
    patientDob: "1990-05-15",
    encounterDate: "2026-03-10",
    encounterId: "enc-1",
    od: makeEyeRx(),
    os: makeEyeRx({ sphere: -1.75, cylinder: -0.25, axis: 85 }),
    pdDistance: 63,
    pdNear: 60,
    pdOd: null,
    pdOs: null,
    providerName: "Dr. Smith",
    providerLicenseNumber: "OD12345",
    providerNpi: "1234567890",
    expirationDate: "2028-03-10",
    expirationMonths: 24,
    rxChangeAlert: makeRxChangeAlert(),
    ...overrides,
  };
}

export function makeStatusUpdateResponse(
  overrides?: Partial<OpticalStatusUpdateResponse>
): OpticalStatusUpdateResponse {
  return {
    encounterId: "enc-1",
    status: "in_progress",
    updatedAt: "2026-03-10T16:00:00Z",
    ...overrides,
  };
}
