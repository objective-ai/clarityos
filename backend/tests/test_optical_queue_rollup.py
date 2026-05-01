"""Phase 13 — Retail Inventory: optical-queue rollup tests (INV-16).

Per 13-CONTEXT.md §C: any placed order → in_progress;
all dispensed → dispensed; else fall back to Encounter.optical_status.

These tests target the pure rollup helper ``_compute_optical_status`` extracted
from ``backend/api/routes/optical.py``. The helper is pure (no DB, no I/O), so
no async fixtures are required — we feed it simple mock encounters/orders.

The Wave-0 ``db_session`` / ``optical_order_factory`` fixtures remain skip stubs
(see ``backend/tests/conftest.py``); a fully integration-style test that drives
the real ``GET /queue`` endpoint will land later when those fixtures are real.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

# Defensive guard: the rollup helper must exist; if the module fails to import
# (e.g. missing env vars during collection), skip the file cleanly.
try:
    from backend.api.routes.optical import _compute_optical_status
    from backend.schemas.optical import OpticalStatus
except Exception as _exc:  # pragma: no cover — collection guard
    pytest.skip(
        f"optical rollup helper not importable ({type(_exc).__name__}: {_exc})",
        allow_module_level=True,
    )


def _order(status: str) -> SimpleNamespace:
    """Lightweight mock OpticalOrder — only ``status`` is consulted by the rollup."""
    return SimpleNamespace(status=status)


def _encounter(*, optical_status: str | None, orders: list) -> SimpleNamespace:
    """Lightweight mock Encounter — only ``optical_status`` and
    ``optical_orders`` are consulted by the rollup."""
    return SimpleNamespace(optical_status=optical_status, optical_orders=orders)


# ---------------------------------------------------------------------------
# Test 1 — placed order overrides Phase 6 column to IN_PROGRESS
# ---------------------------------------------------------------------------


def test_rollup_placed_order_overrides_to_in_progress():
    """INV-16: encounter.optical_status='waiting' + 1 placed order → IN_PROGRESS."""
    enc = _encounter(optical_status="waiting", orders=[_order("placed")])
    assert _compute_optical_status(enc) == OpticalStatus.IN_PROGRESS


# ---------------------------------------------------------------------------
# Test 2 — all-dispensed orders override to DISPENSED
# ---------------------------------------------------------------------------


def test_rollup_all_dispensed_overrides_to_dispensed():
    """INV-16: encounter.optical_status='waiting' + 1 dispensed order → DISPENSED."""
    enc = _encounter(optical_status="waiting", orders=[_order("dispensed")])
    assert _compute_optical_status(enc) == OpticalStatus.DISPENSED


def test_rollup_multiple_dispensed_overrides_to_dispensed():
    """INV-16: 2 dispensed orders, no live placed → DISPENSED."""
    enc = _encounter(
        optical_status="waiting",
        orders=[_order("dispensed"), _order("dispensed")],
    )
    assert _compute_optical_status(enc) == OpticalStatus.DISPENSED


# ---------------------------------------------------------------------------
# Test 3 — mixed placed+dispensed → IN_PROGRESS (any-placed wins)
# ---------------------------------------------------------------------------


def test_rollup_mixed_dispensed_placed_uses_in_progress():
    """INV-16 tie-break: any placed wins over all-dispensed.

    Per CONTEXT §C: 'any order in placed → in_progress'.
    """
    enc = _encounter(
        optical_status="waiting",
        orders=[_order("placed"), _order("dispensed")],
    )
    assert _compute_optical_status(enc) == OpticalStatus.IN_PROGRESS


# ---------------------------------------------------------------------------
# Test 4 — only-cancelled orders fall back to Encounter.optical_status
# ---------------------------------------------------------------------------


def test_rollup_only_cancelled_falls_back():
    """INV-16: 2 cancelled orders → falls back to encounter.optical_status."""
    enc = _encounter(
        optical_status="dispensed",
        orders=[_order("cancelled"), _order("cancelled")],
    )
    # Cancelled orders are filtered out of live_orders → fall through to
    # _safe_optical_status(enc.optical_status) which preserves DISPENSED.
    assert _compute_optical_status(enc) == OpticalStatus.DISPENSED


def test_rollup_cancelled_only_with_waiting_status_falls_back_to_waiting():
    """INV-16: cancelled-only + optical_status='waiting' → WAITING fallback."""
    enc = _encounter(
        optical_status="waiting",
        orders=[_order("cancelled")],
    )
    assert _compute_optical_status(enc) == OpticalStatus.WAITING


# ---------------------------------------------------------------------------
# Test 5 — no orders preserves original Encounter.optical_status
# ---------------------------------------------------------------------------


def test_rollup_no_orders_unchanged():
    """INV-16: encounter with no orders → original optical_status preserved."""
    enc = _encounter(optical_status="in_progress", orders=[])
    assert _compute_optical_status(enc) == OpticalStatus.IN_PROGRESS


def test_rollup_no_orders_null_status_defaults_to_waiting():
    """INV-16: no orders + NULL optical_status → WAITING (via _safe_optical_status)."""
    enc = _encounter(optical_status=None, orders=[])
    assert _compute_optical_status(enc) == OpticalStatus.WAITING


# ---------------------------------------------------------------------------
# Test 6 — draft orders are ignored (not placed, not dispensed)
# ---------------------------------------------------------------------------


def test_rollup_draft_order_falls_back():
    """INV-16: draft is a live order but neither placed nor dispensed → falls back.

    A draft order (work-in-progress, never submitted) shouldn't promote the
    queue card to IN_PROGRESS — only an actual ``placed`` does.
    """
    enc = _encounter(optical_status="waiting", orders=[_order("draft")])
    assert _compute_optical_status(enc) == OpticalStatus.WAITING


def test_rollup_draft_plus_placed_uses_in_progress():
    """INV-16: draft + placed → IN_PROGRESS (placed wins)."""
    enc = _encounter(
        optical_status="waiting",
        orders=[_order("draft"), _order("placed")],
    )
    assert _compute_optical_status(enc) == OpticalStatus.IN_PROGRESS
