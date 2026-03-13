# AI Scribe: Staged Commit Review Mode

## Problem

After AI Scribe generates structured data from a transcript, the doctor must review 12-15 field suggestions before merging them into the encounter. The current Review & Merge UI shows every suggestion in a flat list — "Cornea: Clear" sits alongside "Lens: 2+ NS" and new ICD-10 diagnoses. By the 15th patient of the day, doctors skim or stop reading, which is when hallucinations slip through.

## Solution: Tiered Staged Commit

Split AI suggestions into two tiers based on clinical risk, so the doctor's scarce attention is focused only on items that need a human brain.

### Approach: Staged Commit

Nothing writes to Zustand stores until the doctor explicitly commits. High-confidence normal findings are pre-staged (marked for acceptance). Conflicts, abnormal findings, and diagnoses surface for individual review. One atomic write on commit, with an 8-second undo window.

## Design

### 1. Tiered Conflict Classification

Every `ConflictRow` gains a `tier: "auto" | "review"` field, computed by `buildConflicts`.

**Auto tier** (pre-staged, shown in summary banner):
- `confidence === "high"`
- `humanValue === null` (field is currently empty — see "Default Detection" below)
- `section !== "diagnoses"` (ICD codes always require explicit approval)
- `isNormalFinding(section, fieldKey, aiValue)` returns true

**Review tier** (shown in focused diff for individual review):
- Everything not meeting all four auto-tier criteria
- Includes: conflicts, low/medium confidence, all diagnoses, high-confidence abnormal findings

#### Normal Finding Gate

Derived from `ANTERIOR_FIELD_META` and `POSTERIOR_FIELD_META` in `lib/exam-findings-fields.ts` — single source of truth, no hardcoded map that drifts.

```ts
import { ANTERIOR_FIELD_META, POSTERIOR_FIELD_META } from "@/lib/exam-findings-fields";

const NORMAL_VALUES: Record<string, Set<string>> = {};
for (const field of [...ANTERIOR_FIELD_META, ...POSTERIOR_FIELD_META]) {
  NORMAL_VALUES[field.key] = new Set([field.defaultStatus]);
}
```

This includes all 14 structures: `lids_lashes`, `conjunctiva_sclera`, `cornea`, `anterior_chamber`, `iris`, `lens`, `tear_film`, `angles`, `cup_to_disc_ratio`, `optic_nerve`, `macula`, `vitreous`, `vessels`, `periphery`.

Non-exam fields (vitals, chief complaint, A&P, refraction) have no normal/abnormal distinction — they tier purely on confidence + empty field.

**Important:** The `isNormalFinding` check must run `aiValue` through `mapAiStatus()` before comparison, since the AI may return lowercase or variant phrasing (e.g., `"clear"` vs `"Clear"`) that the status mapper normalizes. This ensures tier classification matches actual apply behavior.

#### Default Detection (Exam Findings)

**Problem:** Exam findings stores pre-populate with `blankDraft()` defaults (`"Normal"`, `"Clear"`, etc.) via the blank factory in `types/exam-findings.ts`. These are NOT doctor-entered values. When `buildConflicts` compares AI suggestions against these defaults, matching values are skipped entirely (the `humanStr === aiStr` early return on line 81). This would result in 0 auto-tier rows for normal findings.

**Solution:** `StoreSnapshots` gains two boolean flags:

```ts
export interface StoreSnapshots {
  // ... existing fields ...
  examAnteriorSaved: boolean;  // true if committed !== null (has API data)
  examPosteriorSaved: boolean;
}
```

In `buildConflicts`, when `examAnteriorSaved === false` (no API data — just blank defaults):
- Treat default-matching values as "empty" for tier purposes: the AI confirms what was never explicitly entered
- These rows are classified as auto-tier (high confidence + default = virtual empty)
- The banner displays them as "confirmed" findings

When `examAnteriorSaved === true` (doctor saved real data):
- Matching values are genuine matches — skip them as before (no row needed)

**Banner copy adapts:**
```
Unsaved defaults:  "12 findings confirmed by AI · Review 3 items"
Saved real data:   "4 new findings staged · Review 3 items"
```

**Typical split for a 15-suggestion encounter:**
- Auto: ~10 items (normal exam findings, confirmed or staged)
- Review: ~5 items (abnormal findings, diagnoses, refraction, conflicts)

### 2. Review UI Layout

**Banner (top of conflict area):**
```
┌─────────────────────────────────────────────────────────────┐
│ ✓ 10 findings confirmed by AI                              │
│   Review 5 items below (2 conflicts, 1 new Dx)             │
└─────────────────────────────────────────────────────────────┘
```

**Split pane (unchanged structure):**
- Left 40%: Sticky SOAP note (existing `StickySoapNote` component)
- Right 60%: `ConflictTable` showing ONLY review-tier rows

**Keyboard legend (bottom of review section, ghost-styled):**
```
[j/k] Nav    [a] Accept    [i] Ignore    [Enter] Commit
```

Key labels use `kbd` styling: `px-1.5 py-0.5 rounded border border-[var(--glass-border)] bg-[var(--bg-glass)] font-mono text-[10px]`. Text is `text-[var(--text-muted)]`. Visible but non-competing.

**Action bar (bottom):**
- "Cancel" — closes review mode, nothing written
- "Approve All Safe (N)" — REMOVED (replaced by auto-tier logic)
- "Apply N Selected" → renamed to "Commit (N)" — writes auto + selected review items
- Review mode is NOT enterable when `isFinalized === true` (encounter locked)

### 3. Keyboard Navigation

Shortcuts active only when review mode is open. Handled via `keydown` listener on the review container div (`tabIndex={0}`, auto-focused on mount). Not on `window` — scoped to avoid conflicting with textarea editing elsewhere.

**Input guard:** If `e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement`, the handler returns early — allows normal text input in any nested fields (e.g., SOAP note panel, future notes fields).

| Key | Action |
|---|---|
| `j` or `↓` | Focus next review item |
| `k` or `↑` | Focus previous review item |
| `a` | Accept focused item (set resolution to `use_ai`) |
| `i` | Ignore focused item (set resolution to `keep`) |
| `Enter` | Commit all (auto-tier + review-tier `use_ai` items) |
| `Escape` | Close review mode (nothing written) |

**Focus state:** `focusedIndex: number` in `InlineReviewSection`, passed to `ConflictTable` → `ConflictRowItem` via `isFocused` prop.

**Focused row visual:**
- `ring-2 ring-[var(--accent)]/40`
- Slightly elevated background
- 2px solid `var(--accent)` left-edge bar

**Auto-advance:** After `a` or `i`, focus moves to next item. On last item, focus stays (no wrap-around — prevents accidental double-commit).

**Accessibility:** The conflict list uses `role="listbox"` with `aria-activedescendant` pointing to the focused row's `id`. Each `ConflictRowItem` has `role="option"` and `aria-selected` reflecting its resolution state.

### 4. Commit Flow + Animation

**On Enter (commit):**

1. Snapshot all affected stores — capture raw Zustand `getState()` slices (see Undo section for shape)
2. Pre-filter rows: `[...autoTierRows, ...reviewTierRows.filter(r => r.resolution === "use_ai")]`
3. `applyResolutions(encounterId, filteredRows, soapText)` writes all rows, returns applied count
   - `applyResolutions` already fires the audit log to `/api/encounters/{id}/ai-scribe/accept` internally — no duplicate call from the commit flow
4. Review section plays exit animation: `scale(0.98)` + `opacity: 0` over 200ms
   - CSS: `animate-fade-out` keyframe added to `globals.css` AND registered in `tailwind.config.ts` `extend.animation` + `extend.keyframes`
5. Review mode state flips → encounter forms mount with existing `stagger` animation
6. Undo toast slides up from bottom-right with applied count
7. Clear `aiStructuredData` from encounter store

The net effect: review panel dissolves, encounter form rises with AI data populated.

**Concurrent generation guard:** If `aiStructuredData` changes in the store while review mode is open (e.g., a background generation completed), the review panel shows a warning banner: "New AI data available — close and re-open review." The stale data is NOT auto-replaced.

### 5. Undo Safety Net

**Snapshot shape:** Raw Zustand store slices, not the simplified `StoreSnapshots` interface. This preserves all fields (including `severity`, `finding`, and other data that `StoreSnapshots` strips).

```ts
interface UndoSnapshot {
  encounter: {
    chiefComplaint: string;
    assessmentAndPlan: string;
  };
  vitals: VitalsEncounterState | null;          // full store slice
  examAnterior: ExamFindingsSlice | null;       // full findings[key] slice
  examPosterior: ExamFindingsSlice | null;
  diagnoses: DiagnosisEntry[];                  // full array
  refractionColumns: RefractionColumn[];        // full columns array
  appliedCount: number;
}
```

**Snapshot storage:** `useRef<UndoSnapshot | null>` in the encounter page component. Component-scoped — lost on navigation (by design).

**Undo toast:**
```
┌──────────────────────────────────────────┐
│ ✓ 15 fields applied     [ Undo ]  8s    │
└──────────────────────────────────────────┘
```

- Bottom-right, 8-second countdown with subtle progress bar
- "Undo" button restores snapshot, re-opens review mode, fires "AI auto-fill reverted" audit log
- Expires or dismisses on click-away → snapshot discarded

**Undo restore uses dedicated `restoreSnapshot` actions** on each store, or iterates the raw slice calling individual setters. The encounter page's existing `handleRevertField` pattern can be extended for this.

**Undo for audit logging:** Reuses the existing `/api/encounters/{id}/ai-scribe/accept` endpoint with a `{ reverted: true }` flag in the payload. No new backend route needed — the accept endpoint already accepts arbitrary `changes` dict.

**Undo exclusions (clinical safety):**
- Diagnoses are NOT auto-removed on undo. If a diagnosis was added via "Accept", undo flags it in the audit trail but the doctor must manually remove it. Silent ICD-10 removal is a liability.
- SOAP narrative text (`aiSummaryText`) is not reverted — it's informational, not structured clinical data.
- Assessment & Plan IS reverted — it's a structured field in `encounterStore` that drives clinical documentation, not just display text.

**No Cmd+Z:** The undo is toast-button only. Cmd+Z has meaning in textareas throughout the encounter — hijacking it would break text editing.

### 6. `applyResolutions` Signature Change

Current: `applyResolutions(encounterId, rows, soapText) => Promise<void>` — filters internally by `resolution === "use_ai"`.

New: `applyResolutions(encounterId, rows, soapText) => Promise<number>` — caller pre-filters rows, function applies all rows it receives, returns `rows.length` as applied count. The audit log call inside `applyResolutions` remains unchanged.

**Existing bug fix (in scope):** Add handlers for diagnosis laterality and description conflict rows (`dx.*.laterality`, `dx.*.description`). Currently these rows can be toggled to "use_ai" in the UI but `applyResolutions` has no handler — the toggle does nothing on commit. Fix: update the matching diagnosis in `diagnosisStore` when these rows are applied.

## Files Modified

| File | Change |
|---|---|
| `components/encounter/conflict-resolver/buildConflicts.ts` | Add `tier` field, `isNormalFinding()` derived from field metadata, default detection via `examAnteriorSaved`/`examPosteriorSaved` flags, run aiValue through `mapAiStatus` before tier check |
| `components/encounter/review-section/InlineReviewSection.tsx` | Split rows by tier, render banner with confirmed/staged count, keyboard handler with input guard, snapshot capture, commit animation state, undo ref |
| `components/encounter/conflict-resolver/ConflictTable.tsx` | Receive + render `focusedIndex`, add `role="listbox"` + `aria-activedescendant`, keyboard legend bar |
| `components/encounter/conflict-resolver/ConflictRowItem.tsx` | Add `isFocused` prop, focused row visual styling, `role="option"` + `aria-selected` |
| `components/encounter/conflict-resolver/applyResolutions.ts` | Change return type to `Promise<number>`, remove internal filtering (caller provides pre-filtered rows), add dx laterality/description handlers |
| `app/(tenant)/[tenant]/encounter/[encounterId]/page.tsx` | Undo toast component, `UndoSnapshot` ref, restore logic, pass `examAnteriorSaved`/`examPosteriorSaved` to snapshots |
| `app/globals.css` | Add `animate-fade-out` keyframe (200ms, scale 0.98 + opacity 0) |
| `tailwind.config.ts` | Register `fade-out` in `extend.animation` + `extend.keyframes` |

**No new files. No new dependencies.**

## What This Does NOT Include

- Voice/ambient input (Direction B — future phase)
- Live streaming field ticker during generation (separate enhancement)
- "AI filled" pills on encounter form fields post-apply (separate enhancement)
- CPT code suggestions from diagnoses (separate enhancement)

## Success Criteria

1. A typical 15-suggestion encounter shows ~10 items confirmed/staged in a banner, ~5 items in the focused diff
2. Doctor can review + commit 5 items in under 10 seconds using keyboard only
3. Diagnoses never auto-apply — always require explicit acceptance
4. Undo restores all non-diagnosis fields within 8 seconds of commit (A&P included, SOAP narrative excluded)
5. No data writes to stores until explicit commit
6. Exit animation provides clear visual transition back to encounter forms
7. Keyboard shortcuts do not interfere with text input in nested fields
8. Exam default detection correctly distinguishes blank-factory defaults from doctor-saved data
