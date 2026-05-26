"""Phase 14 — Deterministic keyword scanner over saved AI Scribe output.

Pure function. NO Claude calls. NO streaming. NO DB writes. Reads
``encounter.ai_summary_text`` + ``encounter.assessment_and_plan`` (both
plain text columns per MEMORY.md AI Scribe Architecture Notes / Pitfall 8 —
A&P is NOT JSONB, so no json.loads anywhere in this module).

The configurator UX surfaces the returned suggestions as ghosted ✨ chips
inline; the accept/dismiss POST routes persist user choices via the
``suggestion_resolutions_jsonb`` column on ``OpticalOrder``.
"""
from __future__ import annotations

from typing import Any


# Priority order matches the dict iteration: first hit wins for lens_type
# and material. Multi-word keywords like "single vision" are spelled out;
# bare " SV " uses surrounding spaces to avoid matching unrelated tokens.
LENS_TYPE_KEYWORDS: dict[str, list[str]] = {
    "progressive": ["progressive", "PAL", "multifocal"],
    "bifocal": ["bifocal", "lined bifocal"],
    "single_vision": ["single vision", " SV "],
    "reading": ["reading glasses", "near-only", "+2.00", "+2.25", "+2.50"],
}


MATERIAL_KEYWORDS: dict[str, list[str]] = {
    "polycarbonate": [
        "polycarbonate",
        "poly",
        "impact-resistant",
        "child",
        "pediatric",
    ],
    "trivex": ["trivex"],
    "hi-index 1.67": ["hi-index 1.67", "1.67", "high-index"],
    "hi-index 1.74": ["hi-index 1.74", "1.74"],
    "hi-index 1.80": ["1.80"],
    "CR-39": ["CR-39", "standard plastic"],
}


COATING_KEYWORDS: dict[str, list[str]] = {
    "AR": ["anti-reflective", "AR coating", "no-glare", "anti-glare"],
    "blue light": ["blue light", "blue-blocker", "digital eye strain"],
    "photochromic": ["photochromic", "transitions", "transition lens"],
    "polarized": ["polarized"],
    "UV": ["UV protection", "ultraviolet"],
    "scratch-resistant": ["scratch-resistant", "scratch resistant"],
    "mirror": ["mirror coating"],
}


def extract_optical_suggestions(encounter: Any) -> dict[str, Any]:
    """Pure keyword scan over saved AI Scribe output.

    Returns a dict with shape::

        {
          "suggestions": [{"field", "value", "matched"}, ...],
          "rationale": str,
        }

    - Walk-in (encounter is None) → empty suggestions + Walk-in rationale (Pitfall 3).
    - Empty AI text → empty suggestions + "No AI Scribe data" rationale.
    - lens_type / material → first match wins (priority follows dict order).
    - coatings → aggregates every match across the coating dictionary.
    """
    if encounter is None:
        return {
            "suggestions": [],
            "rationale": "Walk-in order — no encounter context",
        }

    ai_text = getattr(encounter, "ai_summary_text", None) or ""
    ap_text = getattr(encounter, "assessment_and_plan", None) or ""
    haystack = (ai_text + " " + ap_text).lower()

    if not haystack.strip():
        return {
            "suggestions": [],
            "rationale": "No AI Scribe data on encounter",
        }

    suggestions: list[dict[str, Any]] = []

    for value, keywords in LENS_TYPE_KEYWORDS.items():
        matched = [kw for kw in keywords if kw.lower() in haystack]
        if matched:
            suggestions.append(
                {"field": "lens_type", "value": value, "matched": matched}
            )
            break

    for value, keywords in MATERIAL_KEYWORDS.items():
        matched = [kw for kw in keywords if kw.lower() in haystack]
        if matched:
            suggestions.append(
                {"field": "material", "value": value, "matched": matched}
            )
            break

    matched_coatings: list[str] = []
    coating_matches: list[str] = []
    for value, keywords in COATING_KEYWORDS.items():
        matched = [kw for kw in keywords if kw.lower() in haystack]
        if matched:
            matched_coatings.append(value)
            coating_matches.extend(matched)
    if matched_coatings:
        suggestions.append(
            {
                "field": "coatings",
                "value": matched_coatings,
                "matched": coating_matches,
            }
        )

    return {
        "suggestions": suggestions,
        "rationale": "Derived from saved SOAP narrative + Assessment & Plan keywords",
    }
