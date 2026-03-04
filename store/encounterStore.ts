import { create } from "zustand";
import { persist, devtools } from "zustand/middleware";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EncounterStatus = "pre_test" | "in_exam" | "finalized";

export interface EncounterState {
  status: EncounterStatus;
  isFinalized: boolean;
  encounterDate: string;
  providerName: string;
  iopOdElevated?: boolean;
  iopOsElevated?: boolean;
}

interface EncounterStoreState {
  encounters: Record<string, EncounterState>;
  initEncounter: (id: string, data: Omit<EncounterState, "isFinalized">) => void;
  advanceStatus: (id: string) => void;
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
          if (!next) return; // already finalized
          set(
            (state) => ({
              encounters: {
                ...state.encounters,
                [id]: {
                  ...state.encounters[id],
                  status: next,
                  isFinalized: next === "finalized",
                },
              },
            }),
            false,
            "advanceStatus"
          );
        },

        getEncounter: (id) => get().encounters[id],
      }),
      { name: "clarity-encounters" }
    ),
    { name: "OptometryERP/Encounters" }
  )
);
