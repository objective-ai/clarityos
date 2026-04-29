---
created: 2026-04-29T18:55:43.848Z
title: audit-clinical skill in PR checklist for clinical routes
area: planning
files:
  - backend/api/routes/encounter.py
  - backend/api/routes/diagnosis.py
  - backend/api/routes/refraction.py
  - backend/api/routes/exam_findings.py
  - backend/api/routes/patient_problem.py
---

## Problem

The `audit-clinical` skill is available but not enforced as part of the PR review process for clinical route changes. Clinical data safety checks are ad-hoc.

## Solution

Add a PR checklist entry (in CLAUDE.md or a PR template) requiring `audit-clinical` to be run for any change touching:
- `backend/api/routes/encounter.py`
- `backend/api/routes/diagnosis.py`
- `backend/api/routes/refraction.py`
- `backend/api/routes/exam_findings.py`
- `backend/api/routes/patient_problem.py`
