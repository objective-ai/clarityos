"""Unit tests for the clinical-route tagger / body-drop behavior exposed via
backend.core.sentry_setup._before_send (which delegates to scrub_event).

One parametrized assertion per CLINICAL_PREFIX verifies the body is dropped and
the event gains route_type=clinical tag. A negative case verifies non-clinical
routes keep the data dict (though deny-list still redacts sensitive keys).
"""
from __future__ import annotations

import pytest

from backend.core.sentry_setup import _before_send
from backend.core.sentry_scrubber import CLINICAL_PREFIXES


@pytest.mark.parametrize("prefix", list(CLINICAL_PREFIXES))
def test_clinical_body_dropped_for_each_prefix(prefix):
    event = {
        "request": {
            "url": f"https://api.example.com{prefix}/123",
            "data": {"soap_text": "PATIENT PHI"},
        }
    }
    result = _before_send(event, {})
    assert result is not None
    assert result["tags"]["route_type"] == "clinical"
    assert "data" not in result["request"]


def test_non_clinical_route_untouched():
    event = {
        "request": {
            "url": "https://api.example.com/api/staff",
            "data": {"notes": "X"},
        }
    }
    result = _before_send(event, {})
    # deny-list still redacts 'notes' but the clinical tag is not set
    assert result is not None
    assert result.get("tags", {}).get("route_type") != "clinical"
    # data dict is still present (body-drop did not fire)
    assert "data" in result["request"]
    assert result["request"]["data"]["notes"] == "[Filtered]"
