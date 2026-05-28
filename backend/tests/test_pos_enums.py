"""POS-12 — 13 new AuditAction VARCHAR values + 6 new ClinicalAction values."""

import pytest

try:
    from backend.db.models.tenant.clinical import AuditAction, ClinicalAction
except ImportError:
    pytest.skip(
        "AuditAction/ClinicalAction not yet importable (pre-Phase 1 baseline)",
        allow_module_level=True,
    )


POS_AUDIT_ACTIONS = {
    "SALE_CREATE",
    "SALE_OPENED",
    "SALE_PAID",
    "SALE_VOIDED",
    "PAYMENT_RECORDED",
    "PAYMENT_FAILED",
    "WRITE_OFF_RECORDED",
    "REFUND_ISSUED",
    "RECEIPT_EMAILED",
    "RECEIPT_PRINTED",
    "DAILY_CLOSE_RUN",
    "SALE_DISCOUNT_APPLIED",
    "STRIPE_KEYS_UPDATED",
    "STRIPE_WEBHOOK_RECEIVED",
}

POS_CLINICAL_ACTIONS = {
    "OPEN_POS",
    "RECORD_PAYMENT",
    "RECORD_WRITE_OFF",
    "ISSUE_REFUND",
    "RUN_DAILY_CLOSE",
    "MANAGE_PAYMENT_CONFIG",
}


def test_pos_audit_actions_present():
    if not hasattr(AuditAction, "SALE_CREATE"):
        pytest.skip("Phase 15 AuditAction values not yet added (Plan 15-01)")
    existing = {a.name for a in AuditAction}
    missing = POS_AUDIT_ACTIONS - existing
    assert not missing, f"Missing AuditAction values: {missing}"


def test_pos_clinical_actions_present():
    if not hasattr(ClinicalAction, "OPEN_POS"):
        pytest.skip("Phase 15 ClinicalAction values not yet added (Plan 15-01)")
    existing = {a.name for a in ClinicalAction}
    missing = POS_CLINICAL_ACTIONS - existing
    assert not missing, f"Missing ClinicalAction values: {missing}"
