---
phase: 12
plan: 00
slug: wave0-foundation
type: execute
wave: 1
depends_on: []
files_modified:
  - backend/requirements.txt
  - package.json
  - backend/tests/messaging/__init__.py
  - backend/tests/messaging/conftest.py
  - backend/tests/messaging/factories.py
  - backend/tests/messaging/fixtures/twilio_signatures.py
  - backend/tests/messaging/fixtures/svix_signatures.py
  - backend/tests/messaging/fixtures/phi_scrub_corpus.py
  - tests/e2e/fixtures/messaging.ts
  - .planning/compliance/RESEND-BAA-CHECKPOINT.md
autonomous: false
gap_closure: false
requirements: [CRM-WAVE0]
user_setup:
  - service: resend
    why: "Resend BAA sign-off — required before any production email send to ePHI"
    env_vars:
      - name: RESEND_API_KEY
        source: "Resend Dashboard -> API Keys"
      - name: RESEND_WEBHOOK_SECRET
        source: "Resend Dashboard -> Webhooks (Svix signing secret)"
    dashboard_config:
      - task: "Confirm BAA in writing — escalate to Resend sales (security@resend.com); save signed PDF to .planning/compliance/resend-baa-2026.pdf. If denied within 7 days: STOP and notify planner — fallback to Postmark."
        location: "Resend support / sales contact"
  - service: twilio
    why: "Twilio Programmable Messaging with BAA — SMS provider"
    env_vars:
      - name: TWILIO_ACCOUNT_SID
        source: "Twilio Console -> Account Info"
      - name: TWILIO_AUTH_TOKEN
        source: "Twilio Console -> Account Info"
      - name: TWILIO_MESSAGING_SERVICE_SID
        source: "Twilio Console -> Messaging -> Services (create one with Advanced Opt-Out enabled)"
      - name: WEBHOOK_INTERNAL_SECRET
        source: "Generate via `openssl rand -hex 32` — shared between BFF and FastAPI"
      - name: MESSAGING_TEST_ALLOWLIST
        source: "Comma-separated phone+email allowlist for dev/staging — non-allowlisted recipients are logged-only"
    dashboard_config:
      - task: "Sign Twilio BAA via Twilio Console -> HIPAA tab; enable Advanced Opt-Out on Messaging Service; configure status callback URL placeholder for Wave 2"
        location: "Twilio Console -> Messaging Services"

must_haves:
  truths:
    - "Backend test suite can import twilio, resend, svix, phonenumbers, freezegun without ImportError"
    - "pytest discovers backend/tests/messaging/ and conftest.py fixtures resolve"
    - "Playwright fixtures helpers seedClinicWithMessaging / seedPatientWithConsent / seedAppointment exist and import cleanly"
    - "Resend BAA decision recorded (signed OR Postmark fallback path documented) before any production send"
  artifacts:
    - path: "backend/requirements.txt"
      contains: "twilio>=9.10.5"
    - path: "backend/requirements.txt"
      contains: "resend>=2.29.0"
    - path: "backend/requirements.txt"
      contains: "svix>=1.40.0"
    - path: "backend/requirements.txt"
      contains: "phonenumbers>=8.13.50"
    - path: "backend/requirements.txt"
      contains: "freezegun>=1.5.0"
    - path: "package.json"
      contains: "@react-email/render"
    - path: "package.json"
      contains: "@react-email/components"
    - path: "backend/tests/messaging/conftest.py"
      provides: "mock_twilio_client, mock_resend_client, frozen_clock, signed_twilio_webhook_factory, signed_resend_webhook_factory, mock_anthropic_classifier"
    - path: "tests/e2e/fixtures/messaging.ts"
      exports: ["seedClinicWithMessaging", "seedPatientWithConsent", "seedAppointment", "seedFinalizedEncounter"]
    - path: ".planning/compliance/RESEND-BAA-CHECKPOINT.md"
      provides: "BAA status (signed | pending | denied -> Postmark fallback)"
  key_links:
    - from: "backend/tests/messaging/conftest.py"
      to: "freezegun"
      via: "@pytest.fixture frozen_clock using freezegun.freeze_time"
      pattern: "freeze_time"
    - from: "tests/e2e/fixtures/messaging.ts"
      to: "@playwright/test"
      via: "test.extend fixture"
      pattern: "test.extend"
---

<objective>
Establish Wave 0 foundation: install backend + frontend dependencies (Twilio, Resend, Svix, phonenumbers, freezegun, react-email), create the messaging test scaffolding (conftest, factories, signature fixtures), seed Playwright E2E messaging fixtures, and resolve the Resend BAA blocker via human checkpoint.

Purpose: Per VALIDATION.md, every messaging implementation task has a Wave 0 fixture dependency. Skipping Wave 0 means later tasks have to invent fixtures inline — corrupts the deterministic-test guarantee. The Resend BAA is also a HIPAA blocker — we must NOT send a single production email until BAA is signed (or fallback to Postmark).

Output:
- backend/requirements.txt + package.json updated with locked SDK versions
- backend/tests/messaging/ scaffold with conftest + 6 mock fixtures
- backend/tests/messaging/fixtures/ with deterministic Twilio + Svix signature payloads + PHI corpus
- tests/e2e/fixtures/messaging.ts with 4 E2E seed helpers
- .planning/compliance/RESEND-BAA-CHECKPOINT.md recording decision
</objective>

<execution_context>
@C:/Users/duytr/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/duytr/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/12-crm-patient-engagement/12-CONTEXT.md
@.planning/phases/12-crm-patient-engagement/12-RESEARCH.md
@.planning/phases/12-crm-patient-engagement/12-VALIDATION.md
@./CLAUDE.md
@.claude/rules/testing.md

<interfaces>
<!-- Existing testing patterns -->
From backend/tests/test_self_pinger.py (precedent for backend pytest pattern):
```python
import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, MagicMock
```

From tests/e2e/fixtures.ts (existing Playwright fixture pattern):
```typescript
import { test as base, expect } from "@playwright/test";
export const test = base.extend<{ consoleErrors: string[]; apiCalls: ApiCall[] }>({...});
```

From backend/services/ai_scribe.py (reuse target):
```python
import anthropic
_anthropic_client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Install backend + frontend dependencies and lock versions</name>
  <files>backend/requirements.txt, package.json</files>
  <read_first>
    - backend/requirements.txt (current pinned versions)
    - package.json (current dependencies)
    - .planning/phases/12-crm-patient-engagement/12-RESEARCH.md (lines 152-195 — Standard Stack table with locked versions)
    - CLAUDE.md ("Don't add new npm/pip packages without asking first." — these are pre-approved in 12-CONTEXT.md and UI-SPEC Registry Safety section)
  </read_first>
  <action>
Add these EXACT pins to `backend/requirements.txt` (append, do not reorder existing lines):

```
twilio>=9.10.5,<10
resend>=2.29.0,<3
svix>=1.40.0,<2
phonenumbers>=8.13.50
freezegun>=1.5.0
```

Run `pip install -r backend/requirements.txt` and verify each imports cleanly:
`cd backend && python -c "import twilio, resend, svix, phonenumbers, freezegun; print('OK')"`.

For frontend, install React Email packages and add to `dependencies` (not devDependencies):
```bash
npm install @react-email/components@^0.6.0 @react-email/render@^4.0.0
```

Verify install: `node -e "require('@react-email/render'); require('@react-email/components'); console.log('OK')"`.

Do NOT install `tenacity` (RESEARCH.md § Don't Hand-Roll: 3 fixed retries do not justify a dep — hand-roll in 12-03).

Do NOT install Anthropic — already in project (reuse from `backend/services/ai_scribe.py`).
  </action>
  <verify>
    <automated>cd backend && python -c "import twilio, resend, svix, phonenumbers, freezegun; print('backend OK')" && cd .. && node -e "require('@react-email/render'); require('@react-email/components'); console.log('frontend OK')"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -E "^twilio>=9\.10\.5" backend/requirements.txt` returns a match
    - `grep -E "^resend>=2\.29\.0" backend/requirements.txt` returns a match
    - `grep -E "^svix>=1\.40\.0" backend/requirements.txt` returns a match
    - `grep -E "^phonenumbers>=8\.13\.50" backend/requirements.txt` returns a match
    - `grep -E "^freezegun>=1\.5\.0" backend/requirements.txt` returns a match
    - `grep "@react-email/render" package.json` returns a match
    - `grep "@react-email/components" package.json` returns a match
    - `python -c "import twilio, resend, svix, phonenumbers, freezegun"` exits 0
    - `node -e "require('@react-email/render')"` exits 0
  </acceptance_criteria>
  <done>All five Python deps + two React Email Node deps installed and importable. requirements.txt lock pins committed.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Create messaging test scaffold (conftest + factories + signature fixtures)</name>
  <files>
    backend/tests/messaging/__init__.py,
    backend/tests/messaging/conftest.py,
    backend/tests/messaging/factories.py,
    backend/tests/messaging/fixtures/__init__.py,
    backend/tests/messaging/fixtures/twilio_signatures.py,
    backend/tests/messaging/fixtures/svix_signatures.py,
    backend/tests/messaging/fixtures/phi_scrub_corpus.py,
    tests/e2e/fixtures/messaging.ts
  </files>
  <read_first>
    - backend/tests/test_self_pinger.py (existing pytest pattern reference)
    - tests/e2e/fixtures.ts (existing Playwright fixture pattern reference)
    - .planning/phases/12-crm-patient-engagement/12-VALIDATION.md (lines 30-34 — Wave 0 fixtures requirements)
    - .planning/phases/12-crm-patient-engagement/12-RESEARCH.md (lines 920-985 — fixture exact list)
  </read_first>
  <action>
Create `backend/tests/messaging/__init__.py` (empty file).

Create `backend/tests/messaging/conftest.py` with these fixtures (no production code yet — pure scaffold):

```python
"""Phase 12 messaging test fixtures.

Source-of-truth for: mock Twilio/Resend SDKs, frozen clock, signed webhook payloads,
mock Anthropic classifier. Imported by every test file in backend/tests/messaging/.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any, Callable
from unittest.mock import AsyncMock, MagicMock

import pytest
from freezegun import freeze_time


@pytest.fixture(autouse=True)
def disable_messaging_scheduler(monkeypatch: pytest.MonkeyPatch) -> None:
    """Prevent the asyncio scheduler from starting in tests (mirrors Phase 10.3 self-pinger)."""
    monkeypatch.setenv("MESSAGING_SCHEDULER_ENABLED", "false")


@pytest.fixture
def frozen_clock():
    """Fix wall-clock to 2026-05-01T15:00:00Z (a Friday, mid-afternoon clinic-local PT)."""
    with freeze_time("2026-05-01T15:00:00+00:00") as frozen:
        yield frozen


@pytest.fixture
def mock_twilio_client() -> MagicMock:
    """Mock twilio.rest.Client with messages.create returning a MessageSid."""
    client = MagicMock()
    client.messages.create = MagicMock(return_value=MagicMock(sid="SM_test_message_sid_001"))
    client.available_phone_numbers.return_value.local.list = MagicMock(
        return_value=[MagicMock(phone_number="+15555550100")]
    )
    client.incoming_phone_numbers.create = MagicMock(
        return_value=MagicMock(sid="PN_test_number_sid_001", phone_number="+15555550100")
    )
    return client


@pytest.fixture
def mock_resend_client(monkeypatch: pytest.MonkeyPatch) -> MagicMock:
    """Mock resend.Emails.send returning {'id': 'em_test_id_001'}."""
    mock_send = MagicMock(return_value={"id": "em_test_id_001"})
    import resend  # noqa: F401 — installed in Task 1
    monkeypatch.setattr("resend.Emails.send", mock_send)
    return mock_send


@pytest.fixture
def mock_anthropic_classifier(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    """Mock the Anthropic classifier to return 'reschedule_request' by default."""
    response = MagicMock()
    response.content = [MagicMock(text="reschedule_request")]
    mock = AsyncMock(return_value=response)
    return mock


@pytest.fixture
def signed_twilio_webhook_factory(monkeypatch: pytest.MonkeyPatch) -> Callable[..., dict[str, Any]]:
    """Build a (form_dict, headers) tuple with a valid X-Twilio-Signature against a known auth_token.

    Uses real twilio.request_validator.RequestValidator so signature is byte-correct.
    """
    from twilio.request_validator import RequestValidator
    auth_token = "test_auth_token_phase_12"
    monkeypatch.setenv("TWILIO_AUTH_TOKEN", auth_token)
    validator = RequestValidator(auth_token)

    def _factory(
        url: str = "https://test.clarityos.app/api/webhooks/twilio",
        params: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        params = params or {
            "MessageSid": "SM_test_message_sid_001",
            "MessageStatus": "delivered",
            "From": "+15555550100",
            "To": "+14155551234",
            "Body": "",
        }
        signature = validator.compute_signature(url, params)
        return {
            "url": url,
            "form": params,
            "headers": {"X-Twilio-Signature": signature, "X-Forwarded-Host": "test.clarityos.app"},
        }

    return _factory


@pytest.fixture
def signed_resend_webhook_factory(monkeypatch: pytest.MonkeyPatch) -> Callable[..., dict[str, Any]]:
    """Build a (raw_body, svix_headers) tuple with a valid Svix signature."""
    import json
    from svix.webhooks import Webhook as SvixWebhook
    secret = "whsec_test_phase_12_svix_secret_base64=="
    monkeypatch.setenv("RESEND_WEBHOOK_SECRET", secret)
    wh = SvixWebhook(secret)

    def _factory(payload: dict[str, Any] | None = None) -> dict[str, Any]:
        payload = payload or {
            "type": "email.delivered",
            "data": {"email_id": "em_test_id_001", "to": ["patient@example.com"]},
        }
        body = json.dumps(payload).encode()
        msg_id = "msg_test_001"
        timestamp = "1714579200"  # fixed for determinism
        sig = wh.sign(msg_id, int(timestamp), body)
        return {
            "raw_body": body,
            "headers": {
                "svix-id": msg_id,
                "svix-timestamp": timestamp,
                "svix-signature": sig,
            },
        }

    return _factory
```

Create `backend/tests/messaging/factories.py` (model-builder helpers — keep stubs, real impl after 12-01 lands):

```python
"""Factory helpers for messaging models. Filled in after Plan 12-01 lands the ORM."""
from __future__ import annotations
import uuid
from datetime import datetime, timezone


def make_message_log_kwargs(**overrides) -> dict:
    """Stub — returns a kwargs dict matching MessageLog signature added in Plan 12-01."""
    base = {
        "id": uuid.uuid4(),
        "tenant_id": uuid.uuid4(),
        "patient_id": uuid.uuid4(),
        "channel": "sms",
        "purpose": "operational",
        "status": "queued",
        "body": "Test message body",
        "provider_message_id": None,
        "created_at": datetime.now(timezone.utc),
    }
    base.update(overrides)
    return base
```

Create `backend/tests/messaging/fixtures/__init__.py` (empty).

Create `backend/tests/messaging/fixtures/twilio_signatures.py` with 3 captured payload examples (status callback, inbound SMS, opt-out STOP) plus one corrupted variant per requirement.

Create `backend/tests/messaging/fixtures/svix_signatures.py` with 4 Resend event types: `email.sent`, `email.delivered`, `email.opened`, `email.bounced`.

Create `backend/tests/messaging/fixtures/phi_scrub_corpus.py` with the deny-list corpus:
```python
"""PHI scrub denylist corpus for operational SMS templates.

Each entry MUST trigger a block in `scrub_phi_for_operational_sms()` (Plan 12-03).
"""
DIAGNOSIS_TERMS = [
    "glaucoma", "diabetic retinopathy", "macular degeneration", "cataract",
    "amblyopia", "strabismus", "keratoconus", "retinal detachment",
    "uveitis", "conjunctivitis", "iritis", "papilledema",
]

ICD10_PATTERNS = [
    "H40.10", "E11.319", "H35.31", "H25.9", "H53.0",
]

RX_TERMS = [
    "latanoprost", "timolol", "brimonidine", "dorzolamide",
    "OD -2.50 -1.00 x 180", "+2.00 add", "20/40 OS",
]

# Each tuple: (string, expected_match_token)
TEST_CORPUS = (
    [(t, t) for t in DIAGNOSIS_TERMS]
    + [(c, c) for c in ICD10_PATTERNS]
    + [(r, r) for r in RX_TERMS]
)
```

Create `tests/e2e/fixtures/messaging.ts` (Playwright seed helpers — stubs that throw `Error("not implemented — see Plan 12-08")` for now, BUT export the typed signatures so test files can import them today):

```typescript
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
  startTime: string; // ISO
  patientId: string;
}

export async function seedClinicWithMessaging(
  page: Page,
  opts?: { messagingEnabled?: boolean; dailyCapCents?: number }
): Promise<SeedClinicResult> {
  throw new Error("seedClinicWithMessaging not implemented — Plan 12-10 will land the real impl");
}

export async function seedPatientWithConsent(
  page: Page,
  opts: { tenantId: string; consents: { sms_operational?: boolean; sms_marketing?: boolean; email_operational?: boolean; email_marketing?: boolean } }
): Promise<SeedPatientResult> {
  throw new Error("seedPatientWithConsent not implemented — Plan 12-08 will land the real impl");
}

export async function seedAppointment(
  page: Page,
  opts: { patientId: string; tenantId: string; startTime: string }
): Promise<SeedAppointmentResult> {
  throw new Error("seedAppointment not implemented — Plan 12-06 will land the real impl");
}

export async function seedFinalizedEncounter(
  page: Page,
  opts: { patientId: string; tenantId: string; finalizedAt: string }
): Promise<{ encounterId: string }> {
  throw new Error("seedFinalizedEncounter not implemented — Plan 12-06 will land the real impl");
}
```

Each helper carries a `// TODO(plan-NN)` comment naming the plan that fills in the body.
  </action>
  <verify>
    <automated>cd backend && python -m pytest tests/messaging/conftest.py --collect-only -q 2>&1 | grep -E "(error|ERROR)" | head -5; cd backend && python -c "from tests.messaging.fixtures.phi_scrub_corpus import TEST_CORPUS; assert len(TEST_CORPUS) >= 24, f'expected >=24 corpus entries, got {len(TEST_CORPUS)}'"</automated>
  </verify>
  <acceptance_criteria>
    - `python -c "from backend.tests.messaging.fixtures.phi_scrub_corpus import TEST_CORPUS, DIAGNOSIS_TERMS, ICD10_PATTERNS, RX_TERMS; print(len(TEST_CORPUS))"` prints a number `>= 24`
    - `grep -c "def signed_twilio_webhook_factory" backend/tests/messaging/conftest.py` returns 1
    - `grep -c "def signed_resend_webhook_factory" backend/tests/messaging/conftest.py` returns 1
    - `grep -c "def mock_twilio_client" backend/tests/messaging/conftest.py` returns 1
    - `grep -c "def mock_resend_client" backend/tests/messaging/conftest.py` returns 1
    - `grep -c "def frozen_clock" backend/tests/messaging/conftest.py` returns 1
    - `grep -c "def mock_anthropic_classifier" backend/tests/messaging/conftest.py` returns 1
    - `grep -c "MESSAGING_SCHEDULER_ENABLED" backend/tests/messaging/conftest.py` returns at least 1 (autouse fixture sets `false`)
    - `grep -c "export async function seedClinicWithMessaging" tests/e2e/fixtures/messaging.ts` returns 1
    - `grep -c "export async function seedPatientWithConsent" tests/e2e/fixtures/messaging.ts` returns 1
    - `grep -c "export async function seedAppointment" tests/e2e/fixtures/messaging.ts` returns 1
    - `cd backend && python -m pytest tests/messaging --collect-only -q` exits 0 (collection only — no test files exist yet, but conftest must be importable)
    - `npx tsc --noEmit tests/e2e/fixtures/messaging.ts` exits 0
  </acceptance_criteria>
  <done>conftest.py imports cleanly with all 6 named fixtures; PHI corpus has >=24 entries spanning diagnosis/ICD/Rx; Playwright fixture file exports 4 typed seed helpers (stubs allowed, but signatures locked).</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 3: Resend BAA confirmation checkpoint (HIPAA blocker)</name>
  <files>.planning/compliance/RESEND-BAA-CHECKPOINT.md</files>
  <read_first>
    - .planning/phases/12-crm-patient-engagement/12-RESEARCH.md (lines 605-610 — Pitfall 6: Resend BAA blocker)
    - .planning/phases/12-crm-patient-engagement/12-CONTEXT.md (lines 17-19, 27 — Resend lock-in + Email rules)
  </read_first>
  <what-built>
    All Wave 0 code scaffolding (deps + test fixtures) complete. The remaining gate is a HIPAA compliance attestation: Resend's public docs do NOT advertise a BAA path (verified during research 2026-04-29). Without a signed BAA, sending any patient first name + appointment time via Resend = HIPAA breach.
  </what-built>
  <how-to-verify>
1. **OWNER (duytran@yahoo.com) emails Resend support/sales:**
   - To: `support@resend.com` AND `sales@resend.com`
   - Subject: "BAA request — HIPAA-eligible product use (ClarityOS EHR)"
   - Body: Request signed Business Associate Agreement under HIPAA 45 CFR §164.504(e). Mention: monthly volume ~5–50k transactional emails, healthcare provider, contains patient PHI (first name + appointment metadata).

2. **Wait up to 7 calendar days for response.**

3. **Three possible outcomes — record one in `.planning/compliance/RESEND-BAA-CHECKPOINT.md`:**

   **A) BAA SIGNED** — save signed PDF to `.planning/compliance/resend-baa-2026.pdf`, write `status: signed` + signing date in checkpoint file. Proceed with Plan 12-02 using Resend.

   **B) BAA OFFERED, Enterprise tier required + acceptable to OWNER** — save quote, record `status: signed-pending-payment`, OWNER decides whether cost is acceptable for pilot. If yes → proceed; if no → Postmark fallback.

   **C) BAA DENIED or no response within 7 days** — Postmark fallback. Add to `.planning/compliance/RESEND-BAA-CHECKPOINT.md`:
   ```
   status: postmark-fallback
   reason: <denied | no-response | enterprise-cost-prohibitive>
   action: Plan 12-02 must use Postmark Python SDK (postmarker>=1.0) instead of resend SDK.
   The single-file change lives in backend/services/messaging/resend_client.py — rename to email_client.py.
   Postmark webhook signature uses raw HMAC-SHA1 (not Svix); update Plan 12-04 accordingly.
   ```

4. **Create the checkpoint file** at `.planning/compliance/RESEND-BAA-CHECKPOINT.md` with this YAML frontmatter (fill in actual values):
```yaml
---
status: <signed | signed-pending-payment | postmark-fallback>
provider: <resend | postmark>
baa_pdf_path: <.planning/compliance/resend-baa-2026.pdf | n/a>
recorded_at: <ISO-8601 timestamp>
recorded_by: duytran@yahoo.com
notes: <free-form>
---
```
  </how-to-verify>
  <resume-signal>Reply with the chosen path: "signed", "postmark-fallback", or describe the outcome. Plan 12-02 cannot start until this checkpoint is recorded — it determines whether the email client uses `resend` SDK or `postmarker`.</resume-signal>
  <action>Human-only action — see   <resume-signal>Reply with the chosen path: "signed", "postmark-fallback", or describe the outcome. Plan 12-02 cannot start until this checkpoint is recorded — it determines whether the email client uses `resend` SDK or `postmarker`.</resume-signal>lt;how-to-verify  <resume-signal>Reply with the chosen path: "signed", "postmark-fallback", or describe the outcome. Plan 12-02 cannot start until this checkpoint is recorded — it determines whether the email client uses `resend` SDK or `postmarker`.</resume-signal>gt; above. Claude waits.</action>
  <verify>
    <automated>test -f .planning/compliance/RESEND-BAA-CHECKPOINT.md && grep -E "^status: (signed|signed-pending-payment|postmark-fallback)" .planning/compliance/RESEND-BAA-CHECKPOINT.md</automated>
  </verify>
  <done>.planning/compliance/RESEND-BAA-CHECKPOINT.md exists with status field set to one of the three documented outcomes.</done>
</task>

</tasks>

<verification>
After all tasks complete:
1. `cd backend && python -c "import twilio, resend, svix, phonenumbers, freezegun"` exits 0
2. `node -e "require('@react-email/render')"` exits 0
3. `cd backend && python -m pytest tests/messaging --collect-only -q` exits 0
4. File `.planning/compliance/RESEND-BAA-CHECKPOINT.md` exists with `status:` field set to one of the three outcomes
5. `npx tsc --noEmit` exits 0 (full project type-check still clean)
</verification>

<success_criteria>
- All 5 backend deps + 2 frontend deps install and import
- Test scaffolding (conftest + factories + 3 fixture files + Playwright fixtures) created and pytest-collectable
- BAA decision recorded in compliance checkpoint file (signed | postmark-fallback)
- No production messaging code yet — this plan is foundation only
</success_criteria>

<output>
After completion, create `.planning/phases/12-crm-patient-engagement/12-00-SUMMARY.md` documenting:
- Final installed versions of twilio, resend (or postmarker), svix, phonenumbers, freezegun, @react-email/*
- Resend BAA decision outcome (which path was taken)
- Any deviations from the planned conftest fixture list
</output>
