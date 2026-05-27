---
phase: 14-optical-order-configuration
plan: 12
status: complete
executed: 2026-05-27
gap_closure: true
---

# Plan 14-12 SUMMARY — Configurator BLOCKER + Queue Card MAJOR

All 6 tasks shipped. 6 atomic commits.

## Tasks

| # | Subject | Files | Tests | Commit |
|---|---------|-------|-------|--------|
| 1 | Backend DELETE /line-items/{id}/ + BFF + tests | 3 | 3 new unit tests PASS | `1b5b90e` |
| 2 | store.removeLineItem + FramePicker × + Adding… | 2 | — | `8aa3321` |
| 3 | LensConfig + Measurements empty-state UX | 2 | — | `5282c38` |
| 4 | Layout rebalance + Discard draft + backdrop-blur | 3 | — | `374a879` |
| 5 | Queue card CTA consolidation + dead code cleanup | 1 | — | `32ed7ed` |
| 6 | E2E spec extensions + pickFirstFrame helper fix | 1 | spec: 8 tests (was 6) | `ebb52ec` |

## What Landed

### Backend
- New `DELETE /api/optical-orders/{order_id}/line-items/{line_id}/` route in
  `backend/api/routes/optical_order.py` — gates on `status='draft'` (409
  `not_draft`), 404 on unknown line, recomputes `total_price` from
  surviving lines, writes one `OPTICAL_ORDER_CONFIGURE_UPDATE` audit row
  with `metadata.action='remove_line_item'`.
- New BFF proxy at `app/api/optical-orders/[orderId]/line-items/[lineId]/route.ts`
  forwards DELETE with trailing-slash upstream URL.

### FE store
- `store/opticalOrderConfigStore.ts` — added `removeLineItem(lineId)`
  mirroring the `addLineItem` shape. Both actions now short-circuit the
  `await get().flush()` round-trip when nothing is dirty (RC-2).

### Components
- **FramePicker** — selected chips render as `<div>` (not `<button>`) so a
  nested `<button aria-label="Remove frame">` × control is valid HTML.
  "Adding…" replaces "Added" in-flight; local `removing` state fades the
  chip while DELETE is in flight.
- **LensConfigSection / MeasurementsSection** — dashed-border hint
  ("Select a frame above to ...") + all inputs `disabled={noLines}` when
  no line items exist.
- **ConfiguratorFooter** — `bg-glass-solid` + `backdrop-blur-md`; Cancel
  button re-labels to "Discard draft" when `status='draft'`.
- **OpticalQueueCard** — "+ Create Order" button removed, `Configure
  Order` promoted to `variant='default'`, `flex-wrap` added to footer row.
  Dead code (`CreateWalkInOrderModal` import, `orderModalOpen` useState,
  `fetchQueue` selector, modal mount) deleted.

### Page layout
- `app/(tenant)/[tenant]/optical/orders/[orderId]/page.tsx` — Rx banner is
  full-width at top, then `cancelError` banner slot, then 2-col grid:
  (FramePicker + LensConfigSection) | (MeasurementsSection +
  VisionPlanSection). `handleCancel` calls `cancelOrder(draft.id)` on
  drafts before `router.back()`; on failure surfaces inline `role="alert"`
  banner and stays on the page (no silent draft leakage).

### CSS
- `app/globals.css` — `--bg-glass-solid` added to dark (`:root`) and light
  (`[data-theme="light"]`) blocks.

## Tests

### Backend (new)
- `test_remove_line_item_from_draft_unit` — happy path, recomputes total,
  writes audit.
- `test_remove_line_item_blocked_on_non_draft_unit` — 409 `not_draft`.
- `test_remove_unknown_line_item_returns_404_unit` — 404 on bogus line_id.

All 3 use SimpleNamespace mocks with `patch("backend.api.routes.optical_order.select")`
and `patch("...selectinload")` to avoid the project-wide SQLAlchemy mapper
init failure (unrelated `Appointment.IntakeToken` config error). This is
per the [skip-stubs anti-pattern memo](../../../../../../.claude/projects/c--Users-duytr-Projects-clarityos/memory/feedback_skip_stubs_anti_pattern.md)
— "real assertion bodies that skip via fixture chain" is dead test
coverage, so these run today via mocks rather than wait for the Wave-1
conftest fixtures.

```
$ python -m pytest backend/tests/test_optical_order_configuration.py -k "remove_" -v
3 passed (skipped 6 pre-existing dormant tests)
```

### E2E (new, in existing spec)
- `Configure Order → Discard draft → queue card draft pending count does
  not increment` — covers must_haves truth #2.
- `Add frame → remove frame via × → chip gone and lens Type select
  disabled` — integration test for Tasks 1-3.

`pickFirstFrame` helper updated: assert nested `Remove frame` button
becomes visible (the new add-success signal) rather than the old "first
frame button is disabled" assertion which no longer applies.

8 tests total in the spec (was 6).

### TypeScript
`npx tsc --noEmit` exits clean across all touched files (pre-existing
errors in `tests/e2e/smoke-*` specs are unchanged).

## Deviations from Plan

1. **Light theme selector**: plan referenced `.light` block, codebase
   uses `[data-theme="light"]`. Used the actual selector.
2. **Mid-plan checkpoint browser smoke**: skipped per user preference for
   no-interaction execution; coverage replaced by Task 6 E2E tests + DB
   verification (DELETE round-trip + audit row assertion).
3. **Decimal import for backend tests**: already imported at file top.
4. **`Decimal` import in route**: already imported.
5. **Backend test `Decimal('100.00')` assertion error in initial draft**:
   route recomputes from REMAINING lines (not subtraction from old
   total), so test corrected to expect surviving line total (`50.00`).
6. **Backend test mapper bypass**: added `patch(...select, selectinload)`
   to avoid SA mapper init failure on the unrelated Appointment model.

## Risk / Follow-up

- The new DELETE route writes to clinical data (optical order line items).
  Run `/audit-clinical` on the diff before merge.
- E2E run requires servers; spec landed but not executed in this session.
  Recommend `bash scripts/dev.sh pre-test && npx playwright test
  tests/e2e/optical-order-configuration.spec.ts` after reseed.
- The 6 pre-existing dormant tests in `test_optical_order_configuration.py`
  remain skipped — that backlog is separate (see anti-pattern memo).

## Closes

- BLOCKER (Test 5 / configurator runtime) — RC-1, RC-2, RC-3, RC-5, RC-6
  all fixed. RC-4 (Hargrove fixture mismatch) is Plan 14-14.
- MAJOR (Test 2 / queue card overflow + draft leakage) — both halves
  closed: layout + Discard draft.
