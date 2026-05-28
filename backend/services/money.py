"""Decimal money helpers for Phase 15 POS (POS-13).

ROUND_HALF_EVEN (banker's rounding) minimizes systematic bias in repeated rounding —
critical for daily-close cash reconciliation.

See RESEARCH Pitfall 4: tax MUST be round-of-sum (taxable_subtotal × rate, then quantize),
NOT sum-of-rounds (round each line's tax then sum).
"""
from __future__ import annotations

from decimal import ROUND_HALF_EVEN, Decimal

CENTS = Decimal("0.01")


def quantize_money(value: Decimal) -> Decimal:
    return value.quantize(CENTS, rounding=ROUND_HALF_EVEN)


def to_stripe_cents(amount: Decimal) -> int:
    """Stripe expects integer cents — convert at the API boundary, never use floats."""
    return int(quantize_money(amount) * 100)


def from_stripe_cents(cents: int) -> Decimal:
    return (Decimal(cents) / Decimal(100)).quantize(CENTS, rounding=ROUND_HALF_EVEN)
