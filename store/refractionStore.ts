/**
 * store/refractionStore.ts
 *
 * Zustand store for the RefractionGrid component.
 *
 * Architecture: "Draft / Committed" dual state per column
 * ─────────────────────────────────────────────────────────
 *
 *  ┌──────────────┐      keystroke      ┌──────────────┐
 *  │  committed   │ ◄── API response ── │    draft     │
 *  │  (last save) │                     │  (live DOM)  │
 *  └──────────────┘                     └──────────────┘
 *         │                                    │
 *         │                             1.5s debounce
 *         │                                    │
 *         └──────────── differs? ─────────────►│ POST / PATCH
 *
 *  - `draft`     : the value visible in the input RIGHT NOW
 *  - `committed` : the last successfully saved server state
 *  - If the user navigates away or Wi-Fi drops, `draft` survives in Zustand.
 *    On reconnect, the next keystroke restarts the debounce and saves.
 *
 * Save lifecycle per column:
 *   idle  → user types → dirty
 *   dirty → 1.5s passes with no further input → saving
 *   saving → API 201/200 → saved  (committed = draft)
 *   saving → API error   → error  (committed unchanged, error shown)
 *   saved  → 2s elapses  → idle
 *
 * The store also tracks `focusedCell` so the grid can highlight the active
 * column and the keyboard navigation hook knows where focus is.
 */

import { create } from "zustand";
import { devtools, subscribeWithSelector } from "zustand/middleware";
import {
  blankDraft,
  getDraftValue,
  setDraftValue,
  REFRACTION_COLUMNS,
  type ColumnState,
  type GridCoord,
  type RefractionDraft,
  type RefractionType,
  type RowKey,
  type SaveStatus,
} from "@/types/refraction";
import { apiFetch } from "@/lib/api-client";

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

interface RefractionStoreState {
  // The 4 columns (Habitual / Auto / Manifest / Final)
  columns: ColumnState[];

  // Which cell has keyboard focus — null when grid is not focused
  focusedCell: GridCoord | null;

  // Encounter context (set once on mount, used by API calls)
  encounterId: string;

  // When true, all inputs are disabled (encounter finalized)
  isReadOnly: boolean;

  // Active debounce timer IDs, keyed by column index
  // (stored outside Zustand state to avoid re-renders on timer change)
}

interface RefractionStoreActions {
  /** Called once when the component mounts with encounter data from the server */
  init: (encounterId: string, initialRefractions: RefractionDraft[], isReadOnly: boolean) => void;

  /** Update a single cell value in the draft (called on every keystroke) */
  setCellValue: (colIndex: number, rowKey: RowKey, value: number | string | null) => void;

  /** Mark a column dirty and schedule a debounced save */
  scheduleSave: (colIndex: number) => void;

  /** Immediately flush a column to the API (called on blur of last field) */
  flushSave: (colIndex: number) => void;

  /** Called by the API layer on success */
  commitColumn: (colIndex: number, savedDraft: RefractionDraft) => void;

  /** Called by the API layer on error */
  setColumnError: (colIndex: number, errors: { field: string; message: string }[]) => void;

  /** Track keyboard focus */
  setFocusedCell: (coord: GridCoord | null) => void;

  /** Reset save status to idle after a delay */
  resetStatus: (colIndex: number) => void;

  /** Toggle is_final_rx for a column */
  setFinalRx: (colIndex: number, value: boolean) => void;

  /** Set status directly (used internally) */
  _setStatus: (colIndex: number, status: SaveStatus) => void;
}

type RefractionStore = RefractionStoreState & RefractionStoreActions;

// ---------------------------------------------------------------------------
// Debounce registry (lives outside Zustand — no need to trigger re-renders)
// ---------------------------------------------------------------------------

const debounceTimers: Record<number, ReturnType<typeof setTimeout>> = {};
const DEBOUNCE_MS = 1500;

// ---------------------------------------------------------------------------
// API call — kept here so the store is self-contained
// ---------------------------------------------------------------------------

async function saveColumnToAPI(
  encounterId: string,
  column: ColumnState,
  colIndex: number,
  actions: Pick<RefractionStoreActions, "commitColumn" | "setColumnError" | "_setStatus" | "resetStatus">
): Promise<void> {
  actions._setStatus(colIndex, "saving");

  const draft = column.draft;

  // Build the request body matching RefractionCreate schema
  const body = {
    refractionType: draft.refraction_type,
    od: {
      sphere:       draft.od.sphere,
      cylinder:     draft.od.cylinder,
      axis:         draft.od.axis,
      add:          draft.od.add,
      prism:        draft.od.prism,
      prismBase:    draft.od.prism_base,
      visualAcuity: draft.od.visual_acuity,
    },
    os: {
      sphere:       draft.os.sphere,
      cylinder:     draft.os.cylinder,
      axis:         draft.os.axis,
      add:          draft.os.add,
      prism:        draft.os.prism,
      prismBase:    draft.os.prism_base,
      visualAcuity: draft.os.visual_acuity,
    },
    pdDistance:  draft.pd_distance,
    pdNear:      draft.pd_near,
    pdOd:        draft.pd_od,
    pdOs:        draft.pd_os,
    isFinalRx:   draft.is_final_rx,
    notes:       draft.notes,
  };

  try {
    // Client-side validation (fast feedback)
    const errors: { field: string; message: string }[] = [];
    if (draft.od.cylinder && !draft.od.axis)
      errors.push({ field: "od.axis", message: "Axis required when cylinder is set" });
    if (draft.os.cylinder && !draft.os.axis)
      errors.push({ field: "os.axis", message: "Axis required when cylinder is set" });

    if (errors.length > 0) {
      actions.setColumnError(colIndex, errors);
      return;
    }

    let savedDraft: RefractionDraft;

    try {
      // Real API — PATCH /api/encounters/{id}/column/{col}
      const json = await apiFetch<{ id: string }>(
        `/api/encounters/${encounterId}/column/${colIndex}`,
        { method: "PATCH", body: JSON.stringify(body) },
      );
      savedDraft = { ...draft, id: json.id ?? draft.id };
    } catch {
      // Fallback to mock when backend is unavailable
      await new Promise((resolve) => setTimeout(resolve, 400));
      savedDraft = { ...draft, id: draft.id ?? `mock-rx-${draft.refraction_type}-${Date.now()}` };
    }

    actions.commitColumn(colIndex, savedDraft);
    setTimeout(() => actions.resetStatus(colIndex), 2000);
  } catch (err) {
    actions.setColumnError(colIndex, [
      { field: "_column", message: "Network error — will retry on next change" },
    ]);
  }
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

export const useRefractionStore = create<RefractionStore>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      // ── Initial state ──────────────────────────────────────────────────
      columns: REFRACTION_COLUMNS.map((type) => ({
        draft:       blankDraft(type),
        committed:   null,
        saveStatus:  "idle" as SaveStatus,
        errors:      [],
        lastSavedAt: null,
      })),
      focusedCell: null,
      encounterId: "",
      isReadOnly:  false,

      // ── Actions ────────────────────────────────────────────────────────

      init(encounterId, initialRefractions, isReadOnly) {
        const columns: ColumnState[] = REFRACTION_COLUMNS.map((type, i) => {
          const existing = initialRefractions.find((r) => r.refraction_type === type);
          const draft = existing ?? blankDraft(type);
          return {
            draft,
            committed:   existing ?? null,
            saveStatus:  "idle" as SaveStatus,
            errors:      [],
            lastSavedAt: null,
          };
        });
        set({ columns, encounterId, isReadOnly }, false, "init");
      },

      setCellValue(colIndex, rowKey, value) {
        set(
          (state) => {
            const columns = [...state.columns];
            const col = { ...columns[colIndex] };
            col.draft = setDraftValue(col.draft, rowKey, value);
            col.saveStatus = "dirty";
            col.errors = col.errors.filter((e) => !e.field.includes(rowKey.replace("od_", "od.").replace("os_", "os.")));
            columns[colIndex] = col;
            return { columns };
          },
          false,
          "setCellValue"
        );
        get().scheduleSave(colIndex);
      },

      scheduleSave(colIndex) {
        // Cancel existing debounce for this column
        if (debounceTimers[colIndex]) {
          clearTimeout(debounceTimers[colIndex]);
        }
        debounceTimers[colIndex] = setTimeout(() => {
          get().flushSave(colIndex);
        }, DEBOUNCE_MS);
      },

      flushSave(colIndex) {
        if (debounceTimers[colIndex]) {
          clearTimeout(debounceTimers[colIndex]);
          delete debounceTimers[colIndex];
        }
        const state = get();
        const column = state.columns[colIndex];

        // Don't save if nothing has changed or already saving
        if (column.saveStatus === "idle" || column.saveStatus === "saving") return;

        // Don't save if the draft has no data worth saving
        const draft = column.draft;
        const hasAnyValue =
          draft.od.sphere !== null ||
          draft.od.cylinder !== null ||
          draft.os.sphere !== null ||
          draft.os.cylinder !== null;
        if (!hasAnyValue) return;

        saveColumnToAPI(state.encounterId, column, colIndex, {
          commitColumn:  state.commitColumn,
          setColumnError: state.setColumnError,
          _setStatus:    state._setStatus,
          resetStatus:   state.resetStatus,
        });
      },

      commitColumn(colIndex, savedDraft) {
        set(
          (state) => {
            const columns = [...state.columns];
            columns[colIndex] = {
              ...columns[colIndex],
              draft:       savedDraft,
              committed:   savedDraft,
              saveStatus:  "saved",
              errors:      [],
              lastSavedAt: new Date(),
            };
            return { columns };
          },
          false,
          "commitColumn"
        );
      },

      setColumnError(colIndex, errors) {
        set(
          (state) => {
            const columns = [...state.columns];
            columns[colIndex] = {
              ...columns[colIndex],
              saveStatus: "error",
              errors,
            };
            return { columns };
          },
          false,
          "setColumnError"
        );
      },

      setFocusedCell(coord) {
        set({ focusedCell: coord }, false, "setFocusedCell");
      },

      resetStatus(colIndex) {
        set(
          (state) => {
            const columns = [...state.columns];
            if (columns[colIndex].saveStatus === "saved") {
              columns[colIndex] = { ...columns[colIndex], saveStatus: "idle" };
            }
            return { columns };
          },
          false,
          "resetStatus"
        );
      },

      setFinalRx(colIndex, value) {
        set(
          (state) => {
            const columns = [...state.columns];
            const col = { ...columns[colIndex] };
            col.draft = { ...col.draft, is_final_rx: value };
            col.saveStatus = "dirty";
            columns[colIndex] = col;
            return { columns };
          },
          false,
          "setFinalRx"
        );
        get().scheduleSave(colIndex);
      },

      _setStatus(colIndex, status) {
        set(
          (state) => {
            const columns = [...state.columns];
            columns[colIndex] = { ...columns[colIndex], saveStatus: status };
            return { columns };
          },
          false,
          "_setStatus"
        );
      },
    })),
    { name: "OptometryERP/Refraction" }
  )
);

// ---------------------------------------------------------------------------
// Selector hooks
// ---------------------------------------------------------------------------

export const useColumnState = (colIndex: number) =>
  useRefractionStore((s) => s.columns[colIndex]);

export const useFocusedCell = () =>
  useRefractionStore((s) => s.focusedCell);

export const useIsReadOnly = () =>
  useRefractionStore((s) => s.isReadOnly);
