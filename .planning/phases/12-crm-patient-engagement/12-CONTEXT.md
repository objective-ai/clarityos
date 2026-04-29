# Phase 12: CRM & Patient Engagement - Context

**Gathered:** 2026-04-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Outbound patient communications: automated **appointment reminders** (event-triggered), **recall campaigns** (scheduled), and **manual messaging** (staff-initiated) over SMS + email. Includes inbound-reply handling (staff inbox triage only — not real-time chat), opt-out/consent management, and per-patient communication preferences.

Two-way real-time chat, broadcast marketing campaigns, patient self-service portal with login, and ML-based no-show prediction are explicitly OUT OF SCOPE — see deferred ideas.

</domain>

<decisions>
## Implementation Decisions

### Provider Stack

- **SMS:** Twilio (BAA-signed, webhook delivery status, Advanced Opt-Out enabled)
- **Email:** Resend (React Email templates, BAA path, Next.js-friendly)
- **Account model:** Hybrid — ClarityOS-managed for pilot. BYO clinic credentials deferred to a later phase.
- **Test mode:** Allowlist by phone/email in dev/staging — non-allowlisted recipients are logged-only. Allowlist in env config.
- **Cost guardrails:** Daily per-clinic spend cap (default $25/day). 80% threshold logs warning + emails OWNER; 100% hard-stops with admin override. Tracked in `clinic_settings.daily_sms_cap_cents`.
- **Retry policy:** Exponential backoff, max 3 retries (e.g. 30s → 2m → 10m). After exhaustion, mark `status=failed` and surface in admin error log.
- **Webhooks:** Signed webhooks at `/api/webhooks/twilio` and `/api/webhooks/resend`. Verify provider signature, update `message_log` row by `provider_message_id`.
- **Scheduler:** Background worker (cron every 5–15 min) scans `appointments` for `reminder_due_at <= now AND not yet sent`. No external job queue. Use existing FastAPI scheduling pattern.

### Reminder Cadence & Content

- **3-touch cadence:** 7 days, 72 hours, and 24 hours before appointment. (Stricter than success criteria minimum — chosen for higher no-show reduction.)
- **Templates:** ClarityOS-authored defaults; clinics edit body text in settings. Tokens are predefined: `{{patient_first_name}}`, `{{appt_time}}`, `{{appt_date}}`, `{{provider_name}}`, `{{clinic_name}}`, `{{reschedule_link}}`, `{{confirm_link}}`. No free-form template authoring in v1.
- **PHI rules (HIPAA hot zone):** Minimum-necessary defaults — clinic name, patient first name only, date+time, generic "eye exam" label, reschedule/confirm link. Email may include provider name. **Never** includes diagnosis, Rx, condition codes, or specific reason-for-visit. Clinic CANNOT override these defaults.
- **Action prompts:** Reminders include both confirm (SMS: "Reply YES to confirm, NO to reschedule." / Email: confirm button) AND reschedule link (public page, signed token URL). Confirmation status persists on `appointments.patient_confirmed_at`.
- **Quiet hours:** 9pm–8am patient-local time, enforced by scheduler. Messages that would land in quiet hours are deferred to next allowed window. Manual sends warn but allow override.
- **Languages:** English + Spanish in v1. Patient `preferred_language` field (default `en`). Templates have `en` and `es` variants. Language extensible via template table without code changes.

### Recall Trigger & Approval

- **Candidate rule:** Patients whose **last finalized encounter** is more than 12 months ago AND who have no future appointment scheduled. Excludes no-shows/cancellations from "last appointment" definition.
- **Approval model:** Staff-approved queue. New `/messaging/recall-queue` page lists candidates daily. Staff reviews, edits message, removes patients, then clicks "Send All" or per-patient. No fully-automatic recall sends in v1.
- **Cadence:** 2 touches max — first at month 12, second softer reminder at month 14. After that, mark patient `recall_exhausted=true` until next finalized encounter resets the clock.
- **Auto-exclusions (always applied):**
  - Deceased / inactive patient
  - Marketing opt-out (recall is marketing under TCPA)
  - Missing valid phone AND email
  - Already on a future appointment

### Opt-out, Consent & Inbound Replies

- **STOP handling:** Twilio Advanced Opt-Out (carrier-level, legally required) + DB sync. Webhook updates `patients.sms_opted_out_at`. Belt-and-suspenders.
- **Opt-out scope:** Per-channel + per-purpose. Four flags per patient: `consent_sms_marketing`, `consent_sms_operational`, `consent_email_marketing`, `consent_email_operational`. First STOP opts out of marketing; second STOP opts out of operational too.
- **Consent capture:** Patient intake form + booking confirmation. Explicit opt-in checkboxes for SMS reminders and SMS recall (separate boxes). Stored as timestamps: `consent_sms_marketing_at`, `consent_sms_operational_at`, etc. Builds defensible TCPA audit trail.
- **Inbound replies (non-STOP):** Land in a global Messages **inbox** view with unread badge in TopNav. Per-patient threaded view via patient detail Messages tab. Not real-time chat — one-way send-and-log model with manual reply workflow.

### Manual Messaging UX

- **Entry points:** All four:
  1. Patient detail header "Message" button
  2. Schedule view per-appointment row kebab → "Message Patient"
  3. Inbox reply (from inbound message)
  4. Bulk select on schedule (with safeguards — flagged for planner)
- **Composer:** Template picker + free-form override. Composer opens with: channel selector, template dropdown (5–7 industry presets), tokens auto-fill, editable body before send.
- **Preview before send:** Live preview with tokens replaced + opt-out warning (block send if patient has opted out of that channel/purpose) + SMS character/segment count (cost preview). Single "Send" confirms.
- **PHI in manual sends:** Email = full PHI freedom. SMS = composer scans for risky keywords (Rx values, diagnosis terms, ICD codes) and shows soft "Are you sure? SMS is less secure" confirm. Doesn't block; warns.

### Message History Surface

- **Surface:** Per-patient "Messages" tab on patient detail (chronological, all channels) + global Messages inbox for inbound triage.
- **Lifecycle states:** Queued → Sent → Delivered → Read (email opens only) / Failed. Tooltip-style icons: clock (queued), single check (sent), double check (delivered), eye (read), red X (failed with reason).
- **Failed message handling:** Inline reason ("Invalid number", "Carrier blocked", etc.) with manual "Resend" button. Auto-retry policy from Provider stack handles transient failures; manual resend is for permanent fixes (e.g. updated phone number).
- **Retention:** Indefinite in primary DB for 2 years (fast queries), then archive to compressed cold-storage table. Never auto-delete — supports HIPAA 6-year minimum + state-specific retention rules.

### Patient Channel Preference

- **Capture surfaces:** Intake form, patient detail (staff-editable), and booking confirmation self-service link (signed token URL, no login).
- **Default for new patients:** Both SMS + email opted-in for **operational reminders**. Marketing/recall stays opt-in (must be explicitly checked). Conservative on marketing, fast operational onboarding.
- **Bounce fallback:** If preferred channel fails 3+ times, auto-flip to alternate channel and surface "Phone needs update" / "Email needs update" badge on patient header.
- **Visibility:** Small chip on patient detail header showing current preference state ("SMS+Email ✓" or "No SMS (opted out)"). Manual composer greys-out unavailable channels.
- **Pause:** "Pause communications until [date]" toggle on patient detail and self-service link. Auto-resumes after date.
- **Minors:** Patients with age < 18 route messages to designated `Guardian` (name + phone + email + relationship). UI shows "Sending to: [Guardian Name] ([relationship])" badge. On 18th birthday, surface "Switch to patient" confirmation.
- **Household bundling:** When multiple appointments on same day share a contact phone/email, scheduler bundles into one message: "Reminder: 3 family appointments at [Clinic] tomorrow. View all: [link]." One SMS, one charge.
- **Emergency contact:** Available for manual messaging only (e.g. "patient missed appointment, please check on"). Never auto-messaged for reminders/recall.

### AI Augmentation (v1 scope)

- **AI inbound classifier:** When inbound SMS arrives, Claude tags it with one of: `reschedule_request`, `cancellation`, `question_clinical`, `question_billing`, `thank_you`, `spam`. Tag surfaces in inbox; reschedule/cancellation tagged messages bubble to top.
- **AI message draft assist:** Manual composer "Draft with AI" button. Staff types intent in plain English (e.g. "tell patient lab results came back normal, ask if they have questions"); Claude drafts a HIPAA-safe message respecting current channel rules + opt-out + minors-routing. Staff edits + sends. Reuses existing `backend/services/ai_scribe.py` + Claude Haiku model.

### Seamlessness (v1 scope)

- **Click-to-call + click-to-message:** Patient header phone number is tappable on mobile (`tel:`); message icon opens composer prefilled.
- **Per-patient communication timeline:** Patient detail Messages tab shows visual timeline: reminder sent (✓), reminder delivered (✓✓), confirmed (Y), appointment kept/no-show outcome. Visual proof of reminder effectiveness.

### Compliance & Audit

- **Audit log:** Every message, opt-in/out, consent change, channel preference edit, and template edit is logged with actor + timestamp + reason. Stored in dedicated `messaging_audit_log` table.
- **Monthly compliance export:** OWNER role can export "Communications Compliance Report" PDF (volume, opt-outs, consent changes, audit summary) for compliance binders. Pairs with reporting export (below).

### Clinic Onboarding

- **Activation:** Settings → Messaging onboarding **wizard** (multi-step, persistent progress):
  1. Acknowledge BAA + TCPA terms
  2. Confirm clinic name + timezone
  3. Choose number model (managed = default; BYO disabled in v1)
  4. Pick reminder cadence preset (default: 3-touch)
  5. Pick recall preset (default: staff-approved queue)
  6. Send test message to OWNER's phone + email
  7. OWNER clicks "I received them" to flip `clinic_messaging_enabled=true`
- **Number provisioning:** Dedicated **local Twilio number per clinic** matching clinic area code. Auto-provisioned during wizard step 3. Cost (~$1–2/mo) absorbed by ClarityOS for pilot.
- **Template seeding:** Industry-pack picker — wizard asks practice type (optometry / ophthalmology / general) and seeds practice-specific templates ("Time for your annual eye exam," "Contact lens follow-up," etc.) plus 5–7 common manual templates.

### Reporting & Analytics

- **Surface:** Dedicated `/messaging/analytics` page + 1–2 hero cards on existing main dashboard (today's no-show rate, recall conversions this month). Reuses Phase 8 Recharts patterns and `analytics/page.tsx` inline-chart approach.
- **v1 metrics:**
  1. **Reminder funnel:** sent → delivered → confirmed → kept (stacked funnel)
  2. **Recall conversion:** sent → booked within 14/30/90 days
  3. **Opt-out rate trend:** weekly opt-out count (early-warning signal for template fatigue)
  4. **Cost & volume:** SMS+email count this month, $ spent vs cap, top failure reasons
- **Filtering:** Last 7d / 30d / 90d / YTD / custom range (matches Phase 8 patterns).
- **Export:** CSV per chart + monthly "Communications Compliance Report" PDF (pairs with audit log export).

### Claude's Discretion

- Exact UI styling of the wizard steps, inbox layout, recall-queue table density (use glassmorphism tokens + existing Card components).
- Database schema details — column types, index strategy, FK constraints (subject to clinical-safety review).
- Internal worker implementation details (FastAPI cron mechanism vs APScheduler vs alternative).
- Webhook endpoint code structure and signature verification implementation.
- Error message copy and toast styling.
- Whether to extract a shared `useChannelPreference()` hook vs inline (Claude evaluates after writing code).
- Exact Twilio + Resend SDK version pinning.
- Internal naming for tables/columns/enums (subject to project conventions).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### ROADMAP
- `.planning/ROADMAP.md` lines 120–128 — Phase 12 goal, dependencies (Phase 3 appointment data, Phase 2 patient contact info), and 5 success criteria

### Project context
- `.planning/PROJECT.md` — Vision, principles, design system (glassmorphism, accent #2DD4BF)
- `.planning/REQUIREMENTS.md` — Acceptance criteria patterns and constraints

### Project memory (background, not specs)
- Project memory: `gap_analysis_eyecloudpro` — competitive context for engagement features
- Project memory: `project_pilot_launch` — was the source of the "Phase 12 deferred" memo. Memory has been superseded; pilot launch milestone has progressed and Phase 12 is now in active discussion.

### Reusable code references
- `app/(tenant)/[tenant]/analytics/page.tsx` — Phase 8 Recharts patterns to mirror for Messaging Analytics
- `lib/bff.ts` `proxyToFastAPI()` — required for all `/api` BFF routes (project rule)
- `backend/services/ai_scribe.py` — existing Claude infra to reuse for AI draft assist + inbound classifier

### External standards (no project-internal spec exists yet)
- TCPA written-consent requirements for SMS marketing (recall flow)
- HIPAA Minimum Necessary Standard (reminder content rules)
- HIPAA 6-year retention minimum for patient communications
- Twilio Advanced Opt-Out documentation (https://www.twilio.com/docs/messaging/features/advanced-opt-out)
- Resend BAA / HIPAA documentation (verify during research phase)

**No project-internal ADR or spec exists for messaging/CRM yet.** This CONTEXT.md is the authoritative decision document; researcher should propose creating an ADR-NN-messaging-architecture.md as part of plans.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **Recharts patterns** (`app/(tenant)/[tenant]/analytics/page.tsx`): Inline-defined charts for SSR safety (memory note explicitly says do NOT extract to separate component files). Mirror this for Messaging Analytics.
- **BFF proxy** (`lib/bff.ts` `proxyToFastAPI()`): Mandatory for all new `app/api/` routes proxying to FastAPI. Trailing-slash gotcha on upstream URLs.
- **AI Scribe infrastructure** (`backend/services/ai_scribe.py`): Existing Claude integration — reuse for AI message draft and inbound classifier. Use Haiku for both (low-effort tasks per CLAUDE.md model guidance).
- **Glassmorphism design system** (`globals.css` glass-* classes, accent `#2DD4BF`): Apply across wizard, inbox, recall queue, composer, analytics.
- **Settings page pattern**: Existing `app/(tenant)/[tenant]/settings/` for the messaging onboarding wizard and templates editor.
- **Patient detail layout** (`app/(tenant)/[tenant]/patients/[id]/`): Add Messages tab + header pill + Message button.
- **Schedule view** (`app/(tenant)/[tenant]/schedule/`): Add per-appointment kebab → Message; bulk-select toolbar additions.
- **Audit log infra**: Researcher must verify whether a generic audit-log table exists or needs creation; messaging needs its own table at minimum (`messaging_audit_log`).

### Established Patterns

- **Tenant-scoped routes:** All new pages live under `app/(tenant)/[tenant]/` (slug, NOT UUID).
- **FastAPI route + BFF route pairing** (project rule from `.claude/rules/bff-api.md`): Every new backend endpoint MUST also get a BFF proxy route in `app/api/`.
- **Clinical-data-write rule** (`.claude/rules/clinical-safety.md`): Communications writes (especially audit logs) must be in the primary DB transaction — never fire-and-forget. Memory note `feedback_fire_and_forget.md` is precedent.
- **Zustand store patterns** with devtools + selectors for in-flight state (e.g. composer drafts).
- **Background workers:** Project hasn't yet established a job-queue pattern. Researcher should propose the simplest approach (likely FastAPI APScheduler or cron-style endpoint pinged by Vercel Cron / external scheduler) — see Decisions/Provider Stack/Scheduler.
- **204 No Content for empty payload** pattern (memory note): Use for endpoints like "fetch latest message preferences" before any send history exists.
- **`apiFetch` recursive `camelizeKeys` gotcha** (memory note `feedback_camelizekeys_nested.md`): Snakify on load, draft on save for any JSONB columns (e.g. template token maps).
- **Entitlements**: `useEntitlements().has('messaging')` — researcher must verify whether `messaging` entitlement exists in `PLAN_FEATURES`; likely needs to be added to enable plan-gating later.

### Integration Points

- **Patients table:** New columns (consent flags, opt-out timestamps, language, guardian fields, paused-until). Schema change requires user approval.
- **Appointments table:** New columns (`patient_confirmed_at`, `reminder_status`, `last_reminder_sent_at`).
- **Clinic settings:** New columns (messaging templates per clinic, daily cost cap, quiet hours, messaging_enabled flag).
- **New tables:** `message_log`, `message_templates`, `messaging_audit_log`, `recall_queue_runs` (and possibly `inbound_messages` if separated from message_log).
- **TopNav:** Add unread-inbox badge.
- **Patient detail header:** Channel preference pill + Message button.
- **Schedule view:** Per-row kebab + bulk-select toolbar.
- **Webhook endpoints:** New `/api/webhooks/twilio` and `/api/webhooks/resend` (must be CSRF-exempt, signature-verified).
- **Cron / scheduler:** New entry-point — researcher proposes mechanism.

### Greenfield Risk

No existing CRM/notification/SMS/email scaffolding was found in the scout (`app/`, `backend/api/routes/`). This is a from-scratch phase across the stack: schema migrations, FastAPI routes, BFF routes, scheduler/worker, three new pages (recall queue, inbox, analytics), patient/schedule/settings UI extensions, two webhook endpoints, two new third-party integrations, audit infrastructure, and AI draft features. Plan accordingly — likely 6–10 plans across DB, backend, frontend, and infra.

</code_context>

<specifics>
## Specific Ideas

- The reminder confirm flow ("Reply YES to confirm, NO to reschedule") is borrowed directly from established practice management software conventions. Patients understand it without explanation.
- Messages tab visual timeline (reminder sent → delivered → confirmed → kept) is borrowed from Linear's issue activity feed mental model — clean, chronological, action-oriented.
- The wizard last-step "send a test message to your phone — confirm receipt before going live" pattern is borrowed from Stripe's webhook setup and Twilio's own onboarding. Won't ship without verification.
- AI message draft assist: Staff types **intent** in plain English; Claude drafts. Reuses Haiku-based AI Scribe pattern, but for outbound communications instead of clinical notes.
- Industry-pack template seeding for optometry: "Time for your annual eye exam," "Your contact lens trial is ending — schedule a follow-up," "Your glasses are ready for pickup," "Your test results are in — please call to discuss."
- Bulk select on schedule was selected by user, but the planner should design strict safeguards: max 50 recipients per send, throttle at 1 msg/sec, mandatory preview-and-confirm step, and audit-log every bulk send as a single batch_id.

</specifics>

<deferred>
## Deferred Ideas

These came up during discussion and are valuable, but explicitly OUT OF SCOPE for Phase 12. Capture for future roadmap consideration:

### AI / ML deferred
- **Smart send-time learning per patient** — needs 6–12 months of message-response data we won't have at pilot launch. Revisit after data accumulates.
- **AI auto-reply for FAQ-class inbound** ("what are your hours", "do you take VSP") — auto-reply in healthcare context is risky; needs careful UX + legal review. Future phase.
- **No-show prediction model** — needs training data + ML infrastructure not currently in stack. Future phase.

### UX / capability deferred
- **Two-way real-time chat** with typing indicators, threaded conversation, push notifications — belongs in a dedicated Patient Portal phase.
- **Patient self-service portal with login** — current self-service flows use signed token URLs (no login). Full portal is its own phase.
- **Voice-call fallback** for visually-impaired patients (Twilio TTS) — significant scope; future accessibility phase.
- **BYO clinic Twilio/Resend credentials** — pilot uses ClarityOS-managed; BYO lands when clinics request it.

### Reporting / analytics deferred
- **Per-staff messaging activity dashboard** — useful for multi-staff clinics; pilot is solo OD.
- **Configurable quiet hours per clinic** — v1 uses fixed 9pm–8am patient-local; per-clinic overrides come later.

### Configurability deferred
- **Configurable recall window per patient** (e.g. diabetic = 6mo) — v1 uses single 12mo rule; per-patient overrides are a later complexity.
- **Full template editor with rich text and custom token authoring** — v1 has body-text editing only; full WYSIWYG editor is a later phase.
- **Bulk marketing campaigns / segments** (broadcast to "all patients with last visit 18+ months ago") — recall is the operational form; broader marketing is a separate phase.

</deferred>

---

*Phase: 12-crm-patient-engagement*
*Context gathered: 2026-04-29*
