/**
 * store/billingDashboardStore.ts
 *
 * Zustand store for the billing dashboard page.
 * Fetches and filters the superbill list.
 */

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { apiFetch } from "@/lib/api-client";
import type { ClaimStatus, SuperbillListItem } from "@/types/billing";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BillingDashboardState {
  superbills: SuperbillListItem[];
  loading: boolean;
  error: string | null;
  statusFilter: ClaimStatus | "all";
}

interface BillingDashboardActions {
  fetchSuperbills: (status?: ClaimStatus) => Promise<void>;
  setStatusFilter: (status: ClaimStatus | "all") => void;
  updateClaimStatus: (encounterId: string, newStatus: ClaimStatus) => Promise<void>;
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

          // Coerce fees and ensure array fields
          for (const sb of data) {
            sb.totalFee = Number(sb.totalFee) || 0;
            sb.icdCodes = sb.icdCodes ?? [];
            sb.billedPayerId = sb.billedPayerId ?? null;
            sb.isSelfPay = sb.isSelfPay ?? false;
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
      },

      updateClaimStatus: async (encounterId, newStatus) => {
        try {
          await apiFetch(`/api/encounters/${encounterId}/superbill`, {
            method: "PATCH",
            body: JSON.stringify({ claimStatus: newStatus }),
          });
          set(
            {
              superbills: get().superbills.map((sb) =>
                sb.encounterId === encounterId
                  ? { ...sb, claimStatus: newStatus }
                  : sb
              ),
            },
            false,
            "updateClaimStatus/success",
          );
        } catch (err) {
          set(
            { error: err instanceof Error ? err.message : "Failed to update status" },
            false,
            "updateClaimStatus/error",
          );
        }
      },
    }),
    { name: "ClarityOS/BillingDashboard" },
  ),
);
