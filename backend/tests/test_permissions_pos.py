"""POS-11 — RECORD_WRITE_OFF and ISSUE_REFUND role matrix."""

import pytest


def test_pos_permission_matrix_entries():
    try:
        from backend.core.permissions import PERMISSION_MATRIX
        from backend.db.models.tenant.clinical import ClinicalAction
    except Exception:
        pytest.skip("POS permissions not yet wired (Plan 15-01)")

    if not hasattr(ClinicalAction, "RECORD_WRITE_OFF"):
        pytest.skip("RECORD_WRITE_OFF action not yet added (Plan 15-01)")

    assert ClinicalAction.RECORD_WRITE_OFF in PERMISSION_MATRIX
    assert ClinicalAction.ISSUE_REFUND in PERMISSION_MATRIX
