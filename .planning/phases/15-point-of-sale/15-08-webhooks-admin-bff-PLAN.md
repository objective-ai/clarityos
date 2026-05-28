---
phase: 15-point-of-sale
plan: 08
type: execute
wave: 6
depends_on: [15-04, 15-05, 15-06, 15-07]
files_modified:
  - backend/api/routes/webhooks.py
  - backend/api/routes/admin_payment_config.py
  - backend/main.py
  - app/api/sales/route.ts
  - app/api/sales/[saleId]/route.ts
  - app/api/sales/[saleId]/lines/route.ts
  - app/api/sales/[saleId]/lines/[lineId]/route.ts
  - app/api/sales/[saleId]/payments/route.ts
  - app/api/sales/[saleId]/payments/stripe-confirm/route.ts
  - app/api/sales/[saleId]/payments/[paymentId]/route.ts
  - app/api/sales/[saleId]/close/route.ts
  - app/api/sales/[saleId]/receipt/route.ts
  - app/api/sales/[saleId]/receipt/email/route.ts
  - app/api/sales/[saleId]/refunds/route.ts
  - app/api/refunds/route.ts
  - app/api/refunds/[refundId]/route.ts
  - app/api/refunds/[refundId]/receipt/route.ts
  - app/api/pos/daily-close/route.ts
  - app/api/pos/daily-close/[runId]/export/route.ts
  - app/api/admin/payment-config/route.ts
  - app/api/webhooks/stripe/route.ts
autonomous: true
requirements: [POS-02, POS-08, POS-11, POS-12]

must_haves:
  truths:
    - "Stripe webhook /api/webhooks/stripe verifies signature via stripe.Webhook.construct_event over RAW body bytes (Pitfall 1) — never JSON.parse first"
    - "Webhook idempotent via StripeWebhookEvent.event_id UNIQUE — duplicate deliveries return {ok:true, ignored:duplicate}"
    - "Monotonic Payment.status updates via priority map; 'failed'/'canceled' supersede only when current is pending"
    - "Admin GET /api/admin/payment-config/ returns { stripePublishableKey, hasSecretKey, hasWebhookSecret, salesTaxRate } — NEVER decrypts secrets to FE"
    - "Admin PUT /api/admin/payment-config/ encrypts via encrypt_secret() before persistence (Pitfall 11); validates pk_ / sk_ / whsec_ prefixes"
    - "All 19 BFF routes proxy to FastAPI with trailing-slash upstream URLs; PDF endpoints use raw fetch + arrayBuffer (NOT proxyToFastAPI); webhook route forwards raw body"
    - "Middleware allowlist already covers /api/webhooks/* — no new middleware changes needed"
  artifacts:
    - path: "backend/api/routes/webhooks.py"
      provides: "extended with /stripe POST handler"
      contains: "@router.post(\"/stripe"
    - path: "backend/api/routes/admin_payment_config.py"
      provides: "GET + PUT admin payment config"
      contains: "MANAGE_PAYMENT_CONFIG"
    - path: "app/api/webhooks/stripe/route.ts"
      provides: "BFF passthrough that forwards raw body unmodified"
      contains: "request.text()"
    - path: "app/api/sales/[saleId]/receipt/route.ts"
      provides: "Raw fetch + arrayBuffer (NOT proxyToFastAPI) for PDF Blob"
      contains: "arrayBuffer"
  key_links:
    - from: "/api/webhooks/stripe"
      to: "stripe.Webhook.construct_event over raw bytes"
      via: "request.body() in FastAPI; request.text() in BFF (NOT json())"
      pattern: "construct_event|request\\.text\\(\\)|request\\.body\\(\\)"
    - from: "PUT /api/admin/payment-config/"
      to: "encrypt_secret"
      via: "before any DB write"
      pattern: "encrypt_secret"
    - from: "GET /api/sales/{id}/receipt/"
      to: "BFF raw fetch + arrayBuffer"
      via: "Phase 14 job-ticket pattern clone"
      pattern: "arrayBuffer"
---

<objective>
Wire the BFF route layer (Next.js), Stripe webhook handler (FE + BE), and OWNER-only admin payment-config endpoint. The webhook is the trickiest piece — clone Phase 12 Twilio/Postmark handler shape EXACTLY (raw-body preserved, signature verified, idempotent, monotonic).

Output: All 19 BFF routes exist with correct pattern (JSON proxy vs raw-fetch); webhook idempotency test green; admin endpoint encrypts on write.
</objective>

<execution_context>
@C:/Users/duytr/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/duytr/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/15-point-of-sale/15-CONTEXT.md
@.planning/phases/15-point-of-sale/15-RESEARCH.md
@backend/api/routes/webhooks.py
@app/api/webhooks/twilio/route.ts
@app/api/optical-orders/[orderId]/job-ticket/route.ts
@lib/bff.ts
@middleware.ts

<interfaces>
<!-- Phase 12 webhook BFF pattern -->
```typescript
// app/api/webhooks/twilio/route.ts
// Forwards raw body (request.text()) plus X-Webhook-Internal HMAC seal
// to FastAPI; never JSON.parse before forwarding.
export async function POST(req: Request) {
  const body = await req.text();
  const seal = sealForBody(body);  // internal HMAC
  const upstream = await fetch(`${BACKEND_URL}/api/webhooks/twilio/`, {
    method: 'POST',
    headers: {
      'X-Webhook-Internal': seal,
      'X-Twilio-Signature': req.headers.get('X-Twilio-Signature') ?? '',
      'Content-Type': req.headers.get('Content-Type') ?? 'application/json',
    },
    body,
  });
  return new Response(await upstream.text(), { status: upstream.status });
}
```

<!-- Phase 14 PDF Blob BFF pattern -->
```typescript
// app/api/optical-orders/[orderId]/job-ticket/route.ts
const upstream = await fetch(`${BACKEND_URL}/api/optical-orders/${orderId}/job-ticket/`, {
  headers: await getServerAuthHeaders(),
});
const buf = await upstream.arrayBuffer();
return new Response(buf, {
  status: upstream.status,
  headers: { 'Content-Type': 'application/pdf' },
});
```

<!-- proxyToFastAPI for plain JSON -->
```typescript
// lib/bff.ts
import { proxyToFastAPI } from '@/lib/bff';
export async function GET(req: Request, ctx: { params: Promise<{ saleId: string }> }) {
  const { saleId } = await ctx.params;
  return proxyToFastAPI(req, `/api/sales/${saleId}/`);  // trailing slash mandatory
}
```

<!-- StripeProcessor.verify_webhook_signature returns WebhookEvent -->
```python
# Stripe webhook handler in webhooks.py extends existing file:
@router.post("/stripe/", status_code=200)
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    _check_internal_seal(request)  # reuse from Phase 12
    sig = request.headers.get("Stripe-Signature", "")
    body = await request.body()    # raw bytes
    # Parse JSON ONLY to discover tenant_id (then re-verify signature with tenant's secret)
    ...
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Extend backend/api/routes/webhooks.py with Stripe handler + write backend/api/routes/admin_payment_config.py; register both in main.py</name>
  <files>backend/api/routes/webhooks.py, backend/api/routes/admin_payment_config.py, backend/main.py</files>
  <read_first>
    - backend/api/routes/webhooks.py (FULL FILE — read existing Twilio + Postmark handlers; identify `_check_internal_seal` helper; clone shape; do NOT replace)
    - backend/services/payments/stripe_processor.py (Plan 15-02 — verify_webhook_signature)
    - backend/services/payments/crypto.py (encrypt_secret/decrypt_secret)
    - backend/db/models/tenant/clinical.py (StripeWebhookEvent ORM from Plan 15-01)
    - backend/db/models/public/saas.py (Tenant.stripe_secret_key_encrypted / stripe_webhook_secret_encrypted / stripe_publishable_key)
    - .planning/phases/15-point-of-sale/15-RESEARCH.md §Pattern 3 (Stripe webhook code) + §Pitfall 1 + §Pitfall 6 + §Pitfall 11
    - backend/tests/test_webhooks_stripe.py + test_admin_payment_config.py (Wave-0 skip-stubs)
  </read_first>
  <action>
    Three deliverables.

    **A. Extend `backend/api/routes/webhooks.py`** — APPEND, don't replace:

    ```python
    @router.post("/stripe/", status_code=200)
    async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_db)):
        """Phase 15 Stripe webhook handler (POS-02, POS-12, RESEARCH Pattern 3).

        - Verifies X-Webhook-Internal HMAC seal (defense-in-depth from BFF)
        - Reads RAW body bytes (Pitfall 1)
        - Resolves tenant from event metadata.tenant_id (REQUIRED — set by StripeProcessor.create_payment_intent)
        - Verifies Stripe signature with that tenant's webhook_secret
        - Idempotency: skip if StripeWebhookEvent.event_id already persisted (Pitfall 6)
        - Monotonic Payment.status updates via _PAYMENT_STATUS_PRIORITY
        """
        from backend.services.payments.stripe_processor import StripeProcessor
        from backend.db.models.public.saas import Tenant
        from backend.db.models.tenant.clinical import (
            Payment, PaymentStatus, Sale, SaleStatus, StripeWebhookEvent, AuditAction,
        )
        import json
        from uuid import UUID

        _check_internal_seal(request)
        sig = request.headers.get("Stripe-Signature", "")
        body = await request.body()
        if not sig:
            raise HTTPException(400, "Missing Stripe-Signature header")

        # Parse minimal JSON to discover tenant_id; never trust this parse — re-verify signature next
        try:
            payload = json.loads(body)
            tenant_id_str = (payload.get("data", {}).get("object", {}).get("metadata", {}) or {}).get("tenant_id")
            if not tenant_id_str:
                raise HTTPException(400, "Stripe event missing metadata.tenant_id")
            tenant_id = UUID(tenant_id_str)
        except (ValueError, KeyError, json.JSONDecodeError):
            raise HTTPException(400, "Invalid Stripe event payload")

        tenant = await db.get(Tenant, tenant_id)
        if not tenant or not tenant.stripe_webhook_secret_encrypted:
            raise HTTPException(400, "Tenant not configured for Stripe")

        # Signature verify using THIS TENANT's webhook secret (raw bytes — never JSON.parse'd version)
        processor = StripeProcessor()
        try:
            event = processor.verify_webhook_signature(tenant, body, sig)
        except Exception as e:
            raise HTTPException(403, f"Invalid Stripe signature: {e}")

        # Idempotency check (Pitfall 6)
        existing = (await db.execute(
            select(StripeWebhookEvent).where(StripeWebhookEvent.event_id == event.event_id)
        )).scalar_one_or_none()
        if existing:
            return {"ok": True, "ignored": "duplicate", "event_id": event.event_id}

        db.add(StripeWebhookEvent(
            tenant_id=tenant_id, event_id=event.event_id,
            event_type=event.event_type, payment_intent_id=event.payment_intent_id,
        ))

        # Monotonic Payment.status update
        if event.payment_intent_id:
            payment = (await db.execute(
                select(Payment).where(
                    Payment.tenant_id == tenant_id,
                    Payment.processor_payment_id == event.payment_intent_id,
                )
            )).scalar_one_or_none()
            if payment:
                new_status = _STRIPE_EVENT_TO_PAYMENT_STATUS.get(event.event_type)
                if new_status and _can_advance(payment.status, new_status):
                    payment.status = new_status
                    if event.charge_id and not payment.processor_charge_id:
                        payment.processor_charge_id = event.charge_id

        # Audit
        from backend.core.audit import log_action
        # Use a synthetic ctx — webhook arrives without TenantContext from JWT
        from backend.core.security import TenantContext
        ctx = TenantContext(tenant_id=tenant_id, user_id=None, role=None, staff_id=None)
        await log_action(
            db, ctx, AuditAction.STRIPE_WEBHOOK_RECEIVED, "stripe_webhook", None,
            metadata={"event_id": event.event_id, "event_type": event.event_type,
                      "payment_intent_id": event.payment_intent_id},
        )
        await db.commit()
        return {"ok": True, "event_id": event.event_id, "event_type": event.event_type}


    _STRIPE_EVENT_TO_PAYMENT_STATUS = {
        "payment_intent.succeeded": "succeeded",
        "payment_intent.payment_failed": "failed",
        "payment_intent.canceled": "canceled",
        "payment_intent.processing": "processing",
        "charge.refunded": "refunded",
    }

    _STATUS_PRIORITY = {
        "pending": 0, "processing": 1, "requires_action": 1,
        "partial_refund": 2, "succeeded": 3, "refunded": 4,
        "failed": 5, "canceled": 5,
    }

    def _can_advance(current: str, new: str) -> bool:
        return _STATUS_PRIORITY.get(new, -1) >= _STATUS_PRIORITY.get(current, -1)
    ```

    **B. `backend/api/routes/admin_payment_config.py`:**

    ```python
    """Admin POS payment config — OWNER-only (POS-08, POS-11).

    GET returns metadata only (hasSecretKey booleans). PUT encrypts before persistence.
    """
    from __future__ import annotations
    import re

    from fastapi import APIRouter, Depends, HTTPException
    from sqlalchemy.ext.asyncio import AsyncSession

    from backend.core.audit import log_action
    from backend.core.entitlements import Entitlement, require_entitlement
    from backend.core.permissions import ClinicalAction, require_permission
    from backend.core.security import TenantContext, get_tenant_context, resolve_staff
    from backend.db.deps import get_db
    from backend.db.models.public.saas import Tenant
    from backend.db.models.tenant.clinical import AuditAction
    from backend.schemas.sales import PaymentConfigUpdate, PaymentConfigResponse
    from backend.services.payments.crypto import encrypt_secret

    router = APIRouter(
        prefix="/api/admin/payment-config",
        tags=["admin-payment-config"],
        dependencies=[
            Depends(require_entitlement(Entitlement.RETAIL_POS)),
            Depends(require_permission(ClinicalAction.MANAGE_PAYMENT_CONFIG)),
        ],
    )

    PUBLISHABLE_RE = re.compile(r"^pk_(test|live)_[A-Za-z0-9]+$")
    SECRET_RE = re.compile(r"^sk_(test|live)_[A-Za-z0-9]+$")
    WHSEC_RE = re.compile(r"^whsec_[A-Za-z0-9]+$")

    @router.get("/", response_model=PaymentConfigResponse)
    async def get_payment_config(
        ctx: TenantContext = Depends(get_tenant_context),
        db: AsyncSession = Depends(get_db),
    ):
        tenant = await db.get(Tenant, ctx.tenant_id)
        if tenant is None:
            raise HTTPException(404, "Tenant not found")
        return PaymentConfigResponse(
            stripe_publishable_key=tenant.stripe_publishable_key,
            has_secret_key=bool(tenant.stripe_secret_key_encrypted),
            has_webhook_secret=bool(tenant.stripe_webhook_secret_encrypted),
            sales_tax_rate=tenant.sales_tax_rate,
        )

    @router.put("/", response_model=PaymentConfigResponse)
    async def update_payment_config(
        body: PaymentConfigUpdate,
        ctx: TenantContext = Depends(get_tenant_context),
        db: AsyncSession = Depends(get_db),
    ):
        tenant = await db.get(Tenant, ctx.tenant_id)
        if tenant is None:
            raise HTTPException(404, "Tenant not found")

        if body.stripe_publishable_key is not None:
            if body.stripe_publishable_key and not PUBLISHABLE_RE.match(body.stripe_publishable_key):
                raise HTTPException(400, "That doesn't look like a Stripe publishable key. They start with pk_test_ or pk_live_.")
            tenant.stripe_publishable_key = body.stripe_publishable_key or None
        if body.stripe_secret_key is not None:
            if body.stripe_secret_key and not SECRET_RE.match(body.stripe_secret_key):
                raise HTTPException(400, "That doesn't look like a Stripe secret key. They start with sk_test_ or sk_live_.")
            tenant.stripe_secret_key_encrypted = encrypt_secret(body.stripe_secret_key) if body.stripe_secret_key else None
        if body.stripe_webhook_secret is not None:
            if body.stripe_webhook_secret and not WHSEC_RE.match(body.stripe_webhook_secret):
                raise HTTPException(400, "Webhook signing secrets start with whsec_.")
            tenant.stripe_webhook_secret_encrypted = encrypt_secret(body.stripe_webhook_secret) if body.stripe_webhook_secret else None

        staff = await resolve_staff(ctx, db)
        await log_action(
            db, ctx, AuditAction.STRIPE_KEYS_UPDATED, "tenant", tenant.id,
            staff_id=staff.id if staff else None,
            metadata={
                "updated_fields": [k for k, v in {
                    "publishable": body.stripe_publishable_key is not None,
                    "secret": body.stripe_secret_key is not None,
                    "webhook": body.stripe_webhook_secret is not None,
                }.items() if v],
            },
        )
        await db.commit()
        return PaymentConfigResponse(
            stripe_publishable_key=tenant.stripe_publishable_key,
            has_secret_key=bool(tenant.stripe_secret_key_encrypted),
            has_webhook_secret=bool(tenant.stripe_webhook_secret_encrypted),
            sales_tax_rate=tenant.sales_tax_rate,
        )
    ```

    **C. Register in main.py:**
    ```python
    from backend.api.routes.admin_payment_config import router as admin_payment_config_router
    app.include_router(admin_payment_config_router)
    # webhooks.py router already registered from Phase 12; no new registration
    ```

    **D. Replace `backend/tests/test_webhooks_stripe.py`:**

    ```python
    """POS-02 — Stripe webhook signature + idempotency."""
    import pytest
    import json
    from decimal import Decimal
    from unittest.mock import AsyncMock, MagicMock, patch
    from uuid import uuid4

    pytestmark = pytest.mark.asyncio

    async def test_idempotent_event_id_short_circuits():
        """Second delivery of same event.id returns ignored=duplicate (Pitfall 6)."""
        # Use direct handler invocation with a mocked db.execute that returns an existing StripeWebhookEvent
        # First call: returns None → proceeds. Second call: returns existing → short-circuit.
        # Assert no Payment mutation between the two.

    async def test_signature_verify_rejected_modifies_no_state():
        """Mangled signature → 403; no DB writes happen (Pitfall 1)."""

    async def test_monotonic_status_does_not_downgrade():
        """charge.refunded event for Payment already in succeeded → upgrades to refunded.
           payment_intent.processing event for Payment already in succeeded → does NOT downgrade."""
        from backend.api.routes.webhooks import _can_advance
        assert _can_advance("pending", "succeeded") is True
        assert _can_advance("succeeded", "processing") is False
        assert _can_advance("succeeded", "refunded") is True
        assert _can_advance("succeeded", "failed") is True   # failure always wins for visibility
        assert _can_advance("refunded", "pending") is False
    ```

    **E. Replace `backend/tests/test_admin_payment_config.py`:**

    ```python
    """POS-08 — Stripe key encrypted at rest (ciphertext prefix gAAAA)."""
    import pytest
    from unittest.mock import MagicMock, AsyncMock
    from uuid import uuid4
    from cryptography.fernet import Fernet

    pytestmark = pytest.mark.asyncio

    @pytest.fixture(autouse=True)
    def _set_fernet_key(monkeypatch):
        from backend.core import config
        monkeypatch.setattr(config.settings, "PAYMENTS_FERNET_KEY", Fernet.generate_key().decode())
        monkeypatch.setattr(config.settings, "PAYMENTS_FERNET_KEY_PREVIOUS", "")

    async def test_update_encrypts_secret_before_persistence():
        from backend.api.routes.admin_payment_config import update_payment_config
        from backend.schemas.sales import PaymentConfigUpdate
        tenant = MagicMock()
        tenant.id = uuid4()
        tenant.stripe_publishable_key = None
        tenant.stripe_secret_key_encrypted = None
        tenant.stripe_webhook_secret_encrypted = None
        tenant.sales_tax_rate = 0.0725

        db = AsyncMock()
        db.get = AsyncMock(return_value=tenant)
        ctx = MagicMock(tenant_id=tenant.id)

        with patch("backend.api.routes.admin_payment_config.resolve_staff", new_callable=AsyncMock) as rs, \
             patch("backend.api.routes.admin_payment_config.log_action", new_callable=AsyncMock):
            rs.return_value = None
            body = PaymentConfigUpdate(
                stripePublishableKey="pk_test_abc123",
                stripeSecretKey="sk_test_xyz789",
                stripeWebhookSecret="whsec_signing456",
            )
            await update_payment_config(body, ctx=ctx, db=db)

        # Plain key stored as-is
        assert tenant.stripe_publishable_key == "pk_test_abc123"
        # Secret + webhook secret encrypted (Fernet ciphertext starts with gAAAA)
        assert tenant.stripe_secret_key_encrypted.startswith("gAAAA"), \
            f"Secret was not encrypted! Got: {tenant.stripe_secret_key_encrypted[:30]}"
        assert tenant.stripe_webhook_secret_encrypted.startswith("gAAAA")
        # Decrypts back round-trip
        from backend.services.payments.crypto import decrypt_secret
        assert decrypt_secret(tenant.stripe_secret_key_encrypted) == "sk_test_xyz789"

    async def test_invalid_key_format_rejected():
        from backend.api.routes.admin_payment_config import update_payment_config
        from backend.schemas.sales import PaymentConfigUpdate
        from fastapi import HTTPException
        tenant = MagicMock()
        tenant.id = uuid4()
        tenant.sales_tax_rate = 0.0725
        db = AsyncMock()
        db.get = AsyncMock(return_value=tenant)
        ctx = MagicMock(tenant_id=tenant.id)
        body = PaymentConfigUpdate(stripeSecretKey="not_a_real_key")
        with pytest.raises(HTTPException) as ei:
            await update_payment_config(body, ctx=ctx, db=db)
        assert ei.value.status_code == 400
    ```
  </action>
  <verify>
    <automated>cd backend && pytest tests/test_webhooks_stripe.py tests/test_admin_payment_config.py -v && python -c "from backend.api.routes.webhooks import stripe_webhook, _can_advance, _STRIPE_EVENT_TO_PAYMENT_STATUS; from backend.api.routes.admin_payment_config import router; print('ok')"</automated>
  </verify>
  <acceptance_criteria>
    - `pytest backend/tests/test_webhooks_stripe.py -v` passes (monotonic priority + idempotency tests)
    - `pytest backend/tests/test_admin_payment_config.py -v` passes (encrypt-on-write asserts ciphertext prefix `gAAAA`)
    - `grep -c "construct_event\|verify_webhook_signature" backend/api/routes/webhooks.py` returns >= 1
    - `grep -c "StripeWebhookEvent" backend/api/routes/webhooks.py` returns >= 1 (idempotency table referenced)
    - `grep -c "request\\.body()" backend/api/routes/webhooks.py` returns >= 1 (raw bytes; not request.json())
    - `grep -c "request\\.json()" backend/api/routes/webhooks.py` should NOT increase from existing Twilio/Postmark count — Stripe MUST use request.body()
    - `grep -c "encrypt_secret" backend/api/routes/admin_payment_config.py` returns >= 2 (secret + webhook secret encrypted)
    - `grep -c "MANAGE_PAYMENT_CONFIG" backend/api/routes/admin_payment_config.py` returns >= 1
    - `grep -c "STRIPE_KEYS_UPDATED" backend/api/routes/admin_payment_config.py` returns >= 1
    - `grep -c "include_router(admin_payment_config" backend/main.py` returns >= 1
  </acceptance_criteria>
  <done>Stripe webhook handler + admin config endpoint live; secrets encrypted at rest; webhook idempotent + monotonic.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: 19 Next.js BFF route files — proxyToFastAPI for JSON, raw fetch + arrayBuffer for PDF Blobs, raw text() forward for webhook</name>
  <files>app/api/sales/route.ts, app/api/sales/[saleId]/route.ts, app/api/sales/[saleId]/lines/route.ts, app/api/sales/[saleId]/lines/[lineId]/route.ts, app/api/sales/[saleId]/payments/route.ts, app/api/sales/[saleId]/payments/stripe-confirm/route.ts, app/api/sales/[saleId]/payments/[paymentId]/route.ts, app/api/sales/[saleId]/close/route.ts, app/api/sales/[saleId]/receipt/route.ts, app/api/sales/[saleId]/receipt/email/route.ts, app/api/sales/[saleId]/refunds/route.ts, app/api/refunds/route.ts, app/api/refunds/[refundId]/route.ts, app/api/refunds/[refundId]/receipt/route.ts, app/api/pos/daily-close/route.ts, app/api/pos/daily-close/[runId]/export/route.ts, app/api/admin/payment-config/route.ts, app/api/webhooks/stripe/route.ts</files>
  <read_first>
    - lib/bff.ts (proxyToFastAPI signature — confirm trailing-slash handling)
    - app/api/webhooks/twilio/route.ts (FULL FILE — clone Stripe webhook BFF passthrough)
    - app/api/optical-orders/[orderId]/job-ticket/route.ts (FULL FILE — clone PDF Blob arrayBuffer pattern)
    - app/api/optical-orders/route.ts + app/api/optical-orders/[orderId]/route.ts (clone Promise<{ params }> async params pattern from Phase 13)
    - middleware.ts (confirm /api/webhooks/* allowlist — should already cover /api/webhooks/stripe from Phase 12)
  </read_first>
  <action>
    19 files. All follow ONE of three patterns based on the table below.

    **Pattern A: proxyToFastAPI (JSON)** — 14 routes:

    | BFF Path | FastAPI URL (trailing slash MANDATORY) | Methods |
    |---|---|---|
    | `app/api/sales/route.ts` | `/api/sales/` | GET, POST |
    | `app/api/sales/[saleId]/route.ts` | `/api/sales/{saleId}/` | GET, PATCH, DELETE |
    | `app/api/sales/[saleId]/lines/route.ts` | `/api/sales/{saleId}/lines/` | POST |
    | `app/api/sales/[saleId]/lines/[lineId]/route.ts` | `/api/sales/{saleId}/lines/{lineId}/` | PATCH, DELETE |
    | `app/api/sales/[saleId]/payments/route.ts` | `/api/sales/{saleId}/payments/` | POST |
    | `app/api/sales/[saleId]/payments/stripe-confirm/route.ts` | `/api/sales/{saleId}/payments/stripe-confirm/` | POST |
    | `app/api/sales/[saleId]/payments/[paymentId]/route.ts` | `/api/sales/{saleId}/payments/{paymentId}/` | DELETE |
    | `app/api/sales/[saleId]/close/route.ts` | `/api/sales/{saleId}/close/` | POST |
    | `app/api/sales/[saleId]/refunds/route.ts` | `/api/sales/{saleId}/refunds/` | GET |
    | `app/api/refunds/route.ts` | `/api/refunds/?sale_id=...` | POST |
    | `app/api/refunds/[refundId]/route.ts` | `/api/refunds/{refundId}/` | GET |
    | `app/api/pos/daily-close/route.ts` | `/api/pos/daily-close/` (query passthrough) | GET, POST |
    | `app/api/admin/payment-config/route.ts` | `/api/admin/payment-config/` | GET, PUT |
    | `app/api/sales/[saleId]/receipt/email/route.ts` | `/api/sales/{saleId}/receipt/email/` | POST |

    Template (use this shape exactly, per Phase 13/14 convention):
    ```typescript
    import { proxyToFastAPI } from '@/lib/bff';

    export async function GET(req: Request, ctx: { params: Promise<{ saleId: string }> }) {
      const { saleId } = await ctx.params;
      const url = new URL(req.url);
      const qs = url.search;
      return proxyToFastAPI(req, `/api/sales/${saleId}/${qs}`);
    }
    export async function PATCH(req: Request, ctx: { params: Promise<{ saleId: string }> }) {
      const { saleId } = await ctx.params;
      return proxyToFastAPI(req, `/api/sales/${saleId}/`);
    }
    export async function DELETE(req: Request, ctx: { params: Promise<{ saleId: string }> }) {
      const { saleId } = await ctx.params;
      return proxyToFastAPI(req, `/api/sales/${saleId}/`);
    }
    ```
    For routes WITHOUT dynamic params, signature is `(req: Request)` with no ctx. For routes with query params (sales list, daily-close), forward `req.url`'s search via `url.search` appended to upstream URL.

    **Pattern B: Raw fetch + arrayBuffer (PDF Blob)** — 3 routes:

    | BFF Path | FastAPI URL | Methods |
    |---|---|---|
    | `app/api/sales/[saleId]/receipt/route.ts` | `/api/sales/{saleId}/receipt/` | GET |
    | `app/api/refunds/[refundId]/receipt/route.ts` | `/api/refunds/{refundId}/receipt/` | GET |
    | `app/api/pos/daily-close/[runId]/export/route.ts` | `/api/pos/daily-close/{runId}/export/?format=pdf|csv` | GET |

    Template (clone job-ticket BFF pattern):
    ```typescript
    import { getServerAuthHeaders } from '@/lib/bff';

    const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:8000';

    export async function GET(req: Request, ctx: { params: Promise<{ saleId: string }> }) {
      const { saleId } = await ctx.params;
      const headers = await getServerAuthHeaders();
      const upstream = await fetch(`${BACKEND_URL}/api/sales/${saleId}/receipt/`, { headers });
      if (!upstream.ok) {
        return new Response(await upstream.text(), { status: upstream.status });
      }
      const buf = await upstream.arrayBuffer();
      return new Response(buf, {
        status: upstream.status,
        headers: {
          'Content-Type': upstream.headers.get('Content-Type') ?? 'application/pdf',
          'Content-Disposition': upstream.headers.get('Content-Disposition') ?? 'inline',
        },
      });
    }
    ```
    For `/pos/daily-close/[runId]/export/`, propagate `?format=pdf|csv` to upstream and set Content-Type accordingly (use the upstream's header — same template works).

    **Pattern C: Raw text forward (Webhook)** — 1 route:

    `app/api/webhooks/stripe/route.ts`:
    ```typescript
    import { sealForBody } from '@/lib/webhook-seal';   // Phase 12 helper — confirm path

    const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:8000';

    export async function POST(req: Request) {
      // RAW BYTES — never JSON.parse (Pitfall 1)
      const body = await req.text();
      const seal = sealForBody(body);
      const upstream = await fetch(`${BACKEND_URL}/api/webhooks/stripe/`, {
        method: 'POST',
        headers: {
          'X-Webhook-Internal': seal,
          'Stripe-Signature': req.headers.get('Stripe-Signature') ?? '',
          'Content-Type': req.headers.get('Content-Type') ?? 'application/json',
        },
        body,
      });
      const text = await upstream.text();
      return new Response(text, {
        status: upstream.status,
        headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json' },
      });
    }
    ```
  </action>
  <verify>
    <automated>npx tsc --noEmit && find app/api/sales app/api/refunds app/api/pos app/api/admin/payment-config app/api/webhooks/stripe -name "route.ts" | wc -l</automated>
  </verify>
  <acceptance_criteria>
    - `npx tsc --noEmit` exits 0
    - 19 BFF route.ts files exist at the exact paths listed in files_modified
    - `grep -rn "proxyToFastAPI" app/api/sales app/api/refunds app/api/pos app/api/admin/payment-config 2>/dev/null | wc -l` returns >= 14
    - `grep -rn "arrayBuffer" app/api/sales/\[saleId\]/receipt app/api/refunds/\[refundId\]/receipt app/api/pos/daily-close/\[runId\]/export 2>/dev/null | wc -l` returns >= 3
    - `grep -c "request.text()\|req.text()" app/api/webhooks/stripe/route.ts` returns >= 1 (raw body forwarded)
    - `grep -c "request.json()\|req.json()" app/api/webhooks/stripe/route.ts` returns 0 — webhook MUST forward raw body
    - `grep -rn "Promise<{ " app/api/sales/\[saleId\] | wc -l` returns >= 5 (async params pattern from Phase 13)
    - All upstream URLs end with `/` (trailing slash) — `grep -rn "fetch.*\${BACKEND_URL}.*[^/]'" app/api/sales app/api/refunds app/api/pos app/api/webhooks/stripe | wc -l` returns 0 (no missing trailing slashes in raw fetch calls)
    - `grep -c "'/api/sales/\${saleId}/receipt/'" app/api/sales/\[saleId\]/receipt/route.ts` returns >= 1 (correct trailing-slash URL)
  </acceptance_criteria>
  <done>BFF layer complete; type-checks; 14 JSON proxies + 3 PDF Blob streams + 1 raw-body webhook.</done>
</task>

</tasks>

<verification>
- Webhook handler signature-verifies + idempotency-guards + monotonic-updates
- Admin endpoint encrypts secrets before persistence
- BFF layer: 14 JSON + 3 Blob + 1 raw-body webhook
- tsc clean
</verification>

<success_criteria>
Webhook + admin BE + BFF layer complete. POS backend surface is fully exposed for FE consumption.
</success_criteria>

<output>
After completion, create `.planning/phases/15-point-of-sale/15-08-SUMMARY.md`
</output>
