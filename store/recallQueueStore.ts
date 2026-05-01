/**
 * Recall queue page state: candidate selections, last fetch result.
 */
import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { RecallCandidate } from "@/types/messaging";

interface RecallQueueState {
  candidates: RecallCandidate[];
  selectedIds: Set<string>;
  isLoading: boolean;
  isSending: boolean;
  lastError: string | null;

  setCandidates: (candidates: RecallCandidate[]) => void;
  toggleSelect: (patientId: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  setLoading: (value: boolean) => void;
  setSending: (value: boolean) => void;
  setError: (error: string | null) => void;
}

export const useRecallQueueStore = create<RecallQueueState>()(
  devtools(
    (set) => ({
      candidates: [],
      selectedIds: new Set(),
      isLoading: false,
      isSending: false,
      lastError: null,

      setCandidates: (candidates) => set({ candidates }),
      toggleSelect: (patientId) =>
        set((s) => {
          const next = new Set(s.selectedIds);
          if (next.has(patientId)) next.delete(patientId);
          else next.add(patientId);
          return { selectedIds: next };
        }),
      selectAll: () =>
        set((s) => ({
          selectedIds: new Set(s.candidates.map((c) => c.patientId)),
        })),
      clearSelection: () => set({ selectedIds: new Set() }),
      setLoading: (value) => set({ isLoading: value }),
      setSending: (value) => set({ isSending: value }),
      setError: (error) => set({ lastError: error }),
    }),
    { name: "recallQueueStore", enabled: process.env.NODE_ENV !== "production" }
  )
);
