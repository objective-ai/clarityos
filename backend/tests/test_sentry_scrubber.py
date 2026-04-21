"""Unit tests for backend.core.sentry_scrubber — the HIPAA seatbelt.

Coverage:
  - Deny-list parity: 25 snake_case + 14 camelCase keys redacted to "[Filtered]"
  - Clinical body-drop: one test per CLINICAL_PREFIX (7 tests) — request.data
    gets dropped and tags.route_type = "clinical"
  - Ignore rules: ClientDisconnect → None, HTTPException(401/403) → None,
    HTTPException(500) → event returned unchanged
  - URL query scrub: request.url with ?mrn=X → value redacted
  - User context stripped to {"id": ...} only

See .planning/phases/10.3-error-monitoring-system-status/10.3-CONTEXT.md
§"PHI scrubber (deny-list)" for the canonical key list.
"""
from __future__ import annotations

from typing import Any

import pytest
from fastapi import HTTPException

from backend.core.sentry_scrubber import (
    CLINICAL_PREFIXES,
    DENY_KEYS,
    REDACTED,
    scrub_event,
)

# Snake_case deny list — MUST match CONTEXT verbatim.
SNAKE_DENY_KEYS = (
    "patient_id", "mrn", "dob", "date_of_birth", "ssn",
    "first_name", "last_name", "full_name", "patient_name",
    "phone", "email", "address", "street", "zip", "postal_code",
    "insurance_number", "member_id", "policy_number", "group_number",
    "chief_complaint", "hpi", "assessment", "plan", "soap_text",
    "ai_summary_text", "note", "notes",
)

CAMEL_DENY_KEYS = (
    "patientId", "dateOfBirth", "firstName", "lastName", "fullName",
    "patientName", "postalCode", "insuranceNumber", "memberId",
    "policyNumber", "groupNumber", "chiefComplaint", "soapText",
    "aiSummaryText",
)


# ---------------------------------------------------------------------------
# REDACTED + DENY_KEYS + CLINICAL_PREFIXES exports
# ---------------------------------------------------------------------------


def test_redacted_constant() -> None:
    assert REDACTED == "[Filtered]"


def test_deny_keys_contains_all_snake_case() -> None:
    for key in SNAKE_DENY_KEYS:
        assert key in DENY_KEYS, f"missing deny key: {key}"


def test_deny_keys_contains_all_camel_case() -> None:
    for key in CAMEL_DENY_KEYS:
        assert key in DENY_KEYS, f"missing deny key: {key}"


def test_clinical_prefixes_exact() -> None:
    assert CLINICAL_PREFIXES == (
        "/api/encounters",
        "/api/patients",
        "/api/ai-scribe",
        "/api/claims",
        "/api/vitals",
        "/api/exam-findings",
        "/api/superbills",
    )


# ---------------------------------------------------------------------------
# Deny-list scrub (top-level + nested + arrays)
# ---------------------------------------------------------------------------


def test_deny_list_top_level() -> None:
    extra: dict[str, Any] = {k: "secret" for k in SNAKE_DENY_KEYS}
    result = scrub_event({"extra": extra})
    assert result is not None
    for k in SNAKE_DENY_KEYS:
        assert result["extra"][k] == REDACTED, f"key not redacted: {k}"


def test_deny_list_camel_case() -> None:
    extra: dict[str, Any] = {k: "secret" for k in CAMEL_DENY_KEYS}
    result = scrub_event({"extra": extra})
    assert result is not None
    for k in CAMEL_DENY_KEYS:
        assert result["extra"][k] == REDACTED, f"camel key not redacted: {k}"


def test_nested_objects_scrubbed() -> None:
    event = {"extra": {"a": {"b": {"patient_id": "X", "inner": {"mrn": "Y"}}}}}
    result = scrub_event(event)
    assert result is not None
    assert result["extra"]["a"]["b"]["patient_id"] == REDACTED
    assert result["extra"]["a"]["b"]["inner"]["mrn"] == REDACTED


def test_arrays_scrubbed() -> None:
    event = {"extra": {"records": [{"mrn": "A"}, {"mrn": "B"}]}}
    result = scrub_event(event)
    assert result is not None
    assert result["extra"]["records"][0]["mrn"] == REDACTED
    assert result["extra"]["records"][1]["mrn"] == REDACTED


def test_non_deny_keys_untouched() -> None:
    event = {"extra": {"patient_id": "p1", "safe_key": "visible", "count": 42}}
    result = scrub_event(event)
    assert result is not None
    assert result["extra"]["patient_id"] == REDACTED
    assert result["extra"]["safe_key"] == "visible"
    assert result["extra"]["count"] == 42


# ---------------------------------------------------------------------------
# URL query scrub
# ---------------------------------------------------------------------------


def test_url_query_scrubbed() -> None:
    event = {
        "request": {
            "url": "https://a.com/api/encounters/1?mrn=ABC&ok=1",
        }
    }
    result = scrub_event(event)
    assert result is not None
    url = result["request"]["url"]
    assert "ABC" not in url
    assert "ok=1" in url
    # Either literal "[Filtered]" or URL-encoded form is acceptable.
    assert "[Filtered]" in url or "%5BFiltered%5D" in url


def test_url_without_query_untouched() -> None:
    event = {"request": {"url": "https://a.com/api/healthz"}}
    result = scrub_event(event)
    assert result is not None
    assert result["request"]["url"] == "https://a.com/api/healthz"


# ---------------------------------------------------------------------------
# Clinical body-drop — one test per CLINICAL_PREFIX (7 tests)
# ---------------------------------------------------------------------------


def _body_drop_event(prefix: str) -> dict[str, Any]:
    return {
        "request": {
            "url": f"https://a.com{prefix}/123",
            "data": {"soap_text": "PHI that must be dropped"},
        }
    }


def _assert_body_dropped(result: dict[str, Any] | None) -> None:
    assert result is not None
    assert "data" not in result["request"], "request.data was not dropped"
    assert result.get("tags", {}).get("route_type") == "clinical"


def test_clinical_body_drop_encounters() -> None:
    _assert_body_dropped(scrub_event(_body_drop_event("/api/encounters")))


def test_clinical_body_drop_patients() -> None:
    _assert_body_dropped(scrub_event(_body_drop_event("/api/patients")))


def test_clinical_body_drop_ai_scribe() -> None:
    _assert_body_dropped(scrub_event(_body_drop_event("/api/ai-scribe")))


def test_clinical_body_drop_claims() -> None:
    _assert_body_dropped(scrub_event(_body_drop_event("/api/claims")))


def test_clinical_body_drop_vitals() -> None:
    _assert_body_dropped(scrub_event(_body_drop_event("/api/vitals")))


def test_clinical_body_drop_exam_findings() -> None:
    _assert_body_dropped(scrub_event(_body_drop_event("/api/exam-findings")))


def test_clinical_body_drop_superbills() -> None:
    _assert_body_dropped(scrub_event(_body_drop_event("/api/superbills")))


def test_non_clinical_route_keeps_body() -> None:
    event = {
        "request": {
            "url": "https://a.com/api/healthz",
            "data": {"status": "ok"},
        }
    }
    result = scrub_event(event)
    assert result is not None
    assert "data" in result["request"]
    assert result.get("tags", {}).get("route_type") != "clinical"


# ---------------------------------------------------------------------------
# Ignore rules
# ---------------------------------------------------------------------------


def test_ignore_rules() -> None:
    # ClientDisconnect → drop (None)
    ClientDisconnect = type("ClientDisconnect", (Exception,), {})
    cd_hint = {"exc_info": (ClientDisconnect, ClientDisconnect(), None)}
    assert scrub_event({}, cd_hint) is None

    # HTTPException 401 → drop
    exc_401 = HTTPException(status_code=401, detail="unauthorized")
    hint_401 = {"exc_info": (HTTPException, exc_401, None)}
    assert scrub_event({}, hint_401) is None

    # HTTPException 403 → drop
    exc_403 = HTTPException(status_code=403, detail="forbidden")
    hint_403 = {"exc_info": (HTTPException, exc_403, None)}
    assert scrub_event({}, hint_403) is None

    # HTTPException 500 → keep (real server error, we want to see it)
    exc_500 = HTTPException(status_code=500, detail="server error")
    hint_500 = {"exc_info": (HTTPException, exc_500, None)}
    result = scrub_event({"extra": {"safe": 1}}, hint_500)
    assert result is not None
    assert result["extra"]["safe"] == 1


def test_no_hint_keeps_event() -> None:
    result = scrub_event({"extra": {"safe": 1}})
    assert result is not None
    assert result["extra"]["safe"] == 1


# ---------------------------------------------------------------------------
# User context
# ---------------------------------------------------------------------------


def test_user_context_stripped() -> None:
    event = {
        "user": {
            "id": "u1",
            "email": "x@y.com",
            "full_name": "Dr Smith",
            "role": "OWNER",
            "tenant_slug": "clinic",
        }
    }
    result = scrub_event(event)
    assert result is not None
    assert result["user"] == {"id": "u1"}


def test_user_context_absent_not_created() -> None:
    event = {"extra": {"safe": 1}}
    result = scrub_event(event)
    assert result is not None
    assert "user" not in result


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
