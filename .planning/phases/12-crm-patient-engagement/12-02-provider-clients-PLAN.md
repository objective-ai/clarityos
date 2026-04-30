---
phase: 12
plan: 02
slug: provider-clients
type: execute
wave: 2
depends_on: [12-00, 12-01]
files_modified:
  - backend/services/messaging/__init__.py
  - backend/services/messaging/twilio_client.py
  - backend/services/messaging/resend_client.py
  - backend/services/messaging/templates.py
  - backend/core/config.py
  - backend/tests/messaging/test_twilio_client.py
  - backend/tests/messaging/test_resend_client.py
  - backend/tests/messaging/test_templates.py
  - components/messaging/emails/ReminderEmail.tsx
  - components/messaging/emails/RecallEmail.tsx
  - components/messaging/emails/ManualEmail.tsx
  - app/api/messaging/render-template/route.ts
autonomous: true
gap_closure: false
requirements: [CRM-01, CRM-04, CRM-07, CRM-14]

must_haves:
  truths:
    - "Twilio client wraps SDK with async-safe send_sms() that returns provider_message_id"
    - "Resend client (or Postmark fallback per Wave 0 BAA outcome) wraps SDK with idempotency_key support"
    - "Number provisioning function creates a local US number, attaches to Messaging Service, returns phone_number + sid"
    - "Template renderer interpolates predefined tokens (patient_first_name, appt_time, etc.) into body — no eval, no f-string injection"
    - "PHI scrubber rejects diagnosis/Rx/ICD10 terms in operational SMS body (raises PHIInTemplate)"
    - "React Email components render to inline-styled HTML via @react-email/render (server-side in Next.js BFF)"
  artifacts:
    - path: "backend/services/messaging/twilio_client.py"
      provides: "_get_client lazy singleton, send_sms, provision_local_number, validate_signature"
      exports: ["send_sms", "provision_local_number", "validate_signature", "TwilioConfigError"]
    - path: "backend/services/messaging/resend_client.py"
      provides: "send_email, verify_svix_signature"
      exports: ["send_email", "verify_svix_signature", "EmailConfigError"]
    - path: "backend/services/messaging/templates.py"
      provides: "render_template, scrub_phi_for_operational_sms, count_sms_segments"
      exports: ["render_template", "scrub_phi_for_operational_sms", "count_sms_segments", "PHIInTemplate", "TemplateRenderError", "ALLOWED_TOKENS"]
    - path: "components/messaging/emails/ReminderEmail.tsx"
      provides: "React Email component for appointment reminders"
    - path: "app/api/messaging/render-template/route.ts"
      provides: "BFF endpoint that renders React Email → HTML string for FastAPI to forward to Resend"
  key_links:
    - from: "backend/services/messaging/twilio_client.py"
      to: "backend/core/config.py"
      via: "settings.TWILIO_ACCOUNT_SID + settings.TWILIO_AUTH_TOKEN"
      pattern: "settings\\.TWILIO_"
    - from: "backend/services/messaging/templates.py"
      to: "backend/tests/messaging/fixtures/phi_scrub_corpus.py"
      via: "denylist coverage — every TEST_CORPUS entry must be blocked"
      pattern: "scrub_phi_for_operational_sms"
    - from: "app/api/messaging/render-template/route.ts"
      to: "@react-email/render"
      via: "render(<Component />, { pretty: false })"
      pattern: "from \"@react-email/render\""
---

<objective>
Build the SDK-wrapper layer for Twilio + Resend + React Email. These are pure adapters — they call the SDK and return primitive results. Higher-level decisions (preflight checks, opt-out, cost cap, audit) live in the choke-point sender service in Plan 12-03.

Purpose: Isolate vendor SDK churn behind a thin contract so we can swap Resend → Postmark in a single file (per Wave 0 BAA fallback path). Test against mocked SDKs without depending on network.

Output:
- 3 backend service modules (twilio_client.py, resend_client.py, templates.py)
- Backend config additions for new env vars
- 3 unit test files exercising mocked SDKs and PHI scrub against the corpus
- 3 React Email templates + 1 BFF render endpoint
- Conditional path: if Wave 0 produced postmark-fallback, the email client adapts (see Task 2 conditional)
</objective>

<execution_context>
@C:/Users/duytr/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/duytr/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/12-crm-patient-engagement/12-CONTEXT.md
@.planning/phases/12-crm-patient-engagement/12-RESEARCH.md
@.planning/phases/12-crm-patient-engagement/12-UI-SPEC.md
@.planning/phases/12-crm-patient-engagement/12-00-SUMMARY.md
@.planning/phases/12-crm-patient-engagement/12-01-SUMMARY.md
@.planning/compliance/RESEND-BAA-CHECKPOINT.md
@./CLAUDE.md
@.claude/rules/clinical-safety.md

<interfaces>
<!-- From Plan 12-00 -->
From backend/tests/messaging/conftest.py:
- Fixtures: mock_twilio_client, mock_resend_client, signed_twilio_webhook_factory, signed_resend_webhook_factory, mock_anthropic_classifier, frozen_clock

From backend/tests/messaging/fixtures/phi_scrub_corpus.py:
- TEST_CORPUS: list[tuple[str, str]] — (test_string, expected_match_token)
- DIAGNOSIS_TERMS, ICD10_PATTERNS, RX_TERMS

<!-- From Plan 12-01 -->
From backend/db/models/tenant/messaging.py:
- MessageChannel, MessagePurpose, MessageStatus, TemplateKind enums
- MessageLog, MessageTemplate ORM models

<!-- From research -->
Twilio SDK signature (RESEARCH.md lines 642-670):
- twilio.rest.Client(account_sid, auth_token).messages.create(body, to, messaging_service_sid, status_callback) → returns object with .sid
- twilio.request_validator.RequestValidator(auth_token).validate(url, params, signature) → bool

Resend SDK (RESEARCH.md lines 673-695):
- resend.api_key = key; resend.Emails.send(params, options={"idempotency_key": ...}) → {"id": ...}

React Email (RESEARCH.md lines 697-720):
- import { render } from "@react-email/render"; render(<Component {...props} />, { pretty: false }) → HTML string

Allowed token set (CONTEXT.md):
- {{patient_first_name}}, {{appt_time}}, {{appt_date}}, {{provider_name}}, {{clinic_name}}, {{reschedule_link}}, {{confirm_link}}
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Twilio client wrapper + signature validator + number provisioning</name>
  <files>
    backend/services/messaging/__init__.py,
    backend/services/messaging/twilio_client.py,
    backend/core/config.py,
    backend/tests/messaging/test_twilio_client.py
  </files>
  <read_first>
    - backend/services/ai_scribe.py (existing service module structure — module-level singleton + lazy init pattern)
    - backend/core/config.py (full file — settings class pattern with Pydantic BaseSettings)
    - backend/tests/messaging/conftest.py (fixtures from Plan 12-00 — uses mock_twilio_client + signed_twilio_webhook_factory)
    - .planning/phases/12-crm-patient-engagement/12-RESEARCH.md (lines 642-670 — Twilio code example; lines 832-857 — number provisioning)
    - .planning/phases/12-crm-patient-engagement/12-RESEARCH.md (Pitfall 1 — signature validation behind a proxy uses X-Forwarded-Host)
  </read_first>
  <behavior>
    - Test 1: send_sms with mocked client returns the SDK's MessageSid as a string
    - Test 2: send_sms calls SDK.messages.create with body, to, messaging_service_sid, status_callback exactly as passed
    - Test 3: validate_signature returns True for a payload from signed_twilio_webhook_factory
    - Test 4: validate_signature returns False for a payload with a corrupted signature
    - Test 5: validate_signature reconstructs URL using X-Forwarded-Host header (Pitfall 1)
    - Test 6: provision_local_number returns dict with phone_number + sid keys
    - Test 7: provision_local_number raises NoNumberAvailable when SDK returns empty list
    - Test 8: Lazy client init does NOT fail when env vars are unset at import (only at first call)
  </behavior>
  <action>
**Step 1.** Update `backend/core/config.py` Settings class — add fields:
```python
TWILIO_ACCOUNT_SID: str | None = None
TWILIO_AUTH_TOKEN: str | None = None
TWILIO_MESSAGING_SERVICE_SID: str | None = None
WEBHOOK_INTERNAL_SECRET: str | None = None  # used by Plan 12-04 webhook gate
MESSAGING_TEST_ALLOWLIST: str = ""           # comma-separated phones+emails
RESEND_API_KEY: str | None = None
RESEND_WEBHOOK_SECRET: str | None = None
RESEND_FROM_EMAIL: str | None = None         # e.g. "noreply@clarityos.app"
EMAIL_PROVIDER: str = "resend"               # set to "postmark" if Wave 0 fallback path chosen
POSTMARK_SERVER_TOKEN: str | None = None     # only used if EMAIL_PROVIDER == "postmark"
MESSAGING_SCHEDULER_ENABLED: bool = True     # disabled in tests via conftest autouse
```

**Step 2.** Create `backend/services/messaging/__init__.py` with module docstring and re-exports.

**Step 3.** Create `backend/services/messaging/twilio_client.py`:

```python
"""Twilio SDK adapter — pure wrapper, no business logic.

Lazy-initialized client (RESEARCH.md anti-pattern: do not load credentials at import).
Async-safe via asyncio.to_thread (Twilio SDK is sync-only).
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from backend.core.config import settings

logger = logging.getLogger(__name__)

_client = None  # lazy singleton


class TwilioConfigError(RuntimeError):
    pass


class NoNumberAvailable(RuntimeError):
    pass


def _get_client():
    global _client
    if _client is None:
        if not settings.TWILIO_ACCOUNT_SID or not settings.TWILIO_AUTH_TOKEN:
            raise TwilioConfigError("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set")
        from twilio.rest import Client
        _client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
    return _client


def _reset_client_for_tests() -> None:
    """Test helper — call between tests that swap env."""
    global _client
    _client = None


async def send_sms(*, body: str, to: str, status_callback_url: str, messaging_service_sid: str | None = None) -> str:
    """Send via Messaging Service (enables Advanced Opt-Out + per-clinic number selection).

    Returns Twilio MessageSid. Raises TwilioRestException on validation/rate-limit/blocked numbers.
    """
    msid = messaging_service_sid or settings.TWILIO_MESSAGING_SERVICE_SID
    if not msid:
        raise TwilioConfigError("messaging_service_sid required")

    client = _get_client()
    msg = await asyncio.to_thread(
        client.messages.create,
        body=body,
        to=to,
        messaging_service_sid=msid,
        status_callback=status_callback_url,
    )
    return msg.sid


def validate_signature(*, url: str, form: dict[str, str], signature: str, auth_token: str | None = None) -> bool:
    """Validate X-Twilio-Signature against the URL Twilio signed.

    `url` MUST be reconstructed using X-Forwarded-Host + path (RESEARCH.md Pitfall 1).
    Caller is responsible for URL reconstruction; this function just calls the SDK.
    """
    from twilio.request_validator import RequestValidator
    token = auth_token or settings.TWILIO_AUTH_TOKEN
    if not token:
        raise TwilioConfigError("TWILIO_AUTH_TOKEN required for signature validation")
    return RequestValidator(token).validate(url, form, signature)


async def provision_local_number(*, area_code: str, friendly_name: str, messaging_service_sid: str) -> dict[str, str]:
    """Buy a local US number matching area_code, attach it to Messaging Service.

    Returns: {"phone_number": "+1...", "sid": "PN..."}
    Raises: NoNumberAvailable if no numbers in that area code.
    """
    client = _get_client()
    available = await asyncio.to_thread(
        client.available_phone_numbers("US").local.list,
        area_code=area_code,
        sms_enabled=True,
        limit=1,
    )
    if not available:
        raise NoNumberAvailable(f"No numbers available in area code {area_code}")

    purchased = await asyncio.to_thread(
        client.incoming_phone_numbers.create,
        phone_number=available[0].phone_number,
        friendly_name=friendly_name,
    )
    await asyncio.to_thread(
        client.messaging.v1.services(messaging_service_sid).phone_numbers.create,
        phone_number_sid=purchased.sid,
    )
    return {"phone_number": purchased.phone_number, "sid": purchased.sid}
```

**Step 4.** Create `backend/tests/messaging/test_twilio_client.py` matching the behavior contract above. Use `mock_twilio_client` fixture; monkeypatch `_client` global directly. Cover all 8 test cases listed in `<behavior>`.

Key test pattern (signature):
```python
@pytest.mark.asyncio
async def test_send_sms_returns_message_sid(monkeypatch, mock_twilio_client):
    monkeypatch.setattr("backend.services.messaging.twilio_client._client", mock_twilio_client)
    monkeypatch.setattr(settings, "TWILIO_MESSAGING_SERVICE_SID", "MG_test")
    sid = await send_sms(body="Hi", to="+15555550100", status_callback_url="https://x/cb", messaging_service_sid="MG_test")
    assert sid == "SM_test_message_sid_001"
    mock_twilio_client.messages.create.assert_called_once_with(
        body="Hi", to="+15555550100", messaging_service_sid="MG_test", status_callback="https://x/cb"
    )

def test_validate_signature_accepts_signed_payload(signed_twilio_webhook_factory, monkeypatch):
    payload = signed_twilio_webhook_factory()
    assert validate_signature(
        url=payload["url"],
        form=payload["form"],
        signature=payload["headers"]["X-Twilio-Signature"],
    ) is True

def test_validate_signature_rejects_corrupted(signed_twilio_webhook_factory):
    payload = signed_twilio_webhook_factory()
    assert validate_signature(
        url=payload["url"],
        form=payload["form"],
        signature="bogus_signature",
    ) is False
```
  </action>
  <verify>
    <automated>cd backend && pytest tests/messaging/test_twilio_client.py -x -q</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "def send_sms" backend/services/messaging/twilio_client.py` returns 1
    - `grep -c "def validate_signature" backend/services/messaging/twilio_client.py` returns 1
    - `grep -c "def provision_local_number" backend/services/messaging/twilio_client.py` returns 1
    - `grep -c "_client = None" backend/services/messaging/twilio_client.py` returns at least 1 (lazy init)
    - `grep -c "asyncio.to_thread" backend/services/messaging/twilio_client.py` returns at least 3 (send_sms + 3x in provision)
    - `grep -c "class TwilioConfigError" backend/services/messaging/twilio_client.py` returns 1
    - `grep -c "TWILIO_ACCOUNT_SID" backend/core/config.py` returns at least 1
    - `grep -c "WEBHOOK_INTERNAL_SECRET" backend/core/config.py` returns at least 1
    - `grep -c "EMAIL_PROVIDER" backend/core/config.py` returns at least 1
    - `cd backend && pytest tests/messaging/test_twilio_client.py -x -q` exits 0 with at least 8 passing tests
    - `cd backend && python -c "from services.messaging.twilio_client import send_sms, validate_signature, provision_local_number, TwilioConfigError"` exits 0
    - `cd backend && python -c "import services.messaging.twilio_client as m; assert m._client is None"` exits 0 (no eager init)
  </acceptance_criteria>
  <done>Twilio adapter provides 3 functions + 2 exceptions, all behaviors covered by ≥8 passing tests, no eager credentials access.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Email client (Resend OR Postmark per Wave 0 BAA outcome) + Svix signature verifier</name>
  <files>
    backend/services/messaging/resend_client.py,
    backend/tests/messaging/test_resend_client.py
  </files>
  <read_first>
    - .planning/compliance/RESEND-BAA-CHECKPOINT.md (REQUIRED — determines whether to use resend SDK or postmarker SDK)
    - backend/services/messaging/twilio_client.py (created in Task 1 — mirror structure)
    - .planning/phases/12-crm-patient-engagement/12-RESEARCH.md (lines 673-695 — Resend code; lines 460-473 — Svix verification)
    - backend/tests/messaging/conftest.py (mock_resend_client + signed_resend_webhook_factory fixtures)
  </read_first>
  <behavior>
    - Test 1: send_email with mocked SDK returns the email id as a string
    - Test 2: send_email passes idempotency_key option correctly (RESEARCH "Don't Hand-Roll")
    - Test 3: send_email passes reply_to when provided, omits when None
    - Test 4: send_email accepts a pre-rendered HTML string (does NOT render server-side — that happens in BFF)
    - Test 5: verify_svix_signature returns parsed payload for valid headers
    - Test 6: verify_svix_signature raises SvixVerificationError for invalid signature
    - Test 7: send_email raises EmailConfigError when RESEND_API_KEY (or POSTMARK_SERVER_TOKEN) is unset
  </behavior>
  <action>
**CONDITIONAL ON Wave 0 BAA outcome.** Read `.planning/compliance/RESEND-BAA-CHECKPOINT.md` first.

**Path A — `status: signed` or `signed-pending-payment`:** Use Resend SDK as below.

**Path B — `status: postmark-fallback`:** Replace Resend imports with Postmark, file remains named `resend_client.py` for downstream import stability OR rename to `email_client.py` and update Plan 12-03 imports. Use `postmarker` SDK (`pip install postmarker`). Postmark webhook signatures use raw HMAC-SHA1, NOT Svix — adapt `verify_svix_signature` accordingly (rename to `verify_email_webhook_signature`).

**For Path A (default):**

```python
"""Resend (or Postmark fallback) SDK adapter.

Pure wrapper. Idempotency-key support per RESEARCH § Don't Hand-Roll table.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from backend.core.config import settings

logger = logging.getLogger(__name__)

_initialized = False


class EmailConfigError(RuntimeError):
    pass


class SvixVerificationError(RuntimeError):
    pass


def _ensure_initialized() -> None:
    global _initialized
    if _initialized:
        return
    if settings.EMAIL_PROVIDER == "resend":
        if not settings.RESEND_API_KEY:
            raise EmailConfigError("RESEND_API_KEY must be set")
        import resend
        resend.api_key = settings.RESEND_API_KEY
    elif settings.EMAIL_PROVIDER == "postmark":
        if not settings.POSTMARK_SERVER_TOKEN:
            raise EmailConfigError("POSTMARK_SERVER_TOKEN must be set")
        # Lazy import — postmarker is optional dep until fallback is engaged
    else:
        raise EmailConfigError(f"Unknown EMAIL_PROVIDER: {settings.EMAIL_PROVIDER}")
    _initialized = True


def _reset_for_tests() -> None:
    global _initialized
    _initialized = False


async def send_email(*, subject: str, html: str, to: str, from_: str | None = None, idempotency_key: str, reply_to: str | None = None) -> str:
    """Send a pre-rendered HTML email. Returns provider message id."""
    _ensure_initialized()
    sender = from_ or settings.RESEND_FROM_EMAIL
    if not sender:
        raise EmailConfigError("from_ or RESEND_FROM_EMAIL must be set")

    if settings.EMAIL_PROVIDER == "resend":
        import resend
        params: dict[str, Any] = {
            "from": sender,
            "to": [to],
            "subject": subject,
            "html": html,
        }
        if reply_to:
            params["reply_to"] = reply_to
        options = {"idempotency_key": idempotency_key}
        result = await asyncio.to_thread(resend.Emails.send, params, options)
        return result["id"]

    # Postmark fallback path
    from postmarker.core import PostmarkClient
    pm = PostmarkClient(server_token=settings.POSTMARK_SERVER_TOKEN)
    headers = [{"Name": "X-PM-Idempotency-Key", "Value": idempotency_key}]
    result = await asyncio.to_thread(
        pm.emails.send,
        From=sender, To=to, Subject=subject, HtmlBody=html,
        ReplyTo=reply_to, Headers=headers,
    )
    return result["MessageID"]


def verify_svix_signature(*, raw_body: bytes, headers: dict[str, str]) -> dict[str, Any]:
    """Verify Resend webhook signature using Svix HMAC-SHA256.

    For Postmark fallback path: this function is renamed to verify_email_webhook_signature
    and uses HMAC-SHA1 against POSTMARK_WEBHOOK_SECRET.

    Returns: parsed payload dict on success.
    Raises: SvixVerificationError on invalid signature.
    """
    if settings.EMAIL_PROVIDER == "resend":
        from svix.webhooks import Webhook as SvixWebhook
        if not settings.RESEND_WEBHOOK_SECRET:
            raise EmailConfigError("RESEND_WEBHOOK_SECRET required")
        try:
            wh = SvixWebhook(settings.RESEND_WEBHOOK_SECRET)
            return wh.verify(raw_body, headers)
        except Exception as exc:
            raise SvixVerificationError(str(exc)) from exc

    # Postmark fallback
    raise NotImplementedError("Postmark webhook signature verification — implement when fallback engaged")
```

Create `backend/tests/messaging/test_resend_client.py` covering all 7 behavior cases. For Path A, use `mock_resend_client` fixture and `signed_resend_webhook_factory`.
  </action>
  <verify>
    <automated>cd backend && pytest tests/messaging/test_resend_client.py -x -q</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "async def send_email" backend/services/messaging/resend_client.py` returns 1
    - `grep -c "def verify_svix_signature\\|def verify_email_webhook_signature" backend/services/messaging/resend_client.py` returns 1
    - `grep -c "idempotency_key" backend/services/messaging/resend_client.py` returns at least 2
    - `grep -c "class EmailConfigError" backend/services/messaging/resend_client.py` returns 1
    - `grep -c "EMAIL_PROVIDER" backend/services/messaging/resend_client.py` returns at least 2
    - `cd backend && pytest tests/messaging/test_resend_client.py -x -q` exits 0 with at least 7 passing tests
    - `cd backend && python -c "from services.messaging.resend_client import send_email, verify_svix_signature, EmailConfigError, SvixVerificationError"` exits 0
  </acceptance_criteria>
  <done>Email adapter provides send_email + verify (Svix or HMAC) + 2 exceptions. ≥7 passing tests. EMAIL_PROVIDER toggle proven in code.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Template renderer + PHI scrubber + SMS segment counter + React Email components + BFF render endpoint</name>
  <files>
    backend/services/messaging/templates.py,
    backend/tests/messaging/test_templates.py,
    components/messaging/emails/ReminderEmail.tsx,
    components/messaging/emails/RecallEmail.tsx,
    components/messaging/emails/ManualEmail.tsx,
    app/api/messaging/render-template/route.ts
  </files>
  <read_first>
    - backend/tests/messaging/fixtures/phi_scrub_corpus.py (DENYLIST corpus from Plan 12-00)
    - .planning/phases/12-crm-patient-engagement/12-CONTEXT.md (lines 32, 34 — token list and PHI rules)
    - .planning/phases/12-crm-patient-engagement/12-RESEARCH.md (lines 588-596 — Pitfall 4 PHI leakage; lines 549 — Don't Hand-Roll segment counter)
    - .planning/phases/12-crm-patient-engagement/12-UI-SPEC.md (lines 244-261 — copywriting + token usage)
    - lib/bff.ts (proxyToFastAPI pattern — but this BFF endpoint does NOT proxy, it renders locally)
  </read_first>
  <behavior>
    - Test 1: render_template substitutes all 7 standard tokens correctly: patient_first_name, appt_time, appt_date, provider_name, clinic_name, reschedule_link, confirm_link
    - Test 2: render_template raises TemplateRenderError on missing required token (does not silently leave {{token}} in body)
    - Test 3: render_template ignores unknown {{tokens}} that aren't in ALLOWED_TOKENS (passes them through unchanged — caller validates separately)
    - Test 4: scrub_phi_for_operational_sms raises PHIInTemplate for EVERY entry in TEST_CORPUS (table-driven test using pytest.parametrize)
    - Test 5: scrub_phi_for_operational_sms allows clean operational templates (e.g. "Reminder: your eye exam tomorrow at 10am")
    - Test 6: count_sms_segments returns 1 for ≤160 GSM-7 chars, 2 for 161-306, etc.
    - Test 7: count_sms_segments switches to UCS-2 (70 chars/segment) when message contains emoji or accented chars
  </behavior>
  <action>
**Step 1.** Create `backend/services/messaging/templates.py`:

```python
"""Template rendering, PHI guard, and SMS segment counting.

Token rendering is plain string replacement against a closed allowlist —
no eval, no Jinja, no f-string injection. Caller passes a tokens dict;
unknown keys are ignored, missing required keys raise.
"""
from __future__ import annotations

import re
from typing import Final

ALLOWED_TOKENS: Final[frozenset[str]] = frozenset({
    "patient_first_name",
    "appt_time",
    "appt_date",
    "provider_name",
    "clinic_name",
    "reschedule_link",
    "confirm_link",
})

# PHI denylist — anchored on word boundaries to avoid false positives like "i_diagnosed"
_DIAGNOSIS_TERMS = (
    "glaucoma", "diabetic retinopathy", "macular degeneration", "cataract",
    "amblyopia", "strabismus", "keratoconus", "retinal detachment",
    "uveitis", "conjunctivitis", "iritis", "papilledema", "diabetic", "macular",
)
_RX_TERMS = (
    "latanoprost", "timolol", "brimonidine", "dorzolamide", "bimatoprost",
)
# ICD-10 pattern: letter (A-T,V-Z), 2 digits, optional .digits
_ICD10_RE = re.compile(r"\b[A-TV-Z]\d{2}(?:\.\d{1,4})?\b")
# Rx pattern: OD/OS/OU + sphere/cylinder values
_RX_VALUE_RE = re.compile(r"\b(?:OD|OS|OU)\s*[+-]?\d+\.\d{2}", re.IGNORECASE)
# Acuity pattern: 20/20, 20/40, etc.
_ACUITY_RE = re.compile(r"\b20/\d{2,4}\b")
# Rx add power
_ADD_POWER_RE = re.compile(r"[+-]\d+\.\d{2}\s*add", re.IGNORECASE)


class TemplateRenderError(ValueError):
    pass


class PHIInTemplate(ValueError):
    """Raised when an operational SMS template contains PHI keywords."""

    def __init__(self, matches: list[str]) -> None:
        super().__init__(f"PHI detected in operational SMS: {matches}")
        self.matches = matches


def render_template(*, body: str, tokens: dict[str, str], required: set[str] | None = None) -> str:
    """Substitute {{token}} markers using the tokens dict.

    Required tokens missing from `tokens` raise TemplateRenderError.
    Tokens not in ALLOWED_TOKENS are left untouched (caller validates separately if needed).
    """
    required = required or set()
    missing = [k for k in required if k not in tokens or not tokens[k]]
    if missing:
        raise TemplateRenderError(f"Missing required tokens: {missing}")

    rendered = body
    for token, value in tokens.items():
        rendered = rendered.replace(f"{{{{{token}}}}}", value)
    return rendered


def scrub_phi_for_operational_sms(body: str) -> None:
    """Raise PHIInTemplate if rendered body contains diagnosis/Rx/ICD-10 patterns.

    Operational SMS must be minimum-necessary per HIPAA + CONTEXT rules.
    Email is not scrubbed — clinic-PHI freedom is explicit.
    """
    lower = body.lower()
    matches: list[str] = []
    for term in _DIAGNOSIS_TERMS + _RX_TERMS:
        if term in lower:
            matches.append(term)
    if _ICD10_RE.search(body):
        matches.append(_ICD10_RE.search(body).group(0))
    if _RX_VALUE_RE.search(body):
        matches.append(_RX_VALUE_RE.search(body).group(0))
    if _ACUITY_RE.search(body):
        matches.append(_ACUITY_RE.search(body).group(0))
    if _ADD_POWER_RE.search(body):
        matches.append(_ADD_POWER_RE.search(body).group(0))
    if matches:
        raise PHIInTemplate(matches)


# GSM-7 charset (default SMS encoding) — non-members trigger UCS-2 fallback (70 chars/segment)
_GSM7_CHARS = set(
    "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\x1bÆæßÉ "
    "!\"#¤%&'()*+,-./0123456789:;<=>?"
    "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§"
    "¿abcdefghijklmnopqrstuvwxyzäöñüà"
)


def count_sms_segments(body: str) -> tuple[int, str]:
    """Return (segment_count, encoding) for a message body.

    Encoding: "GSM-7" (160 chars/segment, 153/segment when concatenated)
              "UCS-2" (70 chars/segment, 67/segment when concatenated)
    """
    if all(c in _GSM7_CHARS for c in body):
        if len(body) <= 160:
            return (1, "GSM-7")
        # concatenated SMS
        import math
        return (math.ceil(len(body) / 153), "GSM-7")
    # UCS-2
    if len(body) <= 70:
        return (1, "UCS-2")
    import math
    return (math.ceil(len(body) / 67), "UCS-2")
```

**Step 2.** Create `backend/tests/messaging/test_templates.py` covering all 7 behavior cases. Use the PHI corpus for the parametrize table:

```python
import pytest
from backend.services.messaging.templates import (
    render_template, scrub_phi_for_operational_sms,
    count_sms_segments, TemplateRenderError, PHIInTemplate,
)
from backend.tests.messaging.fixtures.phi_scrub_corpus import TEST_CORPUS


@pytest.mark.parametrize("phi_text,expected_term", TEST_CORPUS)
def test_phi_scrub_blocks_corpus_entries(phi_text, expected_term):
    body = f"Reminder: your appointment. Note: {phi_text}"
    with pytest.raises(PHIInTemplate):
        scrub_phi_for_operational_sms(body)


def test_phi_scrub_allows_clean_operational_template():
    body = "Reminder: your eye exam tomorrow at 10:00 AM at Clarity Clinic."
    scrub_phi_for_operational_sms(body)  # must not raise


def test_render_substitutes_all_tokens():
    body = "Hi {{patient_first_name}}, your appt is {{appt_date}} at {{appt_time}}."
    out = render_template(body=body, tokens={
        "patient_first_name": "Jane", "appt_date": "May 5", "appt_time": "10:00 AM",
    })
    assert "Jane" in out and "May 5" in out and "10:00 AM" in out
    assert "{{" not in out


def test_render_raises_on_missing_required():
    with pytest.raises(TemplateRenderError):
        render_template(body="Hi {{patient_first_name}}", tokens={}, required={"patient_first_name"})


def test_segment_count_short_gsm7():
    assert count_sms_segments("Hello") == (1, "GSM-7")


def test_segment_count_long_gsm7():
    body = "x" * 161
    seg, enc = count_sms_segments(body)
    assert seg == 2 and enc == "GSM-7"


def test_segment_count_emoji_triggers_ucs2():
    body = "Hello 👋"
    seg, enc = count_sms_segments(body)
    assert enc == "UCS-2"
```

**Step 3.** Create 3 React Email components. Keep them minimal — no inline images, brand color from CSS var.

`components/messaging/emails/ReminderEmail.tsx`:
```tsx
import { Body, Button, Container, Head, Heading, Html, Preview, Section, Text } from "@react-email/components";
import * as React from "react";

export interface ReminderEmailProps {
  patientFirstName: string;
  apptDate: string;
  apptTime: string;
  providerName: string;
  clinicName: string;
  confirmLink: string;
  rescheduleLink: string;
  language?: "en" | "es";
}

export const ReminderEmail = ({
  patientFirstName, apptDate, apptTime, providerName, clinicName,
  confirmLink, rescheduleLink, language = "en",
}: ReminderEmailProps) => {
  const t = language === "es" ? esStrings : enStrings;
  return (
    <Html>
      <Head />
      <Preview>{t.preview(clinicName, apptDate, apptTime)}</Preview>
      <Body style={{ fontFamily: "-apple-system,Segoe UI,sans-serif", backgroundColor: "#f8fafc" }}>
        <Container style={{ maxWidth: 480, margin: "0 auto", padding: 24 }}>
          <Heading as="h1" style={{ fontSize: 20, color: "#0f172a" }}>{t.heading(clinicName)}</Heading>
          <Text style={{ fontSize: 14, color: "#0f172a" }}>
            {t.greeting(patientFirstName)}
          </Text>
          <Text style={{ fontSize: 14, color: "#0f172a" }}>
            {t.body(apptDate, apptTime, providerName)}
          </Text>
          <Section style={{ marginTop: 24 }}>
            <Button href={confirmLink} style={{ backgroundColor: "#2DD4BF", color: "#0f172a", padding: "12px 20px", borderRadius: 8, textDecoration: "none", fontWeight: 600 }}>
              {t.confirm}
            </Button>
            <Text style={{ fontSize: 12, marginTop: 16 }}>
              <a href={rescheduleLink} style={{ color: "#2563EB" }}>{t.reschedule}</a>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

const enStrings = {
  preview: (clinic: string, d: string, t: string) => `${clinic} eye exam reminder for ${d} at ${t}`,
  heading: (clinic: string) => `Appointment Reminder — ${clinic}`,
  greeting: (name: string) => `Hi ${name},`,
  body: (d: string, t: string, p: string) => `This is a reminder of your eye exam on ${d} at ${t} with ${p}.`,
  confirm: "Confirm Appointment",
  reschedule: "Need to reschedule?",
};

const esStrings = {
  preview: (clinic: string, d: string, t: string) => `Recordatorio de examen visual en ${clinic} para ${d} a las ${t}`,
  heading: (clinic: string) => `Recordatorio de Cita — ${clinic}`,
  greeting: (name: string) => `Hola ${name},`,
  body: (d: string, t: string, p: string) => `Le recordamos su examen visual el ${d} a las ${t} con ${p}.`,
  confirm: "Confirmar Cita",
  reschedule: "¿Necesita reprogramar?",
};

export default ReminderEmail;
```

`components/messaging/emails/RecallEmail.tsx`: similar shape, content:
```
Heading: "Time for your annual eye exam — {{clinic_name}}"
Body: "Hi {{patient_first_name}}, it's been a year since your last eye exam. Schedule your annual checkup to keep your eyes healthy."
CTA: "Book Now" → schedule_link (use confirmLink prop name to keep API consistent)
```

`components/messaging/emails/ManualEmail.tsx`: takes `subject`, `body` (plain text or markdown), `clinicName`. Renders body as `<Text>` with line-break handling.

**Step 4.** Create `app/api/messaging/render-template/route.ts`:

```typescript
/**
 * BFF endpoint that renders a React Email component to inline-styled HTML.
 *
 * Server (FastAPI) calls this via internal fetch to get HTML; FastAPI then
 * forwards HTML string to Resend SDK. This avoids running Node in the Python
 * backend and gives React Email first-class integration (RESEARCH § Pattern E).
 *
 * Auth: requires WEBHOOK_INTERNAL_SECRET header (same secret as Plan 12-04 webhooks)
 * — this endpoint is service-to-service, not user-facing.
 */
import { NextRequest, NextResponse } from "next/server";
import { render } from "@react-email/render";
import { ReminderEmail } from "@/components/messaging/emails/ReminderEmail";
import { RecallEmail } from "@/components/messaging/emails/RecallEmail";
import { ManualEmail } from "@/components/messaging/emails/ManualEmail";

export const runtime = "nodejs"; // React Email requires Node runtime, not Edge

interface RenderRequest {
  template_kind: "reminder_7d" | "reminder_72h" | "reminder_24h" | "recall_m12" | "recall_m14" | "manual";
  language: "en" | "es";
  tokens: Record<string, string>;
  subject?: string;
  body?: string; // for manual template
}

export async function POST(request: NextRequest) {
  const internal = request.headers.get("X-Webhook-Internal");
  if (!process.env.WEBHOOK_INTERNAL_SECRET || internal !== process.env.WEBHOOK_INTERNAL_SECRET) {
    return new NextResponse("forbidden", { status: 403 });
  }
  const body = (await request.json()) as RenderRequest;

  let element;
  if (body.template_kind.startsWith("reminder_")) {
    element = <ReminderEmail
      patientFirstName={body.tokens.patient_first_name ?? ""}
      apptDate={body.tokens.appt_date ?? ""}
      apptTime={body.tokens.appt_time ?? ""}
      providerName={body.tokens.provider_name ?? ""}
      clinicName={body.tokens.clinic_name ?? ""}
      confirmLink={body.tokens.confirm_link ?? "#"}
      rescheduleLink={body.tokens.reschedule_link ?? "#"}
      language={body.language}
    />;
  } else if (body.template_kind.startsWith("recall_")) {
    element = <RecallEmail
      patientFirstName={body.tokens.patient_first_name ?? ""}
      clinicName={body.tokens.clinic_name ?? ""}
      confirmLink={body.tokens.confirm_link ?? "#"}
      language={body.language}
    />;
  } else {
    element = <ManualEmail
      subject={body.subject ?? ""}
      body={body.body ?? ""}
      clinicName={body.tokens.clinic_name ?? ""}
    />;
  }

  const html = await render(element, { pretty: false });
  return NextResponse.json({ html });
}
```
  </action>
  <verify>
    <automated>cd backend && pytest tests/messaging/test_templates.py -x -q && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "ALLOWED_TOKENS" backend/services/messaging/templates.py` returns at least 1
    - `grep -c "def scrub_phi_for_operational_sms" backend/services/messaging/templates.py` returns 1
    - `grep -c "def render_template" backend/services/messaging/templates.py` returns 1
    - `grep -c "def count_sms_segments" backend/services/messaging/templates.py` returns 1
    - `grep -c "class PHIInTemplate" backend/services/messaging/templates.py` returns 1
    - `grep -c "_GSM7_CHARS" backend/services/messaging/templates.py` returns at least 1
    - `cd backend && pytest tests/messaging/test_templates.py -x -q` exits 0; the parametrized PHI test must show at least 24 individual test runs (matches corpus size)
    - `grep -c "export const ReminderEmail" components/messaging/emails/ReminderEmail.tsx` returns 1
    - `grep -c "export const RecallEmail\\|export default RecallEmail" components/messaging/emails/RecallEmail.tsx` returns 1
    - `grep -c "@react-email/render" app/api/messaging/render-template/route.ts` returns 1
    - `grep -c "WEBHOOK_INTERNAL_SECRET" app/api/messaging/render-template/route.ts` returns at least 1
    - `grep -c "runtime = \"nodejs\"" app/api/messaging/render-template/route.ts` returns 1
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>Templates module covers render + PHI scrub + segment count, all tested. 3 React Email components compile. BFF render endpoint behind WEBHOOK_INTERNAL_SECRET. ≥24 PHI corpus entries blocked.</done>
</task>

</tasks>

<verification>
1. `cd backend && pytest tests/messaging -x -q` → exits 0, ≥24 PHI tests + ≥8 Twilio tests + ≥7 Resend tests + ≥7 templates tests pass
2. `cd backend && python -c "from services.messaging.twilio_client import send_sms; from services.messaging.resend_client import send_email; from services.messaging.templates import render_template, scrub_phi_for_operational_sms"` → exits 0
3. `npx tsc --noEmit` → exits 0
4. `node -e "const r = require('./components/messaging/emails/ReminderEmail.tsx'); console.log(typeof r.ReminderEmail)"` (smoke check the component is exportable; may require esbuild/Next dev server — alternatively run `npm run build` if smoke fails)
</verification>

<success_criteria>
- Twilio: send_sms, validate_signature, provision_local_number all work against mocked SDK
- Email: send_email + Svix verify (or HMAC for Postmark fallback) both work
- Templates: render+scrub+segment count cover all 7 standard tokens, all PHI corpus entries, both encodings
- React Email: 3 components render via BFF endpoint with auth seal
- PHI corpus has ≥24 distinct test cases all blocked
</success_criteria>

<output>
After completion, create `.planning/phases/12-crm-patient-engagement/12-02-SUMMARY.md` documenting:
- Email provider chosen (resend | postmark) and why
- Number of PHI corpus tests passing (corpus_size × 2 if you tested upper+lower case)
- Any deviations from the React Email shape (e.g. used different brand color)
- Final exports list from each module
</output>
