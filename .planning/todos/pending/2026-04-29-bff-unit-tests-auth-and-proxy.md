---
created: 2026-04-29T18:55:43.848Z
title: BFF unit tests — auth and proxy
area: testing
files:
  - lib/bff.ts
  - lib/bff.test.ts
---

## Problem

The BFF proxy layer (`lib/bff.ts`) has no unit tests. It's the boundary between Next.js and FastAPI — auth token forwarding, timeout handling, and error pass-through are all untested.

## Solution

Write `lib/bff.test.ts` covering:
- Auth pass/fail (token present vs missing)
- Token forwarding to upstream FastAPI
- Timeout → 504 response
- Error pass-through (FastAPI 4xx/5xx → BFF response)
