---
created: 2026-04-29T18:55:43.848Z
title: Pytest coverage for clinical routes
area: testing
files:
  - backend/api/routes/encounter.py
  - backend/api/routes/diagnosis.py
  - backend/api/routes/refraction.py
  - backend/api/routes/exam_findings.py
  - backend/api/routes/patient_problem.py
---

## Problem

The 5 highest-risk clinical routes have no automated tests. Auth, tenant isolation, and 404 handling are only verified manually.

## Solution

Add pytest coverage for all 5 routes:
- Happy path (200 with valid tenant + auth)
- 401 (missing/invalid token)
- 404 (resource not found)
- Tenant isolation (tenant A cannot access tenant B data)

Depends on: `backend/conftest.py` Postgres fixture (see related todo).
