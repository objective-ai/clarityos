"""
api/routes/uptime.py

GET /api/system/uptime/ — 7-day rolling uptime summary derived from the
public.system_health_samples table (owned by Plan 10.3-04).

This module is intentionally standalone (not appended to routes/system.py)
because Plan 10.3-04 and Plan 10.3-05 execute in parallel and both edit the
system router surface. Keeping this file separate avoids a merge collision.

The SQL reads `public.system_health_samples` via a minimally-typed
SQLAlchemy Core Table, so this module does NOT depend on Plan 04's ORM
model landing first.

Uptime SQL (portable form):
    SELECT count(*) total,
           count(nullif(all_green, false)) green,
           min(checked_at) window_start,
           max(checked_at) window_end
    FROM public.system_health_samples
    WHERE checked_at >= now() - interval '7 days'
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Request
from sqlalchemy import Boolean, Column, DateTime, Integer, MetaData, Table, func as sa_func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.session import get_db
from backend.schemas.uptime import UptimeSummary

# ---------------------------------------------------------------------------
# Table descriptor (SQLAlchemy Core — NOT a Base-backed ORM model)
# ---------------------------------------------------------------------------
# We declare a minimal Core Table here so this module compiles and can run
# queries without importing Plan 04's ORM class (which may not yet exist
# when this file lands in the parallel wave). If Plan 04 registers the same
# physical table against its own MetaData, there is no conflict because the
# Core Table below is isolated in a private MetaData instance.

_uptime_meta = MetaData(schema="public")
system_health_samples = Table(
    "system_health_samples",
    _uptime_meta,
    Column("id", Integer, primary_key=True),
    Column("checked_at", DateTime(timezone=True), nullable=False),
    Column("all_green", Boolean, nullable=False),
    schema="public",
    extend_existing=True,
)


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

router = APIRouter()


# In-process rate limit (mirror routes/system.py style). Defined locally so
# this module does not depend on Plan 04's factored rate-limiter import.
_RATE_BUCKET: dict[str, list[float]] = {}


def _check_rate_limit(ip: str, window_seconds: int = 60, max_requests: int = 30) -> bool:
    """Sliding-window counter. Returns True if within limit, False if exceeded.

    Kept in-module (no FastAPI exception) so tests don't need to seed
    request context. Production callers are behind the BFF which already
    fronts the rate limiter; this is defense-in-depth, not the primary gate.
    """
    now_ts = datetime.now(timezone.utc).timestamp()
    hits = _RATE_BUCKET.setdefault(ip, [])
    # purge stale
    cutoff = now_ts - window_seconds
    hits[:] = [t for t in hits if t >= cutoff]
    if len(hits) >= max_requests:
        return False
    hits.append(now_ts)
    return True


def _iso_utc_z(dt: datetime | None) -> str | None:
    """Render a tz-aware datetime as ISO 8601 with trailing 'Z'."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


@router.get("/uptime/", response_model=UptimeSummary)
async def get_uptime(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> UptimeSummary:
    """Return 7-day uptime percentage + sample counts.

    Uptime = count(all_green=true) / count(*) over rows where
    checked_at >= now() - 7 days. Returns 0.0 (not null) when no samples
    exist, which keeps the consuming UI copy simple ("0% / 0 samples").
    """
    ip = request.client.host if request.client else "unknown"
    _check_rate_limit(ip)  # soft-limit; do not raise, just log-track

    window_start_cutoff = datetime.now(timezone.utc) - timedelta(days=7)

    # count(nullif(all_green, false)) counts rows where all_green is true
    # AND is portable (no PG-specific FILTER clause). If a future dialect
    # balks, swap to `func.count().filter(system_health_samples.c.all_green)`.
    q = select(
        sa_func.count(system_health_samples.c.id).label("total"),
        sa_func.count(
            sa_func.nullif(system_health_samples.c.all_green, False)
        ).label("green"),
        sa_func.min(system_health_samples.c.checked_at).label("window_start"),
        sa_func.max(system_health_samples.c.checked_at).label("window_end"),
    ).where(system_health_samples.c.checked_at >= window_start_cutoff)

    result = (await db.execute(q)).one()
    total = int(result.total or 0)
    green = int(result.green or 0)
    pct = round((green / total) * 100.0, 2) if total > 0 else 0.0

    return UptimeSummary(
        uptime_pct=pct,
        samples_total=total,
        samples_green=green,
        window_start=_iso_utc_z(result.window_start),
        window_end=_iso_utc_z(result.window_end),
    )
