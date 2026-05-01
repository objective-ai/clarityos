"""backend/tests/test_ai_scribe.py — AI Scribe route coverage scaffold.

Covers the gaps identified in the test-coverage audit (2026-05-01):

  1. Pydantic request schema validation (pure, runs today)
  2. SOAP / JSON delimiter split logic (pure, runs today)
  3. AcceptRequest.changes payload navigation (pure, runs today)
  4. Route-level integration: 503/404/409, persistence, audit log
     (DB-dependent — uses Wave 0 skip pattern matching backend/tests/conftest.py)

The integration tests are scaffolded as skip-stubs so the file is import-clean
today; promoting them to live tests is a follow-up plan that needs a real
async-DB fixture + mocked Anthropic client.
"""

from __future__ import annotations

import json

import pytest
from pydantic import ValidationError

from backend.api.routes.ai_scribe import AiScribeAcceptRequest, AiScribeRequest
from backend.services.ai_scribe import (
    JSON_DELIMITER as DELIMITER,
    resolve_assessment_and_plan as _resolve_ap_value,
    split_soap_and_json as _split_soap_and_json,
)


# ---------------------------------------------------------------------------
# 1. Pydantic schema validation
# ---------------------------------------------------------------------------


class TestAiScribeRequest:
    def test_accepts_transcript_at_min_length(self):
        req = AiScribeRequest(transcript="x" * 10)
        assert req.transcript == "x" * 10

    def test_rejects_transcript_below_min_length(self):
        with pytest.raises(ValidationError):
            AiScribeRequest(transcript="too short")

    def test_rejects_missing_transcript(self):
        with pytest.raises(ValidationError):
            AiScribeRequest()  # type: ignore[call-arg]

    def test_rejects_non_string_transcript(self):
        with pytest.raises(ValidationError):
            AiScribeRequest(transcript=12345)  # type: ignore[arg-type]


class TestAiScribeAcceptRequest:
    def test_accepts_arbitrary_dict_shape(self):
        req = AiScribeAcceptRequest(changes={"assessment_and_plan": {"new": "Plan text"}})
        assert req.changes["assessment_and_plan"]["new"] == "Plan text"

    def test_accepts_empty_dict(self):
        # The route is defensive — empty changes should not raise at schema level
        req = AiScribeAcceptRequest(changes={})
        assert req.changes == {}

    def test_rejects_non_dict_changes(self):
        with pytest.raises(ValidationError):
            AiScribeAcceptRequest(changes="not a dict")  # type: ignore[arg-type]

    def test_rejects_missing_changes(self):
        with pytest.raises(ValidationError):
            AiScribeAcceptRequest()  # type: ignore[call-arg]


# ---------------------------------------------------------------------------
# 2. SOAP / JSON delimiter split — imported from backend/services/ai_scribe.py
# ---------------------------------------------------------------------------


class TestSoapJsonSplit:
    def test_happy_path(self):
        soap, j = _split_soap_and_json(
            f"SUBJECTIVE: pt reports blurry vision\n\n{DELIMITER}\n{{\"chief_complaint\": null}}"
        )
        assert soap.startswith("SUBJECTIVE")
        assert json.loads(j) == {"chief_complaint": None}

    def test_no_delimiter_keeps_full_text_as_soap(self):
        # Claude returned SOAP only — JSON portion missing. Route saves SOAP only.
        soap, j = _split_soap_and_json("SUBJECTIVE: only SOAP, no JSON section")
        assert soap == "SUBJECTIVE: only SOAP, no JSON section"
        assert j == ""

    def test_empty_soap_with_only_json(self):
        # Defensive: model output begins with delimiter (unlikely but possible)
        soap, j = _split_soap_and_json(f"{DELIMITER}\n{{}}")
        assert soap == ""
        assert json.loads(j) == {}

    def test_multiple_delimiters_drops_anything_after_second(self):
        # If the model emits the delimiter twice, only the segment between
        # the first and second delimiter survives — anything after the second
        # is silently discarded. Documents current behavior; flag if we ever
        # want to be stricter (raise) or more permissive (concat all parts).
        soap, j = _split_soap_and_json(
            f"SOAP body{DELIMITER}{{\"a\": 1}}{DELIMITER}garbage"
        )
        assert soap == "SOAP body"
        assert j == '{"a": 1}'
        assert DELIMITER not in j
        assert "garbage" not in j

    def test_strips_trailing_whitespace_from_soap(self):
        soap, _ = _split_soap_and_json(f"SOAP   \n\n  {DELIMITER}\n{{}}")
        assert soap == "SOAP"


# ---------------------------------------------------------------------------
# 3. Accept payload navigation — imported from backend/services/ai_scribe.py
# ---------------------------------------------------------------------------


class TestResolveAssessmentAndPlan:
    def test_persists_string_new_value(self):
        assert _resolve_ap_value({"assessment_and_plan": {"new": "1. Myopia\n2. RTC 6mo"}}) == (
            "1. Myopia\n2. RTC 6mo"
        )

    def test_ignores_missing_key(self):
        assert _resolve_ap_value({}) is None
        assert _resolve_ap_value({"vitals": {"new": "x"}}) is None

    def test_ignores_none_value(self):
        assert _resolve_ap_value({"assessment_and_plan": None}) is None

    def test_ignores_non_dict_change_entry(self):
        # Catches a real bug — earlier shapes had `"assessment_and_plan": "raw text"`
        assert _resolve_ap_value({"assessment_and_plan": "raw text"}) is None
        assert _resolve_ap_value({"assessment_and_plan": ["a", "b"]}) is None

    def test_ignores_missing_new_field(self):
        assert _resolve_ap_value({"assessment_and_plan": {"old": "x"}}) is None

    def test_ignores_non_string_new(self):
        assert _resolve_ap_value({"assessment_and_plan": {"new": 42}}) is None
        assert _resolve_ap_value({"assessment_and_plan": {"new": None}}) is None
        assert _resolve_ap_value({"assessment_and_plan": {"new": ""}}) is None  # falsy guard

    def test_empty_string_does_not_overwrite(self):
        # Guards against a "clear A&P" payload accidentally wiping a saved note
        assert _resolve_ap_value({"assessment_and_plan": {"new": ""}}) is None


# ---------------------------------------------------------------------------
# 4. Route-level integration — Wave 0 skip stubs.
#
# These need:
#   * a real async DB session (currently a Wave 0 stub in conftest.py)
#   * a mocked Anthropic client that yields a deterministic SSE stream
#   * a TenantContext fixture with GENERATE_AI_SCRIBE permission
#
# Promote when the conftest fixtures land. Each test below documents the
# specific behavior it should verify.
# ---------------------------------------------------------------------------


class TestGenerateAiScribeRoute:
    def test_returns_503_when_anthropic_key_missing(self):
        pytest.skip("needs DB+settings override fixture — see test_ai_scribe.py header")

    def test_returns_404_when_encounter_does_not_belong_to_tenant(self):
        pytest.skip("needs DB+TenantContext fixture")

    def test_returns_409_when_encounter_is_finalized(self):
        pytest.skip("needs DB fixture + finalized encounter factory")

    def test_persists_soap_text_on_stream_completion(self):
        pytest.skip(
            "needs DB fixture + mocked Anthropic stream — assert "
            "enc.ai_summary_text == soap_part_before_delimiter and that "
            "ai_summary_generated_at is set"
        )

    def test_writes_audit_log_entry(self):
        pytest.skip("needs DB fixture — assert AuditAction.AI_SCRIBE_GENERATED row exists")

    def test_streams_sse_data_lines(self):
        pytest.skip(
            "needs httpx ASGI client — assert 'text/event-stream' content-type and "
            "that yielded chunks match `data: {...}\\n\\n` shape"
        )

    def test_does_not_persist_assessment_and_plan_during_streaming(self):
        # Guard against regression of the explicit comment in the route:
        # 'A&P is no longer auto-saved during streaming'
        pytest.skip("needs DB fixture")


class TestAcceptAiScribeRoute:
    def test_returns_404_when_encounter_does_not_belong_to_tenant(self):
        pytest.skip("needs DB+TenantContext fixture")

    def test_persists_assessment_and_plan_when_change_is_string(self):
        pytest.skip("needs DB fixture — assert enc.assessment_and_plan updated")

    def test_does_not_persist_when_assessment_and_plan_is_non_dict(self):
        pytest.skip("needs DB fixture — assert enc.assessment_and_plan unchanged")

    def test_writes_audit_log_with_changes_payload_and_ai_model_metadata(self):
        pytest.skip(
            "needs DB fixture — assert AuditAction.AI_SCRIBE_AUTOFILL row contains "
            "the changes dict and metadata.ai_model"
        )

    def test_returns_201_with_logged_status(self):
        pytest.skip("needs ASGI client + DB fixture")
