"""Phase 10.3-04 — SystemHealthSample ORM sanity checks."""
from __future__ import annotations

from backend.db.models.public.saas import SystemHealthSample


def test_model_tablename():
    assert SystemHealthSample.__tablename__ == "system_health_samples"
    assert SystemHealthSample.__table_args__ == {"schema": "public"}


def test_model_columns():
    cols = {c.name for c in SystemHealthSample.__table__.columns}
    assert cols == {
        "id",
        "checked_at",
        "api_status",
        "pg_status",
        "pg_latency_ms",
        "auth_status",
        "auth_latency_ms",
        "all_green",
    }


def test_model_schema():
    assert SystemHealthSample.__table__.schema == "public"
