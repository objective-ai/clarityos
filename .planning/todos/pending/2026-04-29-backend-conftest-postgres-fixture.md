---
created: 2026-04-29T18:55:43.848Z
title: Backend conftest — Postgres fixture + tenant schema seeder
area: testing
files:
  - backend/conftest.py
---

## Problem

No pytest fixture for a real Postgres test DB with tenant schema. All backend tests either hit prod/dev DB or use mocks that diverge from actual schema (past incident: mocked tests passed, prod migration failed).

## Solution

Create `backend/conftest.py` with:
- Postgres test fixture (real DB, not mocked)
- Tenant schema seeder (mirrors `clinic_sunview` schema setup)
- Session-scoped setup/teardown
