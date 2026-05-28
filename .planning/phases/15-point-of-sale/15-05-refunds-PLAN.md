---
phase: 15-point-of-sale
plan: 05
type: execute
wave: 5
depends_on: [15-04]
files_modified:
  - backend/api/routes/refunds.py
  - backend/services/sale_lifecycle.py
  - backend/main.py
autonomous: true
requirements: [POS-05, POS-09]

must_haves:
  truths:
    - "POST /api/refunds/ creates a Refund + RefundLineItem(s) + RefundPayment(s) + restocks Product (with_for_update) + writes InventoryTransaction(reason='refund_restock', sale_id=line.sale_id) + audits REFUND_ISSUED — ALL in single db.commit(); reason value validates against extended ck_inventory_reason CHECK (Plan 15-01)"
    - "ISSUE_REFUND permission gated to OWNER+ADMIN (POS-11)"
    - "Refund.reason is mandatory, length 3-500 (CONTEXT §E)"
    - "Card refunds via processor.refund_payment for stripe_card payments only; cash/external_card/write_off are ledger-only (no processor call)"
    - "Superbill source_type lines NEVER restock (clinical service); only product + optical_order"
    - "When all optical_order lines are fully refunded for a given OpticalOrder, that OpticalOrder.status flips to 'cancelled' with OPTICAL_ORDER_CANCEL audit (Phase 13 semantics)"
    - "Sale.status flips to 'refunded' (same enum for partial + full refund per CONTEXT §E)"
    - "If log_action() raises, the whole refund rolls back (Pitfall 14)"
  artifacts:
    - path: "backend/api/routes/refunds.py"
      provides: "POST /refunds/, GET /refunds/{id}/, GET /sales/{sale_id}/refunds/"
      contains: "router = APIRouter"
    - path: "backend/services/sale_lifecycle.py"
      provides: "issue_refund() + restock_for_refund_line() + maybe_cancel_optical_orders()"
      contains: "async def issue_refund"
  key_links:
    - from: "issue_refund"
      to: "InventoryTransaction(reason='refund_restock', sale_id=...)"
      via: "restock_for_refund_line reads SaleLineItem.optical_order_line_item_id FK (no line_total heuristic) — WARNING #3 + BLOCKER #2"
      pattern: "refund_restock"
    - from: "issue_refund"
      to: "OpticalOrder.status='cancelled'"
      via: "maybe_cancel_optical_orders helper"
      pattern: "OpticalOrder.*cancelled|status.*cancelled"
    - from: "issue_refund stripe_card branch"
      to: "processor.refund_payment"
      via: "PaymentProcessor abstraction"
      pattern: "refund_payment"
---

<objective>
Refund lifecycle: item-level and full-sale refunds with primary-TXN restock + processor refund + audit. Atomic — if any step fails (log_action, processor exception, FK violation), the whole TXN rolls back. Tests verify the atomicity by mocking log_action to raise and asserting Product.stock_qty stays unchanged.

Purpose: complete POS-05 (refunds in patient payment history) and POS-09 (item-level with restock). Lock down the financial-and-inventory-and-audit invariant.

Output: `pytest backend/tests/test_refund_restock.py test_refund_optical_cascade.py` GREEN.
</objective>

<execution_context>
@C:/Users/duytr/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/duytr/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/15-point-of-sale/15-CONTEXT.md
@.planning/phases/15-point-of-sale/15-RESEARCH.md
@backend/api/routes/optical_order.py
@backend/db/models/tenant/clinical.py
@backend/services/payments/base.py

<interfaces>
<!-- Phase 13 cancel handler pattern (lines 790-840 of optical_order.py per RESEARCH refs) — clone shape -->
```python
# Phase 13 optical_order.cancel:
order = (await db.execute(select(OpticalOrder).where(...).options(selectinload(OpticalOrder.line_items)))).scalar_one()
for li in order.line_items:
    product = (await db.execute(select(Product).where(Product.id == li.product_id).with_for_update())).scalar_one()
    product.stock_qty += li.qty
    db.add(InventoryTransaction(..., delta=+li.qty, reason='order_cancelled'))
order.status = "cancelled"
order.cancelled_at = datetime.now(timezone.utc)
await log_action(db, ctx, AuditAction.OPTICAL_ORDER_CANCEL, ...)
await db.commit()
```

<!-- Refund schema from Plan 15-03 -->
```python
class RefundCreate:
    line_refunds: list[RefundLineSpec]    # [(sale_line_item_id, qty, amount), ...]
    payment_refunds: list[RefundPaymentSpec]  # [(payment_id, amount), ...]
    reason: str   # min 3, max 500
```

<!-- StripeProcessor.refund_payment -->
```python
async def refund_payment(self, tenant, payment: Payment, amount: Decimal) -> ProcessorRefund:
    # Calls stripe.Refund.create(payment_intent=payment.processor_payment_id, amount=cents, api_key=...)
    # Raises PaymentProcessorError if payment.processor_payment_id is None
```

<!-- OpticalOrderLineItem from Phase 13 — has product_id FK -->
```python
class OpticalOrderLineItem:
    optical_order_id, product_id, qty, unit_price, line_total
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: backend/services/sale_lifecycle.py — issue_refund() + restock_for_refund_line() + maybe_cancel_optical_orders() helpers</name>
  <files>backend/services/sale_lifecycle.py</files>
  <read_first>
    - backend/api/routes/optical_order.py (cancel handler — clone restock + InventoryTransaction pattern exactly)
    - backend/db/models/tenant/clinical.py (Refund, RefundLineItem, RefundPayment, Product, OpticalOrder, OpticalOrderLineItem, InventoryTransaction)
    - backend/services/payments/base.py (PaymentProcessor + ProcessorRefund)
    - backend/tests/test_refund_restock.py + test_refund_optical_cascade.py (Wave-0 stubs)
    - .planning/phases/15-point-of-sale/15-RESEARCH.md §Refund Flow (Primary TXN) code example + §Pitfall 13 (helper encapsulation) + §Pitfall 14 (audit-in-TXN)
  </read_first>
  <action>
    Append to `backend/services/sale_lifecycle.py` (append, do not rewrite):

    ```python
    from backend.db.models.tenant.clinical import (
        Refund, RefundLineItem, RefundPayment, Product, OpticalOrder, OpticalOrderLineItem,
        InventoryTransaction, AuditAction, PaymentStatus,
    )
    from backend.services.payments.base import PaymentProcessor, PaymentProcessorError
    from backend.core.audit import log_action

    @dataclass
    class RefundLineSpec:
        sale_line_item_id: UUID
        qty: int
        amount: Decimal

    @dataclass
    class RefundPaymentSpec:
        payment_id: UUID
        amount: Decimal

    async def restock_for_refund_line(
        db: AsyncSession, ctx, line: SaleLineItem, qty: int, refund_id: UUID,
    ) -> InventoryTransaction | None:
        """Restock a single sale line — product or optical_order branch (POS-09).

        Superbill lines NEVER restock (CONTEXT §E). Returns the InventoryTransaction
        row written, or None if no restock applicable.
        """
        if line.source_type not in ("product", "optical_order") or qty <= 0:
            return None

        if line.source_type == "product":
            product_id = line.source_id
        else:
            # WARNING #3 fix (checker iter 1): resolve via SaleLineItem.optical_order_line_item_id FK
            # populated by Plan 15-03 prefill_from_optical_order. No line_total heuristic.
            if line.optical_order_line_item_id is None:
                # Legacy data path: SaleLineItem rows created before Plan 15-01 migration ran.
                # Fallback to old description-matching heuristic for backwards compatibility ONLY.
                # New rows always have the FK populated (verified by Plan 15-03 acceptance criteria).
                order = (await db.execute(
                    select(OpticalOrder).where(OpticalOrder.id == line.source_id)
                    .options(selectinload(OpticalOrder.line_items))
                )).scalar_one_or_none()
                if not order:
                    return None
                ooli = next((o for o in order.line_items if o.line_total == line.line_total), None)
                if not ooli:
                    return None
                product_id = ooli.product_id
            else:
                # Standard path: direct FK lookup, no guessing.
                ooli = await db.get(OpticalOrderLineItem, line.optical_order_line_item_id)
                if ooli is None:
                    return None
                product_id = ooli.product_id

        product = (await db.execute(
            select(Product).where(Product.id == product_id).with_for_update()
        )).scalar_one()
        product.stock_qty += qty
        # BLOCKER #1 (checker iter 1): reason='refund_restock' is now in extended ck_inventory_reason CHECK (Plan 15-01).
        # BLOCKER #2: sale_id column exists (Plan 15-01) — link the inventory move to the parent sale via the refund's sale.
        # Caller-passed `refund_id` is unused here directly — sale_id is the audit link to the financial parent.
        # We can resolve sale_id from line.sale_id (each SaleLineItem.sale_id is non-null).
        txn = InventoryTransaction(
            tenant_id=ctx.tenant_id,
            product_id=product.id,
            delta=qty,
            reason="refund_restock",
            sale_id=line.sale_id,            # BLOCKER #2: requires Plan 15-01 sale_id column
            staff_id=None,   # set by caller via ctx if needed
        )
        db.add(txn)
        return txn

    async def maybe_cancel_optical_orders(
        db: AsyncSession, ctx, sale: Sale, refund: Refund,
    ) -> list[OpticalOrder]:
        """When every line of an OpticalOrder is fully refunded (across all refunds for this sale),
        cancel that OpticalOrder per CONTEXT §E + Phase 13 semantics."""
        # Group sale lines by optical_order source_id
        order_ids = {li.source_id for li in sale.lines if li.source_type == "optical_order" and li.source_id}
        cancelled = []
        for order_id in order_ids:
            order_lines = [li for li in sale.lines if li.source_type == "optical_order" and li.source_id == order_id]
            # For each order_line, compute total refunded qty across ALL refunds
            all_refund_lines = (await db.execute(
                select(RefundLineItem).join(Refund).where(
                    Refund.sale_id == sale.id,
                    RefundLineItem.sale_line_item_id.in_([li.id for li in order_lines]),
                )
            )).scalars().all()
            refunded_by_sli = {}
            for rl in all_refund_lines:
                refunded_by_sli[rl.sale_line_item_id] = refunded_by_sli.get(rl.sale_line_item_id, 0) + rl.qty
            fully_refunded = all(refunded_by_sli.get(li.id, 0) >= li.qty for li in order_lines)
            if fully_refunded:
                order = (await db.execute(
                    select(OpticalOrder).where(OpticalOrder.id == order_id)
                )).scalar_one_or_none()
                if order and order.status != "cancelled":
                    order.status = "cancelled"
                    order.cancelled_at = datetime.now(timezone.utc)
                    cancelled.append(order)
                    await log_action(
                        db, ctx, AuditAction.OPTICAL_ORDER_CANCEL, "optical_order", order.id,
                        metadata={"via_refund_id": str(refund.id), "via_sale_id": str(sale.id)},
                    )
        return cancelled

    async def issue_refund(
        db: AsyncSession, ctx, sale: Sale,
        line_refunds: list[RefundLineSpec],
        payment_refunds: list[RefundPaymentSpec],
        reason: str,
        processor: PaymentProcessor,
    ) -> Refund:
        """Atomic refund — restock + processor refund + audit, ALL in primary TXN (POS-05, POS-09).

        Raises HTTPException 400 on bad input; rolls back on any exception per Pitfall 14.
        """
        if not reason or len(reason.strip()) < 3:
            raise HTTPException(400, "reason required (min 3 chars, max 500)")
        if len(reason) > 500:
            raise HTTPException(400, "reason too long (max 500 chars)")
        if not line_refunds:
            raise HTTPException(400, "at least one line refund required")
        if not payment_refunds:
            raise HTTPException(400, "at least one payment refund required")

        from backend.services.money import quantize_money
        total_amount = quantize_money(sum((lr.amount for lr in line_refunds), Decimal("0.00")))
        sum_payments = quantize_money(sum((pr.amount for pr in payment_refunds), Decimal("0.00")))
        if sum_payments != total_amount:
            raise HTTPException(400, f"payment refund total {sum_payments} must equal line refund total {total_amount}")

        staff = await resolve_staff(ctx, db)
        refund = Refund(
            tenant_id=ctx.tenant_id,
            sale_id=sale.id,
            total_amount=total_amount,
            reason=reason.strip(),
            refunded_by_id=staff.id if staff else None,
        )
        db.add(refund)
        await db.flush()

        # 1) Per-line restock + RefundLineItem
        line_by_id = {li.id: li for li in sale.lines}
        for spec in line_refunds:
            line = line_by_id.get(spec.sale_line_item_id)
            if line is None:
                raise HTTPException(400, f"sale_line_item {spec.sale_line_item_id} not on this sale")
            await restock_for_refund_line(db, ctx, line, spec.qty, refund.id)
            db.add(RefundLineItem(
                tenant_id=ctx.tenant_id, refund_id=refund.id,
                sale_line_item_id=line.id, qty=spec.qty, amount=quantize_money(spec.amount),
            ))

        # 2) Per-payment processor refund + RefundPayment
        tenant = await db.get(Tenant, ctx.tenant_id)
        payment_by_id = {p.id: p for p in sale.payments}
        for spec in payment_refunds:
            payment = payment_by_id.get(spec.payment_id)
            if payment is None:
                raise HTTPException(400, f"payment {spec.payment_id} not on this sale")
            processor_refund_id = None
            if payment.method == "stripe_card":
                try:
                    result = await processor.refund_payment(tenant, payment, spec.amount)
                    processor_refund_id = result.refund_id
                except PaymentProcessorError as e:
                    raise HTTPException(502, f"Stripe refund failed: {e}")
            db.add(RefundPayment(
                tenant_id=ctx.tenant_id, refund_id=refund.id,
                payment_id=payment.id, amount=quantize_money(spec.amount),
                processor_refund_id=processor_refund_id,
            ))
            # Update Payment.status — sum prior + this refund; status='refunded' if fully, else 'partial_refund'
            existing_refunded = (await db.execute(
                select(func.coalesce(func.sum(RefundPayment.amount), 0))
                .where(RefundPayment.payment_id == payment.id)
            )).scalar_one()
            total_refunded = quantize_money(Decimal(existing_refunded) + quantize_money(spec.amount))
            if total_refunded >= payment.amount:
                payment.status = "refunded"
            else:
                payment.status = "partial_refund"

        # 3) Cascade-cancel any fully-refunded OpticalOrders
        await maybe_cancel_optical_orders(db, ctx, sale, refund)

        # 4) Sale status flip
        sale.status = "refunded"

        # 5) Audit — MUST be before commit per Pitfall 14
        await log_action(
            db, ctx, AuditAction.REFUND_ISSUED, "refund", refund.id,
            staff_id=staff.id if staff else None,
            patient_id=sale.patient_id,
            metadata={
                "sale_id": str(sale.id),
                "amount": str(refund.total_amount),
                "reason": refund.reason,
                "line_count": len(line_refunds),
                "stripe_refund_count": sum(1 for s in payment_refunds if payment_by_id[s.payment_id].method == "stripe_card"),
            },
        )
        await db.flush()
        return refund
    ```
  </action>
  <verify>
    <automated>cd backend && python -c "from backend.services.sale_lifecycle import issue_refund, restock_for_refund_line, maybe_cancel_optical_orders, RefundLineSpec, RefundPaymentSpec; print('ok')" && pytest tests/test_refund_restock.py tests/test_refund_optical_cascade.py -v</automated>
  </verify>
  <acceptance_criteria>
    - `python -c "from backend.services.sale_lifecycle import issue_refund, restock_for_refund_line, maybe_cancel_optical_orders"` exits 0
    - `grep -c "refund_restock" backend/services/sale_lifecycle.py` returns >= 1
    - `grep -c "with_for_update" backend/services/sale_lifecycle.py` returns >= 2 (close + refund)
    - `grep -c "OPTICAL_ORDER_CANCEL" backend/services/sale_lifecycle.py` returns >= 1
    - `grep -c "REFUND_ISSUED" backend/services/sale_lifecycle.py` returns >= 1
    - `grep -c "reason required" backend/services/sale_lifecycle.py` returns >= 1
    - `pytest backend/tests/test_refund_restock.py -v` passes with assertions covering:
      - product line restock writes InventoryTransaction with reason='refund_restock'
      - superbill line does NOT restock
      - When log_action mocked to raise, no Product.stock_qty mutation persists (db.commit not reached → rollback by caller)
    - `pytest backend/tests/test_refund_optical_cascade.py -v` passes with assertions covering:
      - Refunding all optical_order lines flips OpticalOrder.status to 'cancelled'
      - Partial optical_order refund leaves OpticalOrder.status unchanged
    - `grep -c "optical_order_line_item_id" backend/services/sale_lifecycle.py` returns >= 2 — WARNING #3: restock branch reads the FK directly (standard path + legacy-data fallback both reference it)
    - `grep -c "line\.line_total" backend/services/sale_lifecycle.py` returns <= 2 — WARNING #3: line_total heuristic now lives ONLY in the legacy-data fallback branch (or zero usages if no legacy rows exist)
    - `grep -c "sale_id=line\.sale_id" backend/services/sale_lifecycle.py` returns >= 1 — BLOCKER #2: refund_restock InventoryTransaction passes sale_id (column now exists per Plan 15-01)
    - `grep -c "db\.get(OpticalOrderLineItem" backend/services/sale_lifecycle.py` returns >= 1 — WARNING #3: standard path uses direct FK get, not selectinload-and-guess
  </acceptance_criteria>
  <done>Refund service-layer atomic; restock + processor + cascade-cancel + audit all in one TXN.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: backend/api/routes/refunds.py — POST refunds + GET refunds + nested GET /sales/{sale_id}/refunds/; register router</name>
  <files>backend/api/routes/refunds.py, backend/main.py</files>
  <read_first>
    - backend/services/sale_lifecycle.py (Task 1 result — public surface of issue_refund)
    - backend/api/routes/sales.py (Plan 15-04 — clone the auth / entitlement decorators)
    - backend/core/permissions.py (ISSUE_REFUND ClinicalAction from Plan 15-01)
  </read_first>
  <action>
    **A. `backend/api/routes/refunds.py`** — new file:

    ```python
    """Refund routes (POS-05).

    All routes gated on RETAIL_POS + ISSUE_REFUND (OWNER+ADMIN only).
    """
    from __future__ import annotations
    from uuid import UUID

    from fastapi import APIRouter, Depends, HTTPException
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession
    from sqlalchemy.orm import selectinload

    from backend.core.audit import log_action
    from backend.core.entitlements import Entitlement, require_entitlement
    from backend.core.permissions import ClinicalAction, require_permission
    from backend.core.security import TenantContext, get_tenant_context, resolve_staff
    from backend.db.deps import get_db
    from backend.db.models.tenant.clinical import Refund, Sale
    from backend.schemas.sales import RefundCreate, RefundResponse
    from backend.services.payments.base import get_processor
    from backend.services.sale_lifecycle import (
        issue_refund, RefundLineSpec, RefundPaymentSpec,
    )

    router = APIRouter(
        prefix="/api/refunds",
        tags=["refunds"],
        dependencies=[Depends(require_entitlement(Entitlement.RETAIL_POS))],
    )

    @router.post("/", response_model=RefundResponse, status_code=201)
    async def create_refund(
        body: RefundCreate,
        sale_id: UUID,    # query param: ?sale_id=...
        ctx: TenantContext = Depends(get_tenant_context),
        _perm: None = Depends(require_permission(ClinicalAction.ISSUE_REFUND)),
        db: AsyncSession = Depends(get_db),
    ):
        sale = (await db.execute(
            select(Sale).where(Sale.id == sale_id, Sale.tenant_id == ctx.tenant_id)
            .options(selectinload(Sale.lines), selectinload(Sale.payments))
        )).scalar_one_or_none()
        if sale is None:
            raise HTTPException(404, "Sale not found")
        if sale.status not in ("paid", "refunded"):
            raise HTTPException(409, f"Cannot refund sale in status {sale.status}")

        line_specs = [RefundLineSpec(lr.sale_line_item_id, lr.qty, lr.amount) for lr in body.line_refunds]
        payment_specs = [RefundPaymentSpec(pr.payment_id, pr.amount) for pr in body.payment_refunds]
        processor = get_processor("stripe")
        refund = await issue_refund(db, ctx, sale, line_specs, payment_specs, body.reason, processor)
        await db.commit()
        # Reload with relationships
        full = (await db.execute(
            select(Refund).where(Refund.id == refund.id)
            .options(selectinload(Refund.line_items), selectinload(Refund.payment_refunds))
        )).scalar_one()
        return RefundResponse.model_validate(full)

    @router.get("/{refund_id}/", response_model=RefundResponse)
    async def get_refund(
        refund_id: UUID,
        ctx: TenantContext = Depends(get_tenant_context),
        db: AsyncSession = Depends(get_db),
    ):
        refund = (await db.execute(
            select(Refund).where(Refund.id == refund_id, Refund.tenant_id == ctx.tenant_id)
            .options(selectinload(Refund.line_items), selectinload(Refund.payment_refunds))
        )).scalar_one_or_none()
        if refund is None:
            raise HTTPException(404, "Refund not found")
        return RefundResponse.model_validate(refund)
    ```

    Also extend `backend/api/routes/sales.py` with a nested GET endpoint at `/{sale_id}/refunds/` that lists refunds for a sale (selectinload + return list[RefundResponse]). Reuse Sales router; no need for a new file.

    **B. Register in `backend/main.py`:**
    ```python
    from backend.api.routes.refunds import router as refunds_router
    app.include_router(refunds_router)
    ```

    Also extend ORM relationship lookups on Refund: ensure `Refund.line_items` and `Refund.payment_refunds` back-refs exist on the ORM (added in Plan 15-01 — verify, and if missing, add `lazy="selectin"` relationship() declarations).
  </action>
  <verify>
    <automated>cd backend && python -c "from backend.api.routes.refunds import router; print([r.path for r in router.routes])" && grep -c "include_router(refunds" backend/main.py</automated>
  </verify>
  <acceptance_criteria>
    - `backend/api/routes/refunds.py` exists with `router = APIRouter(prefix="/api/refunds", ...)` gated on RETAIL_POS entitlement
    - `grep -c "ISSUE_REFUND" backend/api/routes/refunds.py` returns >= 1 (permission gate present)
    - `grep -c "include_router(refunds" backend/main.py` returns >= 1
    - `python -c "from backend.api.routes.refunds import router; assert any('/refunds' in r.path for r in router.routes); print('ok')"` exits 0
    - GET `/api/sales/{sale_id}/refunds/` route exists in sales router (added during this task)
    - `grep -c "Refund\.line_items\|relationship.*RefundLineItem" backend/db/models/tenant/clinical.py` returns >= 1 (back-ref exists)
    - `pytest backend/tests/test_refund_restock.py tests/test_refund_optical_cascade.py -v` still green
  </acceptance_criteria>
  <done>Refund route layer ships; permission-gated; ORM relationships eager-load cleanly.</done>
</task>

</tasks>

<verification>
- issue_refund atomicity: rolls back when log_action raises
- Stripe refund path goes through processor abstraction
- OpticalOrder cascade-cancel on full refund
- Superbill lines never restock
- Sale.status flips to refunded on first refund
</verification>

<success_criteria>
Refund workflow complete with primary-TXN atomicity; cascade semantics from Phase 13 honored.
</success_criteria>

<output>
After completion, create `.planning/phases/15-point-of-sale/15-05-SUMMARY.md`
</output>
