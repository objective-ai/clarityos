---
status: resolved
trigger: "billing-no-edit-capability — No way to edit the bill in billing — cannot change insurance or CPT/ICD codes after superbill is created"
created: 2026-03-27T00:00:00Z
updated: 2026-03-27T00:10:00Z
---

## Current Focus

hypothesis: CONFIRMED — The billing workflow is already editable (payer dropdown, add/remove CPT) but only accessible from draft/rejected states. Once status is "ready_to_bill", "submitted", or "accepted", there is NO way to open the workflow dialog.
test: Verified by reading billing/page.tsx PrimaryAction component and full BillingWorkflow.tsx
expecting: Fix = add a Pencil edit icon button to all rows that opens BillingWorkflowDialog for any status
next_action: Implement fix in billing/page.tsx — import Pencil icon, add edit button to icon column

## Symptoms

expected: User should be able to edit insurance selection and CPT/ICD codes on an existing superbill/bill in the billing workflow
actual: No edit UI exists — fields appear read-only or there is no edit button/flow to modify billing codes or insurance after initial creation
errors: None reported — it's a missing feature / UI gap
reproduction: Go to billing section for an encounter, view the superbill — no way to edit insurance or codes
started: Likely never existed — a gap in the billing workflow

## Eliminated

- hypothesis: BillingWorkflow review step is entirely read-only
  evidence: Review step has a payer dropdown (changeable), add CPT button, remove CPT button — it IS editable
  timestamp: 2026-03-27

- hypothesis: No PATCH endpoint exists for superbill
  evidence: app/api/encounters/[encounterId]/superbill/route.ts exports PATCH handler
  timestamp: 2026-03-27

## Evidence

- timestamp: 2026-03-27
  checked: billing/page.tsx PrimaryAction component (lines 88-158)
  found: Only draft-incomplete and rejected statuses open BillingWorkflowDialog. ready_to_bill shows "Post" button. submitted/accepted have no button at all. No row has a general "Edit" button.
  implication: Users can never re-open the workflow to change payer or CPT codes once posted

- timestamp: 2026-03-27
  checked: BillingWorkflow.tsx review step (lines 649-1062)
  found: Step 2 has a payer select dropdown (calls changeBilledPayer), CptAddDropdown, remove line item buttons — fully interactive when opened.
  implication: The gap is purely in the billing list page — no "Edit" entry point for non-draft/rejected rows

- timestamp: 2026-03-27
  checked: billing/page.tsx icon buttons column (lines 457-484)
  found: Only "View Encounter" (ExternalLink) and "Download PDF" (FileDown) icon buttons. No edit/pencil button.
  implication: Adding a Pencil icon button here calling setWorkflowSb(sb) for ALL statuses is the minimal fix

## Resolution

root_cause: The billing list page only opens BillingWorkflowDialog for draft-incomplete and rejected rows via PrimaryAction. There is no universal "Edit" button in the icon column — so ready_to_bill, submitted, and accepted superbills have no UI path to modify payer or CPT codes, even though BillingWorkflow itself is fully interactive when opened.
fix: Add a Pencil edit icon button to the icon column for every row (all statuses) that opens BillingWorkflowDialog. This gives users a consistent way to modify billing data regardless of claim status.
verification: tsc --noEmit passes with zero new errors in billing files. All pre-existing errors are in test/docs files unrelated to this change.
files_changed: [app/(tenant)/[tenant]/billing/page.tsx]
