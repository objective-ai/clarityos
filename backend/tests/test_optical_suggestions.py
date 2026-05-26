"""Phase 14 — AI Scribe optical suggestion extractor: deterministic unit tests.

Pure synchronous tests — no @pytest.mark.asyncio, no DB, no fixtures.
Uses types.SimpleNamespace to fake the small Encounter surface the
extractor actually reads (ai_summary_text + assessment_and_plan).
"""

from __future__ import annotations

from types import SimpleNamespace

from backend.services.optical_suggestions import extract_optical_suggestions


def test_extract_progressive_keyword():
    """OPT14-07 — 'progressive' in A&P maps to lens_type suggestion."""
    enc = SimpleNamespace(
        ai_summary_text="",
        assessment_and_plan=(
            "Patient is presbyopic; consider progressive lenses for near work."
        ),
    )
    result = extract_optical_suggestions(enc)
    lens_type = next(
        (s for s in result["suggestions"] if s["field"] == "lens_type"), None
    )
    assert lens_type is not None
    assert lens_type["value"] == "progressive"
    assert "progressive" in [m.lower() for m in lens_type["matched"]]


def test_extract_polycarbonate_for_child():
    """OPT14-07 — pediatric markers map to polycarbonate material suggestion."""
    enc = SimpleNamespace(
        ai_summary_text=(
            "Patient is an 8-year-old child. Recommend polycarbonate lenses for safety."
        ),
        assessment_and_plan=None,
    )
    result = extract_optical_suggestions(enc)
    material = next(
        (s for s in result["suggestions"] if s["field"] == "material"), None
    )
    assert material is not None
    assert material["value"] == "polycarbonate"


def test_extract_ar_coating():
    """OPT14-07 — 'anti-reflective' in A&P maps to AR coating suggestion."""
    enc = SimpleNamespace(
        ai_summary_text="",
        assessment_and_plan=(
            "Anti-reflective coating recommended for nighttime driving glare."
        ),
    )
    result = extract_optical_suggestions(enc)
    coatings = next(
        (s for s in result["suggestions"] if s["field"] == "coatings"), None
    )
    assert coatings is not None
    assert "AR" in coatings["value"]


def test_no_ai_data_returns_empty():
    """OPT14-07 — when both AI text columns are None, extractor returns []."""
    enc = SimpleNamespace(ai_summary_text=None, assessment_and_plan=None)
    result = extract_optical_suggestions(enc)
    assert result == {
        "suggestions": [],
        "rationale": "No AI Scribe data on encounter",
    }


def test_multiple_coatings_aggregate():
    """OPT14-07 — multiple coating keywords aggregate into a single list value."""
    enc = SimpleNamespace(
        ai_summary_text=(
            "Polarized lenses with anti-reflective coating and UV protection "
            "for outdoor use."
        ),
        assessment_and_plan=None,
    )
    result = extract_optical_suggestions(enc)
    coatings = next(
        (s for s in result["suggestions"] if s["field"] == "coatings"), None
    )
    assert coatings is not None
    assert set(coatings["value"]) >= {"AR", "polarized", "UV"}


def test_walkin_no_encounter_returns_empty():
    """Pitfall 3 — walk-in (encounter is None) short-circuits with empty list."""
    result = extract_optical_suggestions(None)
    assert result == {
        "suggestions": [],
        "rationale": "Walk-in order — no encounter context",
    }
