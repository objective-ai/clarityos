/**
 * store/problemListStore.ts
 *
 * Zustand store for the master patient problem list.
 * Explicit save — each action hits the API immediately.
 * Keyed by patientId.
 */

import { create } from "zustand";
import { devtools, subscribeWithSelector } from "zustand/middleware";

const isDev = process.env.NODE_ENV === "development";
import { apiFetch } from "@/lib/api-client";
import type {
  PatientProblem,
  ProblemCreateRequest,
  ProblemUpdateRequest,
} from "@/types/patient-problem";
import type { Diagnosis } from "@/types/diagnosis";

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

type LoadStatus = "idle" | "loading" | "loaded" | "error";
type SaveStatus = "idle" | "saving" | "error";

interface ProblemSlice {
  problems: PatientProblem[];
  loadStatus: LoadStatus;
  saveStatus: SaveStatus;
  error: string | null;
}

interface ProblemListStoreState {
  patients: Record<string, ProblemSlice>;
}

interface ProblemListStoreActions {
  /** Fetch problems for a patient */
  fetchProblems: (patientId: string) => Promise<void>;

  /** Add a new problem */
  addProblem: (patientId: string, payload: ProblemCreateRequest) => Promise<void>;

  /** Update a problem */
  updateProblem: (
    patientId: string,
    problemId: string,
    payload: ProblemUpdateRequest,
  ) => Promise<void>;

  /** Resolve a problem (convenience) */
  resolveProblem: (patientId: string, problemId: string) => Promise<void>;

  /** Soft-delete a problem */
  deleteProblem: (patientId: string, problemId: string) => Promise<void>;

  /** Promote a problem to an encounter diagnosis */
  promoteToDiagnosis: (
    encounterId: string,
    problemId: string,
  ) => Promise<Diagnosis | null>;
}

type ProblemListStore = ProblemListStoreState & ProblemListStoreActions;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptySlice(): ProblemSlice {
  return { problems: [], loadStatus: "idle", saveStatus: "idle", error: null };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const problemListStoreImpl = subscribeWithSelector(devtools<ProblemListStore>((set, get) => ({
      patients: {},

      async fetchProblems(patientId) {
        set(
          (state) => ({
            patients: {
              ...state.patients,
              [patientId]: {
                ...(state.patients[patientId] ?? emptySlice()),
                loadStatus: "loading",
                error: null,
              },
            },
          }),
          false,
          "fetchProblems/loading",
        );

        try {
          const problems = await apiFetch<PatientProblem[]>(
            `/api/patients/${patientId}/problems`,
          );

          set(
            (state) => ({
              patients: {
                ...state.patients,
                [patientId]: {
                  problems,
                  loadStatus: "loaded",
                  saveStatus: "idle",
                  error: null,
                },
              },
            }),
            false,
            "fetchProblems/loaded",
          );
        } catch (err) {

          set(
            (state) => ({
              patients: {
                ...state.patients,
                [patientId]: {
                  ...(state.patients[patientId] ?? emptySlice()),
                  loadStatus: "error",
                  error: err instanceof Error ? err.message : "Failed to load",
                },
              },
            }),
            false,
            "fetchProblems/error",
          );
        }
      },

      async addProblem(patientId, payload) {
        set(
          (state) => ({
            patients: {
              ...state.patients,
              [patientId]: {
                ...(state.patients[patientId] ?? emptySlice()),
                saveStatus: "saving",
                error: null,
              },
            },
          }),
          false,
          "addProblem/saving",
        );

        try {
          const saved = await apiFetch<PatientProblem>(
            `/api/patients/${patientId}/problems`,
            { method: "POST", body: JSON.stringify(payload) },
          );

          set(
            (state) => {
              const slice = state.patients[patientId] ?? emptySlice();
              return {
                patients: {
                  ...state.patients,
                  [patientId]: {
                    ...slice,
                    problems: [saved, ...slice.problems],
                    saveStatus: "idle",
                    error: null,
                  },
                },
              };
            },
            false,
            "addProblem/saved",
          );
        } catch (err) {
          // Surface error — no mock fallback
          set(
            (state) => ({
              patients: {
                ...state.patients,
                [patientId]: {
                  ...(state.patients[patientId] ?? emptySlice()),
                  saveStatus: "error",
                  error: err instanceof Error ? err.message : "Failed to save problem",
                },
              },
            }),
            false,
            "addProblem/error",
          );
        }
      },

      async updateProblem(patientId, problemId, payload) {
        set(
          (state) => ({
            patients: {
              ...state.patients,
              [patientId]: {
                ...(state.patients[patientId] ?? emptySlice()),
                saveStatus: "saving",
                error: null,
              },
            },
          }),
          false,
          "updateProblem/saving",
        );

        try {
          const saved = await apiFetch<PatientProblem>(
            `/api/patients/${patientId}/problems/${problemId}`,
            { method: "PATCH", body: JSON.stringify(payload) },
          );

          set(
            (state) => {
              const slice = state.patients[patientId] ?? emptySlice();
              return {
                patients: {
                  ...state.patients,
                  [patientId]: {
                    ...slice,
                    problems: slice.problems.map((p) =>
                      p.id === problemId ? saved : p,
                    ),
                    saveStatus: "idle",
                    error: null,
                  },
                },
              };
            },
            false,
            "updateProblem/saved",
          );
        } catch (err) {
          // Surface error — no mock fallback
          set(
            (state) => ({
              patients: {
                ...state.patients,
                [patientId]: {
                  ...(state.patients[patientId] ?? emptySlice()),
                  saveStatus: "error",
                  error: err instanceof Error ? err.message : "Failed to update problem",
                },
              },
            }),
            false,
            "updateProblem/error",
          );
        }
      },

      async resolveProblem(patientId, problemId) {
        await get().updateProblem(patientId, problemId, {
          status: "resolved",
          resolvedDate: new Date().toISOString().split("T")[0],
        });
      },

      async deleteProblem(patientId, problemId) {
        try {
          // Real API call — no silent removal on failure
          await apiFetch(
            `/api/patients/${patientId}/problems/${problemId}`,
            { method: "DELETE" },
          );

          set(
            (state) => {
              const slice = state.patients[patientId] ?? emptySlice();
              return {
                patients: {
                  ...state.patients,
                  [patientId]: {
                    ...slice,
                    problems: slice.problems.filter((p) => p.id !== problemId),
                  },
                },
              };
            },
            false,
            "deleteProblem/done",
          );
        } catch (err) {
          set(
            (state) => ({
              patients: {
                ...state.patients,
                [patientId]: {
                  ...(state.patients[patientId] ?? emptySlice()),
                  saveStatus: "error",
                  error: err instanceof Error ? err.message : "Failed to delete problem",
                },
              },
            }),
            false,
            "deleteProblem/error",
          );
        }
      },

      async promoteToDiagnosis(encounterId, problemId) {
        try {
          const dx = await apiFetch<Diagnosis>(
            `/api/encounters/${encounterId}/diagnoses/from-problem/${problemId}`,
            { method: "POST" },
          );
          return dx;
        } catch {
          return null;
        }
      },

    }), { name: "ClarityOS/ProblemList", enabled: isDev }));

export const useProblemListStore = create<ProblemListStore>()(
  problemListStoreImpl
);

// ---------------------------------------------------------------------------
// Selector hooks
// ---------------------------------------------------------------------------

export const usePatientProblems = (patientId: string) =>
  useProblemListStore((s) => s.patients[patientId]?.problems ?? []);

export const useActiveProblems = (patientId: string) =>
  useProblemListStore((s) =>
    (s.patients[patientId]?.problems ?? []).filter((p) => p.status === "active"),
  );

export const useProblemLoadStatus = (patientId: string) =>
  useProblemListStore((s) => s.patients[patientId]?.loadStatus ?? "idle");
