/**
 * Real Playwright fixtures for Phase 12 messaging E2E specs (Plan 12-10).
 *
 * Replaces the Plan 12-00 stubs that used to throw. These fixtures drive
 * the same BFF routes the app uses, so test setup exercises the full
 * auth → BFF → FastAPI → DB path.
 *
 * Test tenant: storageState in playwright.config.ts authenticates as the
 * seeded owner of the `sunview` tenant. seedClinicWithMessaging returns
 * that tenant's current messaging state — it does NOT provision a fresh
 * clinic, since real onboarding requires Twilio + Postmark credentials.
 */
import type { APIResponse, Page } from "@playwright/test";

export interface SeedClinicResult {
  tenantId: string;
  tenantSlug: string;
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

export interface SeedEncounterResult {
  encounterId: string;
}

const TENANT_SLUG = process.env.E2E_TENANT_SLUG ?? "sunview";
const OWNER_EMAIL = process.env.E2E_EMAIL ?? "duytran@yahoo.com";
const TEST_PHONE = process.env.E2E_TEST_PHONE ?? "+15555550100";

async function expectOk(res: APIResponse, label: string): Promise<APIResponse> {
  if (!res.ok()) {
    throw new Error(
      `[messaging-fixture] ${label} failed: ${res.status()} ${await res.text()}`,
    );
  }
  return res;
}

/**
 * Returns the current messaging state of the authenticated test tenant.
 * Optionally toggles messaging_enabled / cap for the duration of a test.
 */
export async function seedClinicWithMessaging(
  page: Page,
  opts?: { messagingEnabled?: boolean; dailyCapCents?: number },
): Promise<SeedClinicResult> {
  if (opts?.messagingEnabled !== undefined || opts?.dailyCapCents !== undefined) {
    const patch: Record<string, unknown> = {};
    if (opts.messagingEnabled !== undefined) {
      patch.messaging_enabled = opts.messagingEnabled;
    }
    if (opts.dailyCapCents !== undefined) {
      patch.daily_sms_cap_cents = opts.dailyCapCents;
    }
    await expectOk(
      await page.request.patch("/api/messaging/settings", { data: patch }),
      "patch /api/messaging/settings",
    );
  }

  const settingsRes = await expectOk(
    await page.request.get("/api/messaging/settings"),
    "get /api/messaging/settings",
  );
  const settings = (await settingsRes.json()) as {
    twilioPhoneNumber?: string | null;
    twilio_phone_number?: string | null;
  };

  const meRes = await page.request.get("/api/auth/me");
  let tenantId = "";
  let tenantSlug = TENANT_SLUG;
  if (meRes.ok()) {
    const me = (await meRes.json()) as {
      tenantId?: string;
      tenant_id?: string;
      tenantSlug?: string;
      tenant_slug?: string;
    };
    tenantId = me.tenantId ?? me.tenant_id ?? "";
    tenantSlug = me.tenantSlug ?? me.tenant_slug ?? TENANT_SLUG;
  }

  return {
    tenantId,
    tenantSlug,
    ownerEmail: OWNER_EMAIL,
    twilioPhone:
      settings.twilioPhoneNumber ??
      settings.twilio_phone_number ??
      "+15555551234",
  };
}

/**
 * Creates a patient with the requested consent flags via /api/patients.
 */
export async function seedPatientWithConsent(
  page: Page,
  opts: {
    tenantId: string;
    consents: {
      sms_operational?: boolean;
      sms_marketing?: boolean;
      email_operational?: boolean;
      email_marketing?: boolean;
    };
  },
): Promise<SeedPatientResult> {
  const stamp = Date.now().toString(36);
  const firstName = `E2E${stamp}`;
  const email = `e2e+${stamp}@clarityos.test`;

  const nowIso = new Date().toISOString();
  const contactInfo: Record<string, unknown> = {
    phone_e164: TEST_PHONE,
    email,
  };
  if (opts.consents.sms_operational) contactInfo.consent_sms_operational_at = nowIso;
  if (opts.consents.sms_marketing) contactInfo.consent_sms_marketing_at = nowIso;
  if (opts.consents.email_operational) contactInfo.consent_email_operational_at = nowIso;
  if (opts.consents.email_marketing) contactInfo.consent_email_marketing_at = nowIso;

  const res = await expectOk(
    await page.request.post("/api/patients", {
      data: {
        first_name: firstName,
        last_name: "Patient",
        dob: "1990-01-01",
        contact_info_jsonb: contactInfo,
      },
    }),
    "post /api/patients",
  );
  const patient = (await res.json()) as { id: string };

  return {
    patientId: patient.id,
    firstName,
    phoneE164: TEST_PHONE,
    email,
  };
}

/**
 * Creates an appointment for the given patient.
 */
export async function seedAppointment(
  page: Page,
  opts: { patientId: string; tenantId: string; startTime: string },
): Promise<SeedAppointmentResult> {
  const res = await expectOk(
    await page.request.post("/api/appointments", {
      data: {
        patient_id: opts.patientId,
        start_time: opts.startTime,
        duration_minutes: 30,
        status: "scheduled",
      },
    }),
    "post /api/appointments",
  );
  const appt = (await res.json()) as { id: string };
  return {
    appointmentId: appt.id,
    startTime: opts.startTime,
    patientId: opts.patientId,
  };
}

/**
 * Creates and finalizes an encounter — used by recall tests to backdate a visit.
 */
export async function seedFinalizedEncounter(
  page: Page,
  opts: { patientId: string; tenantId: string; finalizedAt: string },
): Promise<SeedEncounterResult> {
  const createRes = await expectOk(
    await page.request.post("/api/encounters", {
      data: {
        patient_id: opts.patientId,
        scheduled_at: opts.finalizedAt,
      },
    }),
    "post /api/encounters",
  );
  const enc = (await createRes.json()) as { id: string };

  await expectOk(
    await page.request.patch(`/api/encounters/${enc.id}`, {
      data: { is_finalized: true, finalized_at: opts.finalizedAt },
    }),
    `patch /api/encounters/${enc.id}`,
  );
  return { encounterId: enc.id };
}
