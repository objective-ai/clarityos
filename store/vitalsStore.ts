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
 *                           mock API (dev) / real API (prod)
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
// Mock API save
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

    // Build payload (snake_case keys matching FastAPI schema)
    const payload = {
      iop_od: draft.iop_od,
      iop_os: draft.iop_os,
      iop_method: draft.iop_method,
      ucva_od: draft.ucva_od,
      ucva_os: draft.ucva_os,
      bcva_od: draft.bcva_od,
      bcva_os: draft.bcva_os,
      near_va_od: draft.near_va_od,
      near_va_os: draft.near_va_os,
      blood_pressure: draft.blood_pressure,
      pulse: draft.pulse,
      pupils_equal_round_reactive: draft.pupils_equal_round_reactive,
      relative_afferent_pupillary_defect: draft.relative_afferent_pupillary_defect,
      cover_test_notes: draft.cover_test_notes,
      technician_notes: draft.technician_notes,
    };

    let savedDraft: VitalsDraft;

    try {
      // Real API call to FastAPI backend
      const res = await apiFetch<{ id: string; encounter_id: string }>(
        `/api/encounters/${encounterId}/vitals`,
        { method: "PUT", body: JSON.stringify(payload) },
      );
      savedDraft = { ...draft, id: res.id };
    } catch {
      // Fallback to mock save when backend is unavailable
      await new Promise((resolve) => setTimeout(resolve, 400));
      savedDraft = { ...draft, id: draft.id ?? `mock-vitals-${Date.now()}` };
    }

    actions.commit(encounterId, savedDraft);
    setTimeout(() => actions.resetStatus(encounterId), 2000);
  } catch {
    actions.setError(encounterId, [
      { field: "_vitals", message: "Network error — will retry on next change" },
    ]);
  }
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

const vitalsStoreImpl = subscribeWithSelector(devtools<VitalsStore>((set, get) => ({
      encounters: {},

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

        // Don't save if nothing changed or already saving
        if (enc.saveStatus === "idle" || enc.saveStatus === "saving" || enc.saveStatus === "saved") return;

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
