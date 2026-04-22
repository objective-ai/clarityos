"""System health / status endpoints (Phase 10.3-04).

GET /api/system/health/  — unauthenticated, rate-limited probe of
the FastAPI process, Postgres, and Supabase Auth. Writes one row
into public.system_health_samples on every hit, which feeds the
uptime endpoint (Plan 10.3-05) and the System Status admin UI
(Plan 10.3-06).

A background self-pinger (wired up in backend/main.py) calls
`sample_health_now` once every 60s in production so uptime data
accumulates even when no dashboard is open.
"""
from __future__ import annotations

import os
import time
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.config import settings
from backend.core.rate_limit import check_rate_limit
from backend.db.models.public.saas import SystemHealthSample
from backend.db.session import get_db
from backend.schemas.system import DependencyStatus, HealthResponse

router = APIRouter(prefix="/api/system", tags=["system"])


# ---------------------------------------------------------------------------
# Probes
# ---------------------------------------------------------------------------


async def _probe_postgres(db: AsyncSession) -> tuple[str, int]:
    """Run a cheap `SELECT 1` and classify the result."""
    start = time.perf_counter()
    try:
        await db.execute(text("SELECT 1"))
        probe_status = "ok"
    except Exception:
        probe_status = "down"
    return probe_status, int((time.perf_counter() - start) * 1000)


async def _probe_supabase() -> tuple[str, int]:
    """Probe Supabase Auth by hitting its OIDC discovery document."""
    start = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            r = await client.get(
                f"{settings.SUPABASE_URL}/.well-known/openid-configuration"
            )
            probe_status = "ok" if r.status_code == 200 else "degraded"
    except Exception:
        probe_status = "down"
    return probe_status, int((time.perf_counter() - start) * 1000)


# ---------------------------------------------------------------------------
# Shared writer (used by the route AND the self-pinger in main.py)
# ---------------------------------------------------------------------------


async def sample_health_now(db: AsyncSession) -> HealthResponse:
    """Run all probes, persist a sample row, and return the response."""
    pg_status, pg_ms = await _probe_postgres(db)
    auth_status, auth_ms = await _probe_supabase()
    all_green = pg_status == "ok" and auth_status == "ok"

    sample = SystemHealthSample(
        api_status="ok",
        pg_status=pg_status,
        pg_latency_ms=pg_ms,
        auth_status=auth_status,
        auth_latency_ms=auth_ms,
        all_green=all_green,
    )
    db.add(sample)
    await db.commit()

    version = (os.getenv("GIT_SHA") or "unknown")[:7]
    return HealthResponse(
        api="ok",
        postgres=DependencyStatus(status=pg_status, latency_ms=pg_ms),
        supabase_auth=DependencyStatus(status=auth_status, latency_ms=auth_ms),
        version=version,
        checked_at=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/health/")
async def get_health(request: Request, db: AsyncSession = Depends(get_db)):
    """Unauthenticated probe — rate-limited by IP to 10 req/min."""
    ip = request.client.host if request.client else "unknown"
    check_rate_limit(ip, window_seconds=60, max_requests=10)
    result = await sample_health_now(db)
    return JSONResponse(content=result.model_dump(by_alias=True, mode="json"))
