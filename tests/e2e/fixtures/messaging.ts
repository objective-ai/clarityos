import type { Page } from "@playwright/test";

export interface SeedClinicResult {
  tenantId: string;
  ownerEmail: string;
  twilioPhone: string;
}

export interface SeedPatientResult {
  patientId: string;
  firstName: string;
  phoneE164: string;
  email: string;
}

export interface SeedAppointmentResult {
  appointmentId: string;
  startTime: string;
  patientId: string;
}

// TODO(plan-12-10): land real impl that provisions a tenant + Twilio number sandbox.
export async function seedClinicWithMessaging(
  _page: Page,
  _opts?: { messagingEnabled?: boolean; dailyCapCents?: number }
): Promise<SeedClinicResult> {
  throw new Error("seedClinicWithMessaging not implemented - Plan 12-10 will land the real impl");
}

// TODO(plan-12-08): land real impl that creates a patient + writes consent rows.
export async function seedPatientWithConsent(
  _page: Page,
  _opts: {
    tenantId: string;
    consents: {
      sms_operational?: boolean;
      sms_marketing?: boolean;
      email_operational?: boolean;
      email_marketing?: boolean;
    };
  }
): Promise<SeedPatientResult> {
  throw new Error("seedPatientWithConsent not implemented - Plan 12-08 will land the real impl");
}

// TODO(plan-12-06): land real impl that creates an appointment row tied to scheduler triggers.
export async function seedAppointment(
  _page: Page,
  _opts: { patientId: string; tenantId: string; startTime: string }
): Promise<SeedAppointmentResult> {
  throw new Error("seedAppointment not implemented - Plan 12-06 will land the real impl");
}

// TODO(plan-12-06): land real impl that creates a finalized encounter (recall trigger).
export async function seedFinalizedEncounter(
  _page: Page,
  _opts: { patientId: string; tenantId: string; finalizedAt: string }
): Promise<{ encounterId: string }> {
  throw new Error("seedFinalizedEncounter not implemented - Plan 12-06 will land the real impl");
}
