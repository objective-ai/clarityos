"""Phase 14 — Optical Order Configuration: configurator PATCH + place validation tests (Wave 0 stub).

Per 14-VALIDATION.md Per-Task Verification Map, Plan 14-03 lands the real
implementation. Until then every test here exits via pytest.skip so the file
is collected (provides a real target for `<verify>` blocks) without
producing ERRORs.
"""

from __future__ import annotations

try:
    from backend.api.routes.optical_order import (  # noqa: F401
        place_optical_order,
        update_optical_order_configuration,
    )
except Exception:  # pragma: no cover - covers ImportError + Settings ValidationError
    import pytest

    pytest.skip(
        "Phase 14-03 not yet landed — configurator PATCH + extended place handler "
        "imports unavailable.",
        allow_module_level=True,
    )

import pytest


def test_draft_creation_prefills_rx(optical_order_factory):
    """OPT14-01 — POST /optical-orders/ auto-populates final_refraction_id from encounter."""
    pytest.skip("Phase 14-03 — implement after extended POST handler")


def test_patch_vision_plan_persists(optical_order_in_draft):
    """OPT14-05 — PATCH /optical-orders/{id}/ persists vision_plan_jsonb snake_case keys."""
    pytest.skip("Phase 14-03 — implement after configurator PATCH endpoint")


def test_patch_rejected_when_status_not_draft(optical_order_factory):
    """Pitfall 11 — PATCH returns 409 when status != 'draft'."""
    pytest.skip("Phase 14-03 — implement after configurator PATCH endpoint")


def test_place_validates_seg_height_for_progressive(
    optical_order_in_draft, lens_type_progressive
):
    """OPT14-04 / Pitfall 7 — place 400s with field_errors when seg_height missing for progressive."""
    pytest.skip("Phase 14-03 — implement after extended place handler validation gate")


def test_place_validates_vertex_for_requires_vertex_lens(optical_order_in_draft):
    """OPT14-04 — place 400s with field_errors when vertex distance missing for requires_vertex lens."""
    pytest.skip("Phase 14-03 — implement after extended place handler validation gate")


def test_place_validation_runs_before_row_lock(optical_order_in_draft):
    """Pitfall 7 — validation 400 must short-circuit BEFORE SELECT FOR UPDATE fires."""
    pytest.skip("Phase 14-03 — assert no with_for_update on 400 path")
