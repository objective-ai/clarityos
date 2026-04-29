---
created: 2026-04-29T18:55:43.848Z
title: GitHub Actions CI workflow
area: tooling
files:
  - .github/workflows/ci.yml
---

## Problem

No CI pipeline. Tests, type-checks, and linting only run locally and manually. Regressions can slip into PRs.

## Solution

Add `.github/workflows/ci.yml` running on PR and push to main:
- `npx vitest run` — unit tests
- `npx tsc --noEmit` — TypeScript type check
- `pytest` — backend tests (once conftest.py exists)
