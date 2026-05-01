"""backend/tests/test_permissions.py — RBAC permission engine coverage.

Closes audit gap #2 (2026-05-01): server-side authz was previously only
exercised through the frontend `useEntitlements()` hook. This file verifies:

  1. PERMISSION_MATRIX structural integrity (every action mapped, every
     allowed value is a real StaffRole, no orphan actions)
  2. The `require_permission()` checker returns/denies as expected when
     called directly with a synthetic TenantContext (no JWT, no DB)
  3. Critical role-action invariants — clinical-safety guardrails like
     "only doctors and owners can finalize an encounter" or "only the
     owner can read system status"
  4. Route-level integration — TestClient + dependency override to verify
     real endpoints return 403. Wave 0 skip-stubs; promote when an
     ASGI-fixture lands.

The matrix tests are intentionally explicit (one assertion per action)
so a careless `+= {RECEPTIONIST}` to a sensitive action surfaces in CI.
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi import HTTPException

from backend.core.permissions import (
    PERMISSION_MATRIX,
    ClinicalAction,
    require_permission,
)
from backend.core.security import TenantContext
from backend.db.models.tenant.clinical import StaffRole


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _ctx(role: str) -> TenantContext:
    """Build a synthetic TenantContext for a given role string."""
    return TenantContext(
        user_id=uuid4(),
        tenant_id=uuid4(),
        role=role,
        plan_name="Premium",
    )


ALL_ROLES = [r.value for r in StaffRole]


# ---------------------------------------------------------------------------
# 1. Matrix structural integrity
# ---------------------------------------------------------------------------


class TestMatrixIntegrity:
    def test_every_clinical_action_has_a_matrix_entry(self):
        """A new ClinicalAction without a PERMISSION_MATRIX entry would
        default-deny silently — surface that as a test failure instead."""
        missing = [a for a in ClinicalAction if a not in PERMISSION_MATRIX]
        assert missing == [], f"Actions missing from PERMISSION_MATRIX: {missing}"

    def test_no_action_has_an_empty_role_set(self):
        """Empty role set means no one can perform the action — almost
        certainly a typo, since OWNER should usually be included."""
        empty = [a for a, roles in PERMISSION_MATRIX.items() if not roles]
        assert empty == [], f"Actions with empty role set: {empty}"

    def test_all_matrix_values_are_real_staff_roles(self):
        valid = set(StaffRole)
        for action, roles in PERMISSION_MATRIX.items():
            for role in roles:
                assert role in valid, f"{action}: {role!r} is not a StaffRole"

    def test_owner_can_perform_every_action(self):
        """OWNER is the superset role per StaffRole comment ('All permissions
        + subscription management'). Any action OWNER cannot perform is
        almost certainly a bug."""
        gaps = [
            a for a, roles in PERMISSION_MATRIX.items()
            if StaffRole.OWNER not in roles
        ]
        assert gaps == [], f"OWNER missing from these actions: {gaps}"


# ---------------------------------------------------------------------------
# 2. require_permission() checker — direct invocation
# ---------------------------------------------------------------------------


class TestCheckerBehavior:
    async def test_returns_ctx_when_role_is_allowed(self):
        checker = require_permission(ClinicalAction.VIEW_PATIENT)
        ctx = _ctx("doctor")
        result = await checker(ctx=ctx)
        assert result is ctx  # returned unchanged

    async def test_raises_403_when_role_is_denied(self):
        checker = require_permission(ClinicalAction.GENERATE_AI_SCRIBE)
        with pytest.raises(HTTPException) as exc:
            await checker(ctx=_ctx("technician"))
        assert exc.value.status_code == 403
        assert "technician" in exc.value.detail
        assert "generate_ai_scribe" in exc.value.detail

    async def test_raises_403_when_role_is_unknown(self):
        """Defends against JWT tampering or a stale role string in
        app_metadata referring to a role that has since been removed."""
        checker = require_permission(ClinicalAction.VIEW_PATIENT)
        with pytest.raises(HTTPException) as exc:
            await checker(ctx=_ctx("super_admin"))
        assert exc.value.status_code == 403
        assert "super_admin" in exc.value.detail

    async def test_raises_403_when_role_is_empty_string(self):
        checker = require_permission(ClinicalAction.VIEW_PATIENT)
        with pytest.raises(HTTPException):
            await checker(ctx=_ctx(""))


# ---------------------------------------------------------------------------
# 3. Critical role-action invariants
#
# Each test below asserts an explicit allow-set for a sensitive action.
# These are the guardrails that protect clinical correctness, billing
# accuracy, and admin-only surfaces. If you intentionally widen one of
# these, update the test in the same commit.
# ---------------------------------------------------------------------------


class TestClinicalGuardrails:
    """Clinical actions that must NOT be accessible to non-clinicians."""

    def test_finalize_encounter_is_doctor_or_owner_only(self):
        # Receptionist/technician/admin must NEVER finalize a chart —
        # that's a regulatory + clinical-correctness boundary.
        assert PERMISSION_MATRIX[ClinicalAction.FINALIZE_ENCOUNTER] == {
            StaffRole.DOCTOR,
            StaffRole.OWNER,
        }

    def test_generate_ai_scribe_is_doctor_or_owner_only(self):
        # Technicians transcribe vitals but should not run the LLM scribe;
        # that produces an A&P that becomes part of the legal record.
        assert PERMISSION_MATRIX[ClinicalAction.GENERATE_AI_SCRIBE] == {
            StaffRole.DOCTOR,
            StaffRole.OWNER,
        }

    def test_edit_exam_findings_is_doctor_or_owner_only(self):
        # Technicians can VIEW exam findings (pre-test prep) but not edit —
        # only the diagnosing clinician records anterior/posterior findings.
        assert PERMISSION_MATRIX[ClinicalAction.EDIT_EXAM_FINDINGS] == {
            StaffRole.DOCTOR,
            StaffRole.OWNER,
        }

    def test_create_diagnosis_is_doctor_or_owner_only(self):
        assert PERMISSION_MATRIX[ClinicalAction.CREATE_DIAGNOSIS] == {
            StaffRole.DOCTOR,
            StaffRole.OWNER,
        }

    def test_delete_diagnosis_is_doctor_or_owner_only(self):
        assert PERMISSION_MATRIX[ClinicalAction.DELETE_DIAGNOSIS] == {
            StaffRole.DOCTOR,
            StaffRole.OWNER,
        }

    def test_start_exam_is_doctor_or_owner_only(self):
        # Transition into the exam room — gates the scribe + clinical fields.
        assert PERMISSION_MATRIX[ClinicalAction.START_EXAM] == {
            StaffRole.DOCTOR,
            StaffRole.OWNER,
        }


class TestAdminGuardrails:
    """Admin / owner-only surfaces."""

    def test_view_system_status_is_owner_only(self):
        # Per the inline comment in permissions.py — system health / errors /
        # uptime is OWNER-only and must not regress to admin.
        assert PERMISSION_MATRIX[ClinicalAction.VIEW_SYSTEM_STATUS] == {
            StaffRole.OWNER,
        }

    def test_view_audit_log_is_admin_or_owner_only(self):
        assert PERMISSION_MATRIX[ClinicalAction.VIEW_AUDIT_LOG] == {
            StaffRole.ADMIN,
            StaffRole.OWNER,
        }

    def test_manage_staff_is_admin_or_owner_only(self):
        assert PERMISSION_MATRIX[ClinicalAction.MANAGE_STAFF] == {
            StaffRole.ADMIN,
            StaffRole.OWNER,
        }

    def test_view_attendance_is_admin_or_owner_only(self):
        assert PERMISSION_MATRIX[ClinicalAction.VIEW_ATTENDANCE] == {
            StaffRole.ADMIN,
            StaffRole.OWNER,
        }


class TestBillingAndAnalyticsGuardrails:
    """Receptionist + technician must not reach billing/analytics surfaces."""

    @pytest.mark.parametrize(
        "action",
        [
            ClinicalAction.VIEW_BILLING,
            ClinicalAction.MANAGE_BILLING,
            ClinicalAction.VIEW_ANALYTICS,
        ],
    )
    def test_excludes_technician_and_receptionist(self, action):
        roles = PERMISSION_MATRIX[action]
        assert StaffRole.TECHNICIAN not in roles, f"{action}: technician should not have access"
        assert StaffRole.RECEPTIONIST not in roles, f"{action}: receptionist should not have access"


class TestInventoryAndOpticalGuardrails:
    """Phase 13 retail-inventory matrix — newest section, most likely to drift."""

    def test_manage_inventory_is_admin_or_owner_only(self):
        # Stock adjustments + receive operations must be supervised.
        assert PERMISSION_MATRIX[ClinicalAction.MANAGE_INVENTORY] == {
            StaffRole.ADMIN,
            StaffRole.OWNER,
        }

    def test_cancel_optical_order_is_admin_or_owner_only(self):
        # Cancelling restores stock — admin/owner gate prevents accidental
        # inventory restoration by front-desk staff.
        assert PERMISSION_MATRIX[ClinicalAction.CANCEL_OPTICAL_ORDER] == {
            StaffRole.ADMIN,
            StaffRole.OWNER,
        }

    def test_view_inventory_is_open_to_all_staff(self):
        assert PERMISSION_MATRIX[ClinicalAction.VIEW_INVENTORY] == set(StaffRole)


# ---------------------------------------------------------------------------
# 4. Parameterized matrix sweep — ensures the checker agrees with the matrix
# for every (action, role) combination. Catches divergence between the
# matrix and the checker (e.g., a future short-circuit bug).
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("action", list(ClinicalAction))
@pytest.mark.parametrize("role", ALL_ROLES)
async def test_checker_matches_matrix_for_every_role_action_pair(
    action: ClinicalAction, role: str
):
    checker = require_permission(action)
    ctx = _ctx(role)
    allowed = StaffRole(role) in PERMISSION_MATRIX[action]

    if allowed:
        result = await checker(ctx=ctx)
        assert result is ctx
    else:
        with pytest.raises(HTTPException) as exc:
            await checker(ctx=ctx)
        assert exc.value.status_code == 403


# ---------------------------------------------------------------------------
# 5. Route-level integration — Wave 0 skip stubs.
#
# These need an ASGI TestClient + dependency override for get_current_tenant
# to inject a synthetic TenantContext per test. Promote when that fixture
# lands. Each test verifies the actual route (not just the matrix) returns
# 403 for a denied role — guards against a future route accidentally
# omitting the require_permission() dependency.
# ---------------------------------------------------------------------------


class TestRouteLevelEnforcement:
    def test_technician_cannot_post_ai_scribe_generate(self):
        pytest.skip("needs ASGI client + get_current_tenant override")

    def test_technician_cannot_post_ai_scribe_accept(self):
        pytest.skip("needs ASGI client + get_current_tenant override")

    def test_receptionist_cannot_finalize_encounter(self):
        pytest.skip("needs ASGI client + get_current_tenant override")

    def test_admin_cannot_view_system_status(self):
        # Owner-only — admin must see 403 even though they outrank doctors.
        pytest.skip("needs ASGI client + get_current_tenant override")

    def test_doctor_cannot_manage_inventory(self):
        # Doctor sees inventory levels but cannot adjust stock.
        pytest.skip("needs ASGI client + get_current_tenant override")

    def test_receptionist_cannot_cancel_optical_order(self):
        pytest.skip("needs ASGI client + get_current_tenant override")

    def test_unknown_role_in_jwt_returns_403_not_500(self):
        # Defends against a JWT carrying a stale role string.
        pytest.skip("needs ASGI client + get_current_tenant override")
