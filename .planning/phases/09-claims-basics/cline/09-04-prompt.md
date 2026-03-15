# Phase 9 Wave 4b — payerStore + BFF Routes + Admin Payers Tab

## Goal
Create the payerStore Zustand store, 4 BFF proxy routes for payer CRUD and fee schedule, and add the Admin Payers tab to the admin panel with glass-card table, create modal, and fee schedule editor.

**Depends on:** 09-02 complete (FastAPI payer endpoints exist)
**Parallel safe with:** 09-03, 09-05 (no shared files)

## Read These Files First
1. `app/(tenant)/[tenant]/admin/page.tsx` — LARGE FILE. Read before editing. Find: `type SectionKey`, `const SECTIONS`, `activeSection` state, role-gating pattern for Staff tab, and how section content renders.
2. `store/` — list existing stores to understand the Zustand pattern used
3. `store/billingStore.ts` (or any existing store) — check the exact devtools pattern
4. `app/api/payers/` — check if any routes already exist (don't overwrite)
5. `types/billing.ts` — confirm `InsurancePayer`, `FeeScheduleItem` are exported (added in 09-01)

## Context

**Zustand devtools pattern (from existing stores):**
```typescript
import { create } from "zustand";
import { devtools } from "zustand/middleware";

export const usePayerStore = create<PayerStore>()(
  devtools(
    (set, get) => ({
      payers: [],
      feeCatalog: [],
      loading: false,
      error: null,
      // ... actions
    }),
    { name: "payerStore" }
  )
);
```

**proxyToFastAPI pattern for BFF routes:**
```typescript
import { proxyToFastAPI } from "@/lib/bff";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  return proxyToFastAPI(request, "/api/payers/");
}
```
Trailing slash on upstream path is required.

**Admin panel SectionKey pattern (from reading admin/page.tsx):**
```typescript
type SectionKey = "general" | "staff" | "compliance" | "demo";
// Extend to: "general" | "staff" | "compliance" | "demo" | "payers"
```

**Glass-card table pattern:**
```tsx
<div className="glass-card p-4 rounded-xl">
  <table className="w-full">
    <tbody>
      {payers.map(p => (
        <tr key={p.id} className="hover:bg-white/5 transition-colors cursor-pointer">
          ...
        </tr>
      ))}
    </tbody>
  </table>
</div>
```

## Do NOT / Instead
- Do NOT call FastAPI directly from the store — all fetches go through `/api/payers` BFF routes
- Do NOT create a separate file for `PayersSection` — keep it inline in `admin/page.tsx` as a function component
- Do NOT show the Payers tab to `"doctor"`, `"technician"`, or `"receptionist"` roles — only `"admin"` or `"owner"`
- Do NOT add payer admin features to any page other than the Admin panel

## Instructions

### Task 1 — Create `store/payerStore.ts` + 4 BFF route files

**Create `store/payerStore.ts`:**
```typescript
import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { InsurancePayer, FeeScheduleItem } from "@/types/billing";

interface FeeScheduleItemUpdate {
  cpt_code: string;
  fee: number;
}

interface PayerStore {
  payers: InsurancePayer[];
  feeCatalog: FeeScheduleItem[];
  loading: boolean;
  error: string | null;
  loadPayers: () => Promise<void>;
  loadFeeCatalog: () => Promise<void>;
  createPayer: (data: Partial<InsurancePayer>) => Promise<InsurancePayer>;
  updatePayer: (id: string, data: Partial<InsurancePayer>) => Promise<void>;
  loadPayerFeeSchedule: (payerId: string) => Promise<FeeScheduleItem[]>;
  updatePayerFeeSchedule: (payerId: string, items: FeeScheduleItemUpdate[]) => Promise<void>;
  updateFeeCatalog: (items: FeeScheduleItemUpdate[]) => Promise<void>;
}

export const usePayerStore = create<PayerStore>()(
  devtools(
    (set) => ({
      payers: [],
      feeCatalog: [],
      loading: false,
      error: null,

      loadPayers: async () => {
        set({ loading: true, error: null });
        try {
          const res = await fetch("/api/payers");
          if (!res.ok) throw new Error("Failed to load payers");
          const data = await res.json();
          set({ payers: data, loading: false });
        } catch (e) {
          set({ error: String(e), loading: false });
        }
      },

      loadFeeCatalog: async () => {
        set({ loading: true, error: null });
        try {
          const res = await fetch("/api/fee-catalog");
          if (!res.ok) throw new Error("Failed to load fee catalog");
          const data = await res.json();
          set({ feeCatalog: data, loading: false });
        } catch (e) {
          set({ error: String(e), loading: false });
        }
      },

      createPayer: async (data) => {
        const res = await fetch("/api/payers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error("Failed to create payer");
        const payer = await res.json();
        set((state) => ({ payers: [...state.payers, payer] }));
        return payer;
      },

      updatePayer: async (id, data) => {
        const res = await fetch(`/api/payers/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error("Failed to update payer");
        const updated = await res.json();
        set((state) => ({
          payers: state.payers.map((p) => (p.id === id ? updated : p)),
        }));
      },

      loadPayerFeeSchedule: async (payerId) => {
        const res = await fetch(`/api/payers/${payerId}/fee-schedule`);
        if (!res.ok) throw new Error("Failed to load fee schedule");
        return res.json();
      },

      updatePayerFeeSchedule: async (payerId, items) => {
        const res = await fetch(`/api/payers/${payerId}/fee-schedule`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(items),
        });
        if (!res.ok) throw new Error("Failed to update fee schedule");
      },

      updateFeeCatalog: async (items) => {
        const res = await fetch("/api/fee-catalog", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(items),
        });
        if (!res.ok) throw new Error("Failed to update fee catalog");
        const data = await res.json();
        set({ feeCatalog: data });
      },
    }),
    { name: "payerStore" }
  )
);
```

**Create `app/api/payers/route.ts`:**
```typescript
import { proxyToFastAPI } from "@/lib/bff";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  return proxyToFastAPI(request, "/api/payers/");
}
export async function POST(request: NextRequest) {
  return proxyToFastAPI(request, "/api/payers/");
}
```

**Create `app/api/payers/[payerId]/route.ts`:**
```typescript
import { proxyToFastAPI } from "@/lib/bff";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest, { params }: { params: { payerId: string } }) {
  return proxyToFastAPI(request, `/api/payers/${params.payerId}/`);
}
export async function PATCH(request: NextRequest, { params }: { params: { payerId: string } }) {
  return proxyToFastAPI(request, `/api/payers/${params.payerId}/`);
}
export async function DELETE(request: NextRequest, { params }: { params: { payerId: string } }) {
  return proxyToFastAPI(request, `/api/payers/${params.payerId}/`);
}
```

**Create `app/api/payers/[payerId]/fee-schedule/route.ts`:**
```typescript
import { proxyToFastAPI } from "@/lib/bff";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest, { params }: { params: { payerId: string } }) {
  return proxyToFastAPI(request, `/api/payers/${params.payerId}/fee-schedule/`);
}
export async function PUT(request: NextRequest, { params }: { params: { payerId: string } }) {
  return proxyToFastAPI(request, `/api/payers/${params.payerId}/fee-schedule/`);
}
```

**Create `app/api/fee-catalog/route.ts`:**
```typescript
import { proxyToFastAPI } from "@/lib/bff";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  return proxyToFastAPI(request, "/api/fee-catalog/");
}
export async function PUT(request: NextRequest) {
  return proxyToFastAPI(request, "/api/fee-catalog/");
}
```

**Update `tests/unit/store/payerStore.test.ts`** — unskip and implement:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("payerStore", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }));
  });

  it("initial state has empty payers array", async () => {
    const { usePayerStore } = await import("@/store/payerStore");
    const state = usePayerStore.getState();
    expect(state.payers).toEqual([]);
  });

  it("loadPayers sets payers from fetch response", async () => {
    const mockPayers = [{ id: "1", name: "VSP", is_active: true }];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockPayers,
    }));
    const { usePayerStore } = await import("@/store/payerStore");
    await usePayerStore.getState().loadPayers();
    expect(usePayerStore.getState().payers).toEqual(mockPayers);
  });
});
```

### Task 2 — Add Payers tab to `app/(tenant)/[tenant]/admin/page.tsx`

Read the full file first. Then:

**Step 1** — Extend `SectionKey` type to add `"payers"`:
```typescript
type SectionKey = "general" | "staff" | "compliance" | "demo" | "payers";
```

**Step 2** — Add to `SECTIONS` array after the staff entry:
```typescript
{ key: "payers", label: "Payers", icon: <CreditCard className="w-4 h-4" /> }
```
Import `CreditCard` from `lucide-react`. Apply the same role gate as the Staff tab: only show when `session.role === "admin" || session.role === "owner"`.

**Step 3** — Add `PayersSection` component inline in the same file (do NOT create a new component file).

The `PayersSection` has two views toggled by `useState<string | null>(null)` for selected payer ID:

**List view (selectedPayerId === null):**
- `useEffect` → `loadPayers()` on mount
- Glass-card table: columns = Name, Payer ID, Phone, Active badge
- "Add Payer" button → opens `CreatePayerModal`
- Clicking a row → `setSelectedPayerId(payer.id)`
- Below table: "Base Fee Catalog" collapsible section (calls `loadFeeCatalog()` on expand)
  - Table: CPT Code | Description | Fee (editable `<input type="number" step="0.01">`)
  - "Save Catalog" button → calls `updateFeeCatalog(editedItems)`

**Fee schedule view (selectedPayerId is set):**
- Header: payer name + Back button (`setSelectedPayerId(null)`)
- Loads fee schedule on mount: `loadPayerFeeSchedule(selectedPayerId)` → local state
- Table: CPT Code | Description | Payer Override Fee (editable input)
- "Save" button → calls `updatePayerFeeSchedule(selectedPayerId, editedItems)`

**CreatePayerModal (shadcn Dialog):**
- Fields: Name (required), Payer ID (optional text), Phone (optional), Address (optional)
- Submit calls `payerStore.createPayer(formData)`

**Step 4** — Wire `PayersSection` into main section renderer:
```tsx
{activeSection === "payers" && <PayersSection />}
```

Import `usePayerStore` from `@/store/payerStore`.

## Verify
```bash
npx vitest run tests/unit/store/payerStore.test.ts --reporter=verbose 2>&1 | tail -10
```
```bash
npx tsc --noEmit 2>&1 | grep -c "error TS" || echo "0"
```

## Done When
- `payerStore.test.ts` passes (no `describe.skip`, real assertions pass)
- All 4 BFF route files exist at correct paths
- `admin/page.tsx` SectionKey includes `"payers"`
- `PayersSection` defined inline in admin/page.tsx
- `usePayerStore` imported and called in PayersSection
- `npx tsc --noEmit` shows 0 errors

## Commit
```
feat(claims-admin): add payerStore, BFF routes, and Admin Payers tab
```
