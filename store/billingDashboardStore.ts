/**
 * store/billingDashboardStore.ts
 *
 * Zustand store for the billing dashboard page.
 * Fetches and filters the superbill list.
 */

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { apiFetch } from "@/lib/api-client";
import type { ClaimStatus } from "@/types/billing";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SuperbillListItem {
  id: string;
  encounterId: string;
  patientId: string;
  patientName: string;
  providerName: string;
  claimStatus: ClaimStatus;
  cptCodes: string[];
  totalFee: number;
  createdAt: string;
}

interface BillingDashboardState {
  superbills: SuperbillListItem[];
  loading: boolean;
  error: string | null;
  statusFilter: ClaimStatus | "all";
}

interface BillingDashboardActions {
  fetchSuperbills: (status?: ClaimStatus) => Promise<void>;
  setStatusFilter: (status: ClaimStatus | "all") => void;
}

type BillingDashboardStore = BillingDashboardState & BillingDashboardActions;

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useBillingDashboardStore = create<BillingDashboardStore>()(
  devtools(
    (set, get) => ({
      superbills: [],
      loading: false,
      error: null,
      statusFilter: "all",

      fetchSuperbills: async (status) => {
        set({ loading: true, error: null }, false, "fetchSuperbills/start");

        try {
          const qs = status ? `?status=${status}` : "";
          const data = await apiFetch<SuperbillListItem[]>(`/api/superbills${qs}`);

          // Coerce fees
          for (const sb of data) {
            sb.totalFee = Number(sb.totalFee) || 0;
          }

          set({ superbills: data, loading: false }, false, "fetchSuperbills/success");
        } catch (err) {
          set({
            loading: false,
            error: err instanceof Error ? err.message : "Failed to load superbills",
          }, false, "fetchSuperbills/error");
        }
      },

      setStatusFilter: (status) => {
        set({ statusFilter: status }, false, "setStatusFilter");
        get().fetchSuperbills(status === "all" ? undefined : status);
      },
    }),
    { name: "ClarityOS/BillingDashboard" },
  ),
);
