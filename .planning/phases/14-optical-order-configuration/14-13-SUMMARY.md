---
phase: 14-optical-order-configuration
plan: 13
status: complete
executed: 2026-05-27
gap_closure: true
---

# Plan 14-13 SUMMARY — RETAIL_POS Entitlement + Locked Orders Tab

## Outcome

All three tasks landed. Two atomic commits + one operational recovery (Task 1).

## Task 1 — Operational recovery (no code)

**Root cause:** `public.tenant_members` had **0 rows** for `duytran@yahoo.com`
(user_id `c75da6ec-259c-4f97-933c-8dbea5ebbdf3`). The custom JWT hook reads
that table to resolve `v_tenant_id` and short-circuits to empty `app_metadata`
when no row exists — explaining the silent fallback to PLAN_FEATURES seen in
the UAT.

**Diagnostic chain walked DB-side (no user browser interaction needed):**

| Step | Check | Result |
|------|-------|--------|
| 2 | `custom_access_token_hook` exists in `pg_proc` | 1 row ✓ |
| 4 | `tenant_addons (tenant_id, retail_pos)` row exists | 1 row ✓ |
| (root cause) | `tenant_members WHERE user_id=...` | **0 rows ✗** |
| Recovery | Ran `python backend/bootstrap_user.py duytran@yahoo.com --role owner` | inserted 1 row |
| 6 | Re-invoked hook — entitlements returned | `["advanced_analytics", "ai_scribe", "basic_exam", "billing_export", "equipment_import", "icd10_diagnoses", "messaging", "multi_provider", "patient_demographics", "retail_pos", "scheduling"]` ✓ |

**User-side step remaining:** log out + log back in as `duytran@yahoo.com / 123456`
to mint a fresh JWT. Page reload alone is insufficient — Supabase only re-mints
on login or token refresh.

**Re-runnable UAT surfaces** post-relogin: Test 4 (Orders tab visibility on
Thornton), Test 12 inventory portion (Sidebar Inventory link unlocked).

## Task 2 — Session-hydrator warn-once diagnostic

`lib/auth/session-hydrator.ts` — added module-level `__planFeaturesFallbackWarned`
guard; the fallback branch now emits one `console.warn` per session pointing at
`debugging_supabase_jwt_entitlements.md`. Test-only `__resetPlanFeaturesFallbackWarnedForTest`
export resets the guard for vitest.

`tests/unit/lib/session-hydrator.test.ts` — 5/5 passing:
- emits exactly one warn on empty entitlements array
- emits exactly one warn when entitlements key absent
- no warn on populated entitlements
- still only warns once across multiple hydrate calls
- falls back to PLAN_FEATURES[Premium] correctly

**Commit:** `c295641 feat(14): warn once on session-hydrator PLAN_FEATURES fallback`

## Task 3 — Locked Orders tab affordance

`app/(tenant)/[tenant]/patients/[patientId]/page.tsx`:
- New `TabDescriptor` interface adds optional `locked` + `upsell` fields.
- Orders tab now ALWAYS in `tabs` array (no longer conditionally pushed).
- When `has(RETAIL_POS)===false`: `opacity-50` + `cursor-not-allowed` + Lock icon (3×3) + `title="Available with Retail POS add-on"` + `aria-disabled="true"` + no-op click.
- When entitled: renders normally, click activates the tab.
- Content gate at content-render preserved (defense in depth).
- `aria-disabled` typed as `"true" | undefined` (string, per ARIA spec).
- Button `type="button"` added.

`tests/unit/patient-detail-page-orders-tab.test.tsx` — 3/3 passing:
- locked state renders opacity + lock + tooltip + aria-disabled
- locked click does NOT activate tab
- unlocked state has no opacity/lock/aria-disabled/title

Sibling regression check: `tests/unit/OrdersTab.test.tsx` 3/4 passing — the
one failure (`clicking a row calls loadOrder`) pre-exists this plan (confirmed
via `git stash` + re-run on stashed worktree).

**Commit:** `3af51d6 feat(14): locked Orders tab affordance on patient detail page`

## Files Changed

- `lib/auth/session-hydrator.ts` — +20 lines (guard + warn + test export)
- `tests/unit/lib/session-hydrator.test.ts` — new, 103 lines
- `app/(tenant)/[tenant]/patients/[patientId]/page.tsx` — +24 / -16 lines (TabDescriptor + locked render)
- `tests/unit/patient-detail-page-orders-tab.test.tsx` — new, 91 lines

## Diagnostic-Smoke Confirmation

Manual smoke for the warn-once: clear cookies, log in to a tenant that has
no entitlements array in JWT, open DevTools console — expect ONE
`[session-hydrator] No entitlements in JWT app_metadata; falling back to
PLAN_FEATURES[<Plan>]. If RETAIL_POS or other add-ons are missing, walk the
chain at debugging_supabase_jwt_entitlements.md.` line. The warn does NOT
repeat on Strict-Mode double-render or session refreshes (guarded by module
boolean).

## Phase 14 UAT Status (Test 4, Test 12)

| Test | Pre-14-13 state | Post-14-13 state |
|------|-----------------|------------------|
| 4 (Thornton Orders tab visibility) | Tab hidden silently when RETAIL_POS missing | After user re-login: tab visible. If entitlement missing again: tab visible-but-locked with upsell tooltip. |
| 12 (Inventory link) | Silently grayed in sidebar | After user re-login: unlocked. Sidebar pattern unchanged. |
| Future regressions | "No order tab" misdiagnosed | Lock affordance makes intent visible; console.warn surfaces the silent fallback in ~30 s instead of ~30 min |
