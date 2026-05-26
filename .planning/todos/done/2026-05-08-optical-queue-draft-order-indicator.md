---
created: 2026-05-08T00:00:00.000Z
title: Optical queue — surface draft order existence on card
area: phase-13-retail
files:
  - backend/api/routes/optical.py
  - backend/schemas/optical.py
  - components/optical/OpticalQueueCard.tsx
---

## Problem

The optical queue rollup intentionally treats `draft` orders as non-authoritative — per 13-CONTEXT.md §C, only `placed` promotes to `in_progress` and all-`dispensed` promotes to `dispensed`. Drafts fall back to `encounter.optical_status` (typically `waiting`).

Side effect: a draft order is invisible on the queue card. A user who saved a draft for a patient gets no on-card hint that one exists, and may create a duplicate. Manually verified during Test 12 UAT — created a draft for Thornton, James and the card still rendered as plain "Waiting".

## Solution

Surface draft existence as a secondary indicator without changing the rollup semantics:

1. Backend — extend `OpticalQueueItem` schema with `draft_order_count: int` (default 0). Compute in the same loop that already iterates `enc.optical_orders` for `_compute_optical_status`. No N+1 since `optical_orders` is already eager-loaded.
2. Frontend — render a small pill (e.g. "Draft pending") next to the status `Badge` in `OpticalQueueCard.tsx` when `draftOrderCount > 0`. Keep the rollup status badge as-is.

## Out of scope

- Showing draft line items / total / SKU on the card.
- Promoting draft to its own queue status (would break the placed/dispensed binary semantics intentionally chosen in CONTEXT §C).

---

## Resolution

- Absorbed into Phase 14-06 (OPT14-14).
- Backend: `draft_order_count` field added to `OpticalQueueItem`; populated in `get_optical_queue` from already-eager-loaded `enc.optical_orders` (no N+1).
- Frontend pill render lands in Phase 14-10 OpticalQueueCard.tsx + entry-point wire-up.
- Closed: 2026-05-26
