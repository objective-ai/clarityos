---
status: diagnosed
trigger: "Phase 14 UAT Test 12: inventory is grayed out and no lens catalog admin"
created: 2026-05-27
updated: 2026-05-27
---

## Current Focus

hypothesis: CONFIRMED — Two separate issues bundled into one UAT finding.
  (1) Lens catalog admin UI is out of scope for Phase 14 — no OPT14-* requirement covers a frontend admin surface. Only Plan 14-02 narrative mentions "Admin Inventory page eventually gets a Lens Catalog sub-tab" as future work. SCOPE GAP, not regression.
  (2) Inventory nav grayed out — Sidebar renders gated nav items with `opacity-50` + `href="#"` when entitlement missing (Sidebar.tsx:192-218). User's JWT lacks `retail_pos` entitlement, same root cause as orders-tab-missing-entitlement.
test: Read REQUIREMENTS.md (lines 161, 165-182), Plan 14-02 narrative, Sidebar.tsx, inventory/page.tsx, lensCatalogStore.ts.
expecting: SCOPE gap for admin UI; shared entitlement root cause for inventory.
next_action: Return diagnosis.

## Symptoms

expected: Admin/owner user can manage lens reference catalog (4 types + 6 materials + 7 coatings) via admin page or documented API surface used by some admin component. Inventory navigation reachable for RETAIL_POS users.
actual: User reported "inventory is grayed out and no lens catalog". Plan 14-02 shipped 15 backend endpoints + Plan 14-07 shipped 6 BFF routes, but no Phase 14 plan built an admin page to exercise them.
errors: None
reproduction: Test 12 in .planning/phases/14-optical-order-configuration/14-UAT.md. Login as duytran@yahoo.com/123456, check nav for Inventory and any Lens Catalog admin entry.
started: Discovered during Phase 14 UAT session 2026-05-26.

## Eliminated

- hypothesis: Phase 14 plan accidentally skipped shipping an admin UI that was in scope
  evidence: REQUIREMENTS.md lines 165-182 enumerate OPT14-01 through OPT14-18; none mention an admin/management/CRUD UI for the lens catalog. OPT14-03 only requires the catalog to be "selectable from new admin-managed reference catalogs" (consumed by configurator dropdowns, not edited). The only narrative reference to an admin UI is Plan 14-02 lines 43-44 ("Admin Inventory page eventually gets a Lens Catalog sub-tab") — explicitly framed as future work.
  timestamp: 2026-05-27

## Evidence

- timestamp: 2026-05-27
  checked: REQUIREMENTS.md OPT14-* requirements (lines 165-182, 18 requirements total)
  found: Zero requirements for an admin/management UI. OPT14-03 says "lens type/material/coatings selectable from new admin-managed reference catalogs" — the word "admin-managed" describes the data model lineage, not a UI requirement. OPT14-16 only lists BFF proxy routes. No OPT14-* item maps to a frontend admin page.
  implication: SCOPE GAP — Phase 14 deliberately scoped to backend (14-02), BFF (14-07), and configurator consumption (14-08, 14-09). No plan was authored for a CRUD admin UI.

- timestamp: 2026-05-27
  checked: Plan 14-02 narrative (lines 41-44)
  found: "Frontend frame picker + lens config dropdowns need a queryable, tenant-scoped reference catalog. Admin Inventory page eventually gets a Lens Catalog sub-tab." Author explicitly deferred admin UI to a future plan.
  implication: Confirms backend was built ahead of an admin consumer by design.

- timestamp: 2026-05-27
  checked: app/(tenant)/[tenant]/inventory/page.tsx (lines 52-110)
  found: Inventory page exists from Phase 13 (INV-20). Renders only Frames + Contacts tabs via `setFilters({ productType: "frame" | "contact_lens" })`. No Lens Catalog tab. Page top-gated on `has(Entitlement.RETAIL_POS)` (line 52) — shows "$150/mo add-on" upsell when missing.
  implication: Even if the user HAD the entitlement, the existing inventory page does not expose Lens Catalog CRUD — no UI was built.

- timestamp: 2026-05-27
  checked: store/lensCatalogStore.ts
  found: Read-only loader (`load()` populates types/materials/coatings from `/api/lens-catalog/*` GET endpoints). Zero CRUD methods — grep for `createType|updateType|deleteType|createMaterial|deleteMaterial|createCoating|deleteCoating` returned 0 matches.
  implication: FE infrastructure for reads exists; no FE write infrastructure was ever built. The 9 lens-catalog mutation BFF routes (POST/PATCH/DELETE × 3 resources) have no FE caller.

- timestamp: 2026-05-27
  checked: components/Sidebar.tsx (lines 147-220)
  found: navItems[5] = `{ label: "Inventory", href: "${base}/inventory", icon: Icon.Optical, requiredEntitlement: Entitlement.RETAIL_POS }`. renderNavItem (line 191) computes `locked = item.requiredEntitlement && !has(item.requiredEntitlement)`. When locked: href becomes "#", className gets `opacity-50` (grayed visual), tooltip says "Upgrade to unlock Inventory", and a padlock icon renders on the right. The item is rendered as a Link, NOT hidden.
  implication: "Grayed out" = `opacity-50` styling because `useEntitlements().has(Entitlement.RETAIL_POS)` returned false for this user. Same gate as the Orders tab finding in Test 4 (app/(tenant)/[tenant]/patients/[patientId]/page.tsx:447). Same root cause expected: either JWT app_metadata.entitlements does not contain "retail_pos", or the silent PLAN_FEATURES fallback kicked in (RETAIL_POS is an Add-on, NOT included in any base plan — see lib/entitlements.ts:159-163). Cross-reference debugging_supabase_jwt_entitlements.md.

- timestamp: 2026-05-27
  checked: lib/entitlements.ts (line 159-163)
  found: `retail_pos: { label: "Retail & POS", description: "Inventory catalog, optical orders, and point-of-sale checkout.", plan: "Add-on" }`. Cross-checked INV-14 (REQUIREMENTS line 155): "explicitly NOT added to PLAN_FEATURES['Core'], ['Plus'], or ['Premium']".
  implication: When PLAN_FEATURES fallback engages (because hook-injected JWT entitlements are empty), retail_pos is GUARANTEED missing for ALL plan tiers. Only direct injection via the JWT hook + tenant_members.entitlements row can grant it.

- timestamp: 2026-05-27
  checked: app/(tenant)/[tenant]/patients/[patientId]/page.tsx (cross-ref Test 4 finding)
  found: Two RETAIL_POS gates at lines 447 and 571 (Orders tab visibility + tab content render). Both use the same `has(Entitlement.RETAIL_POS)` predicate from useEntitlements.
  implication: Orders tab missing (Test 4) + Inventory grayed out (Test 12) are the SAME bug with two symptoms — single retail_pos entitlement not reaching this user's JWT.

## Resolution

root_cause: |
  TWO independent issues bundled as one UAT finding:

  ISSUE A — Lens Catalog admin UI absent (SCOPE GAP, not regression):
    Phase 14 deliberately scoped to backend (Plan 14-02), BFF (Plan 14-07), and read-only consumption by the configurator (Plans 14-08/14-09). No OPT14-* requirement covers an admin CRUD UI. Plan 14-02 explicitly defers admin UI as future work ("Admin Inventory page eventually gets a Lens Catalog sub-tab"). The 15 backend endpoints and 6 BFF routes exist but have no FE consumer for writes — lensCatalogStore is read-only.

  ISSUE B — Inventory nav grayed out (SHARED ENTITLEMENT BUG with Test 4):
    Sidebar.tsx:153 gates Inventory on Entitlement.RETAIL_POS. When useEntitlements().has() returns false, renderNavItem (line 191-218) applies `opacity-50` + `href="#"` + padlock icon — that is the "grayed out" visual. The user's JWT lacks `retail_pos` because (a) it's an Add-on entitlement (lib/entitlements.ts:159) NOT in any base plan's PLAN_FEATURES array, and (b) the JWT hook either failed to inject it from tenant_members.entitlements, or that DB row is missing. This is the SAME root cause as Test 4 (Orders tab missing for James Thornton). See debugging_supabase_jwt_entitlements.md for the silent-fallback failure chain.

fix: |
  Do NOT fix in this debug session. Two separate follow-ups required:

  ISSUE A (scope) — Plan a Phase 14.5 (or 15-prefix) "Lens Catalog Admin UI" plan. Minimum scope:
    - Add a third tab to app/(tenant)/[tenant]/inventory/page.tsx: "Frames | Contacts | Lens Catalog".
      (Tabs render is at lines 79-110; extend setFilters or split into a sub-route.)
    - Create components/inventory/LensCatalogTab.tsx with three nested sub-tabs (Types | Materials | Coatings) — sub-tabs use the existing button-group pattern at inventory/page.tsx:79-110 (shadcn Tabs primitive is not installed).
    - Reuse the ProductFormModal donor pattern (components/inventory/ProductFormModal.tsx) for create/edit modals — three modals: LensTypeFormModal, LensMaterialFormModal, LensCoatingFormModal.
    - Extend store/lensCatalogStore.ts with createType/updateType/deleteType + the same for materials/coatings (9 new actions). All raw-fetch via getAuthHeaders to mirror existing read pattern.
    - Gate the Lens Catalog tab on `requirePermission(ClinicalAction.MANAGE_LENS_CATALOG)` — matches the backend route gate.
    - One Playwright spec: tests/e2e/lens-catalog-admin.spec.ts — login as owner, open Inventory → Lens Catalog → create a new type → assert it appears in the configurator's lens type dropdown → soft-delete → assert it no longer appears.
    - Estimated 1 plan, ~6 files, ~400 LOC.

  ISSUE B (entitlement bug) — DO NOT duplicate work. Track under the existing orders-tab-missing-entitlement debug session (same root cause). The fix for that session will also unblock Inventory + any future RETAIL_POS-gated surface. Verify by checking:
    1. `SELECT raw_app_meta_data->'entitlements' FROM auth.users WHERE email='duytran@yahoo.com';` — should include "retail_pos".
    2. `SELECT entitlements FROM tenant_members WHERE staff_id = (SELECT id FROM staff WHERE auth_id = (SELECT id FROM auth.users WHERE email='duytran@yahoo.com'));` — should be a JSONB array containing "retail_pos".
    3. JWT hook function exists, is registered in Supabase Dashboard (toggle off → save → toggle on → save), and runs on next login.
    4. Fresh logout + login → decode the auth-token cookie's JWT directly (not envelope app_metadata per feedback_jwt_vs_envelope_app_metadata.md) → confirm entitlements array contains "retail_pos".

verification: N/A — diagnose-only mode. No fix applied.
files_changed: []
