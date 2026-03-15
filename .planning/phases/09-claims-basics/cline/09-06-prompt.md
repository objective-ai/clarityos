# Phase 9 Wave 5 — PayerSelectionModal + SuperbillEditor Wiring

## Goal
Build the payer selection flow: extend billingStore with payer selection state, create PayerSelectionModal, extend SuperbillEditor with fee_source visual indicators and patientId prop, and thread patientId from the encounter page down through FinalizeModal to SuperbillEditor.

**Depends on:** 09-04 (payerStore exists), 09-05 (patient insurance BFF route exists)

## Read These Files First
1. `store/billingStore.ts` — **READ THE FULL FILE BEFORE EDITING**. Find: existing interface, existing state shape, `createSuperbill` action, existing fetch patterns.
2. `components/billing/SuperbillEditor.tsx` — find: current props interface (only `encounterId`), the auto-creation logic (`useEffect` that calls `createSuperbill` when no superbill), fee input JSX.
3. `components/encounter/FinalizeModal.tsx` — find: `FinalizeModalProps` interface, `<SuperbillEditor encounterId={encounterId} />` call site (~line 513). **Do not guess line numbers — read first.**
4. `app/(tenant)/[tenant]/encounter/[encounterId]/page.tsx` — find: `<FinalizeModal>` call site (~line 754), how `patientId` is derived from `useEncounterStore`.
5. `store/payerStore.ts` — confirm `usePayerStore` export (created in 09-04)

## Context

**patientId threading chain:**
```
encounter/[encounterId]/page.tsx
  → patientId = useEncounterStore(s => s.encounters[params.encounterId]?.patientId ?? null)
  → <FinalizeModal ... patientId={patientId ?? ""} />

FinalizeModal.tsx
  → props: { ..., patientId: string }  ← ADD THIS
  → <SuperbillEditor encounterId={encounterId} patientId={patientId} />

SuperbillEditor.tsx
  → props: { encounterId: string, patientId: string }  ← ADD THIS
  → renders: <PayerSelectionModal patientId={patientId} />
```

**billingStore extensions needed:**
```typescript
// New state
payerSelectionOpen: boolean;
pendingEncounterId: string | null;

// New actions
openPayerSelection: (encounterId: string) => void;
closePayerSelection: () => void;
createSuperbillWithPayer: (encounterId: string, payerId: string | null, isSelfPay: boolean) => Promise<void>;
changeBilledPayer: (superbillId: string, encounterId: string, newPayerId: string | null, isSelfPay: boolean) => Promise<void>;
```

**Fee source color indicators in SuperbillEditor:**
```tsx
// Apply to fee input wrapper or display:
// fee_source === "base_rate" AND !is_fee_overridden  → className="text-yellow-400"
// fee_source === "manual" OR is_fee_overridden       → className="text-purple-400"
// fee_source === "payer_rate"                        → no special class

// Tooltip text:
// base_rate: "Using base catalog rate — edit to lock"
// manual: "Manually set — won't change on payer switch"
```

**Superbill type already has patientId** (from types/billing.ts):
```typescript
export interface Superbill {
  id: string;
  encounterId: string;
  patientId: string;   // ← already present; can be used as fallback
  billed_payer_id: string | null;
  is_self_pay: boolean;
  // ...
}
```

## Do NOT / Instead
- Do NOT mount `<PayerSelectionModal>` in `FinalizeModal.tsx` or the encounter page — it **must** be rendered inside `SuperbillEditor.tsx` so the modal portal attaches correctly within the encounter view
- Do NOT keep calling `createSuperbill()` directly from the SuperbillEditor auto-creation path — replace it with `openPayerSelection(encounterId)`. The user must choose a payer before the superbill is created.
- Do NOT create `payerStore` in this plan — it was created in 09-04
- Do NOT import `STATUS_STYLES` or other billing page constants — keep PayerSelectionModal self-contained

## Instructions

### Task 1 — Extend `store/billingStore.ts`

Read the full file first.

Add to the store interface:
```typescript
payerSelectionOpen: boolean;
pendingEncounterId: string | null;

openPayerSelection: (encounterId: string) => void;
closePayerSelection: () => void;
createSuperbillWithPayer: (
  encounterId: string,
  payerId: string | null,
  isSelfPay: boolean,
) => Promise<void>;
changeBilledPayer: (
  superbillId: string,
  encounterId: string,
  newPayerId: string | null,
  isSelfPay: boolean,
) => Promise<void>;
```

Add initial state values:
```typescript
payerSelectionOpen: false,
pendingEncounterId: null,
```

Implement actions:
```typescript
openPayerSelection: (encounterId) => set({ payerSelectionOpen: true, pendingEncounterId: encounterId }),

closePayerSelection: () => set({ payerSelectionOpen: false, pendingEncounterId: null }),

createSuperbillWithPayer: async (encounterId, payerId, isSelfPay) => {
  try {
    const res = await fetch(`/api/encounters/${encounterId}/superbill`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ billed_payer_id: payerId, is_self_pay: isSelfPay }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      set((state) => ({ /* set error on encounter slice */ }));
      return;
    }
    const data = await res.json();
    set((state) => ({
      encounters: {
        ...state.encounters,
        [encounterId]: {
          ...state.encounters[encounterId],
          superbill: data.superbill ?? data,
          lineItems: data.line_items ?? [],
        },
      },
      payerSelectionOpen: false,
      pendingEncounterId: null,
    }));
  } catch (e) {
    console.error("createSuperbillWithPayer failed:", e);
  }
},

changeBilledPayer: async (superbillId, encounterId, newPayerId, isSelfPay) => {
  const res = await fetch(`/api/encounters/${encounterId}/superbill`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ billed_payer_id: newPayerId, is_self_pay: isSelfPay }),
  });
  if (!res.ok) return;
  const data = await res.json();
  set((state) => ({
    encounters: {
      ...state.encounters,
      [encounterId]: {
        ...state.encounters[encounterId],
        superbill: data.superbill ?? data,
        lineItems: data.line_items ?? [],
      },
    },
  }));
},
```

**Note:** The exact shape of `state.encounters` depends on the actual billingStore structure. Read it first and adapt accordingly — don't blindly copy the above if the actual shape differs.

Update `tests/unit/store/` to add billingStore payer selection tests (or update existing billingStore tests):
```typescript
it("openPayerSelection sets payerSelectionOpen=true and pendingEncounterId", () => {
  useBillingStore.getState().openPayerSelection("enc-123");
  expect(useBillingStore.getState().payerSelectionOpen).toBe(true);
  expect(useBillingStore.getState().pendingEncounterId).toBe("enc-123");
});
it("closePayerSelection resets to false and null", () => {
  useBillingStore.getState().closePayerSelection();
  expect(useBillingStore.getState().payerSelectionOpen).toBe(false);
  expect(useBillingStore.getState().pendingEncounterId).toBeNull();
});
```

### Task 2 — Create `PayerSelectionModal` + extend `SuperbillEditor` + update `FinalizeModal` + update encounter page

**Step 0 — Read all three files before modifying anything.**

**Create `components/billing/PayerSelectionModal.tsx`:**
```tsx
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useBillingStore } from "@/store/billingStore";
import { PatientInsurance } from "@/types/billing";

export function PayerSelectionModal({ patientId }: { patientId: string }) {
  const open = useBillingStore((s) => s.payerSelectionOpen);
  const encounterId = useBillingStore((s) => s.pendingEncounterId);
  const createSuperbillWithPayer = useBillingStore((s) => s.createSuperbillWithPayer);
  const closePayerSelection = useBillingStore((s) => s.closePayerSelection);

  const [insurance, setInsurance] = useState<PatientInsurance[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPayerId, setSelectedPayerId] = useState<string | null>(null);
  const [isSelfPay, setIsSelfPay] = useState(false);

  useEffect(() => {
    if (!open || !patientId) return;
    setLoading(true);
    fetch(`/api/patients/${patientId}/insurance`)
      .then((r) => r.json())
      .then((data) => setInsurance(data ?? []))
      .finally(() => setLoading(false));
  }, [open, patientId]);

  const handleConfirm = async () => {
    if (!encounterId) return;
    await createSuperbillWithPayer(encounterId, selectedPayerId, isSelfPay);
  };

  const handleSelectInsurance = (ins: PatientInsurance) => {
    setSelectedPayerId(ins.payer_id);
    setIsSelfPay(false);
  };

  const handleSelectSelfPay = () => {
    setSelectedPayerId(null);
    setIsSelfPay(true);
  };

  const isSelected = (ins: PatientInsurance) => selectedPayerId === ins.payer_id && !isSelfPay;
  const confirmed = isSelfPay || selectedPayerId !== null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) closePayerSelection(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Choose Insurance Plan</DialogTitle>
        </DialogHeader>
        {loading ? (
          <p className="text-gray-400 text-sm">Loading insurance plans...</p>
        ) : (
          <div className="space-y-2">
            {insurance.map((ins) => (
              <div
                key={ins.id}
                onClick={() => handleSelectInsurance(ins)}
                className={`glass-card p-3 rounded-xl cursor-pointer transition-colors ${isSelected(ins) ? "ring-2 ring-[#2DD4BF]" : "hover:bg-white/5"}`}
              >
                <p className="font-medium text-sm">
                  {ins.priority.charAt(0).toUpperCase() + ins.priority.slice(1)}{" "}
                  {ins.plan_type.charAt(0).toUpperCase() + ins.plan_type.slice(1)}:{" "}
                  {ins.payer?.name ?? "Unknown Payer"}
                </p>
                {ins.plan_name && <p className="text-xs text-gray-400">{ins.plan_name}</p>}
              </div>
            ))}
            <div
              onClick={handleSelectSelfPay}
              className={`glass-card p-3 rounded-xl cursor-pointer transition-colors ${isSelfPay ? "ring-2 ring-[#2DD4BF]" : "hover:bg-white/5"}`}
            >
              <p className="font-medium text-sm">Self-Pay</p>
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={closePayerSelection} className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white">
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!confirmed}
            className="px-4 py-1.5 rounded-lg text-sm bg-[#2DD4BF] text-black font-medium disabled:opacity-40"
          >
            Confirm
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

**Extend `components/billing/SuperbillEditor.tsx`:**

1. Add `patientId` as required prop:
   ```typescript
   export default function SuperbillEditor({
     encounterId,
     patientId,
   }: {
     encounterId: string;
     patientId: string;
   }) { ... }
   ```

2. Add `<PayerSelectionModal patientId={patientId} />` inside the JSX (near the top-level return, always rendered — not conditional):
   ```tsx
   import { PayerSelectionModal } from "@/components/billing/PayerSelectionModal";
   // In the return:
   return (
     <>
       <PayerSelectionModal patientId={patientId} />
       {/* rest of existing JSX */}
     </>
   );
   ```

3. Find the `useEffect` that auto-triggers superbill creation (the one that calls `createSuperbill(encounterId)` when `!superbill`). Replace the `createSuperbill(encounterId)` call with:
   ```typescript
   billingStore.openPayerSelection(encounterId);
   ```
   **Remove or disconnect the direct `createSuperbill` call from this path.**

4. Add fee_source visual indicators to each line item fee display:
   ```tsx
   // For each line item li:
   const feeClass =
     li.is_fee_overridden || li.fee_source === "manual"
       ? "text-purple-400"
       : li.fee_source === "base_rate"
       ? "text-yellow-400"
       : "";
   const feeTooltip =
     li.is_fee_overridden || li.fee_source === "manual"
       ? "Manually set — won't change on payer switch"
       : li.fee_source === "base_rate"
       ? "Using base catalog rate — edit to lock"
       : undefined;

   // Apply to fee input or display:
   <input
     type="number"
     step="0.01"
     className={`... ${feeClass}`}
     title={feeTooltip}
     // existing onChange handler — when user edits, call PATCH with is_fee_overridden=true, fee_source="manual"
   />
   ```

5. Add "Change Payer" section above line items (only visible when `superbill` exists). The dropdown lists patient's insurance (fetch from `/api/patients/${patientId}/insurance`) + Self-Pay. On change → `billingStore.changeBilledPayer(superbill.id, encounterId, newPayerId, isSelfPay)`.

**Update `components/encounter/FinalizeModal.tsx`:**

1. Find `FinalizeModalProps` interface. Add `patientId: string`.
2. Destructure `patientId` in function signature.
3. Update `<SuperbillEditor encounterId={encounterId} />` call to:
   ```tsx
   <SuperbillEditor encounterId={encounterId} patientId={patientId} />
   ```

**Update `app/(tenant)/[tenant]/encounter/[encounterId]/page.tsx`:**

1. Find where `patientId` is derived from `useEncounterStore` (something like `s.encounters[params.encounterId]?.patientId`).
2. Add `patientId={patientId ?? ""}` to the `<FinalizeModal>` call site.

## Verify
```bash
npx vitest run tests/unit/store/ --reporter=verbose 2>&1 | tail -10
```
```bash
npx tsc --noEmit 2>&1 | grep -c "error TS" || echo "0"
```

## Done When
- `billingStore` has `payerSelectionOpen`, `openPayerSelection`, `closePayerSelection`, `createSuperbillWithPayer`, `changeBilledPayer`
- vitest passes on billingStore tests
- `PayerSelectionModal.tsx` exists and compiles
- `SuperbillEditor.tsx` props interface includes `patientId: string`
- `SuperbillEditor.tsx` renders `<PayerSelectionModal patientId={patientId} />`
- `SuperbillEditor.tsx` calls `openPayerSelection` (not `createSuperbill`) on auto-creation path
- `SuperbillEditor.tsx` has `text-yellow-400` / `text-purple-400` fee_source classes
- `FinalizeModal.tsx` passes `patientId` to `SuperbillEditor`
- Encounter page passes `patientId` to `FinalizeModal`
- `npx tsc --noEmit` shows 0 errors

## Commit
```
feat(claims-ui): add payer selection modal and fee source indicators to SuperbillEditor
```
