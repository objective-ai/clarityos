"""
schemas/uptime.py

Pydantic schemas for system uptime + error monitoring (Phase 10.3-05).

These schemas live in a dedicated module (not schemas/system.py) to avoid
collision with Plan 10.3-04 which owns schemas/system.py for /system/health/.
Plan 04 and Plan 05 run in parallel; keeping them in separate files preserves
independence. Both sets of schemas are surfaced to the frontend via the BFF
types in types/system.ts.
"""

from backend.schemas.common import CamelCaseModel


class UptimeSummary(CamelCaseModel):
    """7-day rolling uptime window returned by GET /api/system/uptime/."""

    uptime_pct: float
    samples_total: int
    samples_green: int
    window_start: str | None = None  # ISO UTC (Z-suffix) or null if no samples
    window_end: str | None = None


class ErrorIssue(CamelCaseModel):
    """Normalized Sentry issue (produced by the BFF /api/system/errors proxy,
    exposed here for backend documentation / future server-side consumers)."""

    id: str
    title: str
    count: int
    user_count: int = 0
    last_seen: str
    first_seen: str
    permalink: str
    environment: str | None = None
    level: str | None = None
    culprit: str | None = None


class ErrorIssueList(CamelCaseModel):
    """Envelope for a page of Sentry issues."""

    issues: list[ErrorIssue]
    fetched_at: str  # ISO UTC
    cached: bool
