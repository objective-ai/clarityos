"""backend/services/ai_scribe.py

Pure helpers for the AI Scribe streaming + accept routes. Extracted from
backend/api/routes/ai_scribe.py so the parsing/navigation logic is unit-
testable without spinning up FastAPI or a DB session.
"""

from __future__ import annotations


JSON_DELIMITER = "___JSON_START___"


def split_soap_and_json(full_text: str) -> tuple[str, str]:
    """Split a streamed Claude response into the SOAP narrative and the
    structured-JSON tail.

    Behavior notes (covered by tests):
      * No delimiter → entire text returned as SOAP, JSON portion is empty.
      * Multiple delimiters → only the segment between the first and second
        delimiter survives in the JSON portion; trailing content is dropped.
      * SOAP portion is `.strip()`-ed of trailing whitespace.
    """
    parts = full_text.split(JSON_DELIMITER)
    soap = parts[0].strip()
    json_part = parts[1].strip() if len(parts) > 1 else ""
    return soap, json_part


def resolve_assessment_and_plan(changes: dict) -> str | None:
    """Walk the AI-Scribe accept payload and return the assessment_and_plan
    string the route should persist, or None if no valid value is present.

    Guards (each covered by tests):
      * Top-level `assessment_and_plan` must be a dict.
      * `.new` must be a non-empty string.
      * Empty-string `new` does NOT overwrite — protects against a "clear"
        payload accidentally wiping a saved A&P note.
    """
    ap_change = changes.get("assessment_and_plan")
    if ap_change and isinstance(ap_change, dict):
        ap_value = ap_change.get("new")
        if ap_value and isinstance(ap_value, str):
            return ap_value
    return None
