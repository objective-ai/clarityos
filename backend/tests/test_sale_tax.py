"""POS-13 — tax only on taxable lines; banker's rounding (ROUND_HALF_EVEN)."""

from decimal import Decimal
from types import SimpleNamespace

from backend.services.sale_lifecycle import compute_sale_totals


def _line(line_total, taxable, discount=Decimal("0.00")):
    return SimpleNamespace(
        line_total=Decimal(line_total),
        taxable=taxable,
        discount_amount=Decimal(discount),
    )


def test_tax_only_on_taxable_lines():
    lines = [_line("100.00", taxable=True), _line("50.00", taxable=False)]
    totals = compute_sale_totals(lines, tax_rate=Decimal("0.0725"))
    assert totals["subtotal"] == Decimal("150.00")
    assert totals["tax"] == Decimal("7.25")  # only the $100 line taxed
    assert totals["total"] == Decimal("157.25")


def test_banker_rounding_round_of_sum():
    # 12.50 * 0.0725 = 0.90625 → quantize to 0.01 ROUND_HALF_EVEN → 0.91
    # (the 6 after the rounding digit forces round-up regardless of tie-breaking)
    lines = [_line("12.50", taxable=True)]
    totals = compute_sale_totals(lines, tax_rate=Decimal("0.0725"))
    assert totals["tax"] == Decimal("0.91")
    assert totals["subtotal"] == Decimal("12.50")
    assert totals["total"] == Decimal("13.41")


def test_all_nontaxable_zero_tax():
    lines = [_line("100.00", taxable=False)]
    totals = compute_sale_totals(lines, tax_rate=Decimal("0.0725"))
    assert totals["tax"] == Decimal("0.00")
    assert totals["total"] == Decimal("100.00")


def test_discount_total_aggregates():
    lines = [
        _line("100.00", True, discount="10.00"),
        _line("50.00", True, discount="5.00"),
    ]
    totals = compute_sale_totals(lines, tax_rate=Decimal("0.0725"))
    assert totals["discount_total"] == Decimal("15.00")
