/**
 * BFF endpoint: render a React Email component to inline-styled HTML.
 *
 * Service-to-service only — FastAPI's sender service (Plan 12-03) calls this
 * via internal fetch, gets HTML back, then forwards the HTML string to the
 * Postmark SDK. This keeps React Email rendering in Node (where it works)
 * and the Postmark call in Python (where the audit/log lives).
 *
 * Auth: WEBHOOK_INTERNAL_SECRET header — same shared secret as the inbound
 * webhook gate in Plan 12-04. Not user-facing; no Supabase auth.
 */
import { NextRequest, NextResponse } from "next/server";
import { render } from "@react-email/render";
import { ReminderEmail } from "@/components/messaging/emails/ReminderEmail";
import { RecallEmail } from "@/components/messaging/emails/RecallEmail";
import { ManualEmail } from "@/components/messaging/emails/ManualEmail";

export const runtime = "nodejs";

type TemplateKind =
  | "reminder_7d"
  | "reminder_72h"
  | "reminder_24h"
  | "recall_m12"
  | "recall_m14"
  | "manual";

interface RenderRequest {
  template_kind: TemplateKind;
  language: "en" | "es";
  tokens: Record<string, string>;
  subject?: string;
  body?: string;
}

export async function POST(request: NextRequest) {
  const headerSecret = request.headers.get("x-webhook-internal");
  const expected = process.env.WEBHOOK_INTERNAL_SECRET;
  if (!expected || headerSecret !== expected) {
    return new NextResponse("forbidden", { status: 403 });
  }

  let payload: RenderRequest;
  try {
    payload = (await request.json()) as RenderRequest;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const tokens = payload.tokens ?? {};
  let element: React.ReactElement;

  if (payload.template_kind.startsWith("reminder_")) {
    element = (
      <ReminderEmail
        patientFirstName={tokens.patient_first_name ?? ""}
        apptDate={tokens.appt_date ?? ""}
        apptTime={tokens.appt_time ?? ""}
        providerName={tokens.provider_name ?? ""}
        clinicName={tokens.clinic_name ?? ""}
        confirmLink={tokens.confirm_link ?? "#"}
        rescheduleLink={tokens.reschedule_link ?? "#"}
        language={payload.language}
      />
    );
  } else if (payload.template_kind.startsWith("recall_")) {
    element = (
      <RecallEmail
        patientFirstName={tokens.patient_first_name ?? ""}
        clinicName={tokens.clinic_name ?? ""}
        confirmLink={tokens.confirm_link ?? "#"}
        language={payload.language}
      />
    );
  } else if (payload.template_kind === "manual") {
    element = (
      <ManualEmail
        subject={payload.subject ?? ""}
        body={payload.body ?? ""}
        clinicName={tokens.clinic_name ?? ""}
      />
    );
  } else {
    return NextResponse.json(
      { error: "unknown_template_kind", template_kind: payload.template_kind },
      { status: 400 },
    );
  }

  const html = await render(element, { pretty: false });
  return NextResponse.json({ html });
}
