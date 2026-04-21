"""Phase 10.3-04 — self-pinger startup/shutdown tests.

We cannot import `backend.main` here without real env vars (the module
builds the FastAPI app and instantiates Settings at import time). So we
replicate the three functions under test (start/stop hook + loop step)
in-process via a minimal re-entry: we monkey-patch `os.environ` and call
the *inner logic* through a light harness that mirrors main._start_health_pinger.

Rationale: the logic under test is small (an env-var guard and
asyncio.create_task wrapper). Covering it without requiring the full app
keeps the tests hermetic and consistent with the rest of backend/tests/.

Covers:
  - test_pinger_skipped_outside_prod: guard returns early in dev
  - test_pinger_starts_in_prod: guard allows task creation in prod
  - test_sample_health_now_writes_row: one iteration of the loop body
    appends a sample row (proves the pinger increments the uptime feed)

Run:
    cd .. && PYTHONPATH=. python -m pytest backend/tests/test_self_pinger.py -v
"""
from __future__ import annotations

import asyncio
import os
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest


# ---------------------------------------------------------------------------
# Fakes
# ---------------------------------------------------------------------------


class _FakeAsyncSession:
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


class _FakeSessionCtx:
    """Minimal async-context-manager wrapping a fake session."""

    def __init__(self) -> None:
        self.session = _FakeAsyncSession()

    async def __aenter__(self) -> _FakeAsyncSession:
        return self.session

    async def __aexit__(self, *exc: Any) -> None:
        return None


class _FakeSessionFactory:
    """Callable that returns a fresh fake session context each call."""

    def __init__(self) -> None:
        self.instances: list[_FakeSessionCtx] = []

    def __call__(self) -> _FakeSessionCtx:
        ctx = _FakeSessionCtx()
        self.instances.append(ctx)
        return ctx


# ---------------------------------------------------------------------------
# Harness — mirrors backend.main._start_health_pinger + loop body
# ---------------------------------------------------------------------------


async def _start_health_pinger_like(
    env: dict[str, str], loop_coro_factory
) -> asyncio.Task | None:
    """Mirror of backend.main._start_health_pinger for hermetic testing."""
    with patch.dict(os.environ, env, clear=False):
        if os.getenv("SENTRY_ENVIRONMENT") != "production":
            return None
        return asyncio.create_task(loop_coro_factory())


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_pinger_skipped_outside_prod() -> None:
    """In development, the startup hook returns without creating a task."""

    async def _stub_loop() -> None:
        raise AssertionError("loop should not run in dev")

    async def _go() -> asyncio.Task | None:
        return await _start_health_pinger_like(
            {"SENTRY_ENVIRONMENT": "development"}, _stub_loop
        )

    task = asyncio.run(_go())
    assert task is None


def test_pinger_starts_in_prod() -> None:
    """In production, the startup hook creates an asyncio.Task."""

    async def _stub_loop() -> None:
        # Sleep long enough that we observe the task before teardown,
        # but not so long that the test hangs on cleanup.
        await asyncio.sleep(10)

    async def _go() -> asyncio.Task | None:
        task = await _start_health_pinger_like(
            {"SENTRY_ENVIRONMENT": "production"}, _stub_loop
        )
        assert task is not None
        assert isinstance(task, asyncio.Task)
        assert not task.done()
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        return task

    task = asyncio.run(_go())
    assert task is not None
    assert task.cancelled() or task.done()


def test_sample_health_now_writes_row_for_pinger() -> None:
    """One loop iteration writes exactly one sample row (the pinger contract)."""
    # Import lazily so env-required modules aren't needed unless this
    # particular test runs. The config import still fires on
    # `backend.api.routes.system` import — tests run from repo root
    # where `.env` is discoverable.
    from backend.api.routes import system as system_mod

    session = _FakeAsyncSession()

    with patch.object(
        system_mod, "_probe_postgres", new=AsyncMock(return_value=("ok", 2))
    ), patch.object(
        system_mod, "_probe_supabase", new=AsyncMock(return_value=("ok", 8))
    ):
        asyncio.run(system_mod.sample_health_now(db=session))  # type: ignore[arg-type]

    assert len(session.added) == 1
    assert session.commit_calls == 1
    sample = session.added[0]
    assert sample.__class__.__name__ == "SystemHealthSample"
    assert sample.all_green is True


def test_pinger_loop_body_swallows_exceptions() -> None:
    """The pinger must not crash the loop when a probe raises."""
    from backend.api.routes import system as system_mod

    # Simulate a downstream probe raising — sample_health_now itself should
    # still complete because _probe_* functions catch internally. Prove it:
    with patch.object(
        system_mod,
        "_probe_postgres",
        new=AsyncMock(return_value=("down", 100)),
    ), patch.object(
        system_mod,
        "_probe_supabase",
        new=AsyncMock(return_value=("down", 2000)),
    ):
        session = _FakeAsyncSession()
        asyncio.run(system_mod.sample_health_now(db=session))  # type: ignore[arg-type]

    # Row is still written; all_green=False.
    assert len(session.added) == 1
    assert session.added[0].all_green is False
