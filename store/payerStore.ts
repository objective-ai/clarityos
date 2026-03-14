import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { InsurancePayer, FeeScheduleItem } from "@/types/billing";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  updatePayerFeeSchedule: (
    payerId: string,
    items: FeeScheduleItemUpdate[],
  ) => Promise<void>;
  updateFeeCatalog: (items: FeeScheduleItemUpdate[]) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

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
        const payer: InsurancePayer = await res.json();
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
        const updated: InsurancePayer = await res.json();
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
    { name: "payerStore" },
  ),
);
