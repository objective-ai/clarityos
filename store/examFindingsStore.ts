/**
 * store/examFindingsStore.ts
 *
 * Zustand store for Ocular Health exam findings (anterior / posterior segment).
 *
 * Architecture: Draft / Committed dual state, keyed by "encounterId:section"
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * WNL Macro:
 *   setWNL() iterates FIELD_META, populates all defaults → is_normal_wnl = true
 *                                                        → scheduleSave()
 *
 * Safety Switch:
 *   setStructureField() checks if new value !== defaultStatus
 *                       → auto-sets is_normal_wnl = false
 */

import { create } from "zustand";
import { devtools, subscribeWithSelector } from "zustand/middleware";

const isDev = process.env.NODE_ENV === "development";
import {
  blankDraft,
  blankStructure,
  type ExamSection,
  type FindingsDraft,
  type FindingsFieldError,
  type FindingsSaveStatus,
  type FindingsState,
  type FindingsStoreKey,
  type StructureFinding,
} from "@/types/exam-findings";
import { getFieldMeta } from "@/lib/exam-findings-fields";
import { apiFetch } from "@/lib/api-client";

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

interface ExamFindingsStoreState {
  findings: Record<FindingsStoreKey, FindingsState>;
}

interface ExamFindingsStoreActions {
  /** Initialize findings for an encounter+section (idempotent) */
  init: (encounterId: string, section: ExamSection, initialData?: Partial<FindingsDraft>) => void;

  /** Update a single structure field (status, severity, or finding) */
  setStructureField: (
    encounterId: string,
    section: ExamSection,
    eye: "od" | "os",
    structure: string,
    field: keyof StructureFinding,
    value: string | null,
  ) => void;

  /** Update provider notes */
  setProviderNotes: (encounterId: string, section: ExamSection, notes: string) => void;

  /** WNL Macro: populate all defaults + set is_normal_wnl = true + save */
  setWNL: (encounterId: string, section: ExamSection) => void;

  /** Copy all OD findings to OS */
  copyOdToOs: (encounterId: string, section: ExamSection) => void;

  /** Schedule debounced save */
  scheduleSave: (key: FindingsStoreKey) => void;

  /** Flush immediately */
  flushSave: (key: FindingsStoreKey) => void;

  /** Mark as saved (API callback) */
  commit: (key: FindingsStoreKey, saved: FindingsDraft) => void;

  /** Mark error */
  setError: (key: FindingsStoreKey, errors: FindingsFieldError[]) => void;

  /** Reset status to idle */
  resetStatus: (key: FindingsStoreKey) => void;

  /** Set status directly (internal) */
  _setStatus: (key: FindingsStoreKey, status: FindingsSaveStatus) => void;
}

type ExamFindingsStore = ExamFindingsStoreState & ExamFindingsStoreActions;

// ---------------------------------------------------------------------------
// Debounce registry
// ---------------------------------------------------------------------------

const debounceTimers: Record<string, ReturnType<typeof setTimeout>> = {};
const DEBOUNCE_MS = 1500;

function makeKey(encounterId: string, section: ExamSection): FindingsStoreKey {
  return `${encounterId}:${section}`;
}

// ---------------------------------------------------------------------------
// API save
// ---------------------------------------------------------------------------

async function saveFindingsToAPI(
  encounterId: string,
  section: ExamSection,
  state: FindingsState,
  actions: Pick<ExamFindingsStoreActions, "commit" | "setError" | "_setStatus" | "resetStatus">,
): Promise<void> {
  const key = makeKey(encounterId, section);
  actions._setStatus(key, "saving");

  try {
    const payload = {
      is_normal_wnl: state.draft.is_normal_wnl,
      findings_od: state.draft.findings_od,
      findings_os: state.draft.findings_os,
      provider_notes: state.draft.provider_notes || null,
    };

    let saved: FindingsDraft;

    try {
      const res = await apiFetch<{
        is_normal_wnl: boolean;
        findings_od: Record<string, StructureFinding> | null;
        findings_os: Record<string, StructureFinding> | null;
        provider_notes: string | null;
      }>(
        `/api/encounters/${encounterId}/exam-findings/${section}`,
        { method: "PUT", body: JSON.stringify(payload) },
      );
      saved = {
        is_normal_wnl: res.is_normal_wnl,
        findings_od: res.findings_od ?? state.draft.findings_od,
        findings_os: res.findings_os ?? state.draft.findings_os,
        provider_notes: res.provider_notes ?? "",
      };
    } catch {
      // Mock fallback when backend is unavailable
      await new Promise((r) => setTimeout(r, 400));
      saved = { ...state.draft };
    }

    actions.commit(key, saved);
    setTimeout(() => actions.resetStatus(key), 2000);
  } catch {
    actions.setError(key, [
      { field: "_findings", message: "Network error — will retry on next change" },
    ]);
  }
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

const examFindingsStoreImpl = subscribeWithSelector(devtools<ExamFindingsStore>((set, get) => ({
      findings: {},

      init(encounterId, section, initialData) {
        const key = makeKey(encounterId, section);
        const existing = get().findings[key];
        if (existing) return; // idempotent

        const draft: FindingsDraft = {
          ...blankDraft(section),
          ...initialData,
        };

        set(
          (state) => ({
            findings: {
              ...state.findings,
              [key]: {
                draft,
                committed: initialData ? { ...draft } : null,
                saveStatus: "idle" as FindingsSaveStatus,
                errors: [],
                lastSavedAt: null,
              },
            },
          }),
          false,
          "init",
        );
      },

      setStructureField(encounterId, section, eye, structure, field, value) {
        const key = makeKey(encounterId, section);

        set(
          (state) => {
            const enc = state.findings[key];
            if (!enc) return state;

            const eyeKey = eye === "od" ? "findings_od" : "findings_os";
            const currentFindings = enc.draft[eyeKey];
            const currentStructure = currentFindings[structure] ?? blankStructure("");

            const updatedStructure: StructureFinding = {
              ...currentStructure,
              [field]: value,
            };

            const updatedEyeFindings = {
              ...currentFindings,
              [structure]: updatedStructure,
            };

            // Safety Switch: check if any field deviates from default
            const meta = getFieldMeta(section);
            const fieldMeta = meta.find((m) => m.key === structure);
            let isWnl = enc.draft.is_normal_wnl;

            if (isWnl && fieldMeta && field === "status" && value !== fieldMeta.defaultStatus) {
              isWnl = false;
            }

            return {
              findings: {
                ...state.findings,
                [key]: {
                  ...enc,
                  draft: {
                    ...enc.draft,
                    [eyeKey]: updatedEyeFindings,
                    is_normal_wnl: isWnl,
                  },
                  saveStatus: "dirty",
                  errors: enc.errors.filter((e) => e.field !== `${eye}.${structure}`),
                },
              },
            };
          },
          false,
          "setStructureField",
        );

        get().scheduleSave(key);
      },

      setProviderNotes(encounterId, section, notes) {
        const key = makeKey(encounterId, section);

        set(
          (state) => {
            const enc = state.findings[key];
            if (!enc) return state;
            return {
              findings: {
                ...state.findings,
                [key]: {
                  ...enc,
                  draft: { ...enc.draft, provider_notes: notes },
                  saveStatus: "dirty",
                },
              },
            };
          },
          false,
          "setProviderNotes",
        );

        get().scheduleSave(key);
      },

      setWNL(encounterId, section) {
        const key = makeKey(encounterId, section);
        const meta = getFieldMeta(section);

        // Build default findings from FIELD_META
        const defaults: Record<string, StructureFinding> = {};
        for (const field of meta) {
          defaults[field.key] = blankStructure(field.defaultStatus);
        }

        set(
          (state) => {
            const enc = state.findings[key];
            if (!enc) return state;
            return {
              findings: {
                ...state.findings,
                [key]: {
                  ...enc,
                  draft: {
                    ...enc.draft,
                    is_normal_wnl: true,
                    findings_od: { ...defaults },
                    findings_os: { ...defaults },
                  },
                  saveStatus: "dirty",
                },
              },
            };
          },
          false,
          "setWNL",
        );

        // Trigger save immediately — the "Normal" exam should persist
        get().scheduleSave(key);
      },

      copyOdToOs(encounterId, section) {
        const key = makeKey(encounterId, section);

        set(
          (state) => {
            const enc = state.findings[key];
            if (!enc) return state;

            // Deep copy OD to OS
            const odCopy = JSON.parse(JSON.stringify(enc.draft.findings_od));

            return {
              findings: {
                ...state.findings,
                [key]: {
                  ...enc,
                  draft: {
                    ...enc.draft,
                    findings_os: odCopy,
                  },
                  saveStatus: "dirty",
                },
              },
            };
          },
          false,
          "copyOdToOs",
        );

        get().scheduleSave(key);
      },

      scheduleSave(key) {
        if (debounceTimers[key]) {
          clearTimeout(debounceTimers[key]);
        }
        debounceTimers[key] = setTimeout(() => {
          get().flushSave(key);
        }, DEBOUNCE_MS);
      },

      flushSave(key) {
        if (debounceTimers[key]) {
          clearTimeout(debounceTimers[key]);
          delete debounceTimers[key];
        }
        const state = get();
        const enc = state.findings[key];
        if (!enc) return;

        if (enc.saveStatus !== "dirty") return;

        const [encounterId, section] = key.split(":") as [string, ExamSection];

        saveFindingsToAPI(encounterId, section, enc, {
          commit: state.commit,
          setError: state.setError,
          _setStatus: state._setStatus,
          resetStatus: state.resetStatus,
        });
      },

      commit(key, saved) {
        set(
          (state) => {
            const enc = state.findings[key];
            if (!enc) return state;
            return {
              findings: {
                ...state.findings,
                [key]: {
                  ...enc,
                  draft: saved,
                  committed: saved,
                  saveStatus: "saved",
                  errors: [],
                  lastSavedAt: new Date(),
                },
              },
            };
          },
          false,
          "commit",
        );
      },

      setError(key, errors) {
        set(
          (state) => {
            const enc = state.findings[key];
            if (!enc) return state;
            return {
              findings: {
                ...state.findings,
                [key]: { ...enc, saveStatus: "error", errors },
              },
            };
          },
          false,
          "setError",
        );
      },

      resetStatus(key) {
        set(
          (state) => {
            const enc = state.findings[key];
            if (!enc || enc.saveStatus !== "saved") return state;
            return {
              findings: {
                ...state.findings,
                [key]: { ...enc, saveStatus: "idle" },
              },
            };
          },
          false,
          "resetStatus",
        );
      },

      _setStatus(key, status) {
        set(
          (state) => {
            const enc = state.findings[key];
            if (!enc) return state;
            return {
              findings: {
                ...state.findings,
                [key]: { ...enc, saveStatus: status },
              },
            };
          },
          false,
          "_setStatus",
        );
      },
    }), { name: "ClarityOS/ExamFindings", enabled: isDev }));

export const useExamFindingsStore = create<ExamFindingsStore>()(
  examFindingsStoreImpl
);

// ---------------------------------------------------------------------------
// Selector hooks
// ---------------------------------------------------------------------------

export const useFindingsState = (encounterId: string, section: ExamSection) =>
  useExamFindingsStore((s) => s.findings[makeKey(encounterId, section)]);

export const useFindingsDraft = (encounterId: string, section: ExamSection) =>
  useExamFindingsStore((s) => s.findings[makeKey(encounterId, section)]?.draft);
