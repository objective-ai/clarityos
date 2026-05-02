---
phase: 13-retail-inventory
plan: 15
type: gap_closure
status: complete
date: 2026-05-02
requirements:
  - INV-14
---

# Plan 13-15: Wire `tenant_addons` into entitlement check + unblock 13-UAT

## Goal

Close the single blocker gap from `13-UAT.md`: no tenant could receive the `retail_pos` entitlement, so all 13 remaining UAT tests were skipped because Test 1 ("inventory is locked") failed. This plan wires the existing `tenant_addons` table read into `has_entitlement()`, updates the JWT hook to mirror that union into `app_metadata.entitlements`, and seeds the dev tenant with a `retail_pos` row.

## Outcome

- ✓ Sidebar Inventory link visible for the dev (Premium) tenant
- ✓ `/inventory` page renders Frames | Contacts tabs with 10 seeded frames (Ray-Ban, Oakley, Warby Parker, etc.) — no upgrade gate
- ✓ `GET /api/inventory/products/` returns 200 with the 10-frame catalog
- ✓ Patient detail Orders tab visible
- ✓ Messaging UI loads for Premium tenant (no regression — the seed reconciliation prevented Plus/Premium from losing `messaging`/`equipment_import` when the FE flipped from `PLAN_FEATURES` fallback to `rawEntitlements`)
- ✓ Live JWT `app_metadata.entitlements` array contains all 11 keys: `advanced_analytics`, `ai_scribe`, `basic_exam`, `billing_export`, `equipment_import`, `icd10_diagnoses`, `messaging`, `multi_provider`, `patient_demographics`, `retail_pos`, `scheduling`
- ✓ All 13 backend regression tests green (5 new in `test_entitlements_addons.py` + 8 messaging back-compat)

## Files modified

| File | LOC delta | Purpose |
|---|---|---|
| `backend/core/entitlements.py` | +70 / -16 | Widen `has_entitlement()`; `require_entitlement()` reads `tenant_addons` via Optional `db` |
| `backend/tests/test_entitlements_addons.py` | +146 (new) | 5 RED→GREEN tests + inline `RecordingSession` helper |
| `backend/db/sql/custom_access_token_hook.sql` | +40 / -2 | JWT hook injects `entitlements` union; conditional GRANT on tenant schema |
| `backend/seed_db.py` | +66 / -14 | Reconcile `subscription_plans.base_features_jsonb` for Plus/Premium; add `_seed_tenant_addons` helper; case-insensitive idempotency |
| `lib/auth/session-hydrator.ts` | +39 / -1 | Decode JWT directly; prefer JWT `app_metadata` over envelope `user.app_metadata` |
| `backend/alembic/versions/0018_products_soft_delete.py` | +55 (new) | Add missing `is_deleted` / `deleted_at` columns to `products` |

## Captured live JWT `app_metadata` (Premium dev tenant, 2026-05-02 07:43 UTC)

```json
{
  "clinic_name": "Sunview Eye Care",
  "clinical_role": "doctor",
  "entitlements": [
    "advanced_analytics",
    "ai_scribe",
    "basic_exam",
    "billing_export",
    "equipment_import",
    "icd10_diagnoses",
    "messaging",
    "multi_provider",
    "patient_demographics",
    "retail_pos",
    "scheduling"
  ],
  "full_name": "",
  "plan_name": "Premium",
  "provider": "email",
  "providers": ["email"],
  "role": "owner",
  "schema_name": "clinic_sunview",
  "staff_id": "",
  "tenant_id": "b0000000-0000-0000-0000-000000000001",
  "tenant_slug": "sunview"
}
```

## JWT hook re-toggle

Performed 2026-05-02 ~07:00 UTC by user via Supabase Dashboard → Authentication → Hooks → Custom Access Token (disable → save → re-enable → save). Confirmed via fresh sign-in token mint + decoded `entitlements` claim.

## Gaps surfaced and closed in this plan

The plan as originally specified covered Tasks 1–3 (entitlement check + hook + seed). Two additional gaps were discovered during browser smoke and closed in the same plan:

1. **`tenant_members` row missing for dev user.** `seed_db.py` does not seed `public.tenant_members` — that's done by `bootstrap_user.py` / `provision_user.py` against Supabase auth users (which exist outside the regular seed flow). The dev tenant_members row was missing on the active Supabase project, so the JWT hook was short-circuiting on `IF v_tenant_id IS NOT NULL` and emitting an empty `app_metadata` for every token mint. Closed by inserting an `('owner', is_active=true)` row directly. Did not bake into seed_db.py because the seed is not the canonical source for `tenant_members`.

2. **FE session-hydrator silently fell back to `PLAN_FEATURES` even after the JWT carried `entitlements`.** Root cause: the Supabase auth-token cookie envelope contains TWO copies of `app_metadata`. The JWT's `app_metadata` claim (set by the hook at mint time, contains `entitlements`) and `user.app_metadata` (snapshot of `auth.users.raw_app_meta_data`, which the hook does NOT write to). `supabase.auth.getSession()` returns the envelope's `user.app_metadata`, not the JWT's. Fix: decode the JWT in `session-hydrator.ts` and merge JWT `app_metadata` over the envelope's. JWT is the source of truth for hook-computed claims.

3. **`products.is_deleted` / `deleted_at` columns missing from migration 0017.** The Phase 13-01 ORM declares `Product(TimestampMixin, SoftDeleteMixin, TenantBase)` but migration 0017 omitted the two SoftDeleteMixin columns. Every SELECT against `products` was failing with `UndefinedColumnError`. Closed via migration `0018_products_soft_delete.py`. Surfaced during 13-15 only because the entitlement fix made the inventory route reachable for the first time.

## Decisions Locked

- **`has_entitlement` uses keyword-only `addon_keys`** to preserve back-compat — any future entitlement test must use the same calling pattern.
- **`require_entitlement._check` keeps `db: AsyncSession | None = None`** — required for non-FastAPI callers (unit tests calling `await dep(ctx)` directly). Do not change to a required parameter without auditing every direct call site.
- **`subscription_plans.base_features_jsonb` is the source of truth the JWT hook reads.** It MUST mirror `backend/core/entitlements.py:PLAN_FEATURES`. A future test asserting this invariant on every CI run is recommended.
- **`session-hydrator.ts` decodes the JWT** rather than trusting `session.user.app_metadata`. Future entitlement work should add new claims to `custom_access_token_hook.sql`, NOT to `auth.users.raw_app_meta_data`. The Supabase `getSession()` envelope is not the source of truth for hook-computed claims.
- **`_seed_tenant_addons` idempotency is case-insensitive on `(tenant_id, lower(feature_key))`** — protects against pre-StrEnum legacy uppercase `feature_key` rows that were silently corrupting the dev DB.
- **Tenant-schema GRANTs in `custom_access_token_hook.sql` are wrapped in `information_schema` checks** so the SQL runs cleanly on Supabase projects where the tenant schema is empty (per project memory: "Seed into public schema only — clinic_sunview unused").

## Iteration 1 fixes (from plan revision)

- `db` is Optional in `_check` (back-compat blocker resolved without patching the messaging test) — proven by `test_require_entitlement_back_compat_no_db_kwarg_messaging` and the unchanged messaging suite passing.
- Inline `RecordingSession` test helper (replaces phantom `last_query` attribute reference).
- Idempotency gated on `(tenant_id, feature_key)` only, with single-row invariant assertion verified post-reseed.
- Same-commit seed reconciliation: Plus + Premium `base_features_jsonb` mirror Python `PLAN_FEATURES` (no messaging regression on hook flip).
- All verification snippets bootstrap their own SQLAlchemy engine from `DATABASE_URL`.

## Follow-ups

- **Phase 15** will introduce the actual purchase / billing flow that mints `tenant_addons` rows for paying customers. This plan only seeds the dev tenant manually.
- **Recommended CI invariant test:** assert `subscription_plans.base_features_jsonb == PLAN_FEATURES` for every plan on every test run, so a future drift between Python `PLAN_FEATURES` and the seed reconciliation is caught at build time rather than at the next JWT-hook flip.
- **Recommended `tenant_members` seeding:** consider adding a `_seed_tenant_members(session)` helper to `seed_db.py` keyed off the dev user's known `auth.users.id`, so future Supabase project resets don't strand the dev login.
- **Audit other Phase 13 tables for SoftDeleteMixin coverage:** `OpticalOrder`, `OpticalOrderLineItem`, `InventoryTransaction` do NOT inherit `SoftDeleteMixin` (intentional — append-only / lifecycle-tracked). If future work adds the mixin, migration 0017 schema must be updated atomically.

## Commits

```
3aa93b4 fix(13-15): hydrate entitlements from JWT app_metadata, not user.app_metadata
30489ec feat(13-15): JWT hook injects entitlements union; reconcile plan seeds; seed retail_pos add-on
ddf3ced fix(13-15): make tenant-schema GRANTs conditional in custom_access_token_hook.sql
b8e3e52 feat(13-15): widen has_entitlement to union tenant_addons (db Optional for back-compat)
a49d112 test(13-15): RED — entitlement check must union tenant_addons
16f7871 fix(13-15): add missing is_deleted/deleted_at columns to products (migration 0018)
```
