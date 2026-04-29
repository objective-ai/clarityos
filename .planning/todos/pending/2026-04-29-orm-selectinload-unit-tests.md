---
created: 2026-04-29T18:55:43.848Z
title: ORM tests — post-flush selectinload re-fetch pattern
area: testing
files:
  - backend/db/models/tenant/clinical.py
---

## Problem

The post-`db.flush()` selectinload re-fetch pattern (never `db.refresh` — MissingGreenlet) is a critical SQLAlchemy invariant with no test coverage. Regressions silently break clinical writes.

## Solution

Write ORM-level tests in `backend/` covering:
- After `db.flush()`, re-fetch via `selectinload` returns correct related data
- Confirm `db.refresh()` raises MissingGreenlet (document the constraint)
- Enums stored as VARCHAR (`native_enum=False`)
