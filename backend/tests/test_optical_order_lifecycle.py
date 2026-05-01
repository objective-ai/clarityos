"""Phase 13 — Retail Inventory: OpticalOrder lifecycle tests (Wave 0 stubs).

Stubs for INV-09, INV-10. Status transitions: draft → placed → dispensed,
with *→cancelled allowed from any state. Wave 1+ fills bodies.
"""

import pytest

clinical = pytest.importorskip(
    "backend.db.models.tenant.clinical",
    reason="Wave 1 (13-01) — OpticalOrder ORM not yet added",
)


@pytest.mark.asyncio
async def test_order_create_draft(db_session, optical_order_factory):
    """INV-09 — order created with status='draft' by default."""
    pytest.skip("Wave 1 (13-01)")


@pytest.mark.asyncio
async def test_walkin_no_encounter(db_session, optical_order_factory):
    """INV-10 — encounter_id is nullable; walk-in retail order persists with patient_id only."""
    pytest.skip("Wave 1 (13-01)")


@pytest.mark.asyncio
async def test_status_lifecycle_draft_placed_dispensed(
    db_session, optical_order_factory
):
    """INV-09 — only draft→placed→dispensed and *→cancelled transitions allowed."""
    pytest.skip("Wave 2 (13-06)")
