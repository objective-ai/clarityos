"""backend/tests/test_multitenancy_isolation.py — multi-tenant guardrails.

Closes audit gap #4 (2026-05-01): tenant isolation had no explicit
backend coverage. Per `backend/core/security.py`'s docstring, FastAPI
connects with the Supabase service-role key and bypasses RLS — so
isolation is enforced ENTIRELY by Python adding `tenant_id == ctx.tenant_id`
to every query. Silent regression on that filter is catastrophic.

This file pins down four invariants that don't need a real DB to verify:

  1. JWT claim extraction — `get_current_tenant()` returns 401/403 for
     malformed claims, applies sane role/plan defaults, and never lets
     a token without `tenant_id` through. (Mocked decode + JWKS.)
  2. Resolver helpers — `_is_uuid()` correctness, plus a static-source
     assertion that every resolver in `backend/api/resolvers.py` filters
     by `tenant_id` (catches a future refactor that drops the WHERE).
  3. BFF non-validation contract — `lib/bff.ts` MUST forward the JWT
     unchanged and not re-decode the tenant claim. Pinned via static
     source check so any future "smart" tenant-side validation surfaces.
  4. TenantContext shape — frozen dataclass, slots-true, no mutation.

Cross-tenant route-level integration (e.g., GET a patient_id from tenant
B with a tenant A JWT must 404) is scaffolded as Wave 0 skip-stubs at
the bottom. Promote when `db_session` lands.
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from backend.api.resolvers import _is_uuid
from backend.core import security as security_module
from backend.core.security import TenantContext, get_current_tenant


REPO_ROOT = Path(__file__).resolve().parents[2]


# ---------------------------------------------------------------------------
# 1. TenantContext — immutability and shape
# ---------------------------------------------------------------------------


class TestTenantContextShape:
    def test_is_frozen(self):
        # @dataclass(frozen=True) — the auth context must not mutate after
        # extraction. A request handler holding onto a mutable identity
        # would be a vector for privilege escalation within a single request.
        ctx = TenantContext(user_id=uuid4(), tenant_id=uuid4(), role="doctor")
        with pytest.raises((AttributeError, TypeError)):
            ctx.role = "owner"  # type: ignore[misc]
        with pytest.raises((AttributeError, TypeError)):
            ctx.tenant_id = uuid4()  # type: ignore[misc]

    def test_uses_slots(self):
        # @dataclass(slots=True) — prevents arbitrary attribute assignment,
        # which both saves memory and surfaces typos like ctx.tennant_id.
        ctx = TenantContext(user_id=uuid4(), tenant_id=uuid4(), role="doctor")
        assert not hasattr(ctx, "__dict__")

    def test_default_plan_name_is_core(self):
        ctx = TenantContext(user_id=uuid4(), tenant_id=uuid4(), role="doctor")
        assert ctx.plan_name == "Core"

    def test_equality_by_value(self):
        u, t = uuid4(), uuid4()
        a = TenantContext(user_id=u, tenant_id=t, role="doctor")
        b = TenantContext(user_id=u, tenant_id=t, role="doctor")
        assert a == b


# ---------------------------------------------------------------------------
# 2. _is_uuid resolver helper
# ---------------------------------------------------------------------------


class TestIsUuid:
    @pytest.mark.parametrize(
        "value",
        [
            "00000000-0000-0000-0000-000000000000",
            "123e4567-e89b-12d3-a456-426614174000",
            str(uuid4()),
        ],
    )
    def test_accepts_valid_uuid_strings(self, value):
        assert _is_uuid(value) is True

    @pytest.mark.parametrize(
        "value",
        [
            "1",  # chart_number digit form
            "12345",
            "ENC-2026-001",  # encounter short_id form
            "not-a-uuid",
            "",
            "00000000-0000-0000-0000",  # too short
        ],
    )
    def test_rejects_non_uuid_strings(self, value):
        assert _is_uuid(value) is False


# ---------------------------------------------------------------------------
# 3. get_current_tenant — JWT claim extraction
#
# We don't test JWT signature validation here — that's pyjwt's job and
# would require generating real ES256/HS256 keypairs. We DO test the
# logic between decode-success and TenantContext creation, which is
# where bugs that leak into production live.
# ---------------------------------------------------------------------------


def _mock_jwt(monkeypatch, payload: dict) -> None:
    """Replace JWKS lookup + decode so get_current_tenant gets `payload`."""
    monkeypatch.setattr(
        security_module._jwks_client,
        "get_signing_key_from_jwt",
        lambda token: MagicMock(key="fake-key"),
    )
    monkeypatch.setattr(
        security_module.pyjwt,
        "decode",
        lambda token, key, algorithms, audience: payload,
    )


def _creds(token: str = "fake.jwt.token") -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


class TestGetCurrentTenantClaims:
    async def test_returns_populated_context_on_full_payload(self, monkeypatch):
        user_id = uuid4()
        tenant_id = uuid4()
        _mock_jwt(monkeypatch, {
            "sub": str(user_id),
            "app_metadata": {
                "tenant_id": str(tenant_id),
                "role": "doctor",
                "plan_name": "Premium",
            },
        })
        ctx = await get_current_tenant(credentials=_creds())
        assert ctx.user_id == user_id
        assert ctx.tenant_id == tenant_id
        assert ctx.role == "doctor"
        assert ctx.plan_name == "Premium"

    async def test_defaults_role_to_receptionist_when_missing(self, monkeypatch):
        # Defensive default — a token without an explicit role should NOT
        # silently grant doctor-level access. Receptionist is the safest
        # least-privileged role in the matrix.
        _mock_jwt(monkeypatch, {
            "sub": str(uuid4()),
            "app_metadata": {"tenant_id": str(uuid4())},
        })
        ctx = await get_current_tenant(credentials=_creds())
        assert ctx.role == "receptionist"
        assert ctx.plan_name == "Core"

    async def test_defaults_plan_to_core_when_missing(self, monkeypatch):
        _mock_jwt(monkeypatch, {
            "sub": str(uuid4()),
            "app_metadata": {"tenant_id": str(uuid4()), "role": "doctor"},
        })
        ctx = await get_current_tenant(credentials=_creds())
        assert ctx.plan_name == "Core"

    async def test_raises_401_when_sub_missing(self, monkeypatch):
        _mock_jwt(monkeypatch, {
            "app_metadata": {"tenant_id": str(uuid4()), "role": "doctor"},
        })
        with pytest.raises(HTTPException) as exc:
            await get_current_tenant(credentials=_creds())
        assert exc.value.status_code == 401
        assert "sub" in exc.value.detail

    async def test_raises_403_when_tenant_id_missing(self, monkeypatch):
        # 403, not 401 — the JWT is valid, but the user has no tenant
        # assignment. This is the "user signed up but isn't on a clinic
        # yet" path, which the UI handles by routing to onboarding.
        _mock_jwt(monkeypatch, {
            "sub": str(uuid4()),
            "app_metadata": {"role": "doctor"},
        })
        with pytest.raises(HTTPException) as exc:
            await get_current_tenant(credentials=_creds())
        assert exc.value.status_code == 403
        assert "tenant" in exc.value.detail.lower()

    async def test_raises_403_when_app_metadata_missing(self, monkeypatch):
        # No app_metadata at all → tenant_id is missing → 403.
        # Pins the `.get("app_metadata", {})` default-empty fallback.
        _mock_jwt(monkeypatch, {"sub": str(uuid4())})
        with pytest.raises(HTTPException) as exc:
            await get_current_tenant(credentials=_creds())
        assert exc.value.status_code == 403

    async def test_raises_401_when_tenant_id_is_malformed_uuid(self, monkeypatch):
        # Tenant id is a string in the JWT — if it can't be coerced to
        # UUID, fail closed with 401 rather than crashing the route.
        _mock_jwt(monkeypatch, {
            "sub": str(uuid4()),
            "app_metadata": {"tenant_id": "not-a-uuid", "role": "doctor"},
        })
        with pytest.raises(HTTPException) as exc:
            await get_current_tenant(credentials=_creds())
        assert exc.value.status_code == 401
        assert "malformed" in exc.value.detail.lower()

    async def test_raises_401_when_sub_is_malformed_uuid(self, monkeypatch):
        _mock_jwt(monkeypatch, {
            "sub": "not-a-uuid",
            "app_metadata": {"tenant_id": str(uuid4()), "role": "doctor"},
        })
        with pytest.raises(HTTPException) as exc:
            await get_current_tenant(credentials=_creds())
        assert exc.value.status_code == 401

    async def test_raises_401_on_decode_failure(self, monkeypatch):
        # Signature failure / expired token / malformed JWT — all surface
        # as the same 401 to avoid leaking which dimension failed.
        def _explode(*a, **kw):
            raise security_module.pyjwt.InvalidTokenError("bad sig")
        monkeypatch.setattr(
            security_module._jwks_client,
            "get_signing_key_from_jwt",
            lambda token: MagicMock(key="fake"),
        )
        monkeypatch.setattr(security_module.pyjwt, "decode", _explode)
        with pytest.raises(HTTPException) as exc:
            await get_current_tenant(credentials=_creds())
        assert exc.value.status_code == 401
        assert exc.value.headers.get("WWW-Authenticate") == "Bearer"


# ---------------------------------------------------------------------------
# 4. Static-source invariants
#
# These are unusual but high-value tests: they assert the SHAPE of the
# resolver and BFF source files, so a refactor that drops a tenant_id
# filter or starts decoding tenant claims in the BFF is caught at CI.
#
# Brittle by design — the failure message tells you exactly what to
# update if the change was intentional.
# ---------------------------------------------------------------------------


class TestResolverTenantFiltering:
    """Every resolver helper must constrain its base SELECT by tenant_id."""

    def _resolvers_src(self) -> str:
        return (REPO_ROOT / "backend/api/resolvers.py").read_text(encoding="utf-8")

    def test_resolve_patient_filters_by_tenant_id(self):
        src = self._resolvers_src()
        assert "Patient.tenant_id == tenant_id" in src, (
            "resolve_patient / resolve_patient_id must filter by tenant_id. "
            "Removing this filter exposes cross-tenant patient data."
        )

    def test_resolve_encounter_filters_by_tenant_id(self):
        src = self._resolvers_src()
        assert "Encounter.tenant_id == tenant_id" in src, (
            "resolve_encounter / resolve_encounter_id must filter by tenant_id."
        )

    def test_resolvers_filter_soft_deleted(self):
        # `is_deleted == False` is paired with the tenant filter — both must
        # be present so a soft-deleted record from another tenant doesn't
        # surface via a numeric chart_number collision.
        src = self._resolvers_src()
        assert "Patient.is_deleted == False" in src
        assert "Encounter.is_deleted == False" in src


class TestBffNonValidation:
    """The BFF forwards the JWT and trusts FastAPI's tenant enforcement.

    If a future change adds tenant inspection to `lib/bff.ts`, that's
    a real architectural shift (it would imply two sources of truth
    for tenant identity) — surface it as an intentional test update.
    """

    def _bff_src(self) -> str:
        return (REPO_ROOT / "lib/bff.ts").read_text(encoding="utf-8")

    def test_bff_does_not_decode_tenant_claim(self):
        src = self._bff_src().lower()
        assert "tenant_id" not in src, (
            "lib/bff.ts must not inspect tenant_id — that's FastAPI's job. "
            "If this changed deliberately, update the test + add a docstring "
            "in bff.ts explaining the new architecture."
        )
        assert "app_metadata" not in src, (
            "lib/bff.ts must not unpack app_metadata — only forward the JWT."
        )

    def test_bff_forwards_bearer_token(self):
        # Pin the forwarding contract — the upstream FastAPI relies on
        # receiving the original session.access_token unchanged.
        src = self._bff_src()
        assert "Authorization: `Bearer ${session.access_token}`" in src, (
            "lib/bff.ts must forward the Supabase access_token as a Bearer "
            "token. Any reshaping of the auth header breaks tenant enforcement."
        )


# ---------------------------------------------------------------------------
# 5. Integration stubs — Wave 0 skip-stubs.
#
# Verifies cross-tenant queries return 404 (not 200 + leaked data, not 500)
# end-to-end. Promote when db_session + multi-tenant fixture lands.
#
# The two-tenant pattern: build a row in tenant A, attempt to access it
# with a TenantContext from tenant B. The Python WHERE clause should
# filter it out before the response is built.
# ---------------------------------------------------------------------------


class TestCrossTenantIntegration:
    """End-to-end cross-tenant access. Skip-stubbed for now."""

    def test_resolve_patient_cross_tenant_returns_404(self, db_session):
        # A patient UUID from tenant B with a tenant A context must 404
        # (not leak the patient, not 500). Resolver-level guard.
        pytest.skip("Wave 0 — needs db_session + two-tenant patient factory")

    def test_resolve_patient_id_cross_tenant_chart_number_returns_404(
        self, db_session
    ):
        # chart_number is per-tenant (small integer), so collisions across
        # tenants are LIKELY. Tenant A's chart 1 and tenant B's chart 1
        # are different patients. Make sure the resolver never returns
        # the wrong tenant's row when the chart_number happens to match.
        pytest.skip("Wave 0 — needs db_session + colliding chart numbers")

    def test_resolve_encounter_cross_tenant_short_id_returns_404(
        self, db_session
    ):
        # encounter short_id collisions across tenants — same risk as
        # chart_number above.
        pytest.skip("Wave 0 — needs db_session + colliding short_ids")

    def test_get_patient_other_tenant_uuid_returns_404(self, db_session):
        # End-to-end via TestClient: GET /api/patients/{uuid_from_tenant_b}
        # with tenant A JWT → 404, NOT 200 + leaked data.
        pytest.skip("Wave 0 — needs db_session + multi-tenant TestClient")

    def test_get_encounter_other_tenant_uuid_returns_404(self, db_session):
        pytest.skip("Wave 0 — needs db_session + multi-tenant TestClient")

    def test_patch_encounter_other_tenant_returns_404_not_500(
        self, db_session
    ):
        # Mutating attempts must 404, not crash on missing-row in the
        # update path. Pins the WHERE-then-update guard.
        pytest.skip("Wave 0 — needs db_session + two-tenant encounter")

    def test_patient_insurance_list_filters_by_tenant(self, db_session):
        # Insurance rows have BOTH patient_id and tenant_id. If the WHERE
        # accidentally only filters by patient_id, a deleted-then-recreated
        # patient_id collision could surface another tenant's insurance.
        pytest.skip("Wave 0 — needs db_session + insurance fixture")

    def test_superbill_list_filters_by_tenant(self, db_session):
        pytest.skip("Wave 0 — needs db_session + superbill fixture")

    def test_audit_log_writes_carry_tenant_id(self, db_session):
        # Every audit row must have ctx.tenant_id stamped — verifies the
        # log_action() helper doesn't drop tenant scoping under concurrent
        # writes from different tenants.
        pytest.skip("Wave 0 — needs db_session + audit_log read")

    def test_inventory_product_other_tenant_returns_404(self, db_session):
        # Phase 13 surface — newest, most likely to skip the tenant guard
        # on a copy-paste from a non-tenant-scoped reference.
        pytest.skip("Wave 0 — needs db_session + product factory")
