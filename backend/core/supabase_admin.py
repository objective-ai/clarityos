"""
core/supabase_admin.py

Lightweight Supabase Auth Admin client using httpx.
Uses service_role key for admin-level operations (user lookup).
No heavy SDK dependency — just direct REST calls.
"""

from __future__ import annotations

import httpx

from backend.core.config import settings


async def list_auth_users(email_filter: str | None = None) -> list[dict]:
    """List Supabase Auth users, optionally filtered by email substring.

    Uses GET /auth/v1/admin/users with service_role key.
    Returns list of {id, email, created_at} dicts.
    """
    url = f"{settings.SUPABASE_URL}/auth/v1/admin/users"
    headers = {
        "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url, headers=headers)
        resp.raise_for_status()

    data = resp.json()
    users = data.get("users", [])

    if email_filter:
        q = email_filter.lower()
        users = [u for u in users if q in (u.get("email") or "").lower()]

    return [
        {
            "id": u["id"],
            "email": u.get("email"),
            "created_at": u.get("created_at"),
        }
        for u in users
    ]


async def get_auth_user(user_id: str) -> dict | None:
    """Get a single Supabase Auth user by ID. Returns None if not found."""
    url = f"{settings.SUPABASE_URL}/auth/v1/admin/users/{user_id}"
    headers = {
        "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url, headers=headers)
        if resp.status_code == 404:
            return None
        resp.raise_for_status()

    u = resp.json()
    return {
        "id": u["id"],
        "email": u.get("email"),
        "created_at": u.get("created_at"),
    }
