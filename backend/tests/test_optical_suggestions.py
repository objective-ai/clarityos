"""Phase 14 — Optical Order Configuration: AI Scribe optical suggestion extractor (Wave 0 stub).

Plan 14-04 implements the deterministic keyword scanner in
backend/services/optical_suggestions.py. Until that lands the imports below
fail and the file skips at collection time.
"""

from __future__ import annotations

try:
    from backend.services.optical_suggestions import extract_optical_suggestions  # noqa: F401
except Exception:  # pragma: no cover
    import pytest

    pytest.skip(
        "Phase 14-04 not yet landed — extract_optical_suggestions() unavailable.",
        allow_module_level=True,
    )

import pytest


def test_extract_progressive_keyword():
    """OPT14-07 — 'progressive' in A&P maps to lens_type suggestion."""
    pytest.skip("Phase 14-04 — implement after keyword extractor")


def test_extract_polycarbonate_for_child():
    """OPT14-07 — child age + 'polycarbonate' in A&P maps to lens_material suggestion."""
    pytest.skip("Phase 14-04 — implement after keyword extractor")


def test_extract_ar_coating():
    """OPT14-07 — 'anti-reflective' in A&P maps to coating suggestion."""
    pytest.skip("Phase 14-04 — implement after keyword extractor")


def test_no_ai_data_returns_empty():
    """OPT14-07 — when ai_summary_text is None, extractor returns []."""
    pytest.skip("Phase 14-04 — implement after keyword extractor")


def test_multiple_coatings_aggregate():
    """OPT14-07 — multiple coating keywords aggregate into a single suggestions[coating] list."""
    pytest.skip("Phase 14-04 — implement after keyword extractor")


def test_walkin_no_encounter_returns_empty():
    """Pitfall 3 — walk-in order with no encounter_id short-circuits and returns []."""
    pytest.skip("Phase 14-04 — implement after keyword extractor")
