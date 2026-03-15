# Phase 9 Wave 4c — Patient Insurance Tab + Patient Billing Tab

## Goal
Build the patient Insurance and Billing tabs: 3 BFF routes, InsuranceTab component with primary/secondary glass cards and add/edit modal, PatientBillingTab with superbill history table, and extend the patient detail page with both tabs — while removing the old JSONB insurance card from the Demographics tab.

**Depends on:** 09-02 complete (patient insurance endpoints exist)
**Parallel safe with:** 09-03, 09-04 (no shared files)
**Note on payerStore:** InsuranceTab uses `usePayerStore().payers` for the payer dropdown. If 09-04 has not yet completed, the import will cause a TS error until `store/payerStore.ts` exists. Run 09-04 first if running sequentially, OR handle with a try-catch + empty array fallback.

## Read These Files First
1. `app/(tenant)/[tenant]/patients/[patientId]/page.tsx` — find: `type TabKey`, `const TABS`, tab content render block, and the **existing JSONB insurance display block in the Demographics tab** (search for `insurance`, `payer`, or `insurance_card` in the demographics section)
2. `app/api/patients/[patientId]/` — check if a `route.ts` or subdirectories already exist from Phase 5
3. `store/payerStore.ts` — confirm it exists (created by 09-04); check `usePayerStore` export
4. `components/patient/` — list existing components to avoid name collisions
5. `app/(tenant)/[tenant]/billing/page.tsx` — copy `STATUS_STYLES` constant (don't import from there — copy inline)

## Context

**TabKey pattern (from reading the patient page):**
```typescript
type TabKey = "demographics" | "encounters" | "flowsheets" | "rx-history";
// Extend to add: "insurance" | "billing"
```

**STATUS_STYLES to copy inline in PatientBillingTab.tsx:**
```typescript
const STATUS_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  draft: { bg: "bg-gray-500/20", text: "text-gray-300", border: "border-gray-500/30", label: "Draft" },
  ready_to_bill: { bg: "bg-yellow-500/20", text: "text-yellow-300", border: "border-yellow-500/30", label: "Ready to Bill" },
  submitted: { bg: "bg-blue-500/20", text: "text-blue-300", border: "border-blue-500/30", label: "Submitted" },
  accepted: { bg: "bg-green-500/20", text: "text-green-300", border: "border-green-500/30", label: "Accepted" },
  rejected: { bg: "bg-red-500/20", text: "text-red-300", border: "border-red-500/30", label: "Rejected" },
};
```

**proxyToFastAPI BFF pattern:**
```typescript
export async function GET(request: NextRequest, { params }: { params: { patientId: string } }) {
  return proxyToFastAPI(request, `/api/patients/${params.patientId}/insurance/`);
}
```

**Glass-card pattern:**
```tsx
<div className="glass-card p-6 rounded-2xl">
  {/* content */}
</div>
```

## Do NOT / Instead
- Do NOT keep the old JSONB single-insurance display block in the Demographics tab — it must be **deleted**. The Insurance tab replaces it entirely. This is a locked decision.
- Do NOT import `STATUS_STYLES` from the billing page — copy it as a constant inline in `PatientBillingTab.tsx`
- Do NOT create a second `app.include_router` for `/api/patients` — the BFF routes here are Next.js API routes, not FastAPI routers (this is a different concern)
- Do NOT check if `/api/patients/[patientId]/route.ts` exists before creating subdirectory routes — Next.js allows subdirectories alongside an existing `[patientId]/route.ts`

## Instructions

### Task 1 — Create 3 BFF proxy routes

Check if `/api/patients/[patientId]/` directory exists first.

**Create `app/api/patients/[patientId]/insurance/route.ts`:**
```typescript
import { proxyToFastAPI } from "@/lib/bff";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest, { params }: { params: { patientId: string } }) {
  return proxyToFastAPI(request, `/api/patients/${params.patientId}/insurance/`);
}
export async function POST(request: NextRequest, { params }: { params: { patientId: string } }) {
  return proxyToFastAPI(request, `/api/patients/${params.patientId}/insurance/`);
}
```

**Create `app/api/patients/[patientId]/insurance/[insuranceId]/route.ts`:**
```typescript
import { proxyToFastAPI } from "@/lib/bff";
import { NextRequest } from "next/server";

export async function PATCH(request: NextRequest, { params }: { params: { patientId: string; insuranceId: string } }) {
  return proxyToFastAPI(request, `/api/patients/${params.patientId}/insurance/${params.insuranceId}/`);
}
export async function DELETE(request: NextRequest, { params }: { params: { patientId: string; insuranceId: string } }) {
  return proxyToFastAPI(request, `/api/patients/${params.patientId}/insurance/${params.insuranceId}/`);
}
```

**Create `app/api/patients/[patientId]/superbills/route.ts`:**
```typescript
import { proxyToFastAPI } from "@/lib/bff";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest, { params }: { params: { patientId: string } }) {
  return proxyToFastAPI(request, `/api/patients/${params.patientId}/superbills/`);
}
```

### Task 2 — Build InsuranceTab + PatientBillingTab + extend patient detail page

**Create `components/patient/InsuranceTab.tsx`:**

Props: `{ patientId: string }`

State: `insurance: PatientInsurance[]`, `loading: boolean`, `error: string | null`, `modalOpen: boolean`, `editingRecord: PatientInsurance | null`

On mount: `useEffect` → `fetch("/api/patients/${patientId}/insurance")` → set insurance array.
Also call `usePayerStore().loadPayers()` if payers array is empty.

UI layout:
- Two glass cards in a `grid-cols-1 md:grid-cols-2` grid
- Left card: "Primary Insurance" — if found, shows payer name, plan type badge, subscriber ID, group number, relationship; "Edit" and "Remove" action buttons. If not found: "+ Add Primary Insurance" button.
- Right card: "Secondary Insurance" — same; if not found: "+ Add Secondary Insurance" button.

**InsuranceFormModal (shadcn Dialog):**
```tsx
// Fields:
// 1. Payer dropdown: <select> populated from usePayerStore().payers, value=payer.id, display=payer.name
// 2. Plan Type: "medical" | "vision" | "other"
// 3. Subscriber ID (text)
// 4. Group Number (text)
// 5. Plan Name (text)
// 6. Relationship to Subscriber: "self" | "spouse" | "child" | "other"
// 7. Subscriber Name (text, only when relationship !== "self")
// 8. Subscriber DOB (date, only when relationship !== "self")
// Priority is pre-set (primary/secondary) based on which card opened the modal

// On submit: POST (create) or PATCH (edit) → refresh list
```

On Remove: call DELETE `/api/patients/${patientId}/insurance/${id}` → refresh list.

**Create `components/patient/PatientBillingTab.tsx`:**

Props: `{ patientId: string }`

State: `superbills: PatientSuperbillSummary[]`, `loading: boolean`, `error: string | null`

On mount: `useEffect` → `fetch("/api/patients/${patientId}/superbills")` → set superbills array.

UI layout:
```tsx
// Copy STATUS_STYLES inline at top of file (see Context above)

return (
  <div>
    <h2 className="text-lg font-semibold mb-4">Billing History</h2>
    {loading ? (
      // 3 skeleton rows with animate-pulse
    ) : superbills.length === 0 ? (
      <p className="text-center text-gray-400 py-8">No superbills on file</p>
    ) : (
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th>Date</th>
            <th>Status</th>
            <th>E&M Code</th>
            <th>CPT Codes</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {superbills.map(sb => {
            const style = STATUS_STYLES[sb.claim_status] ?? STATUS_STYLES.draft;
            return (
              <tr key={sb.id}>
                <td>{new Date(sb.encounter_date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</td>
                <td><span className={`px-2 py-0.5 rounded-full text-xs border ${style.bg} ${style.text} ${style.border}`}>{style.label}</span></td>
                <td>{sb.suggested_em_code ?? sb.mdm_level ?? "—"}</td>
                <td>{sb.cpt_codes.join(", ")}</td>
                <td>${sb.total_fee.toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    )}
  </div>
);
```

**Extend `app/(tenant)/[tenant]/patients/[patientId]/page.tsx`:**

Read the full file first, then:

1. Change `type TabKey` to add `"insurance"` and `"billing"`:
   ```typescript
   type TabKey = "demographics" | "encounters" | "flowsheets" | "rx-history" | "insurance" | "billing";
   ```

2. Add to `TABS` array:
   ```typescript
   { key: "insurance", label: "Insurance" },
   { key: "billing", label: "Billing" },
   ```

3. Add imports:
   ```typescript
   import { InsuranceTab } from "@/components/patient/InsuranceTab";
   import { PatientBillingTab } from "@/components/patient/PatientBillingTab";
   ```

4. In the tab content render block, add:
   ```tsx
   {activeTab === "insurance" && <InsuranceTab patientId={patientId} />}
   {activeTab === "billing" && <PatientBillingTab patientId={patientId} />}
   ```

5. **REMOVE the existing JSONB insurance display block from the Demographics tab.** Search for the block that renders `insurance`, `patient.insurance`, or insurance card fields in the demographics section. Delete it entirely. The Insurance tab is the new home for insurance data.

## Verify
```bash
npx tsc --noEmit 2>&1 | grep -c "error TS" || echo "0"
```

## Done When
- 3 BFF route files exist at correct paths
- `InsuranceTab.tsx` and `PatientBillingTab.tsx` compile without errors
- Patient detail page `TabKey` includes `"insurance"` and `"billing"`
- `{activeTab === "insurance" && <InsuranceTab ...>}` present in patient page
- `{activeTab === "billing" && <PatientBillingTab ...>}` present in patient page
- JSONB insurance display block is **absent** from the Demographics tab render
- `npx tsc --noEmit` shows 0 errors

## Commit
```
feat(claims-patient): add Insurance and Billing tabs to patient detail page
```
