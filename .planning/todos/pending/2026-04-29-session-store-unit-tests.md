---
created: 2026-04-29T18:55:43.848Z
title: Session store unit tests
area: testing
files:
  - store/sessionStore.ts
  - tests/unit/store/sessionStore.test.ts
---

## Problem

The Zustand session store (hydration, refresh, logout) has no unit tests. Auth regressions surface late — only caught in E2E or manually.

## Solution

Write `tests/unit/store/sessionStore.test.ts` covering:
- Hydration from JWT cookie
- Token refresh flow
- Logout clears session state
