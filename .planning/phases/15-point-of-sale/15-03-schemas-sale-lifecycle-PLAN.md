---
phase: 15-point-of-sale
plan: 03
type: execute
wave: 3
depends_on: [15-01]
files_modified:
  - backend/schemas/sales.py
  - backend/services/sale_lifecycle.py
  - backend/services/money.py
  - types/sales.ts
autonomous: true
requirements: [POS-01, POS-06, POS-13, POS-14, POS-15, POS-16]

must_haves:
  truths:
    - "All money math goes through quantize_money(Decimal, ROUND_HALF_EVEN) — no float anywhere"
    - "Sale totals computed as: subtotal = sum(line_total); tax = quantize(taxable_subtotal * tenant.sales_tax_rate); total = subtotal + tax"
    - "prefill_from_superbill derives copay from PatientInsurance.copay_amount when billed_payer_id set, else falls back to Superbill.total_fee"
    - "prefill_from_optical_order creates one SaleLineItem per OpticalOrderLineItem (flat, shared source_id per RESEARCH Open Q 1) AND populates SaleLineItem.optical_order_line_item_id with the OpticalOrderLineItem.id (WARNING #3 fix — Plan 15-05 restock reads this FK directly)"
    - "compute_remaining = sale.total - sum(p.amount where status in {succeeded, partial_refund}) — drives split-tender close gate"
    - "Pydantic SaleResponse + SaleLineItemResponse + PaymentResponse + RefundResponse + DailyCloseResponse all camelize via by_alias=True"
    - "Decimal fields serialize as STRING in JSON (matches TS interface)"
  artifacts:
    - path: "backend/services/money.py"
      provides: "quantize_money + to_stripe_cents helpers"
      contains: "def quantize_money"
    - path: "backend/services/sale_lifecycle.py"
      provides: "prefill_from_superbill, prefill_from_optical_order, compute_sale_totals, compute_remaining"
      contains: "def compute_sale_totals"
    - path: "backend/schemas/sales.py"
      provides: "Pydantic schemas for Sale/Payment/Refund/DailyClose request+response"
      contains: "class SaleResponse"
    - path: "types/sales.ts"
      provides: "TS interfaces matching Pydantic by_alias output (Decimal as string)"
      contains: "export interface Sale"
  key_links:
    - from: "compute_sale_totals"
      to: "Tenant.sales_tax_rate"
      via: "tenant.sales_tax_rate read; never hard-coded"
      pattern: "tenant\\.sales_tax_rate"
    - from: "prefill_from_superbill"
      to: "PatientInsurance.copay_amount"
      via: "selectinload patient_insurances filtered by payer_id + is_active"
      pattern: "PatientInsurance\\.copay_amount|copay_amount"
    - from: "SaleResponse.total"
      to: "types/sales.ts Sale.total"
      via: "by_alias contract test"
      pattern: "by_alias"
---

<objective>
Build the pure-Python service layer + Pydantic schemas + TS types — everything routes will use, but no routes yet. Money arithmetic (Decimal/ROUND_HALF_EVEN), cart-load prefill helpers (Superbill copay derivation, OpticalOrder line snapshot), total computation, split-tender remaining calc, and the wire-format contract.

Purpose: keep route handlers thin and testable; concentrate Decimal/copay rules in one module that's fast to unit-test without HTTP.

Output: `pytest backend/tests/test_sale_tax.py test_sale_cart_load.py test_split_tender.py test_sales_contract.py` GREEN; `types/sales.ts` matches Pydantic by_alias snapshot.
</objective>

<execution_context>
@C:/Users/duytr/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/duytr/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/15-point-of-sale/15-CONTEXT.md
@.planning/phases/15-point-of-sale/15-RESEARCH.md
@backend/db/models/tenant/clinical.py
@backend/schemas/optical_order.py
@backend/schemas/inventory.py
@types/opticalOrder.ts
@types/inventory.ts

<interfaces>
<!-- ORM (from Plan 15-01) -->
```python
class Sale(...):
    id: UUID
    tenant_id: UUID
    patient_id: UUID | None
    status: SaleStatus  # open/paid/refunded/voided
    subtotal: Decimal
    tax: Decimal
    discount_total: Decimal
    total: Decimal
    receipt_number: str | None
    notes: str | None
    opened_at: datetime
    closed_at: datetime | None
    lines: list["SaleLineItem"]
    payments: list["Payment"]
    refunds: list["Refund"]

class SaleLineItem(...):
    sale_id, source_type, source_id, description, qty, unit_price, discount_amount, discount_reason, taxable, line_total

class Payment(...):
    method, amount, tendered, change_due, processor_payment_id, processor_charge_id, last4, card_brand, auth_code, status, reason_note

class Refund(...): sale_id, total_amount, reason, processor_refund_id

class PatientInsurance(...):
    patient_id, payer_id, copay_amount: Decimal | None, is_active: bool
```

<!-- Existing Pydantic CamelCaseModel pattern (Phase 13/14) -->
```python
# backend/schemas/_base.py — already exists (confirm location)
class CamelCaseModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )
```

<!-- Existing TS Decimal convention -->
```typescript
// Decimal fields are strings in TS (Phase 13 §13-03)
// Phase 14 example:
export interface OpticalOrder {
  totalPrice: string;  // NOT number
}
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: money.py helpers + sale_lifecycle.py pure functions (compute_sale_totals, compute_remaining, prefill_from_superbill, prefill_from_optical_order) with TDD</name>
  <files>backend/services/money.py, backend/services/sale_lifecycle.py</files>
  <read_first>
    - backend/db/models/tenant/clinical.py — Sale, SaleLineItem, Payment, Superbill, OpticalOrder, OpticalOrderLineItem, PatientInsurance ORMs
    - backend/api/routes/optical_order.py (place handler for the with_for_update pattern; sale_lifecycle close will mirror it in Plan 15-04)
    - backend/tests/test_sale_cart_load.py + test_sale_tax.py + test_split_tender.py (Wave-0 skip-stubs — see assertions)
    - .planning/phases/15-point-of-sale/15-RESEARCH.md §Pattern 5 (Decimal arithmetic + to_stripe_cents) + §Code Examples (Superbill prefill code)
    - .planning/phases/15-point-of-sale/15-RESEARCH.md §Pitfall 4 (round-of-sum not sum-of-rounds for tax)
  </read_first>
  <behavior>
    money.py:
    - quantize_money(Decimal("0.12345")) == Decimal("0.12")  -- banker's rounding
    - quantize_money(Decimal("0.125")) == Decimal("0.12")    -- banker's: nearest-even
    - quantize_money(Decimal("0.135")) == Decimal("0.14")    -- banker's: nearest-even
    - to_stripe_cents(Decimal("12.34")) == 1234
    - to_stripe_cents(Decimal("0.30")) == 30

    compute_sale_totals(lines, tax_rate):
    - subtotal = quantize(sum(line.line_total))
    - discount_total = quantize(sum(line.discount_amount))
    - taxable_base = quantize(sum(line.line_total where line.taxable))
    - tax = quantize(taxable_base * tax_rate)   -- ROUND-OF-SUM, not sum-of-rounds (Pitfall 4)
    - total = subtotal + tax                    -- subtotal already includes discount because line_total = qty*unit_price - discount_amount
    - Returns dict with all four

    compute_remaining(sale, payments):
    - = sale.total - sum(p.amount where p.status in {succeeded, partial_refund})
    - Quantize result; 0 means full payment received

    prefill_from_superbill(db, sale, superbill_id):
    - selectinload Superbill with encounter
    - If superbill.billed_payer_id set: query PatientInsurance for (patient_id, payer_id, is_active=True); if found and copay_amount not null → unit_price = copay_amount; else 0.00
    - Else (self-pay) → unit_price = superbill.total_fee
    - Creates SaleLineItem(source_type='superbill', source_id=superbill.id, description=f"Encounter copay — {date}", qty=1, taxable=False, line_total=unit_price)
    - db.add + db.flush (does NOT commit — caller's responsibility)

    prefill_from_optical_order(db, sale, optical_order_id):
    - selectinload OpticalOrder with lines + product
    - For each OpticalOrderLineItem creates one SaleLineItem(source_type='optical_order', source_id=optical_order_id, **optical_order_line_item_id=oli.id (WARNING #3 fix)**, description=line.product.brand + ' ' + product.model, qty=line.qty, unit_price=line.unit_price, taxable=True, line_total=line.line_total)
    - Flat structure per RESEARCH Open Q 1 (shared source_id, no parent_line_id self-FK)
    - `optical_order_line_item_id` FK lets Plan 15-05 `restock_for_refund_line` look up the OpticalOrderLineItem directly (no fragile line_total matching)
  </behavior>
  <action>
    Two concrete files.

    **A. `backend/services/money.py`:**

    ```python
    """Decimal money helpers for Phase 15 POS (POS-13).

    ROUND_HALF_EVEN (banker's rounding) minimizes systematic bias in repeated rounding —
    critical for daily-close cash reconciliation.

    See RESEARCH Pitfall 4: tax MUST be round-of-sum (taxable_subtotal × rate, then quantize),
    NOT sum-of-rounds (round each line's tax then sum).
    """
    from decimal import Decimal, ROUND_HALF_EVEN

    CENTS = Decimal("0.01")

    def quantize_money(value: Decimal) -> Decimal:
        return value.quantize(CENTS, rounding=ROUND_HALF_EVEN)

    def to_stripe_cents(amount: Decimal) -> int:
        """Stripe expects integer cents — convert at the API boundary, never use floats."""
        return int(quantize_money(amount) * 100)

    def from_stripe_cents(cents: int) -> Decimal:
        return (Decimal(cents) / Decimal(100)).quantize(CENTS, rounding=ROUND_HALF_EVEN)
    ```

    **B. `backend/services/sale_lifecycle.py`** — initial helpers (close/refund handlers come in Plan 15-04):

    ```python
    """Sale lifecycle pure helpers (POS-01, POS-06, POS-13, POS-14).

    Route handlers (Plan 15-04) compose these into transactional flows.
    """
    from __future__ import annotations
    from decimal import Decimal
    from typing import Iterable
    from uuid import UUID

    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession
    from sqlalchemy.orm import selectinload

    from backend.db.models.tenant.clinical import (
        Sale, SaleLineItem, Payment, Superbill, OpticalOrder, OpticalOrderLineItem,
        PatientInsurance, PaymentStatus,
    )
    from backend.services.money import quantize_money

    ZERO = Decimal("0.00")

    def compute_sale_totals(lines: Iterable[SaleLineItem], tax_rate: Decimal) -> dict[str, Decimal]:
        """Compute subtotal / discount_total / tax / total.

        Tax = round-of-sum (NOT sum-of-rounds) per RESEARCH Pitfall 4.
        """
        subtotal = quantize_money(sum((li.line_total for li in lines), ZERO))
        discount_total = quantize_money(sum((li.discount_amount or ZERO for li in lines), ZERO))
        taxable_base = quantize_money(sum(
            (li.line_total for li in lines if li.taxable), ZERO,
        ))
        tax = quantize_money(taxable_base * tax_rate)
        total = quantize_money(subtotal + tax)
        return {
            "subtotal": subtotal,
            "discount_total": discount_total,
            "tax": tax,
            "total": total,
        }

    def compute_remaining(sale_total: Decimal, payments: Iterable[Payment]) -> Decimal:
        """Drives split-tender close gate (POS-06)."""
        paid = quantize_money(sum(
            (p.amount for p in payments
             if p.status in (PaymentStatus.SUCCEEDED.value, PaymentStatus.PARTIAL_REFUND.value)),
            ZERO,
        ))
        return quantize_money(sale_total - paid)

    async def prefill_from_superbill(
        db: AsyncSession, sale: Sale, superbill_id: UUID,
    ) -> SaleLineItem:
        """Cart-load a Superbill row — patient-owed amount only (POS-14).

        - billed_payer_id set + matching active PatientInsurance → use copay_amount
        - else (self-pay) → use Superbill.total_fee
        """
        superbill = (await db.execute(
            select(Superbill)
            .where(Superbill.id == superbill_id)
            .options(selectinload(Superbill.encounter))
        )).scalar_one()

        if superbill.billed_payer_id:
            ins = (await db.execute(
                select(PatientInsurance).where(
                    PatientInsurance.patient_id == superbill.patient_id,
                    PatientInsurance.payer_id == superbill.billed_payer_id,
                    PatientInsurance.is_active.is_(True),
                )
            )).scalar_one_or_none()
            unit_price = (ins.copay_amount if (ins and ins.copay_amount is not None)
                          else Decimal("0.00"))
        else:
            unit_price = superbill.total_fee

        unit_price = quantize_money(unit_price)
        encounter_date = (superbill.encounter.scheduled_for.date().isoformat()
                          if superbill.encounter and superbill.encounter.scheduled_for else "walk-in")
        line = SaleLineItem(
            tenant_id=sale.tenant_id,
            sale_id=sale.id,
            source_type="superbill",
            source_id=superbill.id,
            description=f"Encounter copay — {encounter_date}",
            qty=1,
            unit_price=unit_price,
            discount_amount=Decimal("0.00"),
            taxable=False,                # clinical service — not CA sales tax
            line_total=unit_price,
        )
        db.add(line)
        await db.flush()
        return line

    async def prefill_from_optical_order(
        db: AsyncSession, sale: Sale, optical_order_id: UUID,
    ) -> list[SaleLineItem]:
        """One SaleLineItem per OpticalOrderLineItem, flat with shared source_id.

        Per RESEARCH Open Q 1 — no self-FK; UI groups by shared source_id.
        """
        order = (await db.execute(
            select(OpticalOrder)
            .where(OpticalOrder.id == optical_order_id)
            .options(selectinload(OpticalOrder.line_items).selectinload(OpticalOrderLineItem.product))
        )).scalar_one()

        lines: list[SaleLineItem] = []
        for oli in order.line_items:
            desc = " ".join(filter(None, [
                getattr(oli.product, "brand", None) if oli.product else None,
                getattr(oli.product, "model", None) if oli.product else None,
            ])) or "Optical order line"
            li = SaleLineItem(
                tenant_id=sale.tenant_id,
                sale_id=sale.id,
                source_type="optical_order",
                source_id=order.id,
                optical_order_line_item_id=oli.id,   # WARNING #3 fix: precise FK for Plan 15-05 restock (no line_total heuristic)
                description=desc,
                qty=oli.qty,
                unit_price=quantize_money(oli.unit_price),
                discount_amount=Decimal("0.00"),
                taxable=True,
                line_total=quantize_money(oli.line_total),
            )
            db.add(li)
            lines.append(li)
        await db.flush()
        return lines
    ```

    **C. Replace skip-stub bodies in tests:**

    `backend/tests/test_sale_tax.py` (POS-13):
    ```python
    from decimal import Decimal
    from backend.services.sale_lifecycle import compute_sale_totals
    from types import SimpleNamespace

    def _line(line_total, taxable, discount=Decimal("0.00")):
        return SimpleNamespace(line_total=Decimal(line_total), taxable=taxable, discount_amount=discount)

    def test_tax_only_on_taxable_lines():
        lines = [_line("100.00", taxable=True), _line("50.00", taxable=False)]
        totals = compute_sale_totals(lines, tax_rate=Decimal("0.0725"))
        assert totals["subtotal"] == Decimal("150.00")
        assert totals["tax"] == Decimal("7.25")   # only the $100 line taxed
        assert totals["total"] == Decimal("157.25")

    def test_banker_rounding_round_of_sum():
        # 12.50 × 0.0725 = 0.90625; with HALF_EVEN → 0.90 (nearest-even on tie at half-cent)
        lines = [_line("12.50", taxable=True)]
        totals = compute_sale_totals(lines, tax_rate=Decimal("0.0725"))
        assert totals["tax"] == Decimal("0.91")  # 0.90625 quantize → 0.91 (3 → even? no — verify)
        # Actually 0.90625 quantized to 2dp ROUND_HALF_EVEN:
        # tie at .005 → 2 (even) → 0.90? Run actual: quantize behaves on the 3 in 0.90625:
        # 0.90625 → ROUND_HALF_EVEN at .01: looks at last digit dropped (5) + next (6 > 5) → rounds up regardless.
        # Result: 0.91. Test asserts the documented behavior.

    def test_all_nontaxable_zero_tax():
        lines = [_line("100.00", taxable=False)]
        totals = compute_sale_totals(lines, tax_rate=Decimal("0.0725"))
        assert totals["tax"] == Decimal("0.00")
        assert totals["total"] == Decimal("100.00")

    def test_discount_total_aggregates():
        lines = [_line("100.00", True, discount=Decimal("10.00")), _line("50.00", True, discount=Decimal("5.00"))]
        totals = compute_sale_totals(lines, tax_rate=Decimal("0.0725"))
        assert totals["discount_total"] == Decimal("15.00")
    ```

    `backend/tests/test_split_tender.py` (POS-06):
    ```python
    from decimal import Decimal
    from backend.services.sale_lifecycle import compute_remaining
    from types import SimpleNamespace

    def _pmt(amount, status="succeeded"):
        return SimpleNamespace(amount=Decimal(amount), status=status)

    def test_remaining_zero_when_fully_paid():
        assert compute_remaining(Decimal("100.00"), [_pmt("60.00"), _pmt("40.00")]) == Decimal("0.00")

    def test_remaining_positive_partial():
        assert compute_remaining(Decimal("100.00"), [_pmt("60.00")]) == Decimal("40.00")

    def test_failed_payment_excluded():
        assert compute_remaining(Decimal("100.00"), [_pmt("100.00", status="failed")]) == Decimal("100.00")

    def test_partial_refund_status_still_counted():
        # A partially-refunded payment still applied its original principal to the sale
        assert compute_remaining(Decimal("100.00"), [_pmt("100.00", status="partial_refund")]) == Decimal("0.00")
    ```

    `backend/tests/test_sale_cart_load.py` — uses `db_session` + `tenant_context` fixtures from Phase 13 Wave 0 + factories from Plan 15-00. If those skip-stubs are not yet real, this test continues to skip; once Plan 15-04 wires real fixtures the test activates. ACCEPTABLE per Wave 0 convention — the assertion bodies must be REAL not pass-through stubs.

    Skeleton (replace skip-stub):
    ```python
    import pytest
    from decimal import Decimal
    from unittest.mock import MagicMock, AsyncMock, patch
    from uuid import uuid4

    pytestmark = pytest.mark.asyncio

    @pytest.fixture
    async def fake_db():
        # Use AsyncMock for db.execute / db.add / db.flush
        m = AsyncMock()
        m.add = MagicMock()
        m.flush = AsyncMock()
        return m

    async def test_copay_from_insurance(fake_db):
        from backend.services.sale_lifecycle import prefill_from_superbill
        sale = MagicMock(id=uuid4(), tenant_id=uuid4())
        superbill = MagicMock(
            id=uuid4(), patient_id=uuid4(), billed_payer_id=uuid4(),
            total_fee=Decimal("250.00"),
            encounter=MagicMock(scheduled_for=None),
        )
        ins = MagicMock(copay_amount=Decimal("20.00"))
        # Two execute calls: superbill SELECT, then PatientInsurance SELECT
        fake_db.execute = AsyncMock(side_effect=[
            MagicMock(scalar_one=MagicMock(return_value=superbill)),
            MagicMock(scalar_one_or_none=MagicMock(return_value=ins)),
        ])
        line = await prefill_from_superbill(fake_db, sale, superbill.id)
        assert line.unit_price == Decimal("20.00")
        assert line.taxable is False
        assert line.source_type == "superbill"

    async def test_copay_self_pay_fallback(fake_db):
        from backend.services.sale_lifecycle import prefill_from_superbill
        sale = MagicMock(id=uuid4(), tenant_id=uuid4())
        superbill = MagicMock(
            id=uuid4(), patient_id=uuid4(), billed_payer_id=None,
            total_fee=Decimal("250.00"),
            encounter=MagicMock(scheduled_for=None),
        )
        fake_db.execute = AsyncMock(return_value=MagicMock(scalar_one=MagicMock(return_value=superbill)))
        line = await prefill_from_superbill(fake_db, sale, superbill.id)
        assert line.unit_price == Decimal("250.00")
        assert line.source_type == "superbill"
    ```
  </action>
  <verify>
    <automated>cd backend && pytest tests/test_sale_tax.py tests/test_split_tender.py tests/test_sale_cart_load.py -v && python -c "from backend.services.money import quantize_money, to_stripe_cents; from decimal import Decimal; assert quantize_money(Decimal('0.12345')) == Decimal('0.12'); assert to_stripe_cents(Decimal('12.34')) == 1234; print('ok')"</automated>
  </verify>
  <acceptance_criteria>
    - `pytest backend/tests/test_sale_tax.py -v` 4 tests pass
    - `pytest backend/tests/test_split_tender.py -v` 4 tests pass
    - `pytest backend/tests/test_sale_cart_load.py -v` 2 tests pass (insurance copay + self-pay)
    - `grep -c "ROUND_HALF_EVEN" backend/services/money.py` >= 1
    - `grep -c "float\\(" backend/services/money.py backend/services/sale_lifecycle.py` returns 0 — no float() anywhere
    - `python -c "from backend.services.sale_lifecycle import compute_sale_totals, compute_remaining, prefill_from_superbill, prefill_from_optical_order"` exits 0
    - `grep -c "optical_order_line_item_id=oli\.id" backend/services/sale_lifecycle.py` returns >= 1 — WARNING #3: prefill_from_optical_order populates the FK column on every cart line so Plan 15-05 can look up the OpticalOrderLineItem directly
  </acceptance_criteria>
  <done>Pure helpers + tax / copay / remaining math TDD'd and green.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Pydantic schemas in backend/schemas/sales.py + TS interfaces in types/sales.ts + by_alias contract test</name>
  <files>backend/schemas/sales.py, types/sales.ts</files>
  <read_first>
    - backend/schemas/optical_order.py (Phase 13/14 example — CamelCaseModel + by_alias pattern; clone exactly)
    - backend/schemas/_base.py (CamelCaseModel definition — confirm exact import path)
    - types/opticalOrder.ts (clone Decimal-as-string convention; phase 13 §13-03)
    - backend/tests/test_sales_contract.py (Wave-0 skip-stub — what snapshot it expects)
    - types/sales.contract.test.ts (vitest skeleton)
  </read_first>
  <action>
    Three concrete deliverables.

    **A. `backend/schemas/sales.py`:**

    ```python
    """Pydantic schemas for Phase 15 Sale ledger (POS-01, POS-16).

    All Decimal fields serialize as STRING in JSON (matches TS interface).
    All wire keys camelCase via CamelCaseModel.by_alias.
    """
    from __future__ import annotations
    from datetime import datetime, date
    from decimal import Decimal
    from typing import Literal
    from uuid import UUID

    from pydantic import Field

    from backend.schemas._base import CamelCaseModel

    SaleStatusLiteral = Literal["open", "paid", "refunded", "voided"]
    PaymentMethodLiteral = Literal["cash", "stripe_card", "external_card", "write_off"]
    PaymentStatusLiteral = Literal["pending", "succeeded", "failed", "refunded", "partial_refund"]
    SaleSourceLiteral = Literal["superbill", "optical_order", "product", "adhoc"]

    # ---------- Line item ----------

    class SaleLineItemBase(CamelCaseModel):
        source_type: SaleSourceLiteral
        source_id: UUID | None = None
        description: str = Field(max_length=500)
        qty: int = Field(ge=1)
        unit_price: Decimal
        discount_amount: Decimal = Decimal("0.00")
        discount_reason: str | None = Field(default=None, max_length=200)
        taxable: bool = True

    class SaleLineItemCreate(SaleLineItemBase):
        pass

    class SaleLineItemUpdate(CamelCaseModel):
        description: str | None = Field(default=None, max_length=500)
        qty: int | None = Field(default=None, ge=1)
        unit_price: Decimal | None = None
        discount_amount: Decimal | None = None
        discount_reason: str | None = Field(default=None, max_length=200)
        taxable: bool | None = None

    class SaleLineItemResponse(SaleLineItemBase):
        id: UUID
        sale_id: UUID
        line_total: Decimal
        created_at: datetime
        updated_at: datetime

    # ---------- Sale ----------

    class SalePrefillRequest(CamelCaseModel):
        patient_id: UUID | None = None
        prefill: list[SalePrefillItem] = Field(default_factory=list)

    class SalePrefillItem(CamelCaseModel):
        kind: Literal["superbill", "optical_order"]
        source_id: UUID

    SalePrefillRequest.model_rebuild()

    class SaleCreate(CamelCaseModel):
        patient_id: UUID | None = None
        notes: str | None = Field(default=None, max_length=1000)
        prefill: list[SalePrefillItem] = Field(default_factory=list)

    class SaleResponse(CamelCaseModel):
        id: UUID
        tenant_id: UUID
        patient_id: UUID | None
        status: SaleStatusLiteral
        subtotal: Decimal
        tax: Decimal
        discount_total: Decimal
        total: Decimal
        receipt_number: str | None
        receipt_url: str | None
        notes: str | None
        opened_at: datetime
        closed_at: datetime | None
        created_at: datetime
        updated_at: datetime
        lines: list[SaleLineItemResponse] = Field(default_factory=list)
        payments: list["PaymentResponse"] = Field(default_factory=list)
        refunds: list["RefundResponse"] = Field(default_factory=list)
        remaining: Decimal = Decimal("0.00")  # computed: total - sum(succeeded payments)

    # ---------- Payment ----------

    class PaymentCreate(CamelCaseModel):
        method: PaymentMethodLiteral
        amount: Decimal
        tendered: Decimal | None = None
        change_due: Decimal | None = None
        last4: str | None = Field(default=None, max_length=4)
        auth_code: str | None = Field(default=None, max_length=20)
        reason_note: str | None = Field(default=None, max_length=500)

    class StripeConfirmRequest(CamelCaseModel):
        payment_intent_id: str = Field(min_length=1, max_length=128)

    class StripeIntentResponse(CamelCaseModel):
        payment_id: UUID
        client_secret: str
        publishable_key: str
        intent_id: str

    class PaymentResponse(CamelCaseModel):
        id: UUID
        sale_id: UUID
        method: PaymentMethodLiteral
        amount: Decimal
        tendered: Decimal | None
        change_due: Decimal | None
        processor_payment_id: str | None
        processor_charge_id: str | None
        last4: str | None
        card_brand: str | None
        auth_code: str | None
        status: PaymentStatusLiteral
        reason_note: str | None
        created_at: datetime

    # ---------- Refund ----------

    class RefundLineSpec(CamelCaseModel):
        sale_line_item_id: UUID
        qty: int = Field(ge=1)
        amount: Decimal

    class RefundPaymentSpec(CamelCaseModel):
        payment_id: UUID
        amount: Decimal

    class RefundCreate(CamelCaseModel):
        line_refunds: list[RefundLineSpec] = Field(min_length=1)
        payment_refunds: list[RefundPaymentSpec] = Field(min_length=1)
        reason: str = Field(min_length=3, max_length=500)

    class RefundLineItemResponse(CamelCaseModel):
        id: UUID
        refund_id: UUID
        sale_line_item_id: UUID
        qty: int
        amount: Decimal

    class RefundPaymentResponse(CamelCaseModel):
        id: UUID
        refund_id: UUID
        payment_id: UUID
        amount: Decimal
        processor_refund_id: str | None

    class RefundResponse(CamelCaseModel):
        id: UUID
        sale_id: UUID
        total_amount: Decimal
        reason: str
        processor_refund_id: str | None
        refunded_by_id: UUID | None
        created_at: datetime
        line_items: list[RefundLineItemResponse] = Field(default_factory=list)
        payment_refunds: list[RefundPaymentResponse] = Field(default_factory=list)

    # ---------- Daily Close ----------

    class DailyCloseRequest(CamelCaseModel):
        close_date: date
        counted_cash: Decimal
        notes: str | None = Field(default=None, max_length=1000)

    class DailyCloseTotalsBucket(CamelCaseModel):
        key: str
        count: int
        total: Decimal

    class DailyCloseSummary(CamelCaseModel):
        sales_count: int
        gross: Decimal
        refunds: Decimal
        net: Decimal

    class DailyCloseResponse(CamelCaseModel):
        close_date: date
        summary: DailyCloseSummary
        by_method: list[DailyCloseTotalsBucket]
        by_category: list[DailyCloseTotalsBucket]
        expected_cash: Decimal
        counted_cash: Decimal | None = None
        variance: Decimal | None = None
        stripe_payout_estimate: Decimal | None = None
        run_id: UUID | None = None
        run_at: datetime | None = None
        notes: str | None = None
        is_closed: bool = False

    # ---------- Admin Stripe config ----------

    class PaymentConfigUpdate(CamelCaseModel):
        stripe_publishable_key: str | None = Field(default=None, max_length=128)
        stripe_secret_key: str | None = Field(default=None, min_length=10, max_length=256)
        stripe_webhook_secret: str | None = Field(default=None, min_length=10, max_length=256)

    class PaymentConfigResponse(CamelCaseModel):
        stripe_publishable_key: str | None
        has_secret_key: bool
        has_webhook_secret: bool
        sales_tax_rate: Decimal

    SaleResponse.model_rebuild()
    ```

    **B. `types/sales.ts`** — TS mirror (Decimal as string):

    ```typescript
    // Generated to mirror backend/schemas/sales.py by_alias output.
    // POS-16: keep keys in lockstep — contract tests fail loud on drift.

    export type SaleStatus = 'open' | 'paid' | 'refunded' | 'voided';
    export type PaymentMethod = 'cash' | 'stripe_card' | 'external_card' | 'write_off';
    export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'refunded' | 'partial_refund';
    export type SaleSource = 'superbill' | 'optical_order' | 'product' | 'adhoc';

    export interface SaleLineItem {
      id: string;
      saleId: string;
      sourceType: SaleSource;
      sourceId: string | null;
      description: string;
      qty: number;
      unitPrice: string;        // Decimal — string
      discountAmount: string;
      discountReason: string | null;
      taxable: boolean;
      lineTotal: string;
      createdAt: string;
      updatedAt: string;
    }

    export interface Payment {
      id: string;
      saleId: string;
      method: PaymentMethod;
      amount: string;
      tendered: string | null;
      changeDue: string | null;
      processorPaymentId: string | null;
      processorChargeId: string | null;
      last4: string | null;
      cardBrand: string | null;
      authCode: string | null;
      status: PaymentStatus;
      reasonNote: string | null;
      createdAt: string;
    }

    export interface RefundLineItem {
      id: string;
      refundId: string;
      saleLineItemId: string;
      qty: number;
      amount: string;
    }

    export interface RefundPayment {
      id: string;
      refundId: string;
      paymentId: string;
      amount: string;
      processorRefundId: string | null;
    }

    export interface Refund {
      id: string;
      saleId: string;
      totalAmount: string;
      reason: string;
      processorRefundId: string | null;
      refundedById: string | null;
      createdAt: string;
      lineItems: RefundLineItem[];
      paymentRefunds: RefundPayment[];
    }

    export interface Sale {
      id: string;
      tenantId: string;
      patientId: string | null;
      status: SaleStatus;
      subtotal: string;
      tax: string;
      discountTotal: string;
      total: string;
      receiptNumber: string | null;
      receiptUrl: string | null;
      notes: string | null;
      openedAt: string;
      closedAt: string | null;
      createdAt: string;
      updatedAt: string;
      lines: SaleLineItem[];
      payments: Payment[];
      refunds: Refund[];
      remaining: string;
    }

    export interface SalePrefillItem {
      kind: 'superbill' | 'optical_order';
      sourceId: string;
    }

    export interface SaleCreatePayload {
      patientId?: string | null;
      notes?: string | null;
      prefill?: SalePrefillItem[];
    }

    export interface PaymentCreatePayload {
      method: PaymentMethod;
      amount: string;
      tendered?: string | null;
      changeDue?: string | null;
      last4?: string | null;
      authCode?: string | null;
      reasonNote?: string | null;
    }

    export interface StripeIntentResponse {
      paymentId: string;
      clientSecret: string;
      publishableKey: string;
      intentId: string;
    }

    export interface RefundLineSpec {
      saleLineItemId: string;
      qty: number;
      amount: string;
    }

    export interface RefundPaymentSpec {
      paymentId: string;
      amount: string;
    }

    export interface RefundCreatePayload {
      lineRefunds: RefundLineSpec[];
      paymentRefunds: RefundPaymentSpec[];
      reason: string;
    }

    export interface DailyCloseBucket {
      key: string;
      count: number;
      total: string;
    }

    export interface DailyCloseSummary {
      salesCount: number;
      gross: string;
      refunds: string;
      net: string;
    }

    export interface DailyCloseResponse {
      closeDate: string;            // YYYY-MM-DD
      summary: DailyCloseSummary;
      byMethod: DailyCloseBucket[];
      byCategory: DailyCloseBucket[];
      expectedCash: string;
      countedCash: string | null;
      variance: string | null;
      stripePayoutEstimate: string | null;
      runId: string | null;
      runAt: string | null;
      notes: string | null;
      isClosed: boolean;
    }

    export interface DailyClosePayload {
      closeDate: string;
      countedCash: string;
      notes?: string | null;
    }

    export interface PaymentConfigUpdatePayload {
      stripePublishableKey?: string | null;
      stripeSecretKey?: string | null;
      stripeWebhookSecret?: string | null;
    }

    export interface PaymentConfigResponse {
      stripePublishableKey: string | null;
      hasSecretKey: boolean;
      hasWebhookSecret: boolean;
      salesTaxRate: string;
    }
    ```

    **C. Contract tests** (replace skip-stubs):

    `backend/tests/test_sales_contract.py`:
    ```python
    from datetime import datetime, timezone, date
    from decimal import Decimal
    from uuid import uuid4
    from backend.schemas.sales import (
        SaleResponse, SaleLineItemResponse, PaymentResponse, RefundResponse,
        DailyCloseResponse, DailyCloseSummary, DailyCloseBucket, PaymentConfigResponse,
    )

    EXPECTED_SALE_KEYS = {
        "id","tenantId","patientId","status","subtotal","tax","discountTotal","total",
        "receiptNumber","receiptUrl","notes","openedAt","closedAt","createdAt","updatedAt",
        "lines","payments","refunds","remaining",
    }
    EXPECTED_LINE_KEYS = {
        "id","saleId","sourceType","sourceId","description","qty","unitPrice",
        "discountAmount","discountReason","taxable","lineTotal","createdAt","updatedAt",
    }
    EXPECTED_PAYMENT_KEYS = {
        "id","saleId","method","amount","tendered","changeDue","processorPaymentId",
        "processorChargeId","last4","cardBrand","authCode","status","reasonNote","createdAt",
    }
    EXPECTED_REFUND_KEYS = {
        "id","saleId","totalAmount","reason","processorRefundId","refundedById",
        "createdAt","lineItems","paymentRefunds",
    }
    EXPECTED_DAILY_CLOSE_KEYS = {
        "closeDate","summary","byMethod","byCategory","expectedCash","countedCash",
        "variance","stripePayoutEstimate","runId","runAt","notes","isClosed",
    }

    def _now(): return datetime.now(timezone.utc)

    def test_sale_by_alias_camel_keys():
        s = SaleResponse(
            id=uuid4(), tenantId=uuid4(), patientId=uuid4(), status="open",
            subtotal=Decimal("0"), tax=Decimal("0"), discountTotal=Decimal("0"), total=Decimal("0"),
            receiptNumber=None, receiptUrl=None, notes=None,
            openedAt=_now(), closedAt=None, createdAt=_now(), updatedAt=_now(),
            lines=[], payments=[], refunds=[], remaining=Decimal("0"),
        )
        out = s.model_dump(by_alias=True)
        assert set(out.keys()) == EXPECTED_SALE_KEYS

    def test_line_item_by_alias_camel_keys():
        li = SaleLineItemResponse(
            id=uuid4(), saleId=uuid4(), sourceType="adhoc", sourceId=None,
            description="x", qty=1, unitPrice=Decimal("1"), discountAmount=Decimal("0"),
            discountReason=None, taxable=True, lineTotal=Decimal("1"),
            createdAt=_now(), updatedAt=_now(),
        )
        assert set(li.model_dump(by_alias=True).keys()) == EXPECTED_LINE_KEYS

    def test_payment_by_alias_camel_keys():
        p = PaymentResponse(
            id=uuid4(), saleId=uuid4(), method="cash", amount=Decimal("1"),
            tendered=None, changeDue=None, processorPaymentId=None, processorChargeId=None,
            last4=None, cardBrand=None, authCode=None, status="succeeded", reasonNote=None,
            createdAt=_now(),
        )
        assert set(p.model_dump(by_alias=True).keys()) == EXPECTED_PAYMENT_KEYS

    def test_refund_by_alias_camel_keys():
        r = RefundResponse(
            id=uuid4(), saleId=uuid4(), totalAmount=Decimal("1"), reason="x",
            processorRefundId=None, refundedById=None, createdAt=_now(),
            lineItems=[], paymentRefunds=[],
        )
        assert set(r.model_dump(by_alias=True).keys()) == EXPECTED_REFUND_KEYS

    def test_daily_close_by_alias_camel_keys():
        dc = DailyCloseResponse(
            closeDate=date.today(),
            summary=DailyCloseSummary(salesCount=0, gross=Decimal("0"), refunds=Decimal("0"), net=Decimal("0")),
            byMethod=[DailyCloseBucket(key="cash", count=0, total=Decimal("0"))],
            byCategory=[DailyCloseBucket(key="retail", count=0, total=Decimal("0"))],
            expectedCash=Decimal("0"),
        )
        assert set(dc.model_dump(by_alias=True).keys()) == EXPECTED_DAILY_CLOSE_KEYS
    ```

    `types/sales.contract.test.ts` (replace describe.skip with active):
    ```typescript
    import { describe, it, expectTypeOf } from 'vitest';
    import type {
      Sale, SaleLineItem, Payment, Refund, DailyCloseResponse, PaymentConfigResponse,
    } from './sales';

    describe('sales contract — literal keys mirror Pydantic by_alias', () => {
      it('Sale has exact key set', () => {
        const sale: Sale = {} as any;
        // Compile-time guard: any key change here must match Python EXPECTED_SALE_KEYS
        expectTypeOf<keyof Sale>().toEqualTypeOf<
          | 'id' | 'tenantId' | 'patientId' | 'status' | 'subtotal' | 'tax' | 'discountTotal'
          | 'total' | 'receiptNumber' | 'receiptUrl' | 'notes' | 'openedAt' | 'closedAt'
          | 'createdAt' | 'updatedAt' | 'lines' | 'payments' | 'refunds' | 'remaining'
        >();
      });
      // Similar blocks for SaleLineItem, Payment, Refund, DailyCloseResponse
    });
    ```
  </action>
  <verify>
    <automated>cd backend && pytest tests/test_sales_contract.py -v && cd .. && npx vitest run types/sales.contract.test.ts && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `pytest backend/tests/test_sales_contract.py -v` 5 tests pass
    - `npx vitest run types/sales.contract.test.ts` exits 0
    - `npx tsc --noEmit` exits 0
    - `grep -c "^export interface Sale " types/sales.ts` returns 1
    - `grep -c "remaining: string" types/sales.ts` returns 1 (Decimal-as-string convention)
    - `grep -c "CamelCaseModel" backend/schemas/sales.py` returns >= 10 (all classes inherit)
    - `python -c "from backend.schemas.sales import SaleResponse, PaymentResponse, RefundResponse, DailyCloseResponse, PaymentConfigUpdate, PaymentConfigResponse, RefundCreate, StripeIntentResponse"` exits 0
  </acceptance_criteria>
  <done>Wire format locked; contract test guards camelize fidelity.</done>
</task>

</tasks>

<verification>
- All 4 tests green: test_sale_tax, test_split_tender, test_sale_cart_load, test_sales_contract
- TS compiles clean
- Money helpers + cart-load pure functions + schemas + types all in place
</verification>

<success_criteria>
Service-layer helpers + wire format locked. Plan 15-04 (routes) and 15-09 (FE) consume from here.
</success_criteria>

<output>
After completion, create `.planning/phases/15-point-of-sale/15-03-SUMMARY.md`
</output>
