/**
 * hooks/useRefractionKeyboard.ts
 *
 * Keyboard navigation for the RefractionGrid.
 *
 * The entire prescription workflow must be completable without a mouse.
 * During a manifest refraction, the doctor's hands are on the phoropter —
 * they dictate values to the technician who types them in.  A mouse click
 * between every field breaks the rhythm of the exam.
 *
 * Navigation model:
 * ─────────────────────────────────────────────────────────────────────────
 *
 *  The grid has [4 columns] × [12 rows].  Navigation is:
 *
 *  Tab / Enter      → advance to next column (same row)
 *                     at last column: jump to first column of NEXT row
 *  Shift+Tab        → reverse of Tab
 *  ArrowDown        → same column, next row
 *  ArrowUp          → same column, previous row
 *  ArrowRight       → next column, same row (when cursor at end of text)
 *  ArrowLeft        → previous column, same row (when cursor at start)
 *  Escape           → clear current cell value, stay in cell
 *
 * Clinical Enter shortcuts (make common workflows single-key):
 *  On SPH with a value → Tab to CYL
 *  On CYL with a non-zero value → Tab to AXIS
 *  On CYL with zero / null → skip AXIS, Tab to ADD
 *  On AXIS with a value → Tab to VA (skipping ADD unless presbyopia flag set)
 *
 * +/- shortcuts (diopter and axis fields only):
 *  + or ArrowUp (in number fields)  → increment by 0.25D (or 1° for axis)
 *  - or ArrowDown (in number fields)→ decrement by 0.25D (or 1° for axis)
 *  These shortcuts only fire when the input is EMPTY or the cursor is at
 *  position 0 — otherwise the character is appended to the typed value.
 *
 * Cell ID scheme (defined in types/refraction.ts):
 *   `rx-cell-{colIndex}-{rowKey}`   e.g. `rx-cell-2-od_sphere`
 */

"use client";

import { useCallback } from "react";
import {
  ROW_KEYS,
  REFRACTION_COLUMNS,
  cellId,
  type GridCoord,
  type RowKey,
} from "@/types/refraction";
import {
  getFieldType,
  incrementDiopter,
  decrementDiopter,
  incrementAxis,
  decrementAxis,
  parseCellValue,
} from "@/lib/rx-format";
import { useRefractionStore } from "@/store/refractionStore";

// ---------------------------------------------------------------------------
// DOM focus helper
// ---------------------------------------------------------------------------

function focusCell(colIndex: number, rowKey: RowKey): boolean {
  const el = document.getElementById(cellId(colIndex, rowKey)) as HTMLInputElement | null;
  if (!el) return false;
  el.focus();
  // Move cursor to end of value
  const len = el.value.length;
  try { el.setSelectionRange(len, len); } catch {}
  return true;
}

function focusCellSelectAll(colIndex: number, rowKey: RowKey): boolean {
  const el = document.getElementById(cellId(colIndex, rowKey)) as HTMLInputElement | null;
  if (!el) return false;
  el.focus();
  el.select();
  return true;
}

// ---------------------------------------------------------------------------
// Navigation helpers
// ---------------------------------------------------------------------------

function nextCoord(
  current: GridCoord,
  direction: "forward" | "backward"
): GridCoord {
  const { colIndex, rowKey } = current;
  const colCount = REFRACTION_COLUMNS.length; // 4
  const rowIndex = ROW_KEYS.indexOf(rowKey);
  const rowCount = ROW_KEYS.length;

  if (direction === "forward") {
    const nextRow = rowIndex + 1;
    if (nextRow < rowCount) {
      // Move down to the next row in the SAME column
      return { colIndex, rowKey: ROW_KEYS[nextRow] };
    }
    // If at the bottom, wrap to the top row of the NEXT column
    const nextCol = (colIndex + 1) % colCount;
    return { colIndex: nextCol, rowKey: ROW_KEYS[0] };
  } else {
    const prevRow = rowIndex - 1;
    if (prevRow >= 0) {
      // Move up to the previous row in the SAME column
      return { colIndex, rowKey: ROW_KEYS[prevRow] };
    }
    // If at the top, wrap to the bottom row of the PREVIOUS column
    const prevCol = (colIndex - 1 + colCount) % colCount;
    return { colIndex: prevCol, rowKey: ROW_KEYS[rowCount - 1] };
  }
}

function aboveCoord(current: GridCoord): GridCoord {
  const rowIndex = ROW_KEYS.indexOf(current.rowKey);
  const prevRow = (rowIndex - 1 + ROW_KEYS.length) % ROW_KEYS.length;
  return { ...current, rowKey: ROW_KEYS[prevRow] };
}

function belowCoord(current: GridCoord): GridCoord {
  const rowIndex = ROW_KEYS.indexOf(current.rowKey);
  const nextRow = (rowIndex + 1) % ROW_KEYS.length;
  return { ...current, rowKey: ROW_KEYS[nextRow] };
}

/**
 * Clinical "smart Enter" — advance to the next clinically relevant field
 * given the current field and value.
 *
 * Standard refraction entry order:
 *   OD: SPH → CYL → AXIS (if cyl ≠ 0) → VA
 *   OS: SPH → CYL → AXIS (if cyl ≠ 0) → VA
 *   PD after OS VA
 */
function clinicalEnterTarget(
  current: GridCoord,
  currentValue: string,
  cylValue: number | null
): GridCoord | null {
  const { colIndex, rowKey } = current;

  switch (rowKey) {
    case "od_sphere":
      return { colIndex, rowKey: "od_cylinder" };
    case "od_cylinder": {
      const { value: parsed } = parseCellValue("od_cylinder", currentValue);
      const cylNonZero = parsed !== null && parsed !== 0;
      return { colIndex, rowKey: cylNonZero ? "od_axis" : "od_va" };
    }
    case "od_axis":
      return { colIndex, rowKey: "od_va" };
    case "od_va":
      return { colIndex, rowKey: "os_sphere" };
    case "os_sphere":
      return { colIndex, rowKey: "os_cylinder" };
    case "os_cylinder": {
      const { value: parsed } = parseCellValue("os_cylinder", currentValue);
      const cylNonZero = parsed !== null && parsed !== 0;
      return { colIndex, rowKey: cylNonZero ? "os_axis" : "os_va" };
    }
    case "os_axis":
      return { colIndex, rowKey: "os_va" };
    case "os_va":
      return { colIndex, rowKey: "pd_distance" };
    default:
      return null; // fall back to Tab behaviour
  }
}

// ---------------------------------------------------------------------------
// The hook
// ---------------------------------------------------------------------------

export interface UseRefractionKeyboardOptions {
  colIndex: number;
  rowKey:   RowKey;
  onClear:  () => void;
  onIncrement: () => void;
  onDecrement: () => void;
}

/**
 * Returns a `onKeyDown` handler to attach to each grid cell <input>.
 *
 * Responsibilities:
 *  1. Tab / Shift+Tab → inter-column navigation
 *  2. ArrowUp/Down   → inter-row navigation
 *  3. Enter          → clinical smart-advance
 *  4. Escape         → clear cell
 *  5. +/-            → diopter increment/decrement
 */
export function useRefractionKeyboard({
  colIndex,
  rowKey,
  onClear,
  onIncrement,
  onDecrement,
}: UseRefractionKeyboardOptions) {
  const setFocused = useRefractionStore((s) => s.setFocusedCell);
  const odCyl = useRefractionStore(
    useCallback((s) => s.columns[colIndex]?.draft.od.cylinder ?? null, [colIndex])
  );
  const osCyl = useRefractionStore(
    useCallback((s) => s.columns[colIndex]?.draft.os.cylinder ?? null, [colIndex])
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      const input = e.currentTarget;
      const current: GridCoord = { colIndex, rowKey };
      const fieldType = getFieldType(rowKey);
      const isNumeric = fieldType !== "va";
      const isEmpty = !input.value.trim();
      const cursorAtStart = input.selectionStart === 0 && input.selectionEnd === 0;
      const cursorAtEnd = input.selectionStart === input.value.length;

      switch (e.key) {
        // ── Tab: move across columns ────────────────────────────────────
        case "Tab": {
          e.preventDefault();
          const dir = e.shiftKey ? "backward" : "forward";
          const target = nextCoord(current, dir);
          focusCellSelectAll(target.colIndex, target.rowKey);
          setFocused(target);
          break;
        }

        // ── Enter: clinical smart-advance ───────────────────────────────
        case "Enter": {
          e.preventDefault();
          const relevantCyl = rowKey.startsWith("od_") ? odCyl : osCyl;

          const smartTarget = clinicalEnterTarget(current, input.value, relevantCyl);
          if (smartTarget) {
            focusCellSelectAll(smartTarget.colIndex, smartTarget.rowKey);
            setFocused(smartTarget);
          } else {
            const target = nextCoord(current, "forward");
            focusCellSelectAll(target.colIndex, target.rowKey);
            setFocused(target);
          }
          break;
        }

        // ── Escape: clear cell ──────────────────────────────────────────
        case "Escape": {
          e.preventDefault();
          onClear();
          break;
        }

        // ── ArrowUp: previous row (or increment for numeric fields) ─────
        case "ArrowUp": {
          if (isNumeric && (isEmpty || cursorAtStart)) {
            e.preventDefault();
            onIncrement();
            break;
          }
          e.preventDefault();
          const above = aboveCoord(current);
          focusCellSelectAll(above.colIndex, above.rowKey);
          setFocused(above);
          break;
        }

        // ── ArrowDown: next row (or decrement for numeric fields) ───────
        case "ArrowDown": {
          if (isNumeric && (isEmpty || cursorAtStart)) {
            e.preventDefault();
            onDecrement();
            break;
          }
          e.preventDefault();
          const below = belowCoord(current);
          focusCellSelectAll(below.colIndex, below.rowKey);
          setFocused(below);
          break;
        }

        // ── ArrowRight: next column (only when cursor is at text end) ───
        case "ArrowRight": {
          if (cursorAtEnd) {
            e.preventDefault();
            const target = nextCoord(current, "forward");
            focusCellSelectAll(target.colIndex, target.rowKey);
            setFocused(target);
          }
          // else: let the cursor move within the text normally
          break;
        }

        // ── ArrowLeft: previous column (only at text start) ─────────────
        case "ArrowLeft": {
          if (cursorAtStart) {
            e.preventDefault();
            const target = nextCoord(current, "backward");
            focusCellSelectAll(target.colIndex, target.rowKey);
            setFocused(target);
          }
          break;
        }

        // ── +/= key: increment (when field is empty or cursor at start) ─
        case "+":
        case "=": {
          if (isNumeric && (isEmpty || cursorAtStart)) {
            e.preventDefault();
            onIncrement();
          }
          break;
        }

        // ── - key: decrement ────────────────────────────────────────────
        case "-": {
          if (isNumeric && isEmpty) {
            // Allow typing a negative number: "-" at start of empty field
            // should NOT decrement, it should let the user type "-2.25"
            // So only decrement if cursorAtStart and field already has a value
            break;
          }
          if (isNumeric && cursorAtStart && !isEmpty) {
            e.preventDefault();
            onDecrement();
          }
          break;
        }

        default:
          break;
      }
    },
    [colIndex, rowKey, onClear, onIncrement, onDecrement, setFocused, odCyl, osCyl]
  );

  return handleKeyDown;
}
