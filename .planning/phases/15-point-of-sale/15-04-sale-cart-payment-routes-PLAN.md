---
phase: 15-point-of-sale
plan: 04
type: execute
wave: 4
depends_on: [15-02, 15-03]
files_modified:
  - backend/api/routes/sales.py
  - backend/api/routes/sale_payments.py
  - backend/main.py
  - backend/services/sale_lifecycle.py
autonomous: true
requirements: [POS-01, POS-02, POS-06, POS-11, POS-12, POS-13, POS-15]

must_haves:
  truths:
    - "POST /api/sales/ creates an open Sale, optionally with prefill items, primary-TXN audit SALE_CREATE"
    - "PATCH /api/sales/{id}/lines/{lineId}/ accepts qty/unit_price/discount/discount_reason/taxable; recomputes totals; audits SALE_DISCOUNT_APPLIED when discount changes"
    - "POST /api/sales/{id}/payments/ records cash/external_card/write_off ledger payments inline; for stripe_card creates PaymentIntent and returns clientSecret"
    - "POST /api/sales/{id}/payments/stripe-confirm/ re-fetches PaymentIntent via stripe.PaymentIntent.retrieve (server-authoritative, Pitfall 2), writes succeeded Payment"
    - "POST /api/sales/{id}/close/ moves open→paid only when remaining<=0; row-locks involved Products and decrements stock with InventoryTransaction(reason='sale_placed'); writes SALE_PAID audit — all single db.commit()"
    - "Write-off enforces RECORD_WRITE_OFF permission + non-empty reason_note (POS-11)"
    - "Discount enforces non-empty discount_reason (POS-15)"
    - "All routes gated on Entitlement.RETAIL_POS + ClinicalAction.OPEN_POS"
    - "Decimal arithmetic exclusively via backend.services.money helpers"
  artifacts:
    - path: "backend/api/routes/sales.py"
      provides: "POST/GET/PATCH/DELETE for sales + lines + close"
      contains: "router = APIRouter"
    - path: "backend/api/routes/sale_payments.py"
      provides: "POST payments + stripe-confirm"
      contains: "stripe-confirm"
    - path: "backend/services/sale_lifecycle.py"
      provides: "close_sale(), record_payment(), maybe_dispense_optical_orders()"
      contains: "async def close_sale"
    - path: "backend/main.py"
      provides: "Router registration"
      contains: "include_router(sales"
  key_links:
    - from: "POST /sales/{id}/close/"
      to: "Product.stock_qty with_for_update + InventoryTransaction"
      via: "primary-TXN clone of optical_order.place (Pitfall 3)"
      pattern: "with_for_update"
    - from: "POST /payments/stripe-confirm/"
      to: "stripe.PaymentIntent.retrieve"
      via: "StripeProcessor.confirm_payment (server-authoritative)"
      pattern: "confirm_payment"
    - from: "Discount path"
      to: "log_action(SALE_DISCOUNT_APPLIED)"
      via: "audit in same commit as line update"
      pattern: "SALE_DISCOUNT_APPLIED"
---

<objective>
Backend route layer: list / open / get / patch / void Sale; add / patch / delete line items; record payments (cash/external_card/write_off inline, stripe_card via PaymentIntent + confirm); close sale (the financial-and-inventory commit point). All transactional with primary-TXN audit per `.claude/rules/clinical-safety.md`.

Purpose: deliver the BE half of POS-01..POS-15 covering everything except refunds (Plan 15-05), receipts (15-06), daily-close (15-07), webhook (15-08), and admin config (15-08).

Output: BE routes registered in `main.py` and exercisable via direct-handler tests; Wave-0 test_payment_cash, test_payment_writeoff, test_split_tender (close gate path) tests green.
</objective>

<execution_context>
@C:/Users/duytr/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/duytr/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/15-point-of-sale/15-CONTEXT.md
@.planning/phases/15-point-of-sale/15-RESEARCH.md
@backend/api/routes/optical_order.py
@backend/api/routes/inventory.py
@backend/api/routes/billing.py
@backend/core/audit.py
@backend/core/permissions.py
@backend/core/security.py
@backend/core/entitlements.py
@backend/main.py

<interfaces>
<!-- Existing route patterns -->
```python
# backend/api/routes/optical_order.py — clone shape:
router = APIRouter(
    prefix="/api/optical-orders",
    tags=["optical-orders"],
    dependencies=[Depends(require_entitlement(Entitlement.RETAIL_POS))],
)

# Get tenant context from JWT:
from backend.core.security import TenantContext, get_tenant_context, resolve_staff
from backend.core.permissions import require_permission, ClinicalAction
from backend.core.entitlements import require_entitlement, Entitlement
from backend.core.audit import log_action, AuditAction

# Primary-TXN pattern:
async def _route(ctx: TenantContext = Depends(get_tenant_context), db: AsyncSession = Depends(get_db)):
    staff = await resolve_staff(ctx, db)
    # ... business logic ...
    db.add(thing)
    await log_action(db, ctx, AuditAction.X, "entity", entity_id, staff_id=..., patient_id=..., metadata={...})
    await db.commit()
    return response
```

<!-- with_for_update pattern from optical_order.place handler -->
```python
product = (await db.execute(
    select(Product).where(Product.id == product_id).with_for_update()
)).scalar_one()
product.stock_qty -= qty
db.add(InventoryTransaction(reason='sale_placed', delta=-qty, ...))
```

<!-- StripeProcessor from Plan 15-02 -->
```python
from backend.services.payments.base import get_processor, PaymentProcessorError
processor = get_processor("stripe")
intent = await processor.create_payment_intent(tenant, amount, "usd", {"sale_id": str(sale.id)})
confirmed = await processor.confirm_payment(tenant, payment_intent_id)
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: backend/api/routes/sales.py — list/open/get/patch/void Sale + add/patch/delete lines + close-sale handler (with stock decrement + optional optical-order dispense flip)</name>
  <files>backend/api/routes/sales.py, backend/services/sale_lifecycle.py, backend/main.py</files>
  <read_first>
    - backend/api/routes/optical_order.py (FULL FILE — clone the place handler structure for close_sale; clone the cancel handler restock pattern; mirror with_for_update + InventoryTransaction(reason='sale_placed') wiring; copy the entitlement+permission decorator shape)
    - backend/api/routes/inventory.py (clone list/CRUD route shape)
    - backend/core/audit.py (log_action signature)
    - backend/core/security.py (TenantContext, resolve_staff)
    - backend/db/models/tenant/clinical.py (Sale, SaleLineItem, Payment, Product, OpticalOrder, OpticalOrderLineItem, InventoryTransaction ORMs)
    - backend/main.py (router registration pattern — find existing include_router calls)
    - backend/services/sale_lifecycle.py (extend, do not rewrite — add close_sale, _maybe_dispense_optical_orders, _generate_receipt_number, record_line_audit_if_discount)
    - .planning/phases/15-point-of-sale/15-RESEARCH.md §Pattern 4 (Sale Lifecycle primary TXN) + §Pitfall 3 (concurrency) + §Pitfall 7 (orphan PaymentIntent) + §Pitfall 8 (receipt-before-commit)
  </read_first>
  <action>
    Three concrete files.

    **A. `backend/api/routes/sales.py`** — new file. Routes (all under `/api/sales`):

    1. `GET /` — list sales filtered by `patient_id`, `status`, `date_from`, `date_to`; pagination via `limit` (default 50, max 200) and `offset`. Eager-load lines/payments/refunds via selectinload. Returns `list[SaleResponse]` with `remaining` computed.

    2. `POST /` — open new Sale. Body: `SaleCreate`. Server creates Sale(status='open', tenant_id=ctx.tenant_id, patient_id=body.patient_id, created_by_id=staff.id, opened_at=now()). For each `prefill` item, call prefill_from_superbill or prefill_from_optical_order from Plan 15-03. After all prefills, recompute totals via compute_sale_totals(sale.lines, tenant.sales_tax_rate) and persist. Audit SALE_CREATE then SALE_OPENED. Single commit.

    3. `GET /{id}/` — fetch single sale with lines/payments/refunds + remaining.

    4. `PATCH /{id}/` — update notes only while status=open. Body: subset of `SaleCreate`.

    5. `DELETE /{id}/` — void open sale (must have no payments). Sets status='voided'. Audit SALE_VOIDED. Returns 409 if any Payment row exists.

    6. `POST /{id}/lines/` — add SaleLineItem to open sale. Body: `SaleLineItemCreate`. Computes `line_total = qty * unit_price - discount_amount` (quantize_money). Validates discount_reason non-empty when discount_amount > 0 (POS-15) — else 400 with `{detail: "discount_reason required when applying discount"}`. Audit SALE_DISCOUNT_APPLIED when discount_amount > 0. Recompute sale totals + persist. Single commit. Returns updated SaleResponse.

    7. `PATCH /{id}/lines/{line_id}/` — update qty/unit_price/discount/discount_reason/taxable. Same validation + audit. Recompute totals.

    8. `DELETE /{id}/lines/{line_id}/` — remove line. Audit (use SALE_OPENED.value or a generic edit audit — pick existing pattern from billing.py for line removal). Recompute totals.

    9. `POST /{id}/close/` — THE key transactional handler. Steps:
       - Load sale with selectinload lines + payments. 409 if status != 'open'.
       - Compute remaining; 409 if remaining > 0 with message "Sale can't close — $X.XX still owed".
       - Compute totals (defensive). Persist.
       - For each line where source_type in {'product', 'optical_order'}: row-lock Product via `select(Product).where(Product.id == ...).with_for_update()` and decrement stock_qty; write `InventoryTransaction(tenant_id, product_id, delta=-qty, reason='sale_placed', staff_id=staff.id, sale_id=sale.id)` (NB: InventoryTransaction may need `sale_id` column — check Phase 13 schema; if missing, store reference via `reason_metadata_jsonb` or skip the FK and only audit via log_action). For source_type='optical_order': resolve product_id via OpticalOrderLineItem.product_id; if multiple lines share the same OpticalOrder, mark order.status='dispensed' if cart toggle indicated (read from sale.notes or a dedicated `dispense_optical_on_close` field — for Phase 15 use a request-body flag `markDispensed: true`).
       - Even on zero stock, write the InventoryTransaction (soft-block warning per Phase 13 — log a `zero_stock` audit metadata flag); never 4xx.
       - Generate `receipt_number = "R-{YYYYMMDD}-{NNNN}"` where NNNN = `LPAD(count(Sale where tenant=ctx.tenant_id AND date(closed_at)=today AND receipt_number IS NOT NULL) + 1, 4, '0')`. Set sale.receipt_number, sale.closed_at = now(), sale.status='paid'.
       - log_action SALE_PAID with metadata `{receipt_number, total, payment_count}`.
       - Single db.commit() at end.
       - Return SaleResponse.

    **B. Extend `backend/services/sale_lifecycle.py`** with helpers used by close handler:

    ```python
    async def maybe_dispense_optical_orders(
        db: AsyncSession, ctx: TenantContext, sale: Sale, mark_dispensed: bool,
    ) -> list[OpticalOrder]:
        """When the cart contained optical_order lines and staff opted to mark dispensed
        at payment time (CONTEXT §A), flip OpticalOrder.status placed→dispensed.
        Returns list of dispensed orders for audit metadata.
        """
        if not mark_dispensed:
            return []
        order_ids = {li.source_id for li in sale.lines if li.source_type == "optical_order" and li.source_id}
        dispensed = []
        for oid in order_ids:
            order = (await db.execute(
                select(OpticalOrder).where(OpticalOrder.id == oid)
            )).scalar_one_or_none()
            if order and order.status == "placed":
                order.status = "dispensed"
                order.dispensed_at = datetime.now(timezone.utc)
                dispensed.append(order)
                await log_action(
                    db, ctx, AuditAction.OPTICAL_ORDER_DISPENSE, "optical_order", order.id,
                    metadata={"via_sale_id": str(sale.id)},
                )
        return dispensed

    async def generate_receipt_number(db: AsyncSession, tenant_id: UUID) -> str:
        from datetime import date
        today = date.today()
        count = (await db.execute(
            select(func.count(Sale.id)).where(
                Sale.tenant_id == tenant_id,
                func.date(Sale.closed_at) == today,
                Sale.receipt_number.isnot(None),
            )
        )).scalar_one()
        return f"R-{today.strftime('%Y%m%d')}-{count + 1:04d}"
    ```

    **C. `backend/main.py`** — register the router:
    ```python
    from backend.api.routes.sales import router as sales_router
    app.include_router(sales_router)
    ```
    Insert near other Phase 13 router registrations.
  </action>
  <verify>
    <automated>cd backend && python -c "from backend.api.routes.sales import router; print([r.path for r in router.routes])" && python -c "from backend.services.sale_lifecycle import close_sale, maybe_dispense_optical_orders, generate_receipt_number, compute_sale_totals, compute_remaining, prefill_from_superbill, prefill_from_optical_order; print('ok')" && pytest tests/test_split_tender.py tests/test_payment_writeoff.py -v</automated>
  </verify>
  <acceptance_criteria>
    - `backend/api/routes/sales.py` exists with `router = APIRouter(prefix="/api/sales", tags=["sales"], dependencies=[Depends(require_entitlement(Entitlement.RETAIL_POS))])`
    - `grep -c "with_for_update" backend/api/routes/sales.py backend/services/sale_lifecycle.py` returns >= 1
    - `grep -c "InventoryTransaction" backend/api/routes/sales.py backend/services/sale_lifecycle.py` returns >= 1
    - `grep -c "log_action.*SALE_PAID\|AuditAction.SALE_PAID" backend/api/routes/sales.py backend/services/sale_lifecycle.py` returns >= 1
    - `grep -c "log_action.*SALE_DISCOUNT_APPLIED\|AuditAction.SALE_DISCOUNT_APPLIED" backend/api/routes/sales.py` returns >= 1
    - `grep -c "log_action.*SALE_VOIDED\|AuditAction.SALE_VOIDED" backend/api/routes/sales.py` returns >= 1
    - `grep -c "log_action.*SALE_CREATE\|AuditAction.SALE_CREATE" backend/api/routes/sales.py` returns >= 1
    - `grep -c "compute_remaining" backend/api/routes/sales.py` returns >= 1
    - `grep -c "discount_reason required" backend/api/routes/sales.py` returns >= 1
    - `grep -c "include_router(sales_router\|sales\\.router\|sales_router" backend/main.py` returns >= 1
    - `grep -c "receipt_number" backend/api/routes/sales.py backend/services/sale_lifecycle.py` returns >= 2 (set + helper)
    - `python -c "from backend.api.routes.sales import router; assert any(r.path.endswith('/close/') for r in router.routes); assert any(r.path.endswith('/lines/') for r in router.routes); print('ok')"` exits 0
  </acceptance_criteria>
  <done>Sales lifecycle routes ready; close-sale handler row-locks + decrements + audits in primary TXN; discount/void/line CRUD wired.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: backend/api/routes/sale_payments.py — POST payments (cash/external_card/write_off inline; stripe_card creates PaymentIntent) + POST stripe-confirm + write-off permission gate + DELETE pending payment</name>
  <files>backend/api/routes/sale_payments.py, backend/main.py</files>
  <read_first>
    - backend/api/routes/sales.py (Task 1 result — confirm router prefix; this file uses prefix `/api/sales` too but on sub-paths)
    - backend/api/routes/optical_order.py (entitlement + permission decorator patterns)
    - backend/core/permissions.py (ClinicalAction enum, require_permission)
    - backend/services/payments/base.py + stripe_processor.py (Plan 15-02 output)
    - backend/tests/test_payment_cash.py + test_payment_writeoff.py + test_stripe_processor.py (Wave-0)
    - .planning/phases/15-point-of-sale/15-RESEARCH.md §Pitfall 2 (re-fetch via retrieve, never trust client status) + §Pitfall 7 (cancel orphan intents)
    - .planning/phases/15-point-of-sale/15-CONTEXT.md §C (payment methods spec)
  </read_first>
  <action>
    **A. `backend/api/routes/sale_payments.py`** — new file:

    Routes (all under `/api/sales/{sale_id}/payments`):

    1. `POST /` — Body: `PaymentCreate`. Behavior depends on `method`:

       - **`cash`**: validate `tendered >= amount` (400 if not). Compute `change_due = tendered - amount`. Insert Payment(method='cash', status='succeeded', amount, tendered, change_due, created_by_id=staff.id). Audit PAYMENT_RECORDED.

       - **`external_card`**: validate `last4` (4 digits) and `auth_code` if provided. Insert Payment(method='external_card', status='succeeded', last4, auth_code, ...). Audit PAYMENT_RECORDED.

       - **`write_off`**: gate on `require_permission(ClinicalAction.RECORD_WRITE_OFF)` (OWNER+ADMIN only — 403 for technician/receptionist). Validate `reason_note` non-empty (400 if missing or empty). Insert Payment(method='write_off', status='succeeded', reason_note). Audit WRITE_OFF_RECORDED.

       - **`stripe_card`**: load Tenant. Call `processor = get_processor('stripe'); intent = await processor.create_payment_intent(tenant, amount, 'usd', {'sale_id': str(sale.id), 'patient_id': str(sale.patient_id) if sale.patient_id else None})`. Insert Payment(method='stripe_card', status='pending', amount, processor_payment_id=intent.intent_id, created_by_id=staff.id). Audit PAYMENT_RECORDED with metadata `{intent_id, status='pending'}`. Return `StripeIntentResponse(payment_id, client_secret=intent.client_secret, publishable_key=tenant.stripe_publishable_key, intent_id=intent.intent_id)`.

       All branches gated on `require_entitlement(Entitlement.RETAIL_POS)` + `require_permission(ClinicalAction.RECORD_PAYMENT)` (except write_off which adds RECORD_WRITE_OFF).

       Single commit per call.

    2. `POST /stripe-confirm/` — Body: `StripeConfirmRequest(payment_intent_id)`. Load tenant + Payment(status='pending', processor_payment_id=body.payment_intent_id). Call `await processor.confirm_payment(tenant, body.payment_intent_id)`. Update Payment: status=confirmed.status (map "succeeded"/"failed"/"requires_action"/"processing"/"canceled"), processor_charge_id, last4, card_brand. Audit PAYMENT_RECORDED on succeeded; PAYMENT_FAILED on failed with metadata `{stripe_error: confirmed.failure_reason}`. Single commit. Return updated PaymentResponse.

    3. `DELETE /{payment_id}/` — cancel a pending stripe_card Payment. Calls `stripe.PaymentIntent.cancel()` via a new processor method or directly (acceptable here since processor exposes refund_payment, not cancel — add `cancel_intent()` to PaymentProcessor Protocol as an OPTIONAL method; or accept TODO + call directly with a comment "Pitfall 7 mitigation — extend Protocol if more processors added"). Sets Payment.status='canceled'. Audit PAYMENT_FAILED with reason `staff_canceled`.

    **B. Register router in `backend/main.py`:**
    ```python
    from backend.api.routes.sale_payments import router as sale_payments_router
    app.include_router(sale_payments_router)
    ```

    **C. Replace skip-stub bodies in `backend/tests/test_payment_cash.py` and `backend/tests/test_payment_writeoff.py`:**

    `test_payment_cash.py`:
    ```python
    import pytest
    from decimal import Decimal
    from unittest.mock import MagicMock, AsyncMock
    from uuid import uuid4

    pytestmark = pytest.mark.asyncio

    async def test_cash_change_due_computed(sale_factory, payment_factory, db_session, tenant_context):
        from backend.api.routes.sale_payments import _record_cash_payment  # name from impl; if private, import via module
        # OR test via direct call to a helper that wraps the cash branch
        # ... real assertion: tendered $50 on $30 amount → change_due $20

    async def test_cash_tendered_below_amount_400():
        from backend.api.routes.sale_payments import _record_cash_payment
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as ei:
            await _record_cash_payment(MagicMock(amount=Decimal("30"), tendered=Decimal("20")), MagicMock(), MagicMock(), MagicMock(), MagicMock())
        assert ei.value.status_code == 400
    ```

    `test_payment_writeoff.py`:
    ```python
    import pytest
    from unittest.mock import MagicMock

    pytestmark = pytest.mark.asyncio

    async def test_writeoff_reason_required():
        from backend.api.routes.sale_payments import _record_writeoff
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as ei:
            await _record_writeoff(MagicMock(reason_note=None, amount=Decimal("100")), MagicMock(), MagicMock(), MagicMock(), MagicMock())
        assert ei.value.status_code == 400
        assert "reason" in ei.value.detail.lower()

    async def test_writeoff_empty_reason_400():
        from backend.api.routes.sale_payments import _record_writeoff
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as ei:
            await _record_writeoff(MagicMock(reason_note="   ", amount=Decimal("100")), MagicMock(), MagicMock(), MagicMock(), MagicMock())
        assert ei.value.status_code == 400
    ```

    Implementation note: the route handler should DELEGATE to internal `_record_cash_payment` / `_record_external_card` / `_record_writeoff` / `_initiate_stripe_payment` async helpers that take a small set of args, so unit tests don't need full HTTP simulation. This pattern matches Phase 13's optical_order.py `_compute_optical_status` helper extraction.
  </action>
  <verify>
    <automated>cd backend && python -c "from backend.api.routes.sale_payments import router; print([r.path for r in router.routes])" && pytest tests/test_payment_cash.py tests/test_payment_writeoff.py tests/test_stripe_processor.py -v</automated>
  </verify>
  <acceptance_criteria>
    - `backend/api/routes/sale_payments.py` exists with router prefixed `/api/sales/{sale_id}/payments`
    - `grep -c "RECORD_WRITE_OFF" backend/api/routes/sale_payments.py` returns >= 1 (permission gate present)
    - `grep -c "WRITE_OFF_RECORDED" backend/api/routes/sale_payments.py` returns >= 1 (audit on success)
    - `grep -c "PAYMENT_RECORDED\|PAYMENT_FAILED" backend/api/routes/sale_payments.py` returns >= 2 (both success + fail audits)
    - `grep -c "confirm_payment" backend/api/routes/sale_payments.py` returns >= 1 (uses server-authoritative retrieve)
    - `grep -c "tendered" backend/api/routes/sale_payments.py` returns >= 1 (cash branch handles tendered)
    - `grep -c "change_due" backend/api/routes/sale_payments.py` returns >= 1
    - `grep -c "automatic_payment_methods\|payment_method_types" backend/api/routes/sale_payments.py` returns 0 — those are processor internals, route layer doesn't touch them
    - `pytest backend/tests/test_payment_cash.py tests/test_payment_writeoff.py -v` exits 0 with all real tests passing
    - `pytest backend/tests/test_stripe_processor.py -v` still passes (no regression)
    - `grep -c "include_router(sale_payments_router\|sale_payments\\.router" backend/main.py` returns >= 1
  </acceptance_criteria>
  <done>Payment-recording routes + Stripe confirm endpoint live; write-off gated; cash math validated.</done>
</task>

</tasks>

<verification>
- All Sale and Payment routes registered in main.py
- with_for_update + InventoryTransaction at sale close
- Discount/void/write-off audits in primary TXN
- Stripe path returns clientSecret on init, retrieves on confirm
- All Wave-0 tests for cash/write_off/split_tender green
</verification>

<success_criteria>
Backend POS lifecycle complete except refunds/receipts/daily-close/webhook/admin.
</success_criteria>

<output>
After completion, create `.planning/phases/15-point-of-sale/15-04-SUMMARY.md`
</output>
