/**
 * store/vitalsStore.ts
 *
 * Zustand store for vitals / pre-test data entry.
 *
 * Architecture: "Draft / Committed" dual state per encounter
 * ───────────────────────────────────────────────────────────
 *
 *  keystroke --> draft updated --> saveStatus = "dirty"
 *                                      |
 *                                1.5s debounce
 *                                      |
 *                                saveStatus = "saving"
 *                                      |
 *                           real API (FastAPI backend)
 *                                      |
 *                  success: committed = draft, status = "saved"
 *                  error:   committed unchanged, status = "error"
 *                                      |
 *                           2s delay --> status = "idle"
 */

import { create } from "zustand";
import { devtools, subscribeWithSelector } from "zustand/middleware";

const isDev = process.env.NODE_ENV === "development";
import {
  blankVitalsDraft,
  type VitalsDraft,
  type VitalsFieldError,
  type VitalsSaveStatus,
  type VitalsState,
} from "@/types/vitals";
import { apiFetch } from "@/lib/api-client";

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

interface VitalsStoreState {
  encounters: Record<string, VitalsState>;
}

interface VitalsStoreActions {
  /** Load vitals from the API for an encounter */
  loadVitals: (encounterId: string) => Promise<void>;

  /** Initialize vitals for an encounter (idempotent) */
  init: (encounterId: string, initialData?: Partial<VitalsDraft>) => void;

  /** Update a single field in the draft */
  setField: (encounterId: string, field: keyof VitalsDraft, value: unknown) => void;

  /** Schedule debounced save */
  scheduleSave: (encounterId: string) => void;

  /** Flush immediately (on blur or status advance) */
  flushSave: (encounterId: string) => void;

  /** Mark as saved (API callback) */
  commit: (encounterId: string, savedDraft: VitalsDraft) => void;

  /** Mark error */
  setError: (encounterId: string, errors: VitalsFieldError[]) => void;

  /** Reset status to idle */
  resetStatus: (encounterId: string) => void;

  /** Set status directly (internal) */
  _setStatus: (encounterId: string, status: VitalsSaveStatus) => void;
}

type VitalsStore = VitalsStoreState & VitalsStoreActions;

// ---------------------------------------------------------------------------
// Debounce registry (outside Zustand — no re-renders on timer change)
// ---------------------------------------------------------------------------

const debounceTimers: Record<string, ReturnType<typeof setTimeout>> = {};
const DEBOUNCE_MS = 1500;

// ---------------------------------------------------------------------------
// API save — real API only, no mock fallback
// ---------------------------------------------------------------------------

async function saveVitalsToAPI(
  encounterId: string,
  vitals: VitalsState,
  actions: Pick<VitalsStoreActions, "commit" | "setError" | "_setStatus" | "resetStatus">
): Promise<void> {
  actions._setStatus(encounterId, "saving");

  const draft = vitals.draft;

  try {
    // Client-side validation (fast feedback)
    const errors: VitalsFieldError[] = [];
    if (draft.iop_od !== null && (draft.iop_od < 0 || draft.iop_od > 80))
      errors.push({ field: "iop_od", message: "IOP must be 0–80 mmHg" });
    if (draft.iop_os !== null && (draft.iop_os < 0 || draft.iop_os > 80))
      errors.push({ field: "iop_os", message: "IOP must be 0–80 mmHg" });
    if (draft.pulse !== null && (draft.pulse < 30 || draft.pulse > 250))
      errors.push({ field: "pulse", message: "Pulse must be 30–250 bpm" });
    if (draft.blood_pressure !== null && !/^\d{2,3}\/\d{2,3}$/.test(draft.blood_pressure))
      errors.push({ field: "blood_pressure", message: "Format: 120/80" });

    if (errors.length > 0) {
      actions.setError(encounterId, errors);
      return;
    }

    // Build payload using camelCase keys — api-client converts to snake_case automatically
    const payload = {
      iopOd: draft.iop_od,
      iopOs: draft.iop_os,
      iopMethod: draft.iop_method,
      ucvaOd: draft.ucva_od,
      ucvaOs: draft.ucva_os,
      bcvaOd: draft.bcva_od,
      bcvaOs: draft.bcva_os,
      nearVaOd: draft.near_va_od,
      nearVaOs: draft.near_va_os,
      bloodPressure: draft.blood_pressure,
      pulse: draft.pulse,
      pupilsEqualRoundReactive: draft.pupils_equal_round_reactive,
      relativeAfferentPupillaryDefect: draft.relative_afferent_pupillary_defect,
      coverTestNotes: draft.cover_test_notes,
      technicianNotes: draft.technician_notes,
    };

    // Real API call — no mock fallback
    const res = await apiFetch<{ id: string; encounterId: string }>(
      `/api/encounters/${encounterId}/vitals`,
      { method: "PUT", body: JSON.stringify(payload) },
    );

    const savedDraft: VitalsDraft = { ...draft, id: res.id };
    actions.commit(encounterId, savedDraft);
    setTimeout(() => actions.resetStatus(encounterId), 2000);
  } catch (err) {
    actions.setError(encounterId, [
      { field: "_vitals", message: err instanceof Error ? err.message : "Network error — will retry on next change" },
    ]);
  }
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

const vitalsStoreImpl = subscribeWithSelector(devtools<VitalsStore>((set, get) => ({
      encounters: {},

      async loadVitals(encounterId) {
        // Set loading state
        set(
          (state) => ({
            encounters: {
              ...state.encounters,
              [encounterId]: {
                ...(state.encounters[encounterId] ?? {
                  draft: blankVitalsDraft(encounterId),
                  committed: null,
                  saveStatus: "idle" as VitalsSaveStatus,
                  errors: [],
                  lastSavedAt: null,
                }),
                saveStatus: "loading" as VitalsSaveStatus,
              },
            },
          }),
          false,
          "loadVitals/loading"
        );

        try {
          // apiFetch returns camelCase keys — map to snake_case VitalsDraft fields
          // 204 = no vitals recorded yet; apiFetch returns null in that case
          const data = await apiFetch<Record<string, unknown> | null>(
            `/api/encounters/${encounterId}/vitals`,
            { retries: 2 },
          );

          if (data === null) {
            // 204: no vitals recorded yet — leave blank draft in place
            set(
              (state) => ({
                encounters: {
                  ...state.encounters,
                  [encounterId]: {
                    ...(state.encounters[encounterId] ?? {
                      draft: blankVitalsDraft(encounterId),
                      committed: null,
                      errors: [],
                      lastSavedAt: null,
                    }),
                    saveStatus: "idle" as VitalsSaveStatus,
                  },
                },
              }),
              false,
              "loadVitals/empty"
            );
            return;
          }

          const draft: VitalsDraft = {
            id: (data.id as string) ?? null,
            encounter_id: encounterId,
            iop_od: (data.iopOd as number) ?? null,
            iop_os: (data.iopOs as number) ?? null,
            iop_method: (data.iopMethod as VitalsDraft["iop_method"]) ?? null,
            ucva_od: (data.ucvaOd as string) ?? null,
            ucva_os: (data.ucvaOs as string) ?? null,
            bcva_od: (data.bcvaOd as string) ?? null,
            bcva_os: (data.bcvaOs as string) ?? null,
            near_va_od: (data.nearVaOd as string) ?? null,
            near_va_os: (data.nearVaOs as string) ?? null,
            blood_pressure: (data.bloodPressure as string) ?? null,
            pulse: (data.pulse as number) ?? null,
            pupils_equal_round_reactive: (data.pupilsEqualRoundReactive as boolean) ?? true,
            relative_afferent_pupillary_defect: (data.relativeAfferentPupillaryDefect as boolean) ?? false,
            cover_test_notes: (data.coverTestNotes as string) ?? null,
            technician_notes: (data.technicianNotes as string) ?? null,
          };
          set(
            (state) => ({
              encounters: {
                ...state.encounters,
                [encounterId]: {
                  draft,
                  committed: { ...draft },
                  saveStatus: "idle" as VitalsSaveStatus,
                  errors: [],
                  lastSavedAt: null,
                },
              },
            }),
            false,
            "loadVitals/loaded"
          );
        } catch (err) {
          set(
            (state) => {
              const enc = state.encounters[encounterId];
              if (!enc) return state;
              return {
                encounters: {
                  ...state.encounters,
                  [encounterId]: {
                    ...enc,
                    saveStatus: "error" as VitalsSaveStatus,
                    errors: [{ field: "_load", message: "Could not load vitals" }],
                  },
                },
              };
            },
            false,
            "loadVitals/error"
          );
        }
      },

      init(encounterId, initialData) {
        const existing = get().encounters[encounterId];
        if (existing) return; // idempotent — don't overwrite existing draft

        const draft: VitalsDraft = {
          ...blankVitalsDraft(encounterId),
          ...initialData,
          encounter_id: encounterId,
        };

        set(
          (state) => ({
            encounters: {
              ...state.encounters,
              [encounterId]: {
                draft,
                committed: initialData ? { ...draft } : null,
                saveStatus: "idle" as VitalsSaveStatus,
                errors: [],
                lastSavedAt: null,
              },
            },
          }),
          false,
          "init"
        );
      },

      setField(encounterId, field, value) {
        set(
          (state) => {
            const enc = state.encounters[encounterId];
            if (!enc) return state;
            return {
              encounters: {
                ...state.encounters,
                [encounterId]: {
                  ...enc,
                  draft: { ...enc.draft, [field]: value },
                  saveStatus: "dirty",
                  errors: enc.errors.filter((e) => e.field !== field),
                },
              },
            };
          },
          false,
          "setField"
        );
        get().scheduleSave(encounterId);
      },

      scheduleSave(encounterId) {
        if (debounceTimers[encounterId]) {
          clearTimeout(debounceTimers[encounterId]);
        }
        debounceTimers[encounterId] = setTimeout(() => {
          get().flushSave(encounterId);
        }, DEBOUNCE_MS);
      },

      flushSave(encounterId) {
        if (debounceTimers[encounterId]) {
          clearTimeout(debounceTimers[encounterId]);
          delete debounceTimers[encounterId];
        }
        const state = get();
        const enc = state.encounters[encounterId];
        if (!enc) return;

        // Don't save if nothing changed, already saving, or currently loading
        if (
          enc.saveStatus === "idle" ||
          enc.saveStatus === "saving" ||
          enc.saveStatus === "saved" ||
          enc.saveStatus === "loading"
        ) return;

        saveVitalsToAPI(encounterId, enc, {
          commit: state.commit,
          setError: state.setError,
          _setStatus: state._setStatus,
          resetStatus: state.resetStatus,
        });
      },

      commit(encounterId, savedDraft) {
        set(
          (state) => {
            const enc = state.encounters[encounterId];
            if (!enc) return state;
            return {
              encounters: {
                ...state.encounters,
                [encounterId]: {
                  ...enc,
                  draft: savedDraft,
                  committed: savedDraft,
                  saveStatus: "saved",
                  errors: [],
                  lastSavedAt: new Date(),
                },
              },
            };
          },
          false,
          "commit"
        );
      },

      setError(encounterId, errors) {
        set(
          (state) => {
            const enc = state.encounters[encounterId];
            if (!enc) return state;
            return {
              encounters: {
                ...state.encounters,
                [encounterId]: { ...enc, saveStatus: "error", errors },
              },
            };
          },
          false,
          "setError"
        );
      },

      resetStatus(encounterId) {
        set(
          (state) => {
            const enc = state.encounters[encounterId];
            if (!enc || enc.saveStatus !== "saved") return state;
            return {
              encounters: {
                ...state.encounters,
                [encounterId]: { ...enc, saveStatus: "idle" },
              },
            };
          },
          false,
          "resetStatus"
        );
      },

      _setStatus(encounterId, status) {
        set(
          (state) => {
            const enc = state.encounters[encounterId];
            if (!enc) return state;
            return {
              encounters: {
                ...state.encounters,
                [encounterId]: { ...enc, saveStatus: status },
              },
            };
          },
          false,
          "_setStatus"
        );
      },
    }), { name: "ClarityOS/Vitals", enabled: isDev }));

export const useVitalsStore = create<VitalsStore>()(
  vitalsStoreImpl
);

// ---------------------------------------------------------------------------
// Selector hooks
// ---------------------------------------------------------------------------

export const useVitalsState = (encounterId: string) =>
  useVitalsStore((s) => s.encounters[encounterId]);

export const useVitalsDraft = (encounterId: string) =>
  useVitalsStore((s) => s.encounters[encounterId]?.draft);
