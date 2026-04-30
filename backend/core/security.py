"""
core/security.py

Supabase JWT verification + TenantContext extraction.

CRITICAL: FastAPI connects with the Supabase service role key, which
bypasses all RLS policies. Therefore tenant isolation MUST be enforced
at the Python level — every query must include
    .where(Model.tenant_id == ctx.tenant_id)

The TenantContext dependency extracts tenant_id from the verified JWT's
app_metadata (injected by the sync_tenant_to_app_metadata trigger).
"""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import jwt as pyjwt
from jwt import PyJWKClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.config import settings

# Cache the JWKS client so we don't re-fetch on every request
_jwks_client = PyJWKClient(f"{settings.SUPABASE_URL}/auth/v1/.well-known/jwks.json")

# ---------------------------------------------------------------------------
# Bearer token extractor
# ---------------------------------------------------------------------------

_bearer_scheme = HTTPBearer(auto_error=True)

# ---------------------------------------------------------------------------
# TenantContext — the identity of every authenticated request
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class TenantContext:
    """Immutable identity extracted from a verified Supabase JWT."""

    user_id: UUID
    tenant_id: UUID
    role: str  # e.g. "doctor", "technician", "receptionist", "admin", "owner"
    plan_name: str = "Core"  # subscription plan ("Core" | "Plus" | "Premium")


# ---------------------------------------------------------------------------
# FastAPI dependency
# ---------------------------------------------------------------------------


async def get_current_tenant(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
) -> TenantContext:
    """
    Verify the Supabase access token and extract tenant context.

    The Supabase JWT contains:
      - sub: user UUID
      - app_metadata.tenant_id: UUID (set by DB trigger on tenant_members)
      - app_metadata.role: staff role string

    Returns TenantContext or raises 401.
    """
    token = credentials.credentials

    # ── Verify JWT ────────────────────────────────────────────────────────
    try:
        signing_key = _jwks_client.get_signing_key_from_jwt(token)
        payload = pyjwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256", "HS256"],
            audience="authenticated",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # ── Extract claims ────────────────────────────────────────────────────
    user_id_str = payload.get("sub")
    if not user_id_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing 'sub' claim.",
        )

    app_metadata = payload.get("app_metadata", {})
    tenant_id_str = app_metadata.get("tenant_id")
    role = app_metadata.get("role", "receptionist")
    plan_name = app_metadata.get("plan_name", "Core")

    if not tenant_id_str:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is not assigned to any tenant. Contact your clinic admin.",
        )

    try:
        return TenantContext(
            user_id=UUID(user_id_str),
            tenant_id=UUID(tenant_id_str),
            role=role,
            plan_name=plan_name,
        )
    except (ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Malformed identity claims: {exc}",
        )


# ---------------------------------------------------------------------------
# Staff identity resolution
# ---------------------------------------------------------------------------


async def resolve_staff(
    ctx: TenantContext,
    db: AsyncSession,
) -> "Staff | None":
    """Resolve the authenticated user's Staff record (maps user_id → staff.id).

    Returns None if no active staff record exists for the user in this tenant.
    """
    from backend.db.models.tenant.clinical import Staff

    return (
        await db.execute(
            select(Staff).where(
                Staff.user_id == ctx.user_id,
                Staff.tenant_id == ctx.tenant_id,
                Staff.is_active == True,  # noqa: E712
            )
        )
    ).scalar_one_or_none()