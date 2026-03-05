/**
 * store/problemListStore.ts
 *
 * Zustand store for the master patient problem list.
 * Explicit save — each action hits the API immediately.
 * Keyed by patientId.
 */

import { create } from "zustand";
import { devtools, subscribeWithSelector } from "zustand/middleware";
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

  /**
   * Seed mock problems for development/demo purposes.
   * Idempotent — skips if patient data is already loaded or loading.
   */
  _seedProblems: (patientId: string, problems: PatientProblem[]) => void;
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

export const useProblemListStore = create<ProblemListStore>()(
  devtools(
    subscribeWithSelector((set, get) => ({
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

          // Don't overwrite if already seeded while we were fetching
          if (get().patients[patientId]?.loadStatus === "loaded") return;

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
          // Don't overwrite if already seeded while we were fetching
          if (get().patients[patientId]?.loadStatus === "loaded") return;

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
          // Mock fallback
          const mock: PatientProblem = {
            id: crypto.randomUUID(),
            patient_id: patientId,
            icd10_code: payload.icd10_code,
            description: payload.description,
            eye_affected: payload.eye_affected ?? null,
            severity: payload.severity ?? null,
            status: payload.status ?? "active",
            onset_date: payload.onset_date ?? null,
            resolved_date: null,
            source_encounter_id: payload.source_encounter_id ?? null,
            notes: payload.notes ?? null,
            is_deleted: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          set(
            (state) => {
              const slice = state.patients[patientId] ?? emptySlice();
              return {
                patients: {
                  ...state.patients,
                  [patientId]: {
                    ...slice,
                    problems: [mock, ...slice.problems],
                    saveStatus: "idle",
                    error: err instanceof Error ? err.message : "Failed to save",
                  },
                },
              };
            },
            false,
            "addProblem/mock-fallback",
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
          // Optimistic local update
          set(
            (state) => {
              const slice = state.patients[patientId] ?? emptySlice();
              return {
                patients: {
                  ...state.patients,
                  [patientId]: {
                    ...slice,
                    problems: slice.problems.map((p) => {
                      if (p.id !== problemId) return p;
                      const updated = { ...p, updated_at: new Date().toISOString() };
                      if (payload.eye_affected !== undefined) updated.eye_affected = payload.eye_affected ?? null;
                      if (payload.severity !== undefined) updated.severity = payload.severity ?? null;
                      if (payload.status != null) updated.status = payload.status;
                      if (payload.onset_date !== undefined) updated.onset_date = payload.onset_date ?? null;
                      if (payload.resolved_date !== undefined) updated.resolved_date = payload.resolved_date ?? null;
                      if (payload.notes !== undefined) updated.notes = payload.notes ?? null;
                      return updated;
                    }),
                    saveStatus: "idle",
                    error: err instanceof Error ? err.message : "Failed to update",
                  },
                },
              };
            },
            false,
            "updateProblem/mock-fallback",
          );
        }
      },

      async resolveProblem(patientId, problemId) {
        await get().updateProblem(patientId, problemId, {
          status: "resolved",
          resolved_date: new Date().toISOString().split("T")[0],
        });
      },

      async deleteProblem(patientId, problemId) {
        try {
          await apiFetch(
            `/api/patients/${patientId}/problems/${problemId}`,
            { method: "DELETE" },
          );
        } catch {
          // Proceed with local removal
        }

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

      _seedProblems(patientId, problems) {
        const existing = get().patients[patientId];
        if (existing?.loadStatus === "loaded") return;
        set(
          (state) => ({
            patients: {
              ...state.patients,
              [patientId]: { problems, loadStatus: "loaded", saveStatus: "idle", error: null },
            },
          }),
          false,
          "_seedProblems",
        );
      },
    })),
    { name: "ClarityOS/ProblemList" },
  ),
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
