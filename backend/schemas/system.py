"""Pydantic schemas for /api/system/* endpoints (Phase 10.3-04).

HealthResponse is the contract consumed by:
  - app/api/system/health/route.ts  (BFF proxy)
  - Plan 10.3-05 uptime endpoint
  - Plan 10.3-06 System Status admin panel
  - Plan 10.3-07 TopNav HealthDot
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class DependencyStatus(BaseModel):
    """Health of a single downstream dependency."""

    status: Literal["ok", "degraded", "down"]
    latency_ms: int


class HealthResponse(BaseModel):
    """Shape of GET /api/system/health/.

    `api` is always "ok" — if the FastAPI process itself were down
    the request would never reach this serializer. `postgres` and
    `supabase_auth` reflect probe results. `version` is the short
    git SHA (7 chars) or "unknown". `checked_at` is ISO 8601 UTC
    with trailing 'Z'.
    """

    api: Literal["ok"]
    postgres: DependencyStatus
    supabase_auth: DependencyStatus
    version: str
    checked_at: str
