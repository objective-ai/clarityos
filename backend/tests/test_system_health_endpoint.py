"""Phase 10.3-04 — GET /api/system/health/ unit tests.

These tests exercise the route-handler functions directly with fakes,
mirroring the pattern established by backend/tests/test_uptime.py
(Plan 10.3-05). Rationale: the existing backend/tests suite is
unit-only — there is no conftest.py, no async DB fixture, and the
full FastAPI app cannot be imported without runtime env vars
(DATABASE_URL, SUPABASE_*). Importing backend.api.routes.system
directly keeps these tests hermetic and portable.

Covers:
  - all-green happy path (Postgres OK + Supabase OIDC 200)
  - Postgres down (_probe_postgres returns "down")
  - Supabase Auth down (httpx timeout → "down")
  - rate limit (11th request in a minute from same IP returns 429)
  - sample row is appended to the session on every hit

Run:
    cd backend && python -m pytest tests/test_system_health_endpoint.py -v
"""
from __future__ import annotations

import asyncio
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest

# Import the handler + helpers directly. This avoids importing
# backend.main which pulls in every router and requires env vars.
from backend.api.routes import system as system_mod


# ---------------------------------------------------------------------------
# Fakes
# ---------------------------------------------------------------------------


class _FakeAsyncSession:
    """Captures added rows; commit is a no-op."""

    def __init__(self) -> None:
        self.added: list[Any] = []
        self.commit_calls = 0

    def add(self, obj: Any) -> None:
        self.added.append(obj)

    async def commit(self) -> None:
        self.commit_calls += 1

    async def execute(self, query: Any) -> Any:
        class _R:
            def scalar(self) -> int:
                return 1

        return _R()


class _FakeRequest:
    """Mimics fastapi.Request.client.host."""

    def __init__(self, host: str = "127.0.0.1") -> None:
        class _C:
            pass

        self.client = _C()
        self.client.host = host  # type: ignore[attr-defined]


def _run(coro):
    """Simple async driver (no pytest-asyncio dep needed)."""
    return asyncio.run(coro)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_health_all_green() -> None:
    """Both probes OK → api=ok, postgres.status=ok, supabase_auth.status=ok."""
    # Clear rate limiter state
    from backend.core.rate_limit import _store

    _store.clear()

    session = _FakeAsyncSession()

    with patch.object(
        system_mod, "_probe_postgres", new=AsyncMock(return_value=("ok", 3))
    ), patch.object(
        system_mod, "_probe_supabase", new=AsyncMock(return_value=("ok", 11))
    ):
        resp = _run(system_mod.get_health(request=_FakeRequest(), db=session))  # type: ignore[arg-type]

    assert resp.api == "ok"
    assert resp.postgres.status == "ok"
    assert resp.postgres.latency_ms == 3
    assert resp.supabase_auth.status == "ok"
    assert resp.supabase_auth.latency_ms == 11
    assert resp.checked_at.endswith("Z")
    # A sample row was persisted.
    assert len(session.added) == 1
    assert session.commit_calls == 1


def test_health_pg_down() -> None:
    """Postgres probe returns 'down' → payload reflects it; request still succeeds."""
    from backend.core.rate_limit import _store

    _store.clear()

    session = _FakeAsyncSession()

    with patch.object(
        system_mod, "_probe_postgres", new=AsyncMock(return_value=("down", 9))
    ), patch.object(
        system_mod, "_probe_supabase", new=AsyncMock(return_value=("ok", 12))
    ):
        resp = _run(system_mod.get_health(request=_FakeRequest(), db=session))  # type: ignore[arg-type]

    assert resp.postgres.status == "down"
    assert resp.supabase_auth.status == "ok"
    sample = session.added[0]
    assert sample.pg_status == "down"
    assert sample.all_green is False


def test_health_auth_down() -> None:
    """Supabase probe 'down' → supabase_auth.status=down."""
    from backend.core.rate_limit import _store

    _store.clear()

    session = _FakeAsyncSession()

    with patch.object(
        system_mod, "_probe_postgres", new=AsyncMock(return_value=("ok", 2))
    ), patch.object(
        system_mod, "_probe_supabase", new=AsyncMock(return_value=("down", 2000))
    ):
        resp = _run(system_mod.get_health(request=_FakeRequest(), db=session))  # type: ignore[arg-type]

    assert resp.supabase_auth.status == "down"
    assert resp.postgres.status == "ok"
    sample = session.added[0]
    assert sample.auth_status == "down"
    assert sample.all_green is False


def test_rate_limit_11th_request_returns_429() -> None:
    """11th request from the same IP in the window raises HTTP 429."""
    from backend.core.rate_limit import _store
    from fastapi import HTTPException

    _store.clear()

    with patch.object(
        system_mod, "_probe_postgres", new=AsyncMock(return_value=("ok", 1))
    ), patch.object(
        system_mod, "_probe_supabase", new=AsyncMock(return_value=("ok", 1))
    ):
        req = _FakeRequest(host="1.2.3.4")
        for _ in range(10):
            session = _FakeAsyncSession()
            _run(system_mod.get_health(request=req, db=session))  # type: ignore[arg-type]

        # 11th within the window must raise 429.
        session = _FakeAsyncSession()
        with pytest.raises(HTTPException) as exc_info:
            _run(system_mod.get_health(request=req, db=session))  # type: ignore[arg-type]

    assert exc_info.value.status_code == 429


def test_writes_sample_row_with_correct_flags() -> None:
    """Each hit appends exactly one SystemHealthSample row; all_green reflects probes."""
    from backend.core.rate_limit import _store

    _store.clear()

    session = _FakeAsyncSession()

    with patch.object(
        system_mod, "_probe_postgres", new=AsyncMock(return_value=("ok", 1))
    ), patch.object(
        system_mod, "_probe_supabase", new=AsyncMock(return_value=("ok", 1))
    ):
        _run(system_mod.get_health(request=_FakeRequest(), db=session))  # type: ignore[arg-type]

    assert len(session.added) == 1
    sample = session.added[0]
    assert sample.__class__.__name__ == "SystemHealthSample"
    assert sample.api_status == "ok"
    assert sample.pg_status == "ok"
    assert sample.auth_status == "ok"
    assert sample.all_green is True
    assert sample.pg_latency_ms == 1
    assert sample.auth_latency_ms == 1


def test_sample_health_now_persists_even_when_probes_down() -> None:
    """sample_health_now (used by the self-pinger) still writes a row on failure."""
    session = _FakeAsyncSession()

    with patch.object(
        system_mod, "_probe_postgres", new=AsyncMock(return_value=("down", 7))
    ), patch.object(
        system_mod, "_probe_supabase", new=AsyncMock(return_value=("down", 2000))
    ):
        resp = _run(system_mod.sample_health_now(db=session))  # type: ignore[arg-type]

    assert resp.postgres.status == "down"
    assert resp.supabase_auth.status == "down"
    assert len(session.added) == 1
    assert session.added[0].all_green is False
    assert session.commit_calls == 1
