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
- `humanValue === null` (field is currently empty)
- `section !== "diagnoses"` (ICD codes always require explicit approval)
- `isNormalFinding(section, fieldKey, aiValue)` returns true

**Review tier** (shown in focused diff for individual review):
- Everything not meeting all four auto-tier criteria
- Includes: conflicts, low/medium confidence, all diagnoses, high-confidence abnormal findings

**Normal finding gate** — uses exact EHR dropdown values from the system prompt:

```ts
const NORMAL_VALUES: Record<string, Set<string>> = {
  lids_lashes: new Set(["Normal"]),
  cornea: new Set(["Clear"]),
  conjunctiva_sclera: new Set(["White & quiet"]),
  anterior_chamber: new Set(["Deep & quiet"]),
  iris: new Set(["Flat, normal architecture"]),
  lens: new Set(["Clear"]),
  tear_film: new Set(["Stable"]),
  optic_nerve: new Set(["Healthy, pink"]),
  macula: new Set(["Flat & intact"]),
  vitreous: new Set(["Clear"]),
  vessels: new Set(["Normal A/V ratio"]),
  periphery: new Set(["Flat & intact"]),
};
```

Non-exam fields (vitals, chief complaint, A&P, refraction) have no normal/abnormal distinction — they tier purely on confidence + empty field.

**Typical split for a 15-suggestion encounter:**
- Auto: ~10 items (normal exam findings)
- Review: ~5 items (abnormal findings, diagnoses, refraction, conflicts)

### 2. Review UI Layout

**Banner (top of conflict area):**
```
┌─────────────────────────────────────────────────┐
│ ✓ 10 normal findings pre-staged                 │
│   Review 5 items below (2 conflicts, 1 new Dx)  │
└─────────────────────────────────────────────────┘
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
- "Apply N Selected" → renamed to "Commit" — writes auto + selected review items

### 3. Keyboard Navigation

Shortcuts active only when review mode is open. Handled via `keydown` listener on the review container div (`tabIndex={0}`, auto-focused on mount). Not on `window` — scoped to avoid conflicting with textarea editing elsewhere.

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

### 4. Commit Flow + Animation

**On Enter (commit):**

1. Snapshot all affected stores (same shape as `StoreSnapshots`)
2. `applyResolutions()` writes all auto-tier rows + review-tier `use_ai` rows
3. Fire audit log via `/api/encounters/{id}/ai-scribe/accept`
4. Review section plays exit animation: `scale(0.98)` + `opacity: 0` over 200ms
5. Review mode state flips → encounter forms mount with existing `stagger` animation
6. Undo toast slides up from bottom-right
7. Clear `aiStructuredData` from encounter store

The net effect: review panel dissolves, encounter form rises with AI data populated.

### 5. Undo Safety Net

**Snapshot storage:** `useRef<StoreSnapshot | null>` in the encounter page component. Component-scoped — lost on navigation (by design).

**Undo toast:**
```
┌──────────────────────────────────────────┐
│ ✓ 15 fields applied     [ Undo ]  8s    │
└──────────────────────────────────────────┘
```

- Bottom-right, 8-second countdown with subtle progress bar
- "Undo" button restores snapshot, re-opens review mode, fires "AI auto-fill reverted" audit log
- Expires or dismisses on click-away → snapshot discarded

**Undo exclusions (clinical safety):**
- Diagnoses are NOT auto-removed on undo. If a diagnosis was added via "Accept", undo flags it in the audit trail but the doctor must manually remove it. Silent ICD-10 removal is a liability.
- SOAP narrative text is not reverted (informational, not structured clinical data).

**No Cmd+Z:** The undo is toast-button only. Cmd+Z has meaning in textareas throughout the encounter — hijacking it would break text editing.

## Files Modified

| File | Change |
|---|---|
| `components/encounter/conflict-resolver/buildConflicts.ts` | Add `tier` field to `ConflictRow`, add `isNormalFinding()` gate, compute tier in `addRow()` |
| `components/encounter/review-section/InlineReviewSection.tsx` | Split rows by tier, render banner, keyboard handler, snapshot capture, commit animation, undo state |
| `components/encounter/conflict-resolver/ConflictTable.tsx` | Receive + render `focusedIndex`, remove "Approve All Safe" |
| `components/encounter/conflict-resolver/ConflictRowItem.tsx` | Add `isFocused` prop, focused row visual styling |
| `components/encounter/conflict-resolver/applyResolutions.ts` | Accept pre-filtered rows (auto + selected review), return applied count |
| `app/(tenant)/[tenant]/encounter/[encounterId]/page.tsx` | Undo toast component, snapshot ref, restore logic |
| `app/globals.css` | Add `animate-fade-out` keyframe (200ms, scale 0.98 + opacity 0) |

**No new files. No new dependencies.**

## What This Does NOT Include

- Voice/ambient input (Direction B — future phase)
- Live streaming field ticker during generation (separate enhancement)
- "AI filled" pills on encounter form fields post-apply (separate enhancement)
- CPT code suggestions from diagnoses (separate enhancement)

## Success Criteria

1. A typical 15-suggestion encounter shows ~10 items auto-staged in a banner, ~5 items in the focused diff
2. Doctor can review + commit 5 items in under 10 seconds using keyboard only
3. Diagnoses never auto-apply — always require explicit acceptance
4. Undo restores all non-diagnosis fields within 8 seconds of commit
5. No data writes to stores until explicit commit
6. Exit animation provides clear visual transition back to encounter forms
