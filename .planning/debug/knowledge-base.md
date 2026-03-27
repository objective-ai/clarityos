# GSD Debug Knowledge Base

Resolved debug sessions. Used by `gsd-debugger` to surface known-pattern hypotheses at the start of new investigations.

---

## billing-no-edit-capability — No edit button for superbills after initial creation
- **Date:** 2026-03-27
- **Error patterns:** billing, edit, superbill, CPT, ICD, payer, insurance, read-only, no edit button, BillingWorkflow, ready_to_bill, submitted, accepted
- **Root cause:** billing/page.tsx only opens BillingWorkflowDialog for draft-incomplete and rejected rows via PrimaryAction. No universal "Edit" button existed in the icon column, so ready_to_bill, submitted, and accepted superbills had no UI path to modify payer or CPT codes.
- **Fix:** Added a Pencil edit icon button to the icon column for every row (all statuses) that opens BillingWorkflowDialog, giving users a consistent way to modify billing data regardless of claim status.
- **Files changed:** app/(tenant)/[tenant]/billing/page.tsx
---
