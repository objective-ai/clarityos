import { create } from "zustand";
import { persist, devtools } from "zustand/middleware";
import type { EncounterStatus } from "@/types/encounter";

export type { EncounterStatus };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EncounterState {
  status: EncounterStatus;
  isFinalized: boolean;
  encounterDate: string;
  providerName: string;
  patientId?: string;
  chiefComplaint?: string;
  signedByName?: string;
  signedAt?: string;
  aiSummaryText?: string;
  aiSummaryGeneratedAt?: string;
}

interface EncounterStoreState {
  encounters: Record<string, EncounterState>;
  finalizeModalOpen: boolean;
  initEncounter: (id: string, data: Omit<EncounterState, "isFinalized">) => void;
  advanceStatus: (id: string) => void;
  setChiefComplaint: (id: string, text: string) => void;
  finalizeEncounter: (id: string, signedByName: string, signedAt: string) => void;
  unlockEncounter: (id: string) => void;
  setFinalizeModalOpen: (open: boolean) => void;
  setAiSummary: (id: string, text: string) => void;
  getEncounter: (id: string) => EncounterState | undefined;
}

// ---------------------------------------------------------------------------
// Transition map
// ---------------------------------------------------------------------------

const NEXT_STATUS: Record<EncounterStatus, EncounterStatus | null> = {
  pre_test: "in_exam",
  in_exam: "finalized",
  finalized: null,
};

// V2: Add unlockForAddendum(id) action — creates timestamped amendment record
// rather than reopening original fields. Finalization remains one-way in MVP.

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useEncounterStore = create<EncounterStoreState>()(
  devtools(
    persist(
      (set, get) => ({
        encounters: {},
        finalizeModalOpen: false,

        initEncounter: (id, data) => {
          const existing = get().encounters[id];
          if (existing) return; // don't overwrite existing state
          set(
            (state) => ({
              encounters: {
                ...state.encounters,
                [id]: { ...data, isFinalized: data.status === "finalized" },
              },
            }),
            false,
            "initEncounter"
          );
        },

        advanceStatus: (id) => {
          const enc = get().encounters[id];
          if (!enc) return;
          const next = NEXT_STATUS[enc.status];
          if (!next || next === "finalized") return; // use finalizeEncounter for finalization
          set(
            (state) => ({
              encounters: {
                ...state.encounters,
                [id]: {
                  ...state.encounters[id],
                  status: next,
                },
              },
            }),
            false,
            "advanceStatus"
          );
        },

        setChiefComplaint: (id, text) => {
          set(
            (state) => ({
              encounters: {
                ...state.encounters,
                [id]: { ...state.encounters[id], chiefComplaint: text },
              },
            }),
            false,
            "setChiefComplaint"
          );
        },

        setFinalizeModalOpen: (open) => {
          set({ finalizeModalOpen: open }, false, "setFinalizeModalOpen");
        },

        finalizeEncounter: (id, signedByName, signedAt) => {
          const enc = get().encounters[id];
          if (!enc || enc.isFinalized) return;
          set(
            (state) => ({
              encounters: {
                ...state.encounters,
                [id]: {
                  ...state.encounters[id],
                  status: "finalized" as EncounterStatus,
                  isFinalized: true,
                  signedByName,
                  signedAt,
                },
              },
            }),
            false,
            "finalizeEncounter"
          );
        },

        // Dev-only: reset a finalized encounter back to in_exam for testing
        unlockEncounter: (id) => {
          set(
            (state) => ({
              encounters: {
                ...state.encounters,
                [id]: {
                  ...state.encounters[id],
                  status: "in_exam" as EncounterStatus,
                  isFinalized: false,
                  signedByName: undefined,
                  signedAt: undefined,
                },
              },
            }),
            false,
            "unlockEncounter"
          );
        },

        setAiSummary: (id, text) => {
          set(
            (state) => ({
              encounters: {
                ...state.encounters,
                [id]: {
                  ...state.encounters[id],
                  aiSummaryText: text,
                  aiSummaryGeneratedAt: new Date().toISOString(),
                },
              },
            }),
            false,
            "setAiSummary"
          );
        },

        getEncounter: (id) => get().encounters[id],
      }),
      {
        name: "clarity-encounters",
        partialize: (state) => ({ encounters: state.encounters }),
      }
    ),
    { name: "ClarityOS/Encounters" }
  )
);
