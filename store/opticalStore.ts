/**
 * store/opticalStore.ts
 *
 * Zustand store for the Optical Handoff queue.
 *
 * Manages the optical queue state — list of patients ready for dispensing,
 * their workflow status, and Rx change alerts.  Data is fetched from the
 * backend via the BFF proxy routes.
 */

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { apiFetch } from "@/lib/api-client";
import type {
  OpticalQueueItem,
  OpticalQueueResponse,
  OpticalStatus,
  OpticalStatusUpdateResponse,
  RxPdfData,
} from "@/types/optical";

const isDev = process.env.NODE_ENV === "development";

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

interface OpticalState {
  /** Queue items for the current date */
  items: OpticalQueueItem[];
  /** Total count of items */
  total: number;
  /** Currently selected date for the queue */
  queueDate: string; // ISO date string YYYY-MM-DD
  /** Loading state */
  isLoading: boolean;
  /** Error message */
  error: string | null;
  /** Rx PDF data for print preview */
  rxPdfData: RxPdfData | null;
  /** Whether the Rx print view is open */
  isPrintPreviewOpen: boolean;

  // Actions
  fetchQueue: (date?: string) => Promise<void>;
  setQueueDate: (date: string) => void;
  updateItemStatus: (encounterId: string, status: OpticalStatus) => Promise<void>;
  fetchRxPdfData: (encounterId: string) => Promise<void>;
  openPrintPreview: (encounterId: string) => Promise<void>;
  closePrintPreview: () => void;
  clearError: () => void;
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

export const useOpticalStore = create<OpticalState>()(
  devtools(
    (set, get) => ({
      items: [],
      total: 0,
      queueDate: new Date().toISOString().split("T")[0],
      isLoading: false,
      error: null,
      rxPdfData: null,
      isPrintPreviewOpen: false,

      fetchQueue: async (date?: string) => {
        const targetDate = date ?? get().queueDate;
        set({ isLoading: true, error: null }, false, "fetchQueue/start");

        try {
          const response = await apiFetch<OpticalQueueResponse>(
            `/api/optical/queue?queue_date=${targetDate}`
          );
          set(
            {
              items: response.items,
              total: response.total,
              queueDate: targetDate,
              isLoading: false,
            },
            false,
            "fetchQueue/success"
          );
        } catch (err) {
          set(
            {
              isLoading: false,
              error: err instanceof Error ? err.message : "Failed to load optical queue",
            },
            false,
            "fetchQueue/error"
          );
        }
      },

      setQueueDate: (date: string) => {
        set({ queueDate: date }, false, "setQueueDate");
        get().fetchQueue(date);
      },

      updateItemStatus: async (encounterId: string, status: OpticalStatus) => {
        try {
          await apiFetch<OpticalStatusUpdateResponse>(
            `/api/optical/${encounterId}/status`,
            {
              method: "PATCH",
              body: JSON.stringify({ status }),
            }
          );
          // Update local state optimistically
          set(
            (state) => ({
              items: state.items.map((item) =>
                item.encounterId === encounterId
                  ? { ...item, status }
                  : item
              ),
            }),
            false,
            "updateItemStatus"
          );
        } catch (err) {
          set(
            {
              error:
                err instanceof Error
                  ? err.message
                  : "Failed to update status",
            },
            false,
            "updateItemStatus/error"
          );
        }
      },

      fetchRxPdfData: async (encounterId: string) => {
        try {
          const data = await apiFetch<RxPdfData>(
            `/api/optical/${encounterId}/rx`
          );
          set({ rxPdfData: data }, false, "fetchRxPdfData");
        } catch (err) {
          set(
            {
              error:
                err instanceof Error
                  ? err.message
                  : "Failed to load Rx data",
            },
            false,
            "fetchRxPdfData/error"
          );
        }
      },

      openPrintPreview: async (encounterId: string) => {
        await get().fetchRxPdfData(encounterId);
        // Only open if data was fetched successfully
        if (get().rxPdfData) {
          set({ isPrintPreviewOpen: true }, false, "openPrintPreview");
        }
      },

      closePrintPreview: () => {
        set(
          { isPrintPreviewOpen: false, rxPdfData: null },
          false,
          "closePrintPreview"
        );
      },

      clearError: () => {
        set({ error: null }, false, "clearError");
      },
    }),
    { name: "ClarityOS/Optical", enabled: isDev }
  )
);
