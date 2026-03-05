import { create } from "zustand";
import { persist, devtools } from "zustand/middleware";

const isDev = process.env.NODE_ENV === "development";
import type { EncounterStatus } from "@/types/encounter";
import { apiFetch } from "@/lib/api-client";

export type { EncounterStatus };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EncounterLoadStatus = "idle" | "loading" | "loaded" | "error";

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
  /** Load status for this encounter from the API */
  loadStatus?: EncounterLoadStatus;
  loadError?: string;
}

// Shape of the API response from GET /api/encounters/:id
interface EncounterApiResponse {
  id: string;
  patientId: string;
  providerId: string;
  providerName?: string;
  status: EncounterStatus;
  chiefComplaint?: string;
  encounterDate: string;
  signedByName?: string;
  signedAt?: string;
  aiSummaryText?: string;
  aiSummaryGeneratedAt?: string;
}

interface EncounterStoreState {
  encounters: Record<string, EncounterState>;
  finalizeModalOpen: boolean;
  /** Load an encounter from the real API — force-overwrites persisted state */
  loadEncounter: (id: string) => Promise<void>;
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

        async loadEncounter(id) {
          // Set loading state — force-overwrite any persisted data
          set(
            (state) => ({
              encounters: {
                ...state.encounters,
                [id]: {
                  ...(state.encounters[id] ?? {
                    status: "pre_test" as EncounterStatus,
                    isFinalized: false,
                    encounterDate: "",
                    providerName: "",
                  }),
                  loadStatus: "loading",
                  loadError: undefined,
                },
              },
            }),
            false,
            "loadEncounter/loading"
          );

          try {
            const data = await apiFetch<EncounterApiResponse>(`/api/encounters/${id}`);

            // Force-overwrite: use set() directly, NOT initEncounter()
            // initEncounter() has an idempotency guard that would skip stale persisted data
            set(
              (state) => ({
                encounters: {
                  ...state.encounters,
                  [id]: {
                    status: data.status,
                    isFinalized: data.status === "finalized",
                    encounterDate: data.encounterDate,
                    providerName: data.providerName ?? "",
                    patientId: data.patientId,
                    chiefComplaint: data.chiefComplaint,
                    signedByName: data.signedByName,
                    signedAt: data.signedAt,
                    aiSummaryText: data.aiSummaryText,
                    aiSummaryGeneratedAt: data.aiSummaryGeneratedAt,
                    loadStatus: "loaded",
                    loadError: undefined,
                  },
                },
              }),
              false,
              "loadEncounter/loaded"
            );
          } catch (err) {
            set(
              (state) => ({
                encounters: {
                  ...state.encounters,
                  [id]: {
                    ...(state.encounters[id] ?? {
                      status: "pre_test" as EncounterStatus,
                      isFinalized: false,
                      encounterDate: "",
                      providerName: "",
                    }),
                    loadStatus: "error",
                    loadError: err instanceof Error ? err.message : "Failed to load encounter",
                  },
                },
              }),
              false,
              "loadEncounter/error"
            );
          }
        },

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
    { name: "ClarityOS/Encounters", enabled: isDev }
  )
);
