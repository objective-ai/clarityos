---
phase: 12
plan: 10
slug: onboarding-compliance-e2e
type: execute
wave: 6
depends_on: [12-06, 12-08, 12-09]
files_modified:
  - app/(tenant)/[tenant]/settings/messaging/onboarding/page.tsx
  - components/messaging/wizard/Step1Acknowledge.tsx
  - components/messaging/wizard/Step2ClinicInfo.tsx
  - components/messaging/wizard/Step3NumberProvision.tsx
  - components/messaging/wizard/Step4ReminderPreset.tsx
  - components/messaging/wizard/Step5RecallPreset.tsx
  - components/messaging/wizard/Step6TemplateSeed.tsx
  - components/messaging/wizard/Step7TestSend.tsx
  - app/api/messaging/onboarding/provision-number/route.ts
  - app/api/messaging/onboarding/seed-templates/route.ts
  - app/api/messaging/onboarding/test-send/route.ts
  - app/api/messaging/onboarding/activate/route.ts
  - app/api/messaging/compliance-report/route.ts
  - backend/api/routes/messaging.py
  - backend/services/messaging/seeds.py
  - backend/services/messaging/compliance_report.py
  - tests/e2e/messaging-wizard.spec.ts
  - tests/e2e/recall-queue.spec.ts
  - tests/e2e/patient-messages-tab.spec.ts
  - tests/e2e/messaging-analytics.spec.ts
  - tests/e2e/fixtures/messaging.ts
  - .planning/phases/12-crm-patient-engagement/12-VERIFICATION.md
autonomous: false
gap_closure: false
requirements: [CRM-13, CRM-14, CRM-16, CRM-15]
user_setup:
  - service: twilio
    why: "Onboarding wizard test-send + production canary"
    env_vars:
      - name: TWILIO_ACCOUNT_SID
        source: "Twilio Console"
      - name: TWILIO_AUTH_TOKEN
        source: "Twilio Console"
      - name: TWILIO_MESSAGING_SERVICE_SID
        source: "Twilio Console -> Messaging -> Services (must have Advanced Opt-Out enabled)"
    dashboard_config:
      - task: "After Plan 12-04 webhooks land, configure Messaging Service status callback URL to https://app.clarityos.app/api/webhooks/twilio and inbound webhook URL to the same"
        location: "Twilio Console -> Messaging -> Services -> Inbound Settings"
  - service: resend
    why: "Wizard test-send requires real Resend API key + verified domain"
    env_vars:
      - name: RESEND_API_KEY
        source: "Resend Dashboard"
      - name: RESEND_FROM_EMAIL
        source: "Verified domain in Resend"
      - name: RESEND_WEBHOOK_SECRET
        source: "Resend Dashboard -> Webhooks (Svix signing)"
    dashboard_config:
      - task: "Configure Resend webhook URL https://app.clarityos.app/api/webhooks/resend with events email.sent, email.delivered, email.opened, email.bounced, email.complained"
        location: "Resend Dashboard -> Webhooks"

must_haves:
  truths:
    - "Onboarding wizard at /settings/messaging/onboarding runs all 7 steps with persistent progress"
    - "Wizard step 3 provisions a real Twilio local number matching clinic area code"
    - "Wizard step 6 seeds industry-pack templates (optometry default) into message_template table"
    - "Wizard step 7 sends real test SMS + email to OWNER and gates clinic_messaging_enabled flip on 'I Received Them' confirmation"
    - "GET /api/messaging/compliance-report?from=YYYY-MM-DD&to=YYYY-MM-DD returns a PDF download (reportlab) summarizing volume + opt-outs + audit trail (CRM-16)"
    - "4 Playwright E2E specs cover: wizard happy path, recall queue Send All, patient Messages tab history rendering, analytics page chart load"
    - "Phase verification document recorded with checker sign-off"
  artifacts:
    - path: "app/(tenant)/[tenant]/settings/messaging/onboarding/page.tsx"
      provides: "7-step wizard orchestration"
    - path: "backend/services/messaging/seeds.py"
      provides: "seed_default_templates(tenant_id, practice_type) — optometry/ophthalmology/general"
    - path: "backend/services/messaging/compliance_report.py"
      provides: "generate_compliance_report_pdf(tenant_id, from, to) -> bytes"
    - path: "tests/e2e/messaging-wizard.spec.ts"
      provides: "Playwright E2E for full wizard happy path"
  key_links:
    - from: "components/messaging/wizard/Step3NumberProvision.tsx"
      to: "app/api/messaging/onboarding/provision-number/route.ts"
      via: "fetch POST"
      pattern: "/api/messaging/onboarding/provision-number"
    - from: "components/messaging/wizard/Step7TestSend.tsx"
      to: "app/api/messaging/onboarding/activate/route.ts"
      via: "fetch POST after 'I Received Them' click"
      pattern: "/api/messaging/onboarding/activate"
---

<objective>
Land the final integration: 7-step Messaging Onboarding Wizard, Compliance Report PDF generator, 4 Playwright E2E specs, and the Phase 12 verification document.

This plan ALSO includes a HIPAA-critical human checkpoint (Task 4) before declaring the phase done — same pattern as Phase 10.3 closure.

Output:
- 1 wizard orchestration page + 7 step components
- 4 onboarding-specific BFF + FastAPI endpoints (provision-number, seed-templates, test-send, activate)
- 1 compliance report endpoint (PDF via reportlab — reuses Phase 9 dep)
- 4 Playwright E2E specs (replaces stub fixtures from Plan 12-00)
- Phase 12-VERIFICATION.md
- HIPAA-critical human checkpoint
</objective>

<execution_context>
@C:/Users/duytr/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/duytr/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/12-crm-patient-engagement/12-CONTEXT.md
@.planning/phases/12-crm-patient-engagement/12-UI-SPEC.md
@.planning/phases/12-crm-patient-engagement/12-RESEARCH.md
@.planning/phases/12-crm-patient-engagement/12-VALIDATION.md
@.planning/phases/12-crm-patient-engagement/12-04-SUMMARY.md
@.planning/phases/12-crm-patient-engagement/12-05-SUMMARY.md
@.planning/phases/12-crm-patient-engagement/12-08-SUMMARY.md
@.planning/phases/12-crm-patient-engagement/12-09-SUMMARY.md
@./CLAUDE.md
@.claude/rules/testing.md
@playwright.config.ts

<interfaces>
From Plan 12-02:
- backend/services/messaging/twilio_client.py — provision_local_number, send_sms

From Plan 12-05:
- backend/api/routes/messaging.py — extend with onboarding sub-router
- lib/api/messaging.ts — extend with onboarding helpers

From Plan 12-07:
- components/messaging/WizardStep.tsx (props: stepNumber, totalSteps, title, active, completed, children, onContinue, onBack, continueLabel, continueDisabled, isContinueLoading)

From Phase 9 (reportlab usage precedent):
- backend/services/cms1500.py uses reportlab for CMS-1500 PDF
- mirror: import from reportlab.lib.pagesizes import letter; from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table

From tests/e2e/fixtures/messaging.ts (Plan 12-00 stubs):
- seedClinicWithMessaging, seedPatientWithConsent, seedAppointment, seedFinalizedEncounter
- These were stubs throwing errors — this plan implements the actual seeding via Playwright API calls
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: 7-step Onboarding Wizard + 4 onboarding endpoints + seeds service</name>
  <files>
    app/(tenant)/[tenant]/settings/messaging/onboarding/page.tsx,
    components/messaging/wizard/Step1Acknowledge.tsx,
    components/messaging/wizard/Step2ClinicInfo.tsx,
    components/messaging/wizard/Step3NumberProvision.tsx,
    components/messaging/wizard/Step4ReminderPreset.tsx,
    components/messaging/wizard/Step5RecallPreset.tsx,
    components/messaging/wizard/Step6TemplateSeed.tsx,
    components/messaging/wizard/Step7TestSend.tsx,
    app/api/messaging/onboarding/provision-number/route.ts,
    app/api/messaging/onboarding/seed-templates/route.ts,
    app/api/messaging/onboarding/test-send/route.ts,
    app/api/messaging/onboarding/activate/route.ts,
    backend/api/routes/messaging.py,
    backend/services/messaging/seeds.py
  </files>
  <read_first>
    - components/messaging/WizardStep.tsx (Plan 12-07)
    - backend/services/messaging/twilio_client.py (Plan 12-02 — provision_local_number signature)
    - backend/services/messaging/sender.py (Plan 12-03 — dispatch for test-send)
    - .planning/phases/12-crm-patient-engagement/12-CONTEXT.md (lines 100-111 — wizard 7 steps)
    - .planning/phases/12-crm-patient-engagement/12-UI-SPEC.md (lines 162-167 — wizard layout; lines 203-209 — step transitions)
    - lib/api/messaging.ts (Plan 12-08 — extend with onboarding helpers)
  </read_first>
  <action>
**Step 1.** Create `backend/services/messaging/seeds.py`:

```python
"""Industry-pack template seeding.

Optometry / ophthalmology / general — picked during wizard step 6.
"""
from __future__ import annotations

from typing import Literal
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from backend.db.models.tenant.messaging import MessageTemplate, TemplateKind, MessageChannel


OPTOMETRY_SMS_EN = {
    TemplateKind.REMINDER_7D.value: "Hi {{patient_first_name}}, this is {{clinic_name}} — your eye exam is on {{appt_date}} at {{appt_time}}. Reply YES to confirm or visit {{reschedule_link}} to reschedule.",
    TemplateKind.REMINDER_72H.value: "Hi {{patient_first_name}}, reminder: your eye exam at {{clinic_name}} is in 3 days, {{appt_date}} at {{appt_time}}. Reply YES to confirm.",
    TemplateKind.REMINDER_24H.value: "Hi {{patient_first_name}}, your eye exam is tomorrow at {{appt_time}}. Reply YES to confirm or {{reschedule_link}} to reschedule.",
    TemplateKind.RECALL_M12.value: "Hi {{patient_first_name}}, it's been a year since your last eye exam at {{clinic_name}}. Time to schedule? Book at {{confirm_link}}",
    TemplateKind.RECALL_M14.value: "Hi {{patient_first_name}}, just a friendly reminder — your eyes deserve regular care. Book your annual exam: {{confirm_link}}",
    TemplateKind.MANUAL.value: "Hi {{patient_first_name}}, ",
    TemplateKind.BOUNCE_FALLBACK_NOTICE.value: "Hi {{patient_first_name}}, we tried reaching you by SMS but couldn't deliver. Please update your contact info at {{clinic_name}}.",
}
OPTOMETRY_EMAIL_EN = {
    TemplateKind.REMINDER_7D.value: ("Eye exam reminder", "Your annual eye exam is on {{appt_date}} at {{appt_time}}. Confirm or reschedule via the buttons below."),
    TemplateKind.RECALL_M12.value: ("Time for your annual eye exam", "It's been a year since your last visit. Schedule your annual exam to keep your eyes healthy."),
}
# Spanish equivalents — abbreviated for plan brevity; implement using same shape
OPTOMETRY_SMS_ES = {
    TemplateKind.REMINDER_24H.value: "Hola {{patient_first_name}}, su examen de la vista es mañana a las {{appt_time}}. Responda SÍ para confirmar.",
    # ... fill remaining 6 entries
}


async def seed_default_templates(
    db: AsyncSession,
    tenant_id: UUID,
    practice_type: Literal["optometry", "ophthalmology", "general"] = "optometry",
) -> int:
    """Seed default templates for a clinic. Idempotent — skips templates that already exist."""
    from sqlalchemy import select

    existing_keys = set()
    rows = (await db.execute(
        select(MessageTemplate.kind, MessageTemplate.channel, MessageTemplate.language)
        .where(MessageTemplate.tenant_id == tenant_id)
    )).all()
    for r in rows:
        existing_keys.add((r.kind, r.channel, r.language))

    seeded = 0
    # SMS English
    for kind, body in OPTOMETRY_SMS_EN.items():
        if (kind, "sms", "en") in existing_keys: continue
        db.add(MessageTemplate(
            tenant_id=tenant_id, kind=kind, channel="sms", language="en",
            body=body, is_default=True,
        ))
        seeded += 1
    # SMS Spanish
    for kind, body in OPTOMETRY_SMS_ES.items():
        if (kind, "sms", "es") in existing_keys: continue
        db.add(MessageTemplate(
            tenant_id=tenant_id, kind=kind, channel="sms", language="es",
            body=body, is_default=True,
        ))
        seeded += 1
    # Email English
    for kind, (subject, body) in OPTOMETRY_EMAIL_EN.items():
        if (kind, "email", "en") in existing_keys: continue
        db.add(MessageTemplate(
            tenant_id=tenant_id, kind=kind, channel="email", language="en",
            subject=subject, body=body, is_default=True,
        ))
        seeded += 1

    await db.flush()
    return seeded
```

**Step 2.** Append onboarding endpoints to `backend/api/routes/messaging.py`:

```python
@router.post("/onboarding/provision-number")
async def provision_number(payload: dict, ctx, db):
    from backend.services.messaging.twilio_client import provision_local_number
    from backend.db.models.public.saas import Tenant
    from sqlalchemy import select
    area_code = payload["area_code"]
    tenant = (await db.execute(select(Tenant).where(Tenant.id == ctx.tenant_id))).scalar_one()
    settings_dict = dict(tenant.settings_jsonb or {})
    msg = dict(settings_dict.get("messaging", {}))
    if not msg.get("twilio_messaging_service_sid"):
        from backend.core.config import settings as app_settings
        msg["twilio_messaging_service_sid"] = app_settings.TWILIO_MESSAGING_SERVICE_SID
    result = await provision_local_number(
        area_code=area_code,
        friendly_name=f"{tenant.name} - ClarityOS",
        messaging_service_sid=msg["twilio_messaging_service_sid"],
    )
    msg["twilio_phone_number"] = result["phone_number"]
    msg["twilio_phone_sid"] = result["sid"]
    settings_dict["messaging"] = msg
    tenant.settings_jsonb = settings_dict
    await db.commit()
    return {"phone_number": result["phone_number"]}


@router.post("/onboarding/seed-templates")
async def seed_templates_route(payload: dict, ctx, db):
    from backend.services.messaging.seeds import seed_default_templates
    practice_type = payload.get("practice_type", "optometry")
    count = await seed_default_templates(db, ctx.tenant_id, practice_type)
    await db.commit()
    return {"seeded": count}


@router.post("/onboarding/test-send")
async def test_send_route(payload: dict, ctx, db):
    """Send a test SMS + email to OWNER's contact. Records audit but does NOT flip messaging_enabled."""
    from backend.services.messaging.sender import dispatch, DispatchRequest
    # Build a minimal DispatchRequest — body_override only, no template
    owner_phone = payload["owner_phone"]
    owner_email = payload["owner_email"]
    # Simple test payloads — bypass template + render
    sms_log = await dispatch(db, ctx, DispatchRequest(
        tenant_id=ctx.tenant_id, patient_id=ctx.user_id,  # special: use user_id as patient_id placeholder for test
        channel="sms", purpose="manual",
        body_override="ClarityOS test: messaging is configured. Reply STOP to opt out at any time.",
        force_outside_quiet_hours=True,
        actor_user_id=ctx.user_id, language="en",
    ), patient={"id": ctx.user_id, "first_name": "Owner", "last_name": "", "dob": None,
                "phone_e164": owner_phone, "email": owner_email, "guardian": None,
                "contact_info_jsonb": {"phone_e164": owner_phone, "email": owner_email,
                                       "consent_sms_operational_at": "2026-01-01T00:00:00Z",
                                       "consent_email_operational_at": "2026-01-01T00:00:00Z"}},
       tenant=await _fetch_tenant(db, ctx), template=None, status_callback_url=_callback_url("sms"))
    # Same for email — abbreviated
    await db.commit()
    return {"sms_log_id": str(sms_log.id), "email_log_id": "..."}


@router.post("/onboarding/activate")
async def activate_messaging(payload: dict, ctx, db):
    from sqlalchemy import select
    from backend.db.models.public.saas import Tenant
    tenant = (await db.execute(select(Tenant).where(Tenant.id == ctx.tenant_id))).scalar_one()
    settings_dict = dict(tenant.settings_jsonb or {})
    msg = dict(settings_dict.get("messaging", {}))
    msg["messaging_enabled"] = True
    settings_dict["messaging"] = msg
    tenant.settings_jsonb = settings_dict
    await log_action(db, ctx, AuditAction.MESSAGING_ENABLED,
                     resource_type="tenant", resource_id=ctx.tenant_id, metadata={"trigger": "onboarding_wizard"})
    await db.commit()
    return {"messaging_enabled": True}
```

**Step 3.** Create matching BFF passthroughs (4 routes).

**Step 4.** Create the 7 wizard step components + the orchestrator page.

`components/messaging/wizard/Step1Acknowledge.tsx`: Checkbox for BAA + TCPA terms, Continue disabled until checked.

`Step2ClinicInfo.tsx`: Read-only display of clinic name + timezone (from tenant settings).

`Step3NumberProvision.tsx`: Area-code input (3 digits), Continue triggers POST /api/messaging/onboarding/provision-number, shows spinner + provisioned number on success.

`Step4ReminderPreset.tsx`: Radio group with "3-touch (recommended)" pre-selected. Just sets a wizard state flag.

`Step5RecallPreset.tsx`: Radio group with "Staff-approved queue (recommended)" pre-selected.

`Step6TemplateSeed.tsx`: Practice type select (optometry/ophthalmology/general), Continue triggers POST /api/messaging/onboarding/seed-templates.

`Step7TestSend.tsx`: Click "Send Test Message" → POST /api/messaging/onboarding/test-send. Then "I Received Them" button appears. Click → POST /api/messaging/onboarding/activate → success state. UI-SPEC line 207: button states idle → sending (spinner) → success ("Resend if needed").

Orchestrator `page.tsx`: holds `currentStep`, persists wizard state in localStorage, renders the active step.

```tsx
"use client";
import { useEffect, useState } from "react";
import { WizardStep } from "@/components/messaging/WizardStep";
import { Step1Acknowledge } from "@/components/messaging/wizard/Step1Acknowledge";
import { Step2ClinicInfo } from "@/components/messaging/wizard/Step2ClinicInfo";
import { Step3NumberProvision } from "@/components/messaging/wizard/Step3NumberProvision";
import { Step4ReminderPreset } from "@/components/messaging/wizard/Step4ReminderPreset";
import { Step5RecallPreset } from "@/components/messaging/wizard/Step5RecallPreset";
import { Step6TemplateSeed } from "@/components/messaging/wizard/Step6TemplateSeed";
import { Step7TestSend } from "@/components/messaging/wizard/Step7TestSend";

const STORAGE_KEY = "messaging-onboarding-state";

interface WizardState {
  currentStep: number;
  step1AcknowledgedAt: string | null;
  step3PhoneNumber: string | null;
  step4ReminderPreset: "3-touch" | null;
  step5RecallPreset: "staff-approved" | null;
  step6PracticeType: "optometry" | "ophthalmology" | "general" | null;
  step7TestSentAt: string | null;
  activatedAt: string | null;
}

const INITIAL: WizardState = {
  currentStep: 1, step1AcknowledgedAt: null, step3PhoneNumber: null,
  step4ReminderPreset: null, step5RecallPreset: null,
  step6PracticeType: null, step7TestSentAt: null, activatedAt: null,
};

export default function OnboardingWizardPage() {
  const [state, setState] = useState<WizardState>(INITIAL);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (stored) try { setState(JSON.parse(stored)); } catch {}
  }, []);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  function update(partial: Partial<WizardState>) {
    setState((s) => ({ ...s, ...partial }));
  }

  function back() { update({ currentStep: Math.max(1, state.currentStep - 1) }); }
  function next() { update({ currentStep: Math.min(7, state.currentStep + 1) }); }

  return (
    <div className="max-w-[640px] mx-auto p-6">
      <div role="progressbar"
           aria-valuenow={state.currentStep} aria-valuemin={1} aria-valuemax={7}
           className="flex gap-2 mb-6 justify-center">
        {[1, 2, 3, 4, 5, 6, 7].map((n) => (
          <div key={n} className={`w-3 h-3 rounded-full ${
            n === state.currentStep ? "bg-[var(--accent)]" :
            n < state.currentStep ? "bg-[var(--accent)] opacity-50" :
            "bg-[var(--text-muted)]"}`} />
        ))}
      </div>

      {state.currentStep === 1 && (
        <Step1Acknowledge state={state} update={update} onContinue={next} />
      )}
      {state.currentStep === 2 && (
        <Step2ClinicInfo state={state} update={update} onContinue={next} onBack={back} />
      )}
      {state.currentStep === 3 && (
        <Step3NumberProvision state={state} update={update} onContinue={next} onBack={back} />
      )}
      {state.currentStep === 4 && (
        <Step4ReminderPreset state={state} update={update} onContinue={next} onBack={back} />
      )}
      {state.currentStep === 5 && (
        <Step5RecallPreset state={state} update={update} onContinue={next} onBack={back} />
      )}
      {state.currentStep === 6 && (
        <Step6TemplateSeed state={state} update={update} onContinue={next} onBack={back} />
      )}
      {state.currentStep === 7 && (
        <Step7TestSend state={state} update={update} onBack={back} />
      )}
    </div>
  );
}
```

Implement each step component using `WizardStep` from Plan 12-07. Use UI-SPEC copy verbatim (e.g. step 7 button: "Send Test Message", success: "I Received Them", final completion: "You're all set. ClarityOS will send appointment reminders automatically.").
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - 7 step component files exist: `ls components/messaging/wizard/Step{1,2,3,4,5,6,7}*.tsx | wc -l` returns 7
    - `grep -c "export default function OnboardingWizardPage" "app/(tenant)/[tenant]/settings/messaging/onboarding/page.tsx"` returns 1
    - `grep -c "I Received Them" components/messaging/wizard/Step7TestSend.tsx` returns at least 1 (UI-SPEC verbatim)
    - `grep -c "You're all set\\|appointment reminders automatically" components/messaging/wizard/Step7TestSend.tsx` returns at least 1
    - `grep -c "role=\"progressbar\"" "app/(tenant)/[tenant]/settings/messaging/onboarding/page.tsx"` returns 1
    - `grep -c "@router.post(\"/onboarding/provision-number\"\\|@router.post(\"/onboarding/seed-templates\"\\|@router.post(\"/onboarding/test-send\"\\|@router.post(\"/onboarding/activate\"" backend/api/routes/messaging.py` returns at least 4
    - `grep -c "async def seed_default_templates" backend/services/messaging/seeds.py` returns 1
    - `grep -c "OPTOMETRY_SMS_EN\\|OPTOMETRY_SMS_ES\\|OPTOMETRY_EMAIL_EN" backend/services/messaging/seeds.py` returns at least 3
    - `ls app/api/messaging/onboarding/{provision-number,seed-templates,test-send,activate}/route.ts | wc -l` returns 4
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>7-step wizard with localStorage persistence + 4 onboarding endpoints + seeds service. UI-SPEC copy verbatim.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Compliance Report PDF + Playwright E2E specs + fixture impl</name>
  <files>
    backend/services/messaging/compliance_report.py,
    backend/api/routes/messaging.py,
    app/api/messaging/compliance-report/route.ts,
    tests/e2e/messaging-wizard.spec.ts,
    tests/e2e/recall-queue.spec.ts,
    tests/e2e/patient-messages-tab.spec.ts,
    tests/e2e/messaging-analytics.spec.ts,
    tests/e2e/fixtures/messaging.ts
  </files>
  <read_first>
    - backend/services/cms1500.py (Phase 9 reportlab pattern reference)
    - tests/e2e/fixtures.ts (existing Playwright fixture pattern)
    - tests/e2e/fixtures/messaging.ts (Plan 12-00 stubs — replace with real impl)
    - playwright.config.ts (storageState pattern + projects config)
    - .planning/phases/12-crm-patient-engagement/12-VALIDATION.md (lines 49-70 — full per-task verification map; CRM-15, CRM-16, CRM-18, CRM-19 → E2E)
  </read_first>
  <action>
**Step 1.** Create `backend/services/messaging/compliance_report.py`:

```python
"""Communications Compliance Report PDF — for HIPAA / TCPA compliance binders."""
from __future__ import annotations

import io
from datetime import date, datetime, timezone
from uuid import UUID

from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib import colors

from backend.db.models.tenant.messaging import MessageLog


async def generate_compliance_report_pdf(
    db: AsyncSession, tenant_id: UUID, *, from_date: date, to_date: date,
) -> bytes:
    # Aggregate stats
    sent = (await db.execute(text("""
      SELECT channel, status, COUNT(*) AS count
      FROM message_log WHERE tenant_id = :t AND created_at::date BETWEEN :f AND :u
      GROUP BY channel, status
    """), {"t": str(tenant_id), "f": from_date, "u": to_date})).mappings().all()

    optouts = (await db.execute(text("""
      SELECT COUNT(*) FROM audit_log
      WHERE tenant_id = :t AND action = 'opt_out_recorded'
            AND created_at::date BETWEEN :f AND :u
    """), {"t": str(tenant_id), "f": from_date, "u": to_date})).scalar()

    consent_events = (await db.execute(text("""
      SELECT action, COUNT(*) FROM audit_log
      WHERE tenant_id = :t AND action IN ('consent_granted', 'consent_revoked')
            AND created_at::date BETWEEN :f AND :u
      GROUP BY action
    """), {"t": str(tenant_id), "f": from_date, "u": to_date})).mappings().all()

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter, title="Communications Compliance Report")
    styles = getSampleStyleSheet()
    story = [
        Paragraph(f"Communications Compliance Report", styles["Title"]),
        Paragraph(f"Period: {from_date.isoformat()} to {to_date.isoformat()}", styles["Normal"]),
        Spacer(1, 12),
        Paragraph(f"Total opt-outs (STOP keyword + manual): {optouts}", styles["Normal"]),
        Spacer(1, 8),
    ]

    # Volume table
    rows = [["Channel", "Status", "Count"]] + [[r["channel"], r["status"], str(r["count"])] for r in sent]
    tbl = Table(rows, hAlign="LEFT")
    tbl.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
                              ("BOX", (0, 0), (-1, -1), 0.5, colors.black)]))
    story += [Paragraph("Message Volume", styles["Heading2"]), tbl, Spacer(1, 12)]

    # Consent events
    rows = [["Action", "Count"]] + [[r["action"], str(r["count"])] for r in consent_events]
    if len(rows) > 1:
        tbl2 = Table(rows, hAlign="LEFT")
        story += [Paragraph("Consent Events", styles["Heading2"]), tbl2, Spacer(1, 12)]

    doc.build(story)
    return buf.getvalue()
```

**Step 2.** Append to `backend/api/routes/messaging.py`:

```python
from fastapi.responses import Response

@router.get("/compliance-report")
async def compliance_report(
    from_date: str = Query(...), to_date: str = Query(...),
    ctx: Annotated[TenantContext, Depends(get_tenant_context)] = ...,
    db: Annotated[AsyncSession, Depends(get_db)] = ...,
):
    if ctx.role != "owner":
        raise HTTPException(403, "OWNER role required")
    from datetime import date
    f = date.fromisoformat(from_date)
    t = date.fromisoformat(to_date)
    from backend.services.messaging.compliance_report import generate_compliance_report_pdf
    pdf_bytes = await generate_compliance_report_pdf(db, ctx.tenant_id, from_date=f, to_date=t)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="compliance-{from_date}-to-{to_date}.pdf"'},
    )
```

**Step 3.** Create BFF route `app/api/messaging/compliance-report/route.ts` using a streaming proxy (since proxyToFastAPI doesn't stream binaries — see Phase 10.4-04 SUMMARY for CSV streaming precedent):

```typescript
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const FASTAPI_URL = process.env.FASTAPI_URL!;
  const url = new URL(request.url);
  const params = url.searchParams;
  const upstream = await fetch(`${FASTAPI_URL}/api/messaging/compliance-report?${params}`, {
    headers: { Authorization: request.headers.get("Authorization") ?? "" },
  });
  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "application/pdf",
      "Content-Disposition": upstream.headers.get("Content-Disposition") ?? "",
    },
  });
}
```

**Step 4.** Replace stub `tests/e2e/fixtures/messaging.ts` with real Playwright-driven seed helpers. Use the existing test-utils + apiFetch pattern from `tests/e2e/helpers/test-utils.js`:

- `seedClinicWithMessaging` — set tenant.settings_jsonb.messaging via a test-only API endpoint OR direct DB seed via FastAPI test endpoint (check if `/api/test/seed` exists; if not, hit `/api/messaging/settings` PATCH with admin auth).
- `seedPatientWithConsent` — POST /api/patients with consent flags in contact_info_jsonb.
- `seedAppointment` — POST /api/appointments with given start_time.
- `seedFinalizedEncounter` — POST /api/encounters then PATCH to finalize.

**Step 5.** Create 4 Playwright E2E specs:

`tests/e2e/messaging-wizard.spec.ts` (CRM-13):
```typescript
import { test, expect } from "@playwright/test";
import { seedClinicWithMessaging } from "./fixtures/messaging";

test.describe("@messaging Messaging Onboarding Wizard", () => {
  test("happy path: 7 steps, test-send, activate", async ({ page }) => {
    const { tenantId, ownerEmail, twilioPhone } = await seedClinicWithMessaging(page);
    await page.goto(`/${tenantId}/settings/messaging/onboarding`);

    // Step 1
    await page.getByRole("checkbox", { name: /BAA/i }).check();
    await page.getByRole("button", { name: /Continue/i }).click();
    // Step 2 — clinic info read-only
    await page.getByRole("button", { name: /Continue/i }).click();
    // Step 3 — area code
    await page.fill('input[aria-label*="area code"]', "415");
    await page.getByRole("button", { name: /Continue/i }).click();
    await expect(page.getByText(twilioPhone)).toBeVisible();
    // Steps 4-5
    await page.getByRole("button", { name: /Continue/i }).click();
    await page.getByRole("button", { name: /Continue/i }).click();
    // Step 6
    await page.getByRole("combobox").selectOption("optometry");
    await page.getByRole("button", { name: /Continue/i }).click();
    // Step 7 — test send + ack
    await page.getByRole("button", { name: /Send Test Message/i }).click();
    await expect(page.getByRole("button", { name: /I Received Them/i })).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: /I Received Them/i }).click();
    await expect(page.getByText(/You're all set/i)).toBeVisible();
  });
});
```

`tests/e2e/recall-queue.spec.ts` (CRM-18 + CRM-03):
```typescript
import { test, expect } from "@playwright/test";
import { seedClinicWithMessaging, seedPatientWithConsent, seedFinalizedEncounter } from "./fixtures/messaging";

test.describe("@messaging Recall Queue", () => {
  test("lists 12mo-stale patients and Send All triggers batch", async ({ page }) => {
    const { tenantId } = await seedClinicWithMessaging(page);
    const p1 = await seedPatientWithConsent(page, { tenantId, consents: { sms_marketing: true, sms_operational: true } });
    await seedFinalizedEncounter(page, { tenantId, patientId: p1.patientId, finalizedAt: "2025-04-01T10:00:00Z" });

    await page.goto(`/${tenantId}/messaging/recall-queue`);
    await expect(page.getByText(p1.firstName)).toBeVisible();
    await page.getByRole("checkbox").first().check();
    await page.getByRole("button", { name: /Send All Recalls/i }).click();
    await page.getByRole("button", { name: /Send All Recalls/i }).last().click();  // confirm
    await expect(page.getByText(/Send All Recalls/i)).not.toBeVisible({ timeout: 10000 });
  });
});
```

`tests/e2e/patient-messages-tab.spec.ts` (CRM-05):
```typescript
import { test, expect } from "@playwright/test";
import { seedClinicWithMessaging, seedPatientWithConsent } from "./fixtures/messaging";

test.describe("@messaging Patient Messages Tab", () => {
  test("renders empty state then composer opens", async ({ page }) => {
    const { tenantId } = await seedClinicWithMessaging(page);
    const p = await seedPatientWithConsent(page, { tenantId, consents: { sms_operational: true, email_operational: true } });
    await page.goto(`/${tenantId}/patients/${p.patientId}`);
    await page.getByRole("tab", { name: "Messages" }).click();
    await expect(page.getByText(/No messages sent to this patient yet/i)).toBeVisible();
    await page.getByRole("button", { name: /Send Message/i }).click();
    await expect(page.getByRole("textbox", { name: /Message body|Body/i })).toBeVisible();
  });
});
```

`tests/e2e/messaging-analytics.spec.ts` (CRM-15):
```typescript
import { test, expect } from "@playwright/test";
import { seedClinicWithMessaging } from "./fixtures/messaging";

test.describe("@messaging Messaging Analytics", () => {
  test("page loads with 4 charts + 4 KPIs + range chips", async ({ page }) => {
    const { tenantId } = await seedClinicWithMessaging(page);
    await page.goto(`/${tenantId}/messaging/analytics`);
    await expect(page.getByRole("heading", { name: "Messaging Analytics" })).toBeVisible();
    await expect(page.getByText("Reminder Funnel")).toBeVisible();
    await expect(page.getByText("Recall Conversion")).toBeVisible();
    await expect(page.getByText("Opt-out Trend")).toBeVisible();
    await expect(page.getByText("Cost & Volume")).toBeVisible();
    await page.getByRole("button", { name: "7d" }).click();
    await page.getByRole("button", { name: "30d" }).click();
  });
});
```
  </action>
  <verify>
    <automated>cd backend && pytest tests/messaging -x -q && bash scripts/dev.sh pre-test && npx playwright test --grep @messaging --project=chromium</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "async def generate_compliance_report_pdf" backend/services/messaging/compliance_report.py` returns 1
    - `grep -c "reportlab" backend/services/messaging/compliance_report.py` returns at least 1
    - `grep -c "@router.get(\"/compliance-report\"" backend/api/routes/messaging.py` returns 1
    - `grep -c "ctx.role != \"owner\"" backend/api/routes/messaging.py` returns at least 1
    - 4 E2E spec files exist: `ls tests/e2e/messaging-wizard.spec.ts tests/e2e/recall-queue.spec.ts tests/e2e/patient-messages-tab.spec.ts tests/e2e/messaging-analytics.spec.ts | wc -l` returns 4
    - `grep -c "@messaging" tests/e2e/messaging-wizard.spec.ts tests/e2e/recall-queue.spec.ts tests/e2e/patient-messages-tab.spec.ts tests/e2e/messaging-analytics.spec.ts` returns at least 4
    - `grep -c "throw new Error" tests/e2e/fixtures/messaging.ts` returns 0 (stubs replaced)
    - `grep -c "export async function seedClinicWithMessaging" tests/e2e/fixtures/messaging.ts` returns 1 (real impl present)
    - All 4 Playwright specs run + pass against staging
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>Compliance Report PDF endpoint + 4 Playwright E2E specs (≥4 @messaging tests) + fixtures impl. All E2E green.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Phase 12-VERIFICATION.md document — links every CRM requirement to evidence</name>
  <files>
    .planning/phases/12-crm-patient-engagement/12-VERIFICATION.md
  </files>
  <read_first>
    - .planning/phases/10.3-error-monitoring-system-status/10.3-VERIFICATION.md (most recent precedent — same template structure)
    - .planning/phases/12-crm-patient-engagement/12-VALIDATION.md (the per-CRM test map — verification.md proves each row passed)
    - All 10 SUMMARY.md files for Plans 12-00 through 12-09
  </read_first>
  <action>
Create `.planning/phases/12-crm-patient-engagement/12-VERIFICATION.md`:

```markdown
---
phase: 12
status: pending-checkpoint
verified_at: <ISO when this fills out>
verified_by: <claude or duytran@yahoo.com>
hipaa_critical: true
---

# Phase 12 — CRM & Patient Engagement Verification

This document is the phase-gate evidence. Every requirement (CRM-01 through CRM-20) MUST have a tick.

## Per-Requirement Evidence

| Req | Plan | Evidence | Status |
|-----|------|----------|--------|
| CRM-01 | 12-06 | pytest backend/tests/messaging/test_reminder_cadence.py — 9 tests pass; manual: 1 reminder fires at scheduled time in staging | ⬜ |
| CRM-02 | 12-05 + 12-08 | pytest test_routes_send.py + Playwright patient-messages-tab.spec.ts pass | ⬜ |
| CRM-03 | 12-05 + 12-09 | pytest test_routes_recall.py + Playwright recall-queue.spec.ts pass | ⬜ |
| CRM-04 | 12-03 + 12-04 | pytest test_opt_out_guard.py + test_twilio_webhook.py STOP-keyword tests pass | ⬜ |
| CRM-05 | 12-04 + 12-08 | pytest test_resend_webhook.py status callback + Playwright patient-messages-tab.spec.ts pass | ⬜ |
| CRM-06 | 12-01 + 12-05 | pytest test_routes_misc.py preferences PATCH covers all 4 consent flags + audit emit | ⬜ |
| CRM-07 | 12-04 | pytest test_twilio_webhook.py + test_resend_webhook.py signature tests pass (CONTRACT TEST) | ⬜ |
| CRM-08 | 12-03 | pytest test_quiet_hours.py 8 tests including DST pass | ⬜ |
| CRM-09 | 12-03 + 12-09 | pytest test_cost_cap.py 7 tests + manual visual on settings page | ⬜ |
| CRM-10 | 12-05 | pytest test_routes_bulk.py — 50 cap + 1msg/sec throttle + batch_id audit | ⬜ |
| CRM-11 | 12-06 | pytest test_classifier.py — 6 tests, fast webhook response Pitfall 8 | ⬜ |
| CRM-12 | 12-05 | pytest test_routes_misc.py ai-draft preflight (CONTRACT TEST) | ⬜ |
| CRM-13 | 12-10 | Playwright messaging-wizard.spec.ts — 7 steps + activate flip | ⬜ |
| CRM-14 | 12-02 + 12-10 | pytest test_twilio_client.py provision_local_number + manual: real number provisioned in staging | ⬜ |
| CRM-15 | 12-05 + 12-09 | pytest test_routes_misc.py analytics endpoint + Playwright messaging-analytics.spec.ts | ⬜ |
| CRM-16 | 12-10 | manual: download compliance report PDF for sample month, verify rendering | ⬜ |
| CRM-17 | 12-01 | grep -c "MESSAGING" lib/entitlements.ts AND app/core/entitlements.py — both ≥ 3 | ⬜ |
| CRM-18 | 12-03 | pytest test_recipient_resolver.py — minor → guardian routing (7 tests) | ⬜ |
| CRM-19 | 12-03 + 12-06 | pytest test_recipient_resolver.py household + test_reminder_cadence.py bundle test | ⬜ |
| CRM-20 | 12-05 | pytest test_routes_send.py bounce-fallback test (3 fails → channel flip) | ⬜ |

## Manual Checkpoints (HIPAA-critical)

| # | Behavior | Evidence | Status |
|---|----------|----------|--------|
| M1 | Resend BAA confirmed in writing | .planning/compliance/RESEND-BAA-CHECKPOINT.md status: signed | ⬜ |
| M2 | Live Twilio test SMS round-trip | OWNER receives SMS during wizard step 7 in staging, taps confirm | ⬜ |
| M3 | PHI scrubber visual QA | Compose 5 borderline templates with diagnosis terms — confirm warn UI | ⬜ |
| M4 | Quiet hours real-clock test | Schedule reminder for 9:30pm clinic-local, observe deferral to 8am | ⬜ |
| M5 | Bulk send throttle on real Twilio | 50-recipient batch in staging, Twilio dashboard shows ~1/sec | ⬜ |
| M6 | Compliance PDF visual review | OWNER downloads sample month report, verifies layout | ⬜ |
| M7 | Twilio Messaging Service status callback wired | After Plan 12-04, OWNER confirms callback URL is configured in Twilio dashboard pointing to /api/webhooks/twilio | ⬜ |
| M8 | Resend webhook configured | After Plan 12-04, OWNER confirms webhook URL in Resend dashboard with Svix events | ⬜ |
| M9 | TWILIO BAA signed (separate from Resend) | OWNER confirms Twilio HIPAA / BAA active in Twilio Console | ⬜ |

## Test Suite Totals

| File | Test Count | Status |
|------|-----------|--------|
| backend/tests/messaging/test_twilio_client.py | ≥ 8 | ⬜ |
| backend/tests/messaging/test_resend_client.py | ≥ 7 | ⬜ |
| backend/tests/messaging/test_templates.py | ≥ 30 (incl 24+ PHI parametrize) | ⬜ |
| backend/tests/messaging/test_opt_out_guard.py | ≥ 7 (+ 32 matrix) | ⬜ |
| backend/tests/messaging/test_quiet_hours.py | ≥ 8 | ⬜ |
| backend/tests/messaging/test_cost_cap.py | ≥ 7 | ⬜ |
| backend/tests/messaging/test_recipient_resolver.py | ≥ 7 | ⬜ |
| backend/tests/messaging/test_sender.py | ≥ 11 (incl choke-point invariant) | ⬜ |
| backend/tests/messaging/test_twilio_webhook.py | ≥ 10 | ⬜ |
| backend/tests/messaging/test_resend_webhook.py | ≥ 5 | ⬜ |
| backend/tests/messaging/test_routes_send.py | ≥ 7 | ⬜ |
| backend/tests/messaging/test_routes_bulk.py | ≥ 3 | ⬜ |
| backend/tests/messaging/test_routes_recall.py | ≥ 5 | ⬜ |
| backend/tests/messaging/test_routes_misc.py | ≥ 15 | ⬜ |
| backend/tests/messaging/test_reminder_cadence.py | ≥ 9 | ⬜ |
| backend/tests/messaging/test_scheduler.py | ≥ 6 | ⬜ |
| backend/tests/messaging/test_classifier.py | ≥ 6 | ⬜ |
| lib/messaging/sms-segments.test.ts | ≥ 6 | ⬜ |
| lib/messaging/phi-scan.test.ts | ≥ 5 | ⬜ |
| lib/messaging/composer-preview.test.ts | ≥ 4 | ⬜ |
| tests/e2e/messaging-*.spec.ts | 4 specs | ⬜ |

## Phase Gate

This phase is COMPLETE when:
- [ ] All 20 CRM requirements ticked above
- [ ] All 9 manual checkpoints ticked
- [ ] All test files at expected count
- [ ] `pytest backend/tests/messaging` → exits 0
- [ ] `npx vitest run lib/messaging` → exits 0
- [ ] `npx playwright test --grep @messaging` → exits 0
- [ ] `npx tsc --noEmit` → exits 0
- [ ] STATE.md updated to mark Phase 12 complete
```
  </action>
  <verify>
    <automated>test -f .planning/phases/12-crm-patient-engagement/12-VERIFICATION.md && grep -c "CRM-01\\|CRM-20" .planning/phases/12-crm-patient-engagement/12-VERIFICATION.md</automated>
  </verify>
  <acceptance_criteria>
    - File exists at the documented path
    - `grep -c "CRM-" .planning/phases/12-crm-patient-engagement/12-VERIFICATION.md` returns at least 22 (20 reqs + table headers + manual list refs)
    - `grep -c "M1\\|M2\\|M3\\|M4\\|M5\\|M6\\|M7\\|M8\\|M9" .planning/phases/12-crm-patient-engagement/12-VERIFICATION.md` returns at least 9
    - `grep -c "Test Suite Totals" .planning/phases/12-crm-patient-engagement/12-VERIFICATION.md` returns 1
    - `grep -c "Phase Gate" .planning/phases/12-crm-patient-engagement/12-VERIFICATION.md` returns 1
  </acceptance_criteria>
  <done>VERIFICATION.md created with all 20 CRM-* rows + 9 manual checkpoints + test count table + phase gate.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: HIPAA-critical phase closure checkpoint (live BAA + Twilio + Resend dashboard sign-off)</name>
  <what-built>
    Plans 12-00 through 12-10 are complete: schema, services, routes, scheduler, classifier, UI, wizard, compliance PDF, E2E specs. Automated tests are green.

    The remaining gate is HIPAA + production-readiness attestation that ONLY a human can sign off. Phase 10.3 set this precedent.
  </what-built>
  <how-to-verify>
1. **Manual checkpoint M1** — Read `.planning/compliance/RESEND-BAA-CHECKPOINT.md`. Confirm `status:` is one of `signed`, `signed-pending-payment`, or `postmark-fallback` (with fallback executed in Plan 12-02). If `pending` or empty, STOP — Plan 12-00 Task 3 must complete first.

2. **Manual checkpoint M2** (live Twilio test SMS) — In staging:
   a. Set `MESSAGING_TEST_ALLOWLIST` env to OWNER's phone + email.
   b. Walk the wizard at `/{tenant}/settings/messaging/onboarding` end-to-end on a real provisioned Twilio number.
   c. Confirm OWNER's phone receives the test SMS and inbox receives the test email within 60s.
   d. Click "I Received Them" — confirm `tenant.settings_jsonb.messaging.messaging_enabled = true`.
   e. Tick `M2` in `12-VERIFICATION.md`.

3. **Manual checkpoint M3** (PHI scrubber visual QA):
   a. In `/settings/messaging` Templates tab, edit a reminder template body to include "glaucoma".
   b. Confirm UI shows `text-warning` warning banner referencing "glaucoma".
   c. Try to send via composer — server returns 422 PHIInTemplate (verify in network tab).
   d. Tick `M3`.

4. **Manual checkpoint M4** (quiet hours real-clock):
   a. Set tenant timezone to America/Los_Angeles.
   b. Schedule a test appointment 24h+1min from now where now is between 9pm-8am LA local.
   c. Confirm scheduler tick logs MESSAGE_DEFERRED with deferred_until set to next 8am.
   d. Wait for that 8am OR fast-forward via SQL update of MessageLog.deferred_until → confirm dispatch happens.
   e. Tick `M4`.

5. **Manual checkpoint M5** (bulk send throttle on real Twilio):
   a. In staging, prepare 5 allowlisted recipients (test cap reduced from 50 to 5 to keep SMS spend low).
   b. Trigger bulk-send via composer.
   c. Confirm Twilio dashboard shows ~1 send/sec across 5s wall clock.
   d. Tick `M5`.

6. **Manual checkpoint M6** (Compliance PDF visual review):
   a. Generate PDF via `/api/messaging/compliance-report?from=2026-04-01&to=2026-04-30` while logged in as OWNER.
   b. Open PDF, verify volume table + opt-out count + consent events render.
   c. Tick `M6`.

7. **Manual checkpoints M7 + M8 + M9** (provider dashboard configuration):
   a. M7: Twilio Console → Messaging Service → confirm status callback URL is `https://app.clarityos.app/api/webhooks/twilio` and inbound URL is the same.
   b. M8: Resend Dashboard → Webhooks → confirm webhook URL is `https://app.clarityos.app/api/webhooks/resend` with at least 4 events checked (sent, delivered, opened, bounced).
   c. M9: Twilio Console → Settings → confirm BAA active.
   d. Tick all three.

8. **Final phase gate** — All 20 CRM requirements + 9 manual rows ticked in `12-VERIFICATION.md`. Then update `STATE.md`:
   ```yaml
   stopped_at: "Phase 12 complete"
   completed_phases: 11   # increment from current
   ```
  </how-to-verify>
  <resume-signal>Confirm "phase 12 closed" with a summary of M1-M9 outcomes. If any M-row failed, file a gap closure plan via `/gsd:plan-phase 12 --gaps` referencing 12-VERIFICATION.md.</resume-signal>
  <files>.planning/phases/12-crm-patient-engagement/12-VERIFICATION.md, .planning/STATE.md</files>
  <action>Human-only sign-off — see &lt;how-to-verify&gt; above. Claude waits for OWNER confirmation.</action>
  <verify>
    <automated>grep -c "⬜" .planning/phases/12-crm-patient-engagement/12-VERIFICATION.md | awk '\ == 0'</automated>
  </verify>
  <done>All 20 CRM-* rows + all 9 manual checkpoint M-rows ticked (no ⬜ remaining) in 12-VERIFICATION.md; STATE.md reflects phase completion.</done>
</task>

</tasks>

<verification>
1. `cd backend && pytest tests/messaging -x -q` → exits 0
2. `npx vitest run lib/messaging` → exits 0
3. `bash scripts/dev.sh pre-test && npx playwright test --grep @messaging` → exits 0 (4 specs)
4. `npx tsc --noEmit` → exits 0
5. All 9 manual checkpoint M-rows ticked in 12-VERIFICATION.md
</verification>

<success_criteria>
- 7-step wizard with persistent state + 4 onboarding endpoints + seeds
- Compliance Report PDF generated server-side via reportlab
- 4 Playwright @messaging specs cover wizard + recall + patient tab + analytics
- Real Playwright fixtures (no stubs)
- 12-VERIFICATION.md fully populated
- Human sign-off on all 9 manual checkpoints
</success_criteria>

<output>
After completion, create `.planning/phases/12-crm-patient-engagement/12-10-SUMMARY.md` documenting:
- Wizard step components final list
- Compliance PDF library used (reportlab confirmed)
- E2E spec count + total assertions
- Each manual checkpoint outcome (Pass/Fail/Skipped with reason)
- ROADMAP and STATE updates
</output>
