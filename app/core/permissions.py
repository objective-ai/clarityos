"""
core/permissions.py

Role-Based Access Control (RBAC) permission engine.

Defines a ClinicalAction enum and a PERMISSION_MATRIX that maps each action
to the set of StaffRoles allowed to perform it. The require_permission()
dependency factory wraps get_current_tenant and adds the role check.
"""

from __future__ import annotations

from enum import StrEnum

from fastapi import Depends, HTTPException, status

from app.core.security import TenantContext, get_current_tenant
from app.db.models.tenant.clinical import StaffRole


# ---------------------------------------------------------------------------
# Clinical actions
# ---------------------------------------------------------------------------


class ClinicalAction(StrEnum):
    # Encounters
    VIEW_ENCOUNTER = "view_encounter"
    CREATE_ENCOUNTER = "create_encounter"
    UPDATE_ENCOUNTER = "update_encounter"
    FINALIZE_ENCOUNTER = "finalize_encounter"

    # Vitals
    VIEW_VITALS = "view_vitals"
    EDIT_VITALS = "edit_vitals"

    # Refraction
    VIEW_REFRACTION = "view_refraction"
    EDIT_REFRACTION = "edit_refraction"

    # Exam Findings
    VIEW_EXAM_FINDINGS = "view_exam_findings"
    EDIT_EXAM_FINDINGS = "edit_exam_findings"

    # Diagnoses
    VIEW_DIAGNOSIS = "view_diagnosis"
    CREATE_DIAGNOSIS = "create_diagnosis"
    DELETE_DIAGNOSIS = "delete_diagnosis"
    PROMOTE_PROBLEM = "promote_problem"

    # Admin
    VIEW_AUDIT_LOG = "view_audit_log"
    MANAGE_STAFF = "manage_staff"


# ---------------------------------------------------------------------------
# Permission matrix  (action → allowed roles)
# ---------------------------------------------------------------------------

_D = StaffRole.DOCTOR
_T = StaffRole.TECHNICIAN
_R = StaffRole.RECEPTIONIST
_A = StaffRole.ADMIN
_O = StaffRole.OWNER

PERMISSION_MATRIX: dict[ClinicalAction, set[StaffRole]] = {
    # Encounters
    ClinicalAction.VIEW_ENCOUNTER:      {_D, _T, _R, _A, _O},
    ClinicalAction.CREATE_ENCOUNTER:    {_D, _T, _A, _O},
    ClinicalAction.UPDATE_ENCOUNTER:    {_D, _T, _A, _O},
    ClinicalAction.FINALIZE_ENCOUNTER:  {_D, _O},

    # Vitals
    ClinicalAction.VIEW_VITALS:         {_D, _T, _A, _O},
    ClinicalAction.EDIT_VITALS:         {_D, _T, _O},

    # Refraction
    ClinicalAction.VIEW_REFRACTION:     {_D, _T, _A, _O},
    ClinicalAction.EDIT_REFRACTION:     {_D, _T, _O},

    # Exam Findings (clinical — restricted)
    ClinicalAction.VIEW_EXAM_FINDINGS:  {_D, _T, _A, _O},
    ClinicalAction.EDIT_EXAM_FINDINGS:  {_D, _O},

    # Diagnoses
    ClinicalAction.VIEW_DIAGNOSIS:      {_D, _T, _A, _O},
    ClinicalAction.CREATE_DIAGNOSIS:    {_D, _O},
    ClinicalAction.DELETE_DIAGNOSIS:    {_D, _O},
    ClinicalAction.PROMOTE_PROBLEM:     {_D, _O},

    # Admin
    ClinicalAction.VIEW_AUDIT_LOG:      {_A, _O},
    ClinicalAction.MANAGE_STAFF:        {_A, _O},
}


# ---------------------------------------------------------------------------
# FastAPI dependency factory
# ---------------------------------------------------------------------------


def require_permission(action: ClinicalAction):
    """Return a FastAPI dependency that enforces role-based access.

    Usage::

        @router.post("/{encounter_id}/finalize")
        async def finalize_encounter(
            ...,
            ctx: TenantContext = Depends(require_permission(ClinicalAction.FINALIZE_ENCOUNTER)),
        ):

    Internally calls ``get_current_tenant`` (JWT verification + tenant
    extraction), then checks the caller's role against PERMISSION_MATRIX.
    Returns the TenantContext on success; raises HTTP 403 otherwise.
    """

    async def _checker(
        ctx: TenantContext = Depends(get_current_tenant),
    ) -> TenantContext:
        allowed = PERMISSION_MATRIX.get(action, set())
        try:
            caller_role = StaffRole(ctx.role)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Unknown role '{ctx.role}'.",
            )
        if caller_role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{ctx.role}' cannot perform '{action.value}'.",
            )
        return ctx

    return _checker
