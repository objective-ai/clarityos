---
status: resolved
trigger: "no order tab for james thornton — Orders tab not visible on patient detail; Inventory nav also grayed out; optical queue page DOES render → divergent RETAIL_POS gating"
created: 2026-05-27T00:00:00Z
updated: 2026-05-27T00:00:00Z
---

## Current Focus

hypothesis: RETAIL_POS is missing from the user's current JWT entitlements; FE silently falls back to PLAN_FEATURES["Premium"] (which excludes RETAIL_POS). Patient page Orders tab + Sidebar Inventory both gate on `has(RETAIL_POS)` and correctly hide. The optical queue page "renders" because that page itself has zero entitlement gate (Phase 14 queue card CTAs visibility is a separate question, see Evidence #9).
test: Read tab gate, optical page gate, queue card gate, useEntitlements hook, session-hydrator, JWT hook SQL, and the seed addon path. Compare PLAN_FEATURES vs. the only path to RETAIL_POS.
expecting: Confirm only path to RETAIL_POS for duytran (Premium tenant) is tenant_addons + working JWT hook union — no PLAN_FEATURES path.
next_action: Diagnose-only mode complete. Return root cause + suggested fix direction.

## Symptoms

expected: Orders tab visible on patient detail (e.g. James Thornton); Inventory nav visible for the user.
actual: Orders tab not rendered; Inventory nav grayed out. But optical queue page renders Phase 14 buttons.
errors: None (silent gate)
reproduction: Login as duytran@yahoo.com / 123456 (tenant sunview); navigate to patient detail page (Thornton).
started: Discovered during Phase 14 UAT session 2026-05-26.

## Eliminated

- hypothesis: Patient page tab gate has a logic bug (wrong entitlement constant, broken useMemo dep, etc.)
  evidence: Tab gate at line 447 uses `has(Entitlement.RETAIL_POS)` against the same hook the Sidebar uses. Sidebar Inventory item (line 153) uses the identical check. The user reports Inventory ALSO grayed out → both readings consistent → gate logic is correct, the underlying entitlement is false.
  timestamp: 2026-05-27

- hypothesis: useEntitlements returns different `has` results per-route (cache/hydration mismatch)
  evidence: hook reads `useSessionStore((s) => s.session)`; `has` is a pure Set lookup over `session.tenant.entitlements`. Zustand subscription is global; no per-route cache; both pages are `"use client"`. No mechanism for divergent reads in the same tab at the same instant.
  timestamp: 2026-05-27

- hypothesis: PLAN_FEATURES fallback grants RETAIL_POS for some plan
  evidence: lib/entitlements.ts:60–88 — RETAIL_POS appears in zero PLAN_FEATURES entries. Documented as Add-on tier (line 50–52, 159–163). The only path to retail_pos in the JWT is via tenant_addons.feature_key + working hook union.
  timestamp: 2026-05-27

## Evidence

- timestamp: 2026-05-27
  checked: app/(tenant)/[tenant]/patients/[patientId]/page.tsx (lines 441–451, 571–573)
  found: Tab and content are BOTH gated by `has(Entitlement.RETAIL_POS)`. The tab is added via `useMemo([has])` — `has` reference is stable while `session` doesn't change.
  implication: No bug in the gate logic itself. Tab visibility is purely a function of `has(RETAIL_POS)` at render time.

- timestamp: 2026-05-27
  checked: app/(tenant)/[tenant]/optical/page.tsx (full file)
  found: Optical queue PAGE has NO entitlement gate at all. Imports do not include `useEntitlements` or `Entitlement`. Anyone with an active session can load the page.
  implication: "Optical queue page renders" does NOT prove RETAIL_POS is reaching the user — the page is intentionally accessible to all authenticated users.

- timestamp: 2026-05-27
  checked: components/optical/OpticalQueueCard.tsx (lines 105–110, 318–337)
  found: The "+ Create Order" and "Configure Order" CTAs on each queue card ARE gated by `canCreateOrder = has(Entitlement.RETAIL_POS) && role-in-set`. The "Print Rx" button is NOT gated.
  implication: If the user genuinely saw "Configure Order overlapping Print Rx" (UAT Test 2), `has(RETAIL_POS)` was TRUE at that render. If they DIDN'T see it (only Print Rx + Start Processing), the UAT Test 2 overlap report would actually be from an earlier session/screenshot. Worth confirming with the user.

- timestamp: 2026-05-27
  checked: components/Sidebar.tsx (lines 109–113, 147–155, 191–219)
  found: Inventory nav uses `requiredEntitlement: Entitlement.RETAIL_POS`. When false, item RENDERS with `opacity-50` + href="#" + Lock icon — that's the "grayed out" appearance. Optical nav has NO `requiredEntitlement` (always renders normally).
  implication: "Inventory grayed out" is direct unambiguous evidence that `has(RETAIL_POS) === false` in the current session. Sidebar and patient page share the same Zustand store and same hook — both readings consistent.

- timestamp: 2026-05-27
  checked: hooks/useEntitlements.ts (lines 118–185)
  found: `has(key)` is `entitlementSet.has(key)` from `session.tenant.entitlements`. Cleanly memoized on `[session]`. No per-route caching.
  implication: `has(RETAIL_POS)` cannot return different values on different routes in the same tab/session.

- timestamp: 2026-05-27
  checked: lib/auth/session-hydrator.ts (lines 83–135, especially 100–105)
  found: If `meta.entitlements` is undefined OR `[]`, hydrator silently falls back to `PLAN_FEATURES[planName] ?? []`. Throws loudly only on missing `tenant_id`/`tenant_slug`/`schema_name` — never on empty entitlements.
  implication: Empty/missing entitlements claim silently degrades. Zero error logging. Exactly matches the pattern documented in `debugging_supabase_jwt_entitlements.md` (2026-05-26).

- timestamp: 2026-05-27
  checked: lib/entitlements.ts:50–88 + backend/seed_db.py:234–311, 339–388
  found: RETAIL_POS is in zero PLAN_FEATURES tiers. Dev tenant is on Premium (`plan_id=PLAN_PREMIUM_ID`, line 311). PLAN_FEATURES["Premium"] = {scheduling, patient_demographics, basic_exam, icd10_diagnoses, billing_export, multi_provider, ai_scribe, advanced_analytics, equipment_import, messaging} — RETAIL_POS not included. Only path is via _seed_tenant_addons (idempotent on tenant_id + lower(feature_key)).
  implication: The ONLY way for RETAIL_POS to be in duytran's JWT is for the hook to UNION subscription_plans.base_features_jsonb with tenant_addons.feature_key. If anything in that chain breaks, fallback PLAN_FEATURES["Premium"] silently excludes RETAIL_POS.

- timestamp: 2026-05-27
  checked: backend/db/sql/custom_access_token_hook.sql (lines 86–139, 156)
  found: Hook unions base_features ∪ tenant_addons.feature_key. tenant_addons SELECT is OUTSIDE the EXCEPTION-handling block — a permission/grant failure throws and aborts the hook (claim absent). GRANT SELECT on tenant_addons present at line 156.
  implication: If the GRANT or hook function is missing in the running DB, the entitlements claim never gets set, and FE silently uses PLAN_FEATURES.

- timestamp: 2026-05-27
  checked: Recent commits + memory note `debugging_supabase_jwt_entitlements.md`
  found: Commits ddf3ced + 30489ec (Phase 13-15, 2026-05-01) added the union. Memory note dated 2026-05-26 says this exact pattern cost ~30 min the same day as the UAT. Pattern: cached pre-13-15 JWT, or hook toggle never re-cycled in Dashboard, or tenant_addons row missing → silent PLAN_FEATURES fallback → all RETAIL_POS gates close.
  implication: Today's report is most likely a recurrence of the 2026-05-26 pattern (same user, same dev DB, same Premium tenant).

- timestamp: 2026-05-27
  checked: Contradiction analysis between "Configure Order visible" (Test 2) and "Orders tab missing + Inventory grayed" (Tests 4 + 12)
  found: Both cannot be true at the same instant in the same tab. Most parsimonious explanation: Test 2's "Configure Order overlapping Print Rx" screenshot was captured during an earlier interval when the JWT did carry RETAIL_POS (e.g., right after a fresh login or RESEED), while Tests 4 + 12 reflect the CURRENT degraded session (post-refresh, post-logout/in, or after a hook regression). Alternative: layout overlap report from Test 2 could be from a window where the user IS owner — and the Configure button was rendered before some state change wiped the JWT entitlements (less likely).
  implication: Cannot fully resolve without runtime artifacts. Recommend the diagnostic checklist below to confirm which link in the 5-link chain broke this time.

## Resolution

root_cause: |
  RETAIL_POS is missing from the user's current JWT `app_metadata.entitlements` claim. The FE session-hydrator silently falls back to `PLAN_FEATURES["Premium"]`, which does NOT include RETAIL_POS (it is an add-on, not a plan-tier feature). The patient page Orders tab gate (page.tsx:447) and the Sidebar Inventory gate (Sidebar.tsx:153) both correctly hide their surfaces — the gate logic is sound; the entitlement value is wrong.

  The "Optical queue page renders" finding is not contradictory: the optical queue page (`app/(tenant)/[tenant]/optical/page.tsx`) has ZERO entitlement gate and is accessible to any authenticated user. Phase 14 CTAs ON the queue card ("+ Create Order", "Configure Order") ARE gated by `has(RETAIL_POS)` — so if the user is currently in a degraded session, those CTAs should be hidden too. If the user genuinely sees them right now, that proves the JWT carries RETAIL_POS in some tabs/sessions but not others (cached JWT problem). If the Test 2 "overlap" report was actually from an earlier interval, that's consistent with the current degraded session.

  The silent-fallback chain that produces this exact symptom is documented in `[debugging_supabase_jwt_entitlements.md]` (created 2026-05-26, the same day as the UAT, costing ~30 min to diagnose then). The 5 possible failure points:
    1. Cached JWT predates Phase 13-15 hook update (commit 30489ec, 2026-05-01) — user hasn't logged out/in or hit a token refresh since.
    2. Supabase Dashboard hook toggle is OFF, or the function was edited and the toggle was never re-cycled (off → save → on → save).
    3. `public.tenant_addons` row missing for tenant `b0000000-0000-0000-0000-000000000001` (RESEED never ran, or row was wiped).
    4. `GRANT SELECT ON public.tenant_addons TO supabase_auth_admin` lost (DB recreated without re-running hook SQL).
    5. The hook function itself missing/regressed in `public` schema.

  This is an entitlement-distribution issue, NOT a UI logic bug. The recurrence pattern means a more durable countermeasure is worth considering (see fix direction below).

fix: |
  Diagnose-only mode. Suggested fix direction (NOT applied):

  IMMEDIATE RECOVERY (in order — stop at first issue resolved):
    a. Decode current JWT from browser DevTools (Application → Cookies → `sb-*-auth-token` → concatenate chunks → base64-decode middle segment). Verify `app_metadata.entitlements` includes `"retail_pos"`. If missing/empty array, proceed.
    b. SQL check the 5-link chain from `debugging_supabase_jwt_entitlements.md`:
         (1) `SELECT proname FROM pg_proc JOIN pg_namespace ON ... WHERE proname='custom_access_token_hook' AND nspname='public';` — should return 1 row.
         (2) Supabase Dashboard → Authentication → Hooks → "Custom Access Token (JWT)" toggle ON, pointing to `public.custom_access_token_hook`.
         (3) `SELECT * FROM public.tenant_members WHERE user_id='c75da6ec-259c-4f97-933c-8dbea5ebbdf3' AND is_active=true;` — should return 1 row.
         (4) `SELECT * FROM public.tenant_addons WHERE tenant_id='b0000000-0000-0000-0000-000000000001' AND feature_key='retail_pos';` — should return 1 row. If missing → `RESEED=true python backend/seed_db.py` (or `npm run db:reseed`).
         (5) After ANY of the above are fixed, user must log out + log back in to mint a fresh JWT.
    c. Direct hook invocation to bypass JWT caching:
         `SELECT public.custom_access_token_hook(jsonb_build_object('user_id','c75da6ec-259c-4f97-933c-8dbea5ebbdf3', 'claims', jsonb_build_object('app_metadata', '{}'::jsonb)));`
         The returned `claims.app_metadata.entitlements` should include `"retail_pos"`. If yes, the DB side is healthy — the only remaining problem is a stale JWT in the browser (log out/in).

  PRODUCT-LEVEL HARDENING (out of scope for this diagnose-only session, but worth a follow-up):
    - The Sidebar shows a "grayed out + Lock" affordance for locked nav items. The patient page Orders tab silently disappears with no visible affordance, which is what produced the "no order tab" bug report. Consider rendering a locked Orders tab with an upsell tooltip (consistent with Sidebar pattern). This would convert "feature missing" into "feature locked, click to learn more" and prevent the next recurrence from looking like a regression.
    - Consider adding a one-time console.warn in session-hydrator when entitlements array is empty AND falls back to PLAN_FEATURES. The current behavior is documented as "fail loudly only on missing tenant_id" — the silent fallback on entitlements is by design but it's the exact thing that took 30 min to diagnose on 2026-05-26 and is recurring today. A single `console.warn("[session-hydrator] JWT entitlements empty — using PLAN_FEATURES fallback. Hook may be off.")` would make the next occurrence diagnosable in ~30 seconds.

  Files involved (no edits applied):
    - C:\Users\duytr\Projects\clarityos\app\(tenant)\[tenant]\patients\[patientId]\page.tsx — tab gate at 447, render gate at 571
    - C:\Users\duytr\Projects\clarityos\components\Sidebar.tsx — Inventory entry at 153
    - C:\Users\duytr\Projects\clarityos\components\optical\OpticalQueueCard.tsx — Phase 14 CTAs gated at 108–110, 318–337
    - C:\Users\duytr\Projects\clarityos\lib\auth\session-hydrator.ts — silent PLAN_FEATURES fallback at 102–105
    - C:\Users\duytr\Projects\clarityos\lib\entitlements.ts — PLAN_FEATURES at 60–88 (RETAIL_POS not in any tier)
    - C:\Users\duytr\Projects\clarityos\backend\db\sql\custom_access_token_hook.sql — hook union at 86–139
    - C:\Users\duytr\Projects\clarityos\backend\seed_db.py — _seed_tenant_addons at 347–388
    - C:\Users\duytr\.claude\projects\c--Users-duytr-Projects-clarityos\memory\debugging_supabase_jwt_entitlements.md — known troubleshooting chain (created 2026-05-26)

verification: (diagnose-only — no fix applied)
files_changed: []
