"""Phase 13 — Retail Inventory: optical-queue rollup tests (Wave 0 stub).

Stub for INV-16. Per 13-CONTEXT.md §C: any placed order → in_progress;
all dispensed → dispensed; else fall back to Encounter.optical_status.
"""

import pytest

# Defensive guard: the rollup helper does not exist yet AND the parent module
# may fail to initialise without runtime env vars. Either failure → skip the
# whole file cleanly so collection stays green. Wave 3 (13-09) replaces this
# with a real import once the rollup helper lands.
try:
    optical = __import__("backend.api.routes.optical", fromlist=["*"])
except Exception as _exc:  # pragma: no cover — Wave 0 collection guard
    pytest.skip(
        f"Wave 3 (13-09) — rollup not yet wired ({type(_exc).__name__})",
        allow_module_level=True,
    )


@pytest.mark.asyncio
async def test_encounter_optical_status_rollup(db_session, optical_order_factory):
    """INV-16 — any placed order → in_progress; all dispensed → dispensed; else fall back."""
    pytest.skip("Wave 3 (13-09) — implement after queue rollup added")


@pytest.mark.asyncio
async def test_rollup_falls_back_when_only_cancelled_orders(
    db_session, optical_order_factory
):
    """INV-16 — cancelled-only orders treated as no live orders → fall back to Encounter.optical_status."""
    pytest.skip("Wave 3 (13-09)")
