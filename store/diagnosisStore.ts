/**
 * store/diagnosisStore.ts
 *
 * Zustand store for encounter-level diagnoses.
 * Explicit save — each add/update/delete hits the API immediately.
 * Keyed by encounterId.
 */

import { create } from "zustand";
import { devtools, subscribeWithSelector } from "zustand/middleware";

const isDev = process.env.NODE_ENV === "development";
import { apiFetch } from "@/lib/api-client";
import type {
  Diagnosis,
  DiagnosisCreateRequest,
  DiagnosisUpdateRequest,
} from "@/types/diagnosis";

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

type SaveStatus = "idle" | "loading" | "saving" | "error";

interface DiagnosisSlice {
  diagnoses: Diagnosis[];
  saveStatus: SaveStatus;
  error: string | null;
}

interface DiagnosisStoreState {
  encounters: Record<string, DiagnosisSlice>;
}

interface DiagnosisStoreActions {
  /** Load diagnoses from the API for an encounter */
  loadDiagnoses: (encounterId: string) => Promise<void>;

  /** Initialize diagnoses for an encounter (idempotent) */
  init: (encounterId: string, initial?: Diagnosis[]) => void;

  /** Add a diagnosis via POST */
  addDiagnosis: (encounterId: string, payload: DiagnosisCreateRequest) => Promise<void>;

  /** Update a diagnosis via PATCH */
  updateDiagnosis: (
    encounterId: string,
    diagnosisId: string,
    payload: DiagnosisUpdateRequest,
  ) => Promise<void>;

  /** Remove a diagnosis via DELETE */
  removeDiagnosis: (encounterId: string, diagnosisId: string) => Promise<void>;

  /** Optimistic add for mock/offline */
  _addLocal: (encounterId: string, dx: Diagnosis) => void;

  /** Remove local entry */
  _removeLocal: (encounterId: string, diagnosisId: string) => void;
}

type DiagnosisStore = DiagnosisStoreState & DiagnosisStoreActions;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptySlice(): DiagnosisSlice {
  return { diagnoses: [], saveStatus: "idle", error: null };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const diagnosisStoreImpl = subscribeWithSelector(devtools<DiagnosisStore>((set, get) => ({
      encounters: {},

      async loadDiagnoses(encounterId) {
        set(
          (state) => ({
            encounters: {
              ...state.encounters,
              [encounterId]: {
                ...(state.encounters[encounterId] ?? emptySlice()),
                saveStatus: "loading" as SaveStatus,
                error: null,
              },
            },
          }),
          false,
          "loadDiagnoses/loading"
        );

        try {
          const diagnoses = await apiFetch<Diagnosis[]>(`/api/encounters/${encounterId}/diagnoses`);
          set(
            (state) => ({
              encounters: {
                ...state.encounters,
                [encounterId]: {
                  diagnoses,
                  saveStatus: "idle" as SaveStatus,
                  error: null,
                },
              },
            }),
            false,
            "loadDiagnoses/loaded"
          );
        } catch (err) {
          set(
            (state) => ({
              encounters: {
                ...state.encounters,
                [encounterId]: {
                  ...(state.encounters[encounterId] ?? emptySlice()),
                  saveStatus: "error" as SaveStatus,
                  error: err instanceof Error ? err.message : "Could not load diagnoses",
                },
              },
            }),
            false,
            "loadDiagnoses/error"
          );
        }
      },

      init(encounterId, initial) {
        const existing = get().encounters[encounterId];
        if (existing) return; // idempotent

        set(
          (state) => ({
            encounters: {
              ...state.encounters,
              [encounterId]: {
                diagnoses: initial ?? [],
                saveStatus: "idle",
                error: null,
              },
            },
          }),
          false,
          "init",
        );
      },

      async addDiagnosis(encounterId, payload) {
        set(
          (state) => ({
            encounters: {
              ...state.encounters,
              [encounterId]: {
                ...(state.encounters[encounterId] ?? emptySlice()),
                saveStatus: "saving",
                error: null,
              },
            },
          }),
          false,
          "addDiagnosis/saving",
        );

        try {
          const saved = await apiFetch<Diagnosis>(
            `/api/encounters/${encounterId}/diagnoses`,
            { method: "POST", body: JSON.stringify(payload) },
          );

          set(
            (state) => {
              const slice = state.encounters[encounterId] ?? emptySlice();
              return {
                encounters: {
                  ...state.encounters,
                  [encounterId]: {
                    diagnoses: [...slice.diagnoses, saved],
                    saveStatus: "idle",
                    error: null,
                  },
                },
              };
            },
            false,
            "addDiagnosis/saved",
          );
        } catch (err) {
          // Surface error — no mock fallback
          set(
            (state) => ({
              encounters: {
                ...state.encounters,
                [encounterId]: {
                  ...(state.encounters[encounterId] ?? emptySlice()),
                  saveStatus: "error" as SaveStatus,
                  error: err instanceof Error ? err.message : "Failed to save diagnosis",
                },
              },
            }),
            false,
            "addDiagnosis/error",
          );
        }
      },

      async updateDiagnosis(encounterId, diagnosisId, payload) {
        set(
          (state) => ({
            encounters: {
              ...state.encounters,
              [encounterId]: {
                ...(state.encounters[encounterId] ?? emptySlice()),
                saveStatus: "saving",
                error: null,
              },
            },
          }),
          false,
          "updateDiagnosis/saving",
        );

        try {
          const saved = await apiFetch<Diagnosis>(
            `/api/encounters/${encounterId}/diagnoses/${diagnosisId}`,
            { method: "PATCH", body: JSON.stringify(payload) },
          );

          set(
            (state) => {
              const slice = state.encounters[encounterId] ?? emptySlice();
              return {
                encounters: {
                  ...state.encounters,
                  [encounterId]: {
                    diagnoses: slice.diagnoses.map((dx) =>
                      dx.id === diagnosisId ? saved : dx,
                    ),
                    saveStatus: "idle",
                    error: null,
                  },
                },
              };
            },
            false,
            "updateDiagnosis/saved",
          );
        } catch (err) {
          // Surface error — no mock fallback
          set(
            (state) => ({
              encounters: {
                ...state.encounters,
                [encounterId]: {
                  ...(state.encounters[encounterId] ?? emptySlice()),
                  saveStatus: "error" as SaveStatus,
                  error: err instanceof Error ? err.message : "Failed to update diagnosis",
                },
              },
            }),
            false,
            "updateDiagnosis/error",
          );
        }
      },

      async removeDiagnosis(encounterId, diagnosisId) {
        set(
          (state) => ({
            encounters: {
              ...state.encounters,
              [encounterId]: {
                ...(state.encounters[encounterId] ?? emptySlice()),
                saveStatus: "saving",
                error: null,
              },
            },
          }),
          false,
          "removeDiagnosis/saving",
        );

        try {
          // Real API call — no silent swallow on failure
          await apiFetch(
            `/api/encounters/${encounterId}/diagnoses/${diagnosisId}`,
            { method: "DELETE" },
          );

          set(
            (state) => {
              const slice = state.encounters[encounterId] ?? emptySlice();
              return {
                encounters: {
                  ...state.encounters,
                  [encounterId]: {
                    diagnoses: slice.diagnoses.filter((dx) => dx.id !== diagnosisId),
                    saveStatus: "idle",
                    error: null,
                  },
                },
              };
            },
            false,
            "removeDiagnosis/done",
          );
        } catch (err) {
          set(
            (state) => ({
              encounters: {
                ...state.encounters,
                [encounterId]: {
                  ...(state.encounters[encounterId] ?? emptySlice()),
                  saveStatus: "error" as SaveStatus,
                  error: err instanceof Error ? err.message : "Failed to remove diagnosis",
                },
              },
            }),
            false,
            "removeDiagnosis/error",
          );
        }
      },

      _addLocal(encounterId, dx) {
        set(
          (state) => {
            const slice = state.encounters[encounterId] ?? emptySlice();
            return {
              encounters: {
                ...state.encounters,
                [encounterId]: {
                  ...slice,
                  diagnoses: [...slice.diagnoses, dx],
                },
              },
            };
          },
          false,
          "_addLocal",
        );
      },

      _removeLocal(encounterId, diagnosisId) {
        set(
          (state) => {
            const slice = state.encounters[encounterId] ?? emptySlice();
            return {
              encounters: {
                ...state.encounters,
                [encounterId]: {
                  ...slice,
                  diagnoses: slice.diagnoses.filter((dx) => dx.id !== diagnosisId),
                },
              },
            };
          },
          false,
          "_removeLocal",
        );
      },
    }), { name: "ClarityOS/Diagnoses", enabled: isDev }));

export const useDiagnosisStore = create<DiagnosisStore>()(
  diagnosisStoreImpl
);

// ---------------------------------------------------------------------------
// Selector hooks
// ---------------------------------------------------------------------------

export const useDiagnoses = (encounterId: string) =>
  useDiagnosisStore((s) => s.encounters[encounterId]?.diagnoses ?? []);

export const useDiagnosisSaveStatus = (encounterId: string) =>
  useDiagnosisStore((s) => s.encounters[encounterId]?.saveStatus ?? "idle");
