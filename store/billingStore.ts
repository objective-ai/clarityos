/**
 * store/billingStore.ts
 *
 * Zustand store for encounter billing / superbill management.
 *
 * Manages:
 *  - Superbill CRUD (create, read, update status)
 *  - Line items (add/remove CPT codes with diagnosis pointers)
 *  - MDM calculation results
 *  - CPT-ICD pointer validation warnings
 *  - CMS-1500 export readiness
 *
 * Keyed by encounterId — each encounter has at most one superbill.
 */

import { create } from "zustand";
import { devtools } from "zustand/middleware";

import { apiFetch } from "@/lib/api-client";
import type {
  ClaimStatus,
  CptIcdWarning,
  LineItemCreateRequest,
  MdmCalculationResult,
  Superbill,
  SuperbillCreateRequest,
  SuperbillLineItem,
} from "@/types/billing";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Coerce Decimal strings from backend into numbers.
 * FastAPI returns Decimal as string; this normalizes them for frontend use.
 */
function normalizeSuperBill(superbill: Superbill): Superbill {
  return {
    ...superbill,
    totalFee: Number(superbill.totalFee) || 0,
    lineItems: (superbill.lineItems ?? []).map((li) => ({
      ...li,
      fee: Number(li.fee) || 0,
    })),
  };
}

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

type LoadStatus = "idle" | "loading" | "loaded" | "error";

interface BillingSlice {
  superbill: Superbill | null;
  loadStatus: LoadStatus;
  error: string | null;
  mdm: MdmCalculationResult | null;
  warnings: CptIcdWarning[];
  isSaving: boolean;
}

interface BillingStoreState {
  encounters: Record<string, BillingSlice>;
}

interface BillingStoreActions {
  /** Load existing superbill for an encounter */
  loadSuperbill: (encounterId: string) => Promise<void>;

  /** Create a new superbill (auto-populated with suggested CPT codes) */
  createSuperbill: (
    encounterId: string,
    payload?: SuperbillCreateRequest,
  ) => Promise<Superbill | null>;

  /** Update superbill status (draft -> ready_to_bill) */
  updateStatus: (encounterId: string, status: ClaimStatus) => Promise<void>;

  /** Add a CPT line item */
  addLineItem: (
    encounterId: string,
    item: LineItemCreateRequest,
  ) => Promise<void>;

  /** Remove a CPT line item */
  removeLineItem: (encounterId: string, itemId: string) => Promise<void>;

  /** Recalculate MDM complexity */
  calculateMdm: (encounterId: string) => Promise<MdmCalculationResult | null>;

  /** Reset billing state for an encounter */
  reset: (encounterId: string) => void;
}

type BillingStore = BillingStoreState & BillingStoreActions;

// ---------------------------------------------------------------------------
// Default slice
// ---------------------------------------------------------------------------

const defaultSlice: BillingSlice = {
  superbill: null,
  loadStatus: "idle",
  error: null,
  mdm: null,
  warnings: [],
  isSaving: false,
};

function getSlice(
  state: BillingStoreState,
  encounterId: string,
): BillingSlice {
  return state.encounters[encounterId] ?? defaultSlice;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useBillingStore = create<BillingStore>()(
  devtools(
    (set, get) => ({
      encounters: {},

      // ── Load ──────────────────────────────────────────────────────────
      loadSuperbill: async (encounterId: string) => {
        const current = getSlice(get(), encounterId);
        if (current.loadStatus === "loading") return;

        set(
          {
            encounters: {
              ...get().encounters,
              [encounterId]: { ...current, loadStatus: "loading", error: null },
            },
          },
          false,
          "loadSuperbill/start",
        );

        try {
          const rawSuperbill = await apiFetch<Superbill>(
            `/api/encounters/${encounterId}/superbill`,
          );
          const superbill = normalizeSuperBill(rawSuperbill);

          set(
            {
              encounters: {
                ...get().encounters,
                [encounterId]: {
                  superbill,
                  loadStatus: "loaded",
                  error: null,
                  mdm: superbill.mdmLevel
                    ? {
                        mdmLevel: superbill.mdmLevel,
                        suggestedEmCode: superbill.suggestedEmCode ?? "99213",
                        reasoning: superbill.mdmReasoning ?? "",
                        problemPoints: 0,
                        dataPoints: 0,
                        riskLevel: "minimal",
                      }
                    : null,
                  warnings: superbill.warnings ?? [],
                  isSaving: false,
                },
              },
            },
            false,
            "loadSuperbill/success",
          );
        } catch (err) {
          // 404 is expected when no superbill exists yet
          const isNotFound =
            err instanceof Error && err.message.includes("not found");

          set(
            {
              encounters: {
                ...get().encounters,
                [encounterId]: {
                  ...defaultSlice,
                  loadStatus: isNotFound ? "loaded" : "error",
                  error: isNotFound ? null : (err instanceof Error ? err.message : "Failed to load superbill"),
                },
              },
            },
            false,
            "loadSuperbill/done",
          );
        }
      },

      // ── Create ────────────────────────────────────────────────────────
      createSuperbill: async (encounterId, payload = {}) => {
        const current = getSlice(get(), encounterId);

        set(
          {
            encounters: {
              ...get().encounters,
              [encounterId]: { ...current, isSaving: true, error: null },
            },
          },
          false,
          "createSuperbill/start",
        );

        try {
          const rawSuperbill = await apiFetch<Superbill>(
            `/api/encounters/${encounterId}/superbill`,
            {
              method: "POST",
              body: JSON.stringify(payload),
            },
          );
          const superbill = normalizeSuperBill(rawSuperbill);

          set(
            {
              encounters: {
                ...get().encounters,
                [encounterId]: {
                  superbill,
                  loadStatus: "loaded",
                  error: null,
                  mdm: superbill.mdmLevel
                    ? {
                        mdmLevel: superbill.mdmLevel,
                        suggestedEmCode: superbill.suggestedEmCode ?? "99213",
                        reasoning: superbill.mdmReasoning ?? "",
                        problemPoints: 0,
                        dataPoints: 0,
                        riskLevel: "minimal",
                      }
                    : null,
                  warnings: superbill.warnings ?? [],
                  isSaving: false,
                },
              },
            },
            false,
            "createSuperbill/success",
          );

          return superbill;
        } catch (err) {
          set(
            {
              encounters: {
                ...get().encounters,
                [encounterId]: {
                  ...current,
                  isSaving: false,
                  error: err instanceof Error ? err.message : "Failed to create superbill",
                },
              },
            },
            false,
            "createSuperbill/error",
          );
          return null;
        }
      },

      // ── Update Status ─────────────────────────────────────────────────
      updateStatus: async (encounterId, newStatus) => {
        const current = getSlice(get(), encounterId);
        if (!current.superbill) return;

        set(
          {
            encounters: {
              ...get().encounters,
              [encounterId]: { ...current, isSaving: true },
            },
          },
          false,
          "updateStatus/start",
        );

        try {
          const updated = await apiFetch<Superbill>(
            `/api/encounters/${encounterId}/superbill`,
            {
              method: "PATCH",
              body: JSON.stringify({ claimStatus: newStatus }),
            },
          );

          set(
            {
              encounters: {
                ...get().encounters,
                [encounterId]: {
                  ...current,
                  superbill: updated,
                  warnings: updated.warnings ?? current.warnings,
                  isSaving: false,
                },
              },
            },
            false,
            "updateStatus/success",
          );
        } catch (err) {
          set(
            {
              encounters: {
                ...get().encounters,
                [encounterId]: {
                  ...current,
                  isSaving: false,
                  error: err instanceof Error ? err.message : "Failed to update status",
                },
              },
            },
            false,
            "updateStatus/error",
          );
        }
      },

      // ── Add Line Item ─────────────────────────────────────────────────
      addLineItem: async (encounterId, item) => {
        const current = getSlice(get(), encounterId);
        if (!current.superbill) return;

        try {
          const newItem = await apiFetch<SuperbillLineItem>(
            `/api/encounters/${encounterId}/superbill/line-items`,
            {
              method: "POST",
              body: JSON.stringify(item),
            },
          );

          const updatedItems = [
            ...(current.superbill.lineItems ?? []),
            newItem,
          ];
          const totalFee = updatedItems.reduce(
            (sum, li) => sum + li.fee * li.units,
            0,
          );

          set(
            {
              encounters: {
                ...get().encounters,
                [encounterId]: {
                  ...current,
                  superbill: {
                    ...current.superbill,
                    lineItems: updatedItems,
                    totalFee,
                  },
                },
              },
            },
            false,
            "addLineItem/success",
          );
        } catch (err) {
          set(
            {
              encounters: {
                ...get().encounters,
                [encounterId]: {
                  ...current,
                  error: err instanceof Error ? err.message : "Failed to add line item",
                },
              },
            },
            false,
            "addLineItem/error",
          );
        }
      },

      // ── Remove Line Item ──────────────────────────────────────────────
      removeLineItem: async (encounterId, itemId) => {
        const current = getSlice(get(), encounterId);
        if (!current.superbill) return;

        try {
          await apiFetch(
            `/api/encounters/${encounterId}/superbill/line-items/${itemId}`,
            { method: "DELETE" },
          );

          const updatedItems = current.superbill.lineItems.filter(
            (li) => li.id !== itemId,
          );
          const totalFee = updatedItems.reduce(
            (sum, li) => sum + li.fee * li.units,
            0,
          );

          set(
            {
              encounters: {
                ...get().encounters,
                [encounterId]: {
                  ...current,
                  superbill: {
                    ...current.superbill,
                    lineItems: updatedItems,
                    totalFee,
                  },
                },
              },
            },
            false,
            "removeLineItem/success",
          );
        } catch (err) {
          set(
            {
              encounters: {
                ...get().encounters,
                [encounterId]: {
                  ...current,
                  error: err instanceof Error ? err.message : "Failed to remove line item",
                },
              },
            },
            false,
            "removeLineItem/error",
          );
        }
      },

      // ── Calculate MDM ─────────────────────────────────────────────────
      calculateMdm: async (encounterId) => {
        try {
          const result = await apiFetch<MdmCalculationResult>(
            `/api/encounters/${encounterId}/superbill/mdm`,
          );

          const current = getSlice(get(), encounterId);
          set(
            {
              encounters: {
                ...get().encounters,
                [encounterId]: { ...current, mdm: result },
              },
            },
            false,
            "calculateMdm/success",
          );

          return result;
        } catch {
          return null;
        }
      },

      // ── Reset ─────────────────────────────────────────────────────────
      reset: (encounterId) => {
        const { [encounterId]: _, ...rest } = get().encounters;
        set({ encounters: rest }, false, "reset");
      },
    }),
    { name: "ClarityOS/Billing" },
  ),
);

// ---------------------------------------------------------------------------
// Selector hooks for components
// ---------------------------------------------------------------------------

export function useSuperbill(encounterId: string) {
  return useBillingStore((s) => s.encounters[encounterId]?.superbill ?? null);
}

export function useBillingWarnings(encounterId: string) {
  return useBillingStore((s) => s.encounters[encounterId]?.warnings ?? []);
}

export function useMdmResult(encounterId: string) {
  return useBillingStore((s) => s.encounters[encounterId]?.mdm ?? null);
}
