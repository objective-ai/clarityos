"""Unit tests for backend.core.sentry_setup.init_sentry().

Validates env-gating (dev/preview = no-op, prod + DSN = init) and that the
sentry_sdk.init call receives the correct kwargs — before_send wired to
_before_send, traces off, PII off, release from GIT_SHA.
"""
from __future__ import annotations

import os
from unittest.mock import MagicMock, patch

import pytest

from backend.core import sentry_setup


def _run_init_with_env(env: dict[str, str]) -> MagicMock:
    """Run init_sentry() with a patched os.environ + fake sentry_sdk modules.

    Returns the fake sentry_sdk MagicMock so the caller can inspect .init calls.
    """
    fake_sdk = MagicMock()
    fake_fi = MagicMock()
    fake_si = MagicMock()
    fake_ai = MagicMock()
    with patch.dict(os.environ, env, clear=True):
        with patch.dict(
            "sys.modules",
            {
                "sentry_sdk": fake_sdk,
                "sentry_sdk.integrations.fastapi": MagicMock(FastApiIntegration=fake_fi),
                "sentry_sdk.integrations.starlette": MagicMock(StarletteIntegration=fake_si),
                "sentry_sdk.integrations.asyncio": MagicMock(AsyncioIntegration=fake_ai),
            },
        ):
            sentry_setup.init_sentry()
    return fake_sdk


def test_init_skipped_when_dsn_missing():
    fake = _run_init_with_env({"SENTRY_ENVIRONMENT": "production"})
    fake.init.assert_not_called()


def test_init_skipped_in_dev():
    fake = _run_init_with_env(
        {"SENTRY_DSN": "https://x@o.ingest.sentry.io/1", "SENTRY_ENVIRONMENT": "development"}
    )
    fake.init.assert_not_called()


def test_init_skipped_in_preview():
    fake = _run_init_with_env(
        {"SENTRY_DSN": "https://x@o.ingest.sentry.io/1", "SENTRY_ENVIRONMENT": "preview"}
    )
    fake.init.assert_not_called()


def test_init_runs_in_prod():
    fake = _run_init_with_env(
        {
            "SENTRY_DSN": "https://x@o.ingest.sentry.io/1",
            "SENTRY_ENVIRONMENT": "production",
            "GIT_SHA": "abc123",
        }
    )
    fake.init.assert_called_once()
    kwargs = fake.init.call_args.kwargs
    assert kwargs["environment"] == "production"
    assert kwargs["traces_sample_rate"] == 0.0
    assert kwargs["send_default_pii"] is False
    assert kwargs["before_send"] is sentry_setup._before_send
    assert kwargs["release"] == "abc123"


def test_init_sets_release_from_git_sha():
    fake = _run_init_with_env(
        {
            "SENTRY_DSN": "https://x@o.ingest.sentry.io/1",
            "SENTRY_ENVIRONMENT": "production",
            "GIT_SHA": "deadbeef",
        }
    )
    fake.init.assert_called_once()
    assert fake.init.call_args.kwargs["release"] == "deadbeef"
