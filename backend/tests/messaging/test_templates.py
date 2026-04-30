"""Tests for backend/services/messaging/templates.py (Plan 12-02 Task 3).

Covers render_template, scrub_phi_for_operational_sms (parametrized over the
PHI corpus), count_sms_segments (GSM-7 + UCS-2).
"""
from __future__ import annotations

import pytest

from backend.services.messaging.templates import (
    ALLOWED_TOKENS,
    PHIInTemplate,
    TemplateRenderError,
    count_sms_segments,
    render_template,
    scrub_phi_for_operational_sms,
)
from backend.tests.messaging.fixtures.phi_scrub_corpus import TEST_CORPUS


# ── PHI denylist ────────────────────────────────────────────────────────────

@pytest.mark.parametrize("phi_text,expected_term", TEST_CORPUS)
def test_phi_scrub_blocks_corpus_entries(phi_text, expected_term):
    body = f"Reminder: appointment. Note: {phi_text}"
    with pytest.raises(PHIInTemplate):
        scrub_phi_for_operational_sms(body)


def test_phi_scrub_allows_clean_operational_template():
    body = "Reminder: your eye exam tomorrow at 10:00 AM at Clarity Clinic."
    scrub_phi_for_operational_sms(body)


def test_phi_scrub_records_matches_on_exception():
    try:
        scrub_phi_for_operational_sms("Patient has glaucoma — please confirm.")
    except PHIInTemplate as exc:
        assert "glaucoma" in exc.matches
    else:
        pytest.fail("expected PHIInTemplate")


# ── render_template ──────────────────────────────────────────────────────────

def test_render_substitutes_all_seven_allowed_tokens():
    body = (
        "Hi {{patient_first_name}}, your eye exam at {{clinic_name}} with "
        "{{provider_name}} is on {{appt_date}} at {{appt_time}}. "
        "Confirm: {{confirm_link}}  Reschedule: {{reschedule_link}}"
    )
    out = render_template(
        body=body,
        tokens={
            "patient_first_name": "Jane",
            "clinic_name": "Clarity Optometry",
            "provider_name": "Dr. Smith",
            "appt_date": "May 5",
            "appt_time": "10:00 AM",
            "confirm_link": "https://c/y",
            "reschedule_link": "https://c/r",
        },
    )
    assert "{{" not in out
    assert "Jane" in out and "Clarity Optometry" in out and "Dr. Smith" in out


def test_render_raises_when_required_token_missing():
    with pytest.raises(TemplateRenderError):
        render_template(
            body="Hi {{patient_first_name}}",
            tokens={},
            required={"patient_first_name"},
        )


def test_render_raises_when_required_token_empty_string():
    with pytest.raises(TemplateRenderError):
        render_template(
            body="Hi {{patient_first_name}}",
            tokens={"patient_first_name": ""},
            required={"patient_first_name"},
        )


def test_render_leaves_unknown_tokens_untouched():
    out = render_template(
        body="Hi {{patient_first_name}}, code {{unknown_token}}",
        tokens={"patient_first_name": "Jane"},
    )
    assert "Jane" in out
    assert "{{unknown_token}}" in out


def test_allowed_tokens_set_size():
    assert len(ALLOWED_TOKENS) == 7


# ── count_sms_segments ──────────────────────────────────────────────────────

def test_segment_count_short_gsm7():
    assert count_sms_segments("Hello") == (1, "GSM-7")


def test_segment_count_exactly_160_gsm7():
    assert count_sms_segments("x" * 160) == (1, "GSM-7")


def test_segment_count_long_gsm7_concatenated():
    seg, enc = count_sms_segments("x" * 161)
    assert seg == 2 and enc == "GSM-7"


def test_segment_count_three_segments_gsm7():
    seg, enc = count_sms_segments("x" * 307)
    assert seg == 3 and enc == "GSM-7"


def test_segment_count_emoji_triggers_ucs2():
    seg, enc = count_sms_segments("Hello 👋")
    assert enc == "UCS-2" and seg == 1


def test_segment_count_long_ucs2_concatenated():
    body = "👋" * 80
    seg, enc = count_sms_segments(body)
    assert enc == "UCS-2" and seg >= 2


def test_segment_count_accented_chars_stay_gsm7():
    """Accented chars in the GSM-7 extended alphabet stay GSM-7."""
    seg, enc = count_sms_segments("café")
    assert enc == "GSM-7"
