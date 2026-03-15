# Phase 9 — Cline Prompts

Paste each prompt file directly into Cline's task input. Each file is self-contained.

## Wave Order

```
Wave 1 (start here, no deps)
  └─ 09-00-prompt.md    Test stubs — run this first, alone

Wave 2 (after Wave 1)
  └─ 09-01-prompt.md    ORM models + migration + seed + TS types

Wave 3 (after Wave 2)
  └─ 09-02-prompt.md    Backend API routes + fee_service.py

Wave 4 (after Wave 3 — these THREE are safe to run in parallel)
  ├─ 09-03-prompt.md    PDF generation endpoint + binary BFF route
  ├─ 09-04-prompt.md    payerStore + Admin Payers tab
  └─ 09-05-prompt.md    Patient Insurance + Billing tabs

Wave 5 (after ALL of Wave 4)
  └─ 09-06-prompt.md    PayerSelectionModal + SuperbillEditor wiring

Wave 6 (after Wave 5)
  └─ 09-07-prompt.md    Download PDF buttons + human verification checkpoint
```

## Parallelism Notes

- **09-03, 09-04, 09-05** touch zero shared files — safe to run in 3 parallel Cline sessions simultaneously
- **09-05** requires `store/payerStore.ts` to exist (created by 09-04) for the payer dropdown import — if running in parallel, run 09-04 first and let it finish before 09-05 reads the store file, OR have 09-05 stub the import and expect a type error that resolves when 09-04 lands
- **09-06** must wait for all Wave 4 plans to finish — it reads `FinalizeModal.tsx`, `SuperbillEditor.tsx`, and `billingStore.ts`, which are all modified in Wave 4

## What Each Prompt Contains

Each prompt follows this structure:
1. **Goal** — one sentence
2. **Read These Files First** — ordered list, read before touching anything
3. **Context** — key patterns and interfaces
4. **Do NOT / Instead** — the biggest gotchas in negative form
5. **Instructions** — verbatim from the plan's action blocks
6. **Verify** — automated command to run after implementation
7. **Done When** — exact criteria
8. **Commit** — suggested commit message

## Key Rules (also in .clinerules at project root)

- BFF JSON: `proxyToFastAPI()` from `@/lib/bff`, trailing slash on upstream
- BFF PDF: raw `fetch()` + `arrayBuffer()` — never `proxyToFastAPI` for binary
- SQLAlchemy: NEVER `db.refresh()` after flush — `selectinload` re-fetch instead
- Enums: `native_enum=False` always
- `@/` path alias always — no relative imports
- Never add packages without approval
