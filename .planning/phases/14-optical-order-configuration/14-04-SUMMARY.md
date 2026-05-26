---
phase: 14-optical-order-configuration
plan: 04
subsystem: api
tags: [ai-scribe, keyword-extraction, suggestions, jsonb, optical-configurator]

# Dependency graph
requires:
  - phase: 14-optical-order-configuration
    provides: 14-01 OpticalOrder.suggestion_resolutions_jsonb column + AuditAction.OPTICAL_ORDER_CONFIGURE_UPDATE; 14-00 test scaffold; 14-03 PATCH plumbing
provides:
  - "backend/services/optical_suggestions.py — pure-function extract_optical_suggestions() over Encounter.ai_summary_text + Encounter.assessment_and_plan"
  - "Three new routes on /api/optical-orders/: GET /{id}/suggestions/, POST /{id}/suggestions/{field}/accept/, POST /{id}/suggestions/{field}/dismiss/"
  - "OpticalSuggestionResponse + OpticalSuggestionsListResponse schemas"
  - "6 deterministic unit tests (no DB, no async, no fixtures) — 0.04s runtime"
affects: [14-07, 14-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Deterministic keyword scanner: lowercased haystack matching with first-hit-wins (lens_type, material) + aggregate (coatings); NO Claude calls"
    - "flag_modified() pattern for in-place JSONB dict mutation — without it the column persist is silently skipped because SQLAlchemy compares the same Python dict object"
    - "Pure synchronous unit tests via types.SimpleNamespace fake the Encounter surface the extractor reads — bypasses the dormant db_session fixture entirely; runs in ~6ms per test"

key-files:
  created:
    - backend/services/optical_suggestions.py
    - .planning/phases/14-optical-order-configuration/14-04-SUMMARY.md
  modified:
    - backend/schemas/optical_order.py
    - backend/api/routes/optical_order.py
    - backend/tests/test_optical_suggestions.py

key-decisions:
  - "Used require_permission not require_clinical_action — same correction applied across Phase 14 to match the canonical dependency factory."
  - "POST accept/dismiss routes use the existing CREATE_OPTICAL_ORDER permission rather than introducing a new SUGGEST_OPTICAL_ORDER ClinicalAction. Suggestion resolution is part of the configurator flow; the {T,R,A,O} set is identical."
  - "GET suggestions filters out accepted+dismissed resolutions on the BE side rather than returning all + letting FE filter. Keeps the chip list short on cold load and centralizes the resolution semantic. FE can still query historical resolutions via the OpticalOrder.suggestion_resolutions_jsonb field returned by GET /{id}/."
  - "lens_type uses first-match-wins (priority follows dict iteration order). progressive > bifocal > single_vision > reading reflects ECP convention: presbyopia + multifocal vocabulary dominates A&P narratives when present, so prioritizing progressive catches the most relevant case."

patterns-established:
  - "flag_modified() on JSONB dict-in-place mutation is required when the column is typed Mapped[dict]; otherwise persist silently no-ops. Future Phase 14+ JSONB mutation sites (e.g. exam-findings PATCH) should follow this."
  - "Pure unit test for a pure function: SimpleNamespace fakes the minimal ORM surface, test runs without any DB or async setup. Use this for any future deterministic service that doesn't touch DB."

requirements-completed: [OPT14-07]

# Metrics
duration: ~20min
completed: 2026-05-26
---

# Phase 14 Plan 04: AI Scribe Optical Suggestion Extractor Summary

**Pure keyword scanner over saved AI Scribe output + 3 accept/dismiss routes. 6 deterministic unit tests pass in 40ms. Zero new Claude API spend — pulls from already-persisted Encounter.ai_summary_text + assessment_and_plan.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-05-26T14:20Z
- **Completed:** 2026-05-26T14:40Z
- **Tasks:** 3
- **Files created:** 2
- **Files modified:** 3

## Accomplishments
- Pure extract_optical_suggestions() function — synchronous, no DB, no async, no Claude
- 3 keyword maps (LENS_TYPE/MATERIAL/COATING_KEYWORDS) cover the catalog vocabulary admin-seeded in Plan 14-06
- 3 new routes registered: GET /{id}/suggestions/, POST /{id}/suggestions/{field}/accept/, POST /{id}/suggestions/{field}/dismiss/
- Walk-in short-circuit returns "Walk-in order — no encounter context" rationale (Pitfall 3)
- Empty AI text returns "No AI Scribe data on encounter" rationale
- 6 unit tests PASS in 0.04s — Pitfall 3 (walk-in) and Pitfall 8 (A&P is plain text) explicitly covered
- audit-clinical.md gate: accept/dismiss writes OPTICAL_ORDER_CONFIGURE_UPDATE in primary TXN with metadata.action='suggestion_resolution'

## Task Commits
1. **Task 1+2+3 combined commit** — `1dbd167` (feat) — service module + schemas + routes + tests landed together since the service has no DB dependency

**Plan metadata:** _committed alongside this SUMMARY_

## Files Created
- `backend/services/optical_suggestions.py` — pure extractor + 3 keyword maps
- `.planning/phases/14-optical-order-configuration/14-04-SUMMARY.md`

## Files Modified
- `backend/schemas/optical_order.py` — OpticalSuggestionResponse + OpticalSuggestionsListResponse classes
- `backend/api/routes/optical_order.py` — 3 new routes + _resolve_suggestion helper + flag_modified import
- `backend/tests/test_optical_suggestions.py` — 6 deterministic unit tests replacing skip-stubs

## Decisions Made
1. **Combined Tasks 1+2+3 into one atomic commit.** The service module has no DB dependency and the tests exercise the pure function directly without async fixtures. Splitting into 3 micro-commits would have lost the natural "introduce the unit + its tests together" semantic.
2. **flag_modified() on the in-place dict mutation.** Per SQLAlchemy docs, Mapped[dict] columns don't auto-detect dict mutation (the column compares the same Python object identity). Without flag_modified() the UPDATE statement is silently skipped — confirmed by reading the SQLAlchemy attribute tracking source. Future Phase 14+ JSONB write-back sites need the same pattern.

## Deviations from Plan
None — Task 2's route registration was verified via `app.routes` enumeration (the plan's single-line grep heuristic for `@router.get.*suggestions/` returned 0 because I used multi-line decorator formatting matching the rest of the file's convention; the routes themselves are correctly registered).

## Issues Encountered
None.

## User Setup Required
None.

## Self-Check: PASSED

- Files: all 4 modified/created files have expected changes
- Commit: `1dbd167` exists in `git log`
- Verify commands:
  - `pytest tests/test_optical_suggestions.py -v` → 6 PASSED, 0 FAILED, 0 SKIPPED, 0.04s
  - `python -c "from backend.main import app; ..."` → 3 suggestion routes registered (GET, POST accept, POST dismiss)
  - Schema smoke test → OpticalSuggestionResponse + OpticalSuggestionsListResponse import + instantiate cleanly

## Next Phase Readiness
- **14-07** (BFF proxies) wires `app/api/optical-orders/[orderId]/suggestions/route.ts` + accept/dismiss BFF routes — upstream URLs match the trailing-slash routes registered here.
- **14-09** (configurator UX) consumes `GET /api/optical-orders/{id}/suggestions/` to render ✨ chips and calls accept/dismiss on user interaction.

---
*Phase: 14-optical-order-configuration*
*Completed: 2026-05-26*
