---
created: 2026-04-29T18:55:43.848Z
title: Auth middleware unit tests
area: testing
files:
  - lib/supabase/middleware.ts
  - lib/supabase/middleware.test.ts
---

## Problem

Supabase auth middleware has no unit tests. Public-route allowlist logic, returnTo redirect, and slug-based dashboard redirect are all manually verified only.

## Solution

Write `lib/supabase/middleware.test.ts` covering:
- Public-route allowlist (unauthenticated access allowed)
- returnTo redirect after login
- Slug-based dashboard redirect from JWT app_metadata
