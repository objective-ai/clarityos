"""Phase 14 — Optical Order Configuration: lens reference catalog CRUD tests (Wave 0 stub).

Plan 14-02 lands the LensType/LensMaterial/LensCoating ORM + 9 FastAPI
routes. Module-level skip guard keeps collection green until then.
"""

from __future__ import annotations

try:
    from backend.api.routes.lens_catalog import router as _lens_catalog_router  # noqa: F401
except Exception:  # pragma: no cover
    import pytest

    pytest.skip(
        "Phase 14-02 not yet landed — lens_catalog router unavailable.",
        allow_module_level=True,
    )

import pytest


def test_create_lens_type(lens_type_progressive):
    """OPT14-03 — POST /lens-catalog/types/ creates a LensType row."""
    pytest.skip("Phase 14-02 — implement after lens-catalog routes")


def test_create_lens_material(lens_material_polycarbonate):
    """OPT14-03 — POST /lens-catalog/materials/ creates a LensMaterial row."""
    pytest.skip("Phase 14-02 — implement after lens-catalog routes")


def test_create_lens_coating(lens_coating_ar):
    """OPT14-03 — POST /lens-catalog/coatings/ creates a LensCoating row."""
    pytest.skip("Phase 14-02 — implement after lens-catalog routes")


def test_partial_unique_index_allows_inactive_duplicate(lens_type_progressive):
    """OPT14-08 / mirrors Phase 13 INV-07 — partial unique index (tenant_id, name) WHERE is_active=true permits inactive duplicate."""
    pytest.skip("Phase 14-02 — implement after migration 0019")


def test_soft_delete_keeps_history(lens_type_progressive):
    """OPT14-03 — DELETE flips is_active=false; row remains for historical orders."""
    pytest.skip("Phase 14-02 — implement after lens-catalog routes")
