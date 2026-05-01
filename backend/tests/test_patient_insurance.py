"""backend/tests/test_patient_insurance.py — Patient Insurance CRUD coverage.

Closes audit gap #3 (2026-05-01): patient insurance CRUD had no backend tests.
Covers:

  1. Pydantic request schema validation — priority, plan_type, eligibility_status
     enums; partial-update permissiveness (pure, runs today)
  2. Route-level RBAC enforcement — technician/receptionist denied on every
     endpoint via the `authed_client` fixture (live, runs today; the 403
     fires inside `require_permission()` before resolver/DB code)
  3. Route-level CRUD behavior — payer-not-found, priority auto-deactivation,
     date-format guards, audit-log emission, hard-delete (DB-dependent;
     scaffolded as Wave 0 skip-stubs matching backend/tests/conftest.py until
     a real `db_session` fixture lands)

The route does some non-trivial work that's worth pinning down with tests
even before live DB tests exist — most notably the `auto-deactivate same-priority active record` flow on both POST and PATCH, which silently
mutates a row the caller didn't reference. The pure-logic tests assert
the schema accepts the shapes that drive those branches; the integration
stubs document the behavior that should be exercised end-to-end.
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from pydantic import ValidationError

from backend.schemas.billing import (
    PatientInsuranceCreate,
    PatientInsuranceUpdate,
)


# ---------------------------------------------------------------------------
# 1. Pydantic schema validation — PatientInsuranceCreate
# ---------------------------------------------------------------------------


class TestPatientInsuranceCreateValidation:
    def _minimal(self, **overrides) -> dict:
        base = {
            "payer_id": uuid4(),
            "priority": "primary",
            "plan_type": "medical",
        }
        base.update(overrides)
        return base

    def test_accepts_minimal_payload(self):
        req = PatientInsuranceCreate(**self._minimal())
        # Defaults that the route relies on
        assert req.relationship_to_subscriber == "self"
        assert req.eligibility_status == "unknown"
        assert req.is_active is True
        assert req.copay_amount is None

    def test_accepts_full_payload(self):
        req = PatientInsuranceCreate(
            **self._minimal(
                priority="secondary",
                plan_type="vision",
                subscriber_id="SUB-123",
                group_number="GRP-456",
                plan_name="Premier PPO",
                relationship_to_subscriber="spouse",
                subscriber_name="Jane Doe",
                subscriber_dob="1980-04-15",
                copay_amount=20.0,
                eligibility_status="active",
                eligibility_verified_date="2026-04-30",
                auth_number="AUTH-789",
                auth_expiry="2026-12-31",
                auth_services="exam,refraction",
                is_active=True,
            )
        )
        assert req.subscriber_dob == "1980-04-15"
        assert req.copay_amount == 20.0
        assert req.auth_services == "exam,refraction"

    @pytest.mark.parametrize("priority", ["primary", "secondary"])
    def test_accepts_valid_priority(self, priority):
        req = PatientInsuranceCreate(**self._minimal(priority=priority))
        assert req.priority == priority

    @pytest.mark.parametrize("priority", ["tertiary", "PRIMARY", "", "main"])
    def test_rejects_invalid_priority(self, priority):
        # priority is the field that resolves real-world conflicts (a patient
        # can have at most one ACTIVE primary + one ACTIVE secondary). A typo
        # like "tertiary" must hard-fail at the schema layer.
        with pytest.raises(ValidationError):
            PatientInsuranceCreate(**self._minimal(priority=priority))

    @pytest.mark.parametrize("plan_type", ["medical", "vision", "other"])
    def test_accepts_valid_plan_type(self, plan_type):
        req = PatientInsuranceCreate(**self._minimal(plan_type=plan_type))
        assert req.plan_type == plan_type

    @pytest.mark.parametrize("plan_type", ["dental", "MEDICAL", "", "health"])
    def test_rejects_invalid_plan_type(self, plan_type):
        with pytest.raises(ValidationError):
            PatientInsuranceCreate(**self._minimal(plan_type=plan_type))

    @pytest.mark.parametrize(
        "status",
        ["active", "inactive", "pending_verification", "expired", "unknown"],
    )
    def test_accepts_valid_eligibility_status(self, status):
        req = PatientInsuranceCreate(
            **self._minimal(eligibility_status=status)
        )
        assert req.eligibility_status == status

    @pytest.mark.parametrize(
        "status", ["verified", "ACTIVE", "", "in_review"]
    )
    def test_rejects_invalid_eligibility_status(self, status):
        with pytest.raises(ValidationError):
            PatientInsuranceCreate(**self._minimal(eligibility_status=status))

    def test_rejects_missing_payer_id(self):
        payload = self._minimal()
        payload.pop("payer_id")
        with pytest.raises(ValidationError):
            PatientInsuranceCreate(**payload)

    def test_rejects_non_uuid_payer_id(self):
        with pytest.raises(ValidationError):
            PatientInsuranceCreate(**self._minimal(payer_id="not-a-uuid"))

    def test_dates_are_passthrough_strings_at_schema_level(self):
        # Dates are validated at the route layer (date.fromisoformat). The
        # schema intentionally accepts any string so the route can return a
        # 422 with a field-specific message instead of a generic Pydantic
        # error. Pin that contract: schema accepts garbage, route rejects.
        req = PatientInsuranceCreate(
            **self._minimal(
                subscriber_dob="not-a-date",
                eligibility_verified_date="2026-13-99",
                auth_expiry="garbage",
            )
        )
        assert req.subscriber_dob == "not-a-date"
        assert req.eligibility_verified_date == "2026-13-99"
        assert req.auth_expiry == "garbage"


# ---------------------------------------------------------------------------
# 2. Pydantic schema validation — PatientInsuranceUpdate
# ---------------------------------------------------------------------------


class TestPatientInsuranceUpdateValidation:
    def test_accepts_empty_update(self):
        # Empty PATCH is valid — exclude_unset() in the route makes it a no-op.
        req = PatientInsuranceUpdate()
        assert req.model_dump(exclude_unset=True) == {}

    def test_accepts_single_field_update(self):
        req = PatientInsuranceUpdate(eligibility_status="active")
        dumped = req.model_dump(exclude_unset=True)
        assert dumped == {"eligibility_status": "active"}

    def test_accepts_is_active_toggle(self):
        # The flow "deactivate the existing primary, activate a new one" is
        # the single most common UI action — make sure a bare `{is_active: true}`
        # round-trips cleanly.
        req = PatientInsuranceUpdate(is_active=True)
        assert req.is_active is True
        assert req.model_dump(exclude_unset=True) == {"is_active": True}

    def test_update_does_not_validate_priority_enum(self):
        # PatientInsuranceUpdate has NO field_validator on priority — unlike
        # PatientInsuranceCreate. This is a known asymmetry: the update path
        # was added in Phase 10.1 and the Phase 9 enum guard wasn't ported.
        # Test pins the current behavior so a future tightening is intentional.
        req = PatientInsuranceUpdate(priority="tertiary")
        assert req.priority == "tertiary"

    def test_update_does_not_validate_plan_type_enum(self):
        req = PatientInsuranceUpdate(plan_type="dental")
        assert req.plan_type == "dental"

    def test_update_does_not_validate_eligibility_status_enum(self):
        req = PatientInsuranceUpdate(eligibility_status="bogus")
        assert req.eligibility_status == "bogus"

    def test_rejects_non_uuid_payer_id(self):
        with pytest.raises(ValidationError):
            PatientInsuranceUpdate(payer_id="not-a-uuid")

    def test_copay_amount_accepts_zero_and_decimal(self):
        # Real plans run from $0 (preventive) up; no upper bound on schema.
        assert PatientInsuranceUpdate(copay_amount=0).copay_amount == 0
        assert PatientInsuranceUpdate(copay_amount=15.50).copay_amount == 15.50


# ---------------------------------------------------------------------------
# 3. Route-level RBAC enforcement
#
# Lives, runs today — uses `authed_client` from conftest.py which overrides
# get_current_tenant entirely. The 403 fires inside require_permission()
# before resolve_patient_id() touches the DB, so the dummy patient_id is fine.
#
# VIEW_BILLING / MANAGE_BILLING are doctor/admin/owner only — technician and
# receptionist must be rejected on every endpoint.
# ---------------------------------------------------------------------------


DUMMY_PATIENT = "00000000-0000-0000-0000-000000000001"
DUMMY_INSURANCE = "00000000-0000-0000-0000-000000000002"


class TestRouteLevelRBAC:
    @pytest.mark.parametrize("role", ["technician", "receptionist"])
    def test_denied_role_cannot_list_insurance(self, authed_client, role):
        client, set_role = authed_client
        set_role(role)
        r = client.get(f"/api/patients/{DUMMY_PATIENT}/insurance")
        assert r.status_code == 403
        assert "view_billing" in r.json()["detail"]

    @pytest.mark.parametrize("role", ["technician", "receptionist"])
    def test_denied_role_cannot_list_superbills(self, authed_client, role):
        client, set_role = authed_client
        set_role(role)
        r = client.get(f"/api/patients/{DUMMY_PATIENT}/superbills")
        assert r.status_code == 403
        assert "view_billing" in r.json()["detail"]

    @pytest.mark.parametrize("role", ["technician", "receptionist"])
    def test_denied_role_cannot_create_insurance(self, authed_client, role):
        client, set_role = authed_client
        set_role(role)
        r = client.post(
            f"/api/patients/{DUMMY_PATIENT}/insurance",
            json={
                "payer_id": str(uuid4()),
                "priority": "primary",
                "plan_type": "medical",
            },
        )
        assert r.status_code == 403
        assert "manage_billing" in r.json()["detail"]

    @pytest.mark.parametrize("role", ["technician", "receptionist"])
    def test_denied_role_cannot_update_insurance(self, authed_client, role):
        client, set_role = authed_client
        set_role(role)
        r = client.patch(
            f"/api/patients/{DUMMY_PATIENT}/insurance/{DUMMY_INSURANCE}",
            json={"eligibility_status": "active"},
        )
        assert r.status_code == 403
        assert "manage_billing" in r.json()["detail"]

    @pytest.mark.parametrize("role", ["technician", "receptionist"])
    def test_denied_role_cannot_delete_insurance(self, authed_client, role):
        client, set_role = authed_client
        set_role(role)
        r = client.delete(
            f"/api/patients/{DUMMY_PATIENT}/insurance/{DUMMY_INSURANCE}"
        )
        assert r.status_code == 403
        assert "manage_billing" in r.json()["detail"]

    def test_unknown_role_returns_403_not_500(self, authed_client):
        client, set_role = authed_client
        set_role("super_admin")
        r = client.get(f"/api/patients/{DUMMY_PATIENT}/insurance")
        assert r.status_code == 403
        assert "super_admin" in r.json()["detail"]


# ---------------------------------------------------------------------------
# 4. Integration stubs — Wave 0 skip-stubs.
#
# Promote when backend/tests/conftest.py grows a real async `db_session`
# + `tenant_context` fixture. Each stub names one route behavior worth
# pinning down end-to-end. The skip body is intentional — these are NOT
# `xfail`, they're pre-flighted scaffolding that should light up when the
# fixture lands rather than rotting.
# ---------------------------------------------------------------------------


class TestRouteIntegration:
    """End-to-end CRUD behaviors that touch the DB. Skip-stubbed for now."""

    def test_post_returns_404_when_payer_does_not_exist(self, db_session):
        pytest.skip(
            "Wave 0 — integration test requires real db_session + payer factory"
        )

    def test_post_returns_404_when_patient_does_not_exist(self, db_session):
        pytest.skip(
            "Wave 0 — integration test requires real db_session + patient factory"
        )

    def test_post_returns_422_for_invalid_subscriber_dob(self, db_session):
        # Schema accepts any string; the route runs date.fromisoformat() and
        # 422s on parse failure. Pin the field-specific error detail.
        pytest.skip("Wave 0 — needs db_session + payer + patient")

    def test_post_returns_422_for_invalid_eligibility_verified_date(self, db_session):
        pytest.skip("Wave 0 — needs db_session + payer + patient")

    def test_post_returns_422_for_invalid_auth_expiry(self, db_session):
        pytest.skip("Wave 0 — needs db_session + payer + patient")

    def test_post_auto_deactivates_existing_primary_when_creating_primary(
        self, db_session
    ):
        # The most surprising behavior in this route: creating a new primary
        # silently sets is_active=False on the existing active primary. The
        # caller did not reference that other row. Make sure E2E asserts
        # both rows post-write: new=active, old=inactive.
        pytest.skip("Wave 0 — needs db_session, payer, patient, existing insurance")

    def test_post_does_not_auto_deactivate_when_is_active_false(self, db_session):
        # Regression guard: creating a record with is_active=false must NOT
        # touch any other row. The `if payload.is_active is not False` check
        # is load-bearing and easy to break with a refactor.
        pytest.skip("Wave 0 — needs db_session, payer, patient, existing insurance")

    def test_post_writes_audit_log_with_create_action(self, db_session):
        # Required by clinical-safety rules: every patient_insurance write
        # must emit an AuditAction.CREATE row referencing the patient_id.
        pytest.skip("Wave 0 — needs db_session + audit_log table read")

    def test_patch_returns_404_when_insurance_belongs_to_other_tenant(self, db_session):
        # Tenant-isolation guard: the WHERE clause filters by tenant_id, so
        # a cross-tenant insurance_id must surface as 404, not 403/500.
        pytest.skip("Wave 0 — needs multi-tenant db_session")

    def test_patch_auto_deactivates_when_setting_is_active_true(self, db_session):
        # Mirror of the POST flow: PATCHing is_active=true on an inactive
        # record deactivates the currently-active record at the same priority.
        pytest.skip("Wave 0 — needs db_session, two existing insurance rows")

    def test_patch_skips_audit_log_when_no_changes(self, db_session):
        # The route's `if changes:` guard skips audit log when the diff is
        # empty. Worth pinning — silent no-ops shouldn't pollute audit history.
        pytest.skip("Wave 0 — needs db_session + audit_log table read")

    def test_patch_writes_audit_log_with_field_diff(self, db_session):
        # When fields actually change, the audit log carries the old/new diff
        # in the `changes` field — used by the audit viewer.
        pytest.skip("Wave 0 — needs db_session + audit_log read")

    def test_delete_hard_deletes_row(self, db_session):
        # DELETE on patient_insurance is HARD delete (not soft). The audit
        # log row is the only persistent trace. Pin this — clinical records
        # default to soft-delete, so this is an intentional exception.
        pytest.skip("Wave 0 — needs db_session + insurance factory")

    def test_delete_writes_audit_log_before_removal(self, db_session):
        # Order matters: audit log must be written BEFORE the row is deleted
        # so the audit row's reference to the now-gone insurance_id is the
        # last record of its existence.
        pytest.skip("Wave 0 — needs db_session + audit_log read")

    def test_get_insurance_orders_by_priority(self, db_session):
        # List endpoint orders by priority ASC — primary before secondary,
        # which the patient Billing tab relies on for display order.
        pytest.skip("Wave 0 — needs db_session + multiple insurance rows")

    def test_get_superbills_filters_deleted_line_items(self, db_session):
        # `active_items = [li for li in line_items if not li.is_deleted]` —
        # the summary's cpt_codes list and total reflect non-deleted lines only.
        pytest.skip("Wave 0 — needs db_session + superbill factory")

    def test_get_superbills_orders_by_created_at_desc(self, db_session):
        # Newest superbill first, per the patient Billing tab UX.
        pytest.skip("Wave 0 — needs db_session + multiple superbills")
