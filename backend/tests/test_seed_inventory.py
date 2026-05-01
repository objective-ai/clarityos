"""Phase 13 — Retail Inventory: seed inventory test (Wave 0 stub).

INV-17 — backend/db/seed/_seed_retail_inventory creates ~10 frames + 5 contacts
on the dev tenant for E2E tests. Wave 2 (13-04) fills body.
"""

import pytest


@pytest.mark.asyncio
async def test_inventory_seed(db_session):
    """INV-17 — seed_db._seed_retail_inventory creates 10 frames + 5 contacts on tenant."""
    pytest.skip("Wave 2 (13-04) — implement after seed function exists")
