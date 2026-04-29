---
created: 2026-04-29T18:55:43.848Z
title: Vitest coverage thresholds
area: tooling
files:
  - vitest.config.ts
---

## Problem

No coverage enforcement. Coverage can regress silently as the codebase grows.

## Solution

Add coverage thresholds to `vitest.config.ts`:
- Start lenient: 50% lines on `lib/` and `store/`
- Ratchet up incrementally as tests are added
- Fail CI when thresholds drop
