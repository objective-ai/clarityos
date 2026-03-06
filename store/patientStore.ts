/**
 * store/patientStore.ts
 *
 * Zustand store for patient CRUD operations.
 *
 * Uses apiFetch for authenticated requests to FastAPI via BFF proxy routes.
 * Handles patient list, detail, encounters, flowsheet, and Prep Me state.
 */

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { apiFetch } from "@/lib/api-client";
import type {
  FlowsheetRow,
  PatientCreatePayload,
  PatientDetail,
  PatientEncounterSummary,
  PatientListResponse,
  PatientSummary,
  PatientUpdatePayload,
  PrepMeResponse,
} from "@/types/patient";

const isDev = process.env.NODE_ENV === "development";

// ---------------------------------------------------------------------------
// State + Actions
// ---------------------------------------------------------------------------

interface PatientStoreState {
  // List
  patients: PatientSummary[];
  totalPatients: number;
  listLoading: boolean;
  listError: string | null;
  searchQuery: string;

  // Detail
  activePatient: PatientDetail | null;
  detailLoading: boolean;
  detailError: string | null;

  // Encounters
  encounters: PatientEncounterSummary[];
  encountersLoading: boolean;

  // Flowsheet
  flowsheet: FlowsheetRow[];
  flowsheetLoading: boolean;

  // Prep Me
  prepMeSummary: string | null;
  prepMeLoading: boolean;
}

interface PatientStoreActions {
  // List
  fetchPatients: (search?: string, limit?: number, offset?: number) => Promise<void>;
  setSearchQuery: (query: string) => void;

  // CRUD
  createPatient: (payload: PatientCreatePayload) => Promise<PatientDetail>;
  fetchPatient: (patientId: string) => Promise<void>;
  updatePatient: (patientId: string, payload: PatientUpdatePayload) => Promise<void>;
  deletePatient: (patientId: string) => Promise<void>;

  // Encounters
  fetchEncounters: (patientId: string) => Promise<void>;

  // Flowsheet
  fetchFlowsheet: (patientId: string) => Promise<void>;

  // Prep Me
  fetchPrepMe: (patientId: string) => Promise<void>;
  clearPrepMe: () => void;

  // Reset
  clearActivePatient: () => void;
}

type PatientStore = PatientStoreState & PatientStoreActions;

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const usePatientStore = create<PatientStore>()(
  devtools(
    (set, get) => ({
      // -- Initial state --
      patients: [],
      totalPatients: 0,
      listLoading: false,
      listError: null,
      searchQuery: "",

      activePatient: null,
      detailLoading: false,
      detailError: null,

      encounters: [],
      encountersLoading: false,

      flowsheet: [],
      flowsheetLoading: false,

      prepMeSummary: null,
      prepMeLoading: false,

      // -- List --
      fetchPatients: async (search, limit = 20, offset = 0) => {
        set({ listLoading: true, listError: null }, false, "fetchPatients/start");
        try {
          const params = new URLSearchParams();
          if (search) params.set("search", search);
          params.set("limit", String(limit));
          params.set("offset", String(offset));

          const data = await apiFetch<PatientListResponse>(
            `/api/patients?${params.toString()}`
          );
          set(
            {
              patients: data.items,
              totalPatients: data.total,
              listLoading: false,
            },
            false,
            "fetchPatients/success"
          );
        } catch (err) {
          set(
            {
              listLoading: false,
              listError: err instanceof Error ? err.message : "Failed to load patients",
            },
            false,
            "fetchPatients/error"
          );
        }
      },

      setSearchQuery: (query) => {
        set({ searchQuery: query }, false, "setSearchQuery");
      },

      // -- Create --
      createPatient: async (payload) => {
        const data = await apiFetch<PatientDetail>("/api/patients", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        // Refresh list
        const { searchQuery } = get();
        await get().fetchPatients(searchQuery);
        return data;
      },

      // -- Detail --
      fetchPatient: async (patientId) => {
        set({ detailLoading: true, detailError: null }, false, "fetchPatient/start");
        try {
          const data = await apiFetch<PatientDetail>(`/api/patients/${patientId}`);
          set({ activePatient: data, detailLoading: false }, false, "fetchPatient/success");
        } catch (err) {
          set(
            {
              detailLoading: false,
              detailError: err instanceof Error ? err.message : "Failed to load patient",
            },
            false,
            "fetchPatient/error"
          );
        }
      },

      // -- Update --
      updatePatient: async (patientId, payload) => {
        const data = await apiFetch<PatientDetail>(`/api/patients/${patientId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        set({ activePatient: data }, false, "updatePatient/success");
      },

      // -- Delete --
      deletePatient: async (patientId) => {
        await apiFetch(`/api/patients/${patientId}`, { method: "DELETE" });
        set({ activePatient: null }, false, "deletePatient/success");
        const { searchQuery } = get();
        await get().fetchPatients(searchQuery);
      },

      // -- Encounters --
      fetchEncounters: async (patientId) => {
        set({ encountersLoading: true }, false, "fetchEncounters/start");
        try {
          const data = await apiFetch<PatientEncounterSummary[]>(
            `/api/patients/${patientId}/encounters`
          );
          set({ encounters: data, encountersLoading: false }, false, "fetchEncounters/success");
        } catch {
          set({ encountersLoading: false }, false, "fetchEncounters/error");
        }
      },

      // -- Flowsheet --
      fetchFlowsheet: async (patientId) => {
        set({ flowsheetLoading: true }, false, "fetchFlowsheet/start");
        try {
          const data = await apiFetch<FlowsheetRow[]>(
            `/api/patients/${patientId}/flowsheet`
          );
          set({ flowsheet: data, flowsheetLoading: false }, false, "fetchFlowsheet/success");
        } catch {
          set({ flowsheetLoading: false }, false, "fetchFlowsheet/error");
        }
      },

      // -- Prep Me --
      fetchPrepMe: async (patientId) => {
        set({ prepMeLoading: true, prepMeSummary: null }, false, "fetchPrepMe/start");
        try {
          const data = await apiFetch<PrepMeResponse>(
            `/api/patients/${patientId}/prep-me`,
            { method: "POST" }
          );
          set({ prepMeSummary: data.summary, prepMeLoading: false }, false, "fetchPrepMe/success");
        } catch {
          set({ prepMeLoading: false }, false, "fetchPrepMe/error");
        }
      },

      clearPrepMe: () => {
        set({ prepMeSummary: null }, false, "clearPrepMe");
      },

      // -- Reset --
      clearActivePatient: () => {
        set(
          {
            activePatient: null,
            encounters: [],
            flowsheet: [],
            prepMeSummary: null,
          },
          false,
          "clearActivePatient"
        );
      },
    }),
    { name: "ClarityOS/Patients", enabled: isDev }
  )
);

// ---------------------------------------------------------------------------
// Selector hooks
// ---------------------------------------------------------------------------

export const usePatients = () => usePatientStore((s) => s.patients);
export const useActivePatient = () => usePatientStore((s) => s.activePatient);
export const usePatientEncounters = () => usePatientStore((s) => s.encounters);
export const usePatientFlowsheet = () => usePatientStore((s) => s.flowsheet);
