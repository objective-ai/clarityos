"use client";

/**
 * components/encounter/RefractionGrid.tsx
 *
 * The prescription entry grid for the exam room.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  REFRACTION                                                                    │
 * ├──────────┬────────────┬────────────┬────────────┬────────────-----------┤
 * │          │  HABITUAL  │  AUTO REF  │  MANIFEST  │   FINAL Rx  ★        │
 * ├──────────┼────────────┼────────────┼────────────┼─────────────---------┤
 * │ OD ──────┤            │            │            │             │         │
 * │   SPH    │  -2.25     │  -2.50     │  -2.25     │  -2.25      │         │
 * │   CYL    │  -1.00     │  -1.25     │  -1.00     │  -1.00      │         │
 * │   AXIS   │  090       │  088       │  090       │  090        │         │
 * │   ADD    │            │            │            │             │         │
 * │   VA     │  20/200    │            │  20/20     │  20/20      │         │
 * ├──────────┼────────────┼────────────┼────────────┼─────────────---------┤
 * │ OS ──────┤            │            │            │             │         │
 * │   SPH    │  -1.75     │  -1.75     │  -1.75     │  -1.75      │         │
 * │   CYL    │  -0.50     │  -0.75     │  -0.50     │  -0.50      │         │
 * │   AXIS   │  175       │  170       │  175       │  175        │         │
 * │   ADD    │            │            │            │             │         │
 * │   VA     │  20/100    │            │  20/20     │  20/20      │         │
 * ├──────────┼────────────┼────────────┼────────────┼─────────────---------┤
 * │  PD dist │            │            │            │  63.5       │         │
 * │  PD near │            │            │            │             │         │
 * └──────────┴────────────┴────────────┴────────────┴─────────────---------┘
 *
 * Keyboard map:
 * Tab / Enter       → next column  (same row, wraps to next row at end)
 * Shift+Tab         → previous column
 * ↑ / ↓             → previous/next row  (or ±0.25D in numeric fields when empty)
 * ← / →             → previous/next column  (when cursor at edge)
 * Escape            → clear cell
 * + / -             → increment/decrement  (empty numeric cells only)
 *
 * State layers:
 * Keystrokes → local <input> state (controlled via rawText)
 * onChange   → Zustand setCellValue  (marks column dirty)
 * Debounce   → 1.5 s after last keystroke → API save
 * onBlur     → immediate flushSave (so navigating away always saves)
 */

import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  memo,
} from "react";
import {
  REFRACTION_COLUMNS,
  REFRACTION_COLUMN_LABELS,
  ROW_KEYS,
  ROW_LABELS,
  cellId,
  getDraftValue,
  type GridCoord,
  type RowKey,
  type RefractionDraft,
  type SaveStatus,
} from "@/types/refraction";
import {
  formatCellValue,
  rawCellValue,
  parseCellValue,
  getFieldType,
  getPlaceholder,
  getInputMode,
  incrementDiopter,
  decrementDiopter,
  incrementAxis,
  decrementAxis,
  getEyeForRow,
} from "@/lib/rx-format";
import { useRefractionKeyboard } from "@/hooks/useRefractionKeyboard";
import {
  useRefractionStore,
  useColumnState,
  useIsReadOnly,
} from "@/store/refractionStore";

// ─────────────────────────────────────────────────────────────────────────────
// Colours & constants
// ─────────────────────────────────────────────────────────────────────────────

const COL_ACCENT: Record<number, string> = {
  0: "rgba(96, 165, 250, 0.07)",   // habitual — blue tint
  1: "rgba(167, 139, 250, 0.07)",  // auto     — violet tint
  2: "rgba(45, 212, 191, 0.07)",   // manifest — teal tint
  3: "rgba(251, 191, 36, 0.10)",   // final    — amber tint (most important)
};

const COL_ACCENT_BORDER: Record<number, string> = {
  0: "rgba(96, 165, 250, 0.18)",
  1: "rgba(167, 139, 250, 0.18)",
  2: "rgba(45, 212, 191, 0.22)",
  3: "rgba(251, 191, 36, 0.35)",
};

const COL_ACCENT_FOCUS: Record<number, string> = {
  0: "rgba(96, 165, 250, 0.90)",
  1: "rgba(167, 139, 250, 0.90)",
  2: "rgba(45, 212, 191, 0.90)",
  3: "rgba(251, 191, 36, 0.90)",
};

const STATUS_META: Record<SaveStatus, { label: string; color: string; dot: string }> = {
  idle:   { label: "",        color: "transparent",       dot: "transparent"     },
  dirty:  { label: "unsaved", color: "var(--state-warning)", dot: "var(--state-warning)" },
  saving: { label: "saving…", color: "var(--text-secondary)", dot: "var(--accent)"  },
  saved:  { label: "saved",   color: "var(--state-normal)", dot: "var(--state-normal)" },
  error:  { label: "error",   color: "var(--state-critical)", dot: "var(--state-critical)" },
};

// ─────────────────────────────────────────────────────────────────────────────
// Row section separators
// ─────────────────────────────────────────────────────────────────────────────

function isSectionHeader(rowKey: RowKey): "OD" | "OS" | "PD" | null {
  if (rowKey === "od_sphere") return "OD";
  if (rowKey === "os_sphere") return "OS";
  if (rowKey === "pd_distance") return "PD";
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// SaveStatusPip — tiny indicator in column header
// ─────────────────────────────────────────────────────────────────────────────

const SaveStatusPip = memo(function SaveStatusPip({
  status,
  lastSavedAt,
}: {
  status: SaveStatus;
  lastSavedAt: Date | null;
}) {
  const meta = STATUS_META[status];
  if (status === "idle") return null;

  const timeStr = lastSavedAt
    ? lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div
      className="flex items-center gap-1 mt-1"
      style={{ fontSize: "11px", color: meta.color }}
      aria-live="polite"
      aria-label={`Save status: ${meta.label}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${status === "saving" ? "animate-pulse-dot" : ""}`}
        style={{ background: meta.dot }}
      />
      {meta.label}
      {timeStr && status === "saved" && (
        <span style={{ color: "var(--text-muted)", marginLeft: 2 }}>{timeStr}</span>
      )}
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// ErrorTooltip — shown below a cell with a validation error
// ─────────────────────────────────────────────────────────────────────────────

const ErrorTooltip = memo(function ErrorTooltip({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="absolute left-0 right-0 z-50 px-2 py-1 rounded text-[11px] leading-tight animate-slide-down"
      style={{
        top: "calc(100% + 3px)",
        background: "rgba(248, 113, 113, 0.15)",
        border: "1px solid rgba(248, 113, 113, 0.35)",
        color: "var(--state-critical)",
        backdropFilter: "blur(8px)",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {message}
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// RxCell — a single editable prescription input cell
// ─────────────────────────────────────────────────────────────────────────────

interface RxCellProps {
  colIndex:   number;
  rowKey:     RowKey;
  isFocused:  boolean;
  isReadOnly: boolean;
  error?:     string;
}

const RxCell = memo(function RxCell({
  colIndex,
  rowKey,
  isFocused,
  isReadOnly,
  error,
}: RxCellProps) {
  const storedValue = useRefractionStore(
    useCallback(
      (s) => getDraftValue(s.columns[colIndex].draft, rowKey),
      [colIndex, rowKey]
    )
  );
  const setCellValue = useRefractionStore((s) => s.setCellValue);
  const flushSave    = useRefractionStore((s) => s.flushSave);
  const setFocused   = useRefractionStore((s) => s.setFocusedCell);

  const [rawText, setRawText] = useState<string>(() =>
    rawCellValue(rowKey, storedValue)
  );
  const [localError, setLocalError] = useState<string | null>(null);
  const [hasFocus, setHasFocus] = useState(false);

  const prevStoredRef = useRef(storedValue);
  useEffect(() => {
    if (prevStoredRef.current !== storedValue && !hasFocus) {
      setRawText(rawCellValue(rowKey, storedValue));
      prevStoredRef.current = storedValue;
    }
  }, [storedValue, hasFocus, rowKey]);

  const handleIncrement = useCallback(() => {
    const fieldType = getFieldType(rowKey);
    let next: number;
    if (fieldType === "axis") {
      next = incrementAxis(storedValue as number | null);
    } else {
      next = incrementDiopter(storedValue as number | null);
    }
    setCellValue(colIndex, rowKey, next);
    setRawText(String(next));
    setLocalError(null);
  }, [colIndex, rowKey, storedValue, setCellValue]);

  const handleDecrement = useCallback(() => {
    const fieldType = getFieldType(rowKey);
    let next: number;
    if (fieldType === "axis") {
      next = decrementAxis(storedValue as number | null);
    } else {
      next = decrementDiopter(storedValue as number | null);
    }
    setCellValue(colIndex, rowKey, next);
    setRawText(String(next));
    setLocalError(null);
  }, [colIndex, rowKey, storedValue, setCellValue]);

  const handleClear = useCallback(() => {
    setRawText("");
    setLocalError(null);
    setCellValue(colIndex, rowKey, null);
  }, [colIndex, rowKey, setCellValue]);

  const handleKeyDown = useRefractionKeyboard({
    colIndex,
    rowKey,
    onClear:     handleClear,
    onIncrement: handleIncrement,
    onDecrement: handleDecrement,
  });

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      setRawText(raw);

      const { value, error: parseError } = parseCellValue(rowKey, raw);
      setLocalError(parseError);

      if (parseError === null) {
        setCellValue(colIndex, rowKey, value);
      }
    },
    [colIndex, rowKey, setCellValue]
  );

  const handleFocus = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      setHasFocus(true);
      setFocused({ colIndex, rowKey });
      const raw = rawCellValue(rowKey, storedValue);
      setRawText(raw);
      e.target.select();
    },
    [colIndex, rowKey, storedValue, setFocused]
  );

  const handleBlur = useCallback(() => {
    setHasFocus(false);
    const { value, error: parseError } = parseCellValue(rowKey, rawText);
    setLocalError(parseError);

    if (parseError === null && value !== null) {
      const formatted = rawCellValue(rowKey, value);
      setRawText(formatted);
      setCellValue(colIndex, rowKey, value);
    } else if (!rawText.trim()) {
      setRawText("");
    }
    flushSave(colIndex);
  }, [colIndex, rowKey, rawText, setCellValue, flushSave]);

  const displayValue = hasFocus
    ? rawText
    : storedValue !== null
    ? formatCellValue(rowKey, storedValue)
    : "";

  const fieldType     = getFieldType(rowKey);
  const hasError      = !!(error || localError);
  const hasValue      = storedValue !== null;
  const isAxisField   = fieldType === "axis";
  const isVAField     = fieldType === "va";

  return (
    <div className="relative">
      <input
        id={cellId(colIndex, rowKey)}
        type="text"
        inputMode={getInputMode(rowKey)}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        readOnly={isReadOnly}
        disabled={isReadOnly}
        value={displayValue}
        placeholder={hasFocus ? getPlaceholder(rowKey) : ""}
        aria-label={`${rowKey.replace("_", " ")} column ${colIndex + 1}`}
        aria-invalid={hasError}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className="w-full text-center outline-none transition-all"
        style={{
          fontFamily: "var(--font-mono), monospace",
          fontSize: isAxisField ? "0.875rem" : "0.95rem",
          fontWeight: hasValue ? "500" : "400",
          letterSpacing: isAxisField ? "0.08em" : isVAField ? "0" : "0.02em",
          height: "36px",
          padding: "0 8px",
          borderRadius: "5px",
          border: "1px solid",
          borderColor: hasError
            ? "rgba(248, 113, 113, 0.5)"
            : isFocused
            ? COL_ACCENT_FOCUS[colIndex]
            : COL_ACCENT_BORDER[colIndex],
          background: hasError
            ? "rgba(248, 113, 113, 0.06)"
            : isFocused
            ? `rgba(255, 255, 255, 0.04)`
            : COL_ACCENT[colIndex],
          color: hasError
            ? "var(--state-critical)"
            : hasValue
            ? "var(--text-primary)"
            : "var(--text-muted)",
          cursor: isReadOnly ? "default" : "text",
          boxShadow: isFocused
            ? `0 0 0 2px ${COL_ACCENT_FOCUS[colIndex]}22, inset 0 1px 2px rgba(0,0,0,0.2)`
            : "none",
        }}
      />
      {hasError && (localError || error) && (
        <ErrorTooltip message={localError ?? error ?? ""} />
      )}
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// ColumnHeader — column title + save status pip
// ─────────────────────────────────────────────────────────────────────────────

const ColumnHeader = memo(function ColumnHeader({
  colIndex,
  isFinalCol,
}: {
  colIndex:   number;
  isFinalCol: boolean;
}) {
  const { saveStatus, lastSavedAt, draft } = useColumnState(colIndex);
  const setFinalRx = useRefractionStore((s) => s.setFinalRx);
  const isReadOnly = useIsReadOnly();
  const type       = REFRACTION_COLUMNS[colIndex];
  const label      = REFRACTION_COLUMN_LABELS[type];

  return (
    <th
      className="pb-1 text-center"
      style={{
        minWidth: "110px",
        paddingLeft: "6px",
        paddingRight: "6px",
      }}
    >
      <div className="flex flex-col items-center gap-0.5">
        <div className="flex items-center justify-center gap-1.5">
          <span
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: isFinalCol ? "var(--state-warning)" : "var(--text-secondary)" }}
          >
            {label}
          </span>
          {isFinalCol && (
            <button
              title={draft.is_final_rx ? "Marked as final Rx" : "Mark as final Rx"}
              onClick={() => !isReadOnly && setFinalRx(colIndex, !draft.is_final_rx)}
              className="transition-all"
              aria-label="Toggle final prescription"
              aria-pressed={draft.is_final_rx}
              style={{
                color: draft.is_final_rx ? "var(--state-warning)" : "var(--text-muted)",
                fontSize: "11px",
                cursor: isReadOnly ? "default" : "pointer",
              }}
            >
              ★
            </button>
          )}
        </div>
        <SaveStatusPip status={saveStatus} lastSavedAt={lastSavedAt} />
      </div>
    </th>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// SectionRow — OD / OS / PD section header inside the <tbody>
// ─────────────────────────────────────────────────────────────────────────────

function SectionRow({
  section,
  colCount,
}: {
  section: "OD" | "OS" | "PD";
  colCount: number;
}) {
  const label: Record<typeof section, string> = {
    OD: "OD — Right Eye",
    OS: "OS — Left Eye",
    PD: "PD — Pupillary Distance",
  };

  return (
    <tr>
      <td
        colSpan={colCount + 1}
        style={{
          paddingTop: section === "OD" ? "8px" : "16px",
          paddingBottom: "4px",
        }}
      >
        <div className="flex items-center gap-3">
          <span
            className="text-[11px] font-bold uppercase tracking-wide"
            style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}
          >
            {label[section]}
          </span>
          <div
            className="flex-1 h-px"
            style={{ background: "var(--border-subtle)" }}
          />
        </div>
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RefractionGrid — main export
// ─────────────────────────────────────────────────────────────────────────────

export interface RefractionGridProps {
  encounterId:          string;
  initialRefractions?:  RefractionDraft[];
  isReadOnly?:          boolean;
}

export function RefractionGrid({
  encounterId,
  initialRefractions = [],
  isReadOnly = false,
}: RefractionGridProps) {
  const init          = useRefractionStore((s) => s.init);
  const focusedCell   = useRefractionStore((s) => s.focusedCell);
  const allErrors     = useRefractionStore((s) => s.columns.map((c) => c.errors));
  const isReadOnlyStore = useIsReadOnly();


  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    init(encounterId, initialRefractions, isReadOnly);
  }, [encounterId, init, initialRefractions, isReadOnly]);

  // No auto-focus — let the user click into the field they want.
  // Auto-focusing Habitual/SPH was hiding the loaded value on first render.

  const colCount = REFRACTION_COLUMNS.length;

  const getCellError = useCallback(
    (colIndex: number, rowKey: RowKey): string | undefined => {
      const errors = allErrors[colIndex];
      if (!errors.length) return undefined;
      const fieldPath = rowKey.replace("_", ".");
      const err = errors.find(
        (e) => e.field === fieldPath || e.field === `_column`
      );
      return err?.message;
    },
    [allErrors]
  );

  return (
    <div ref={gridRef} className="relative">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="section-title">
            Refraction
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
            Habitual → Auto → Manifest → Final Rx
          </p>
        </div>

        <div className="flex items-center gap-2">
          {allErrors.some((e) => e.length > 0) && (
            <span
              className="text-xs px-2 py-1 rounded"
              style={{
                background: "rgba(248, 113, 113, 0.1)",
                color: "var(--state-critical)",
                border: "1px solid rgba(248, 113, 113, 0.25)",
              }}
            >
              ⚠ Validation errors
            </span>
          )}
          {isReadOnly && (
            <span
              className="text-[11px] px-2 py-1 rounded font-medium uppercase tracking-wide"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-secondary)",
              }}
            >
              🔒 read-only
            </span>
          )}
        </div>
      </div>

      <div
        className="overflow-x-auto"
        role="grid"
        aria-label="Optical prescription entry grid"
        aria-readonly={isReadOnly || isReadOnlyStore}
      >
        <table
          className="w-full border-collapse"
          style={{ minWidth: "560px", tableLayout: "fixed" }}
        >
          <colgroup>
            <col style={{ width: "72px" }} />
            {REFRACTION_COLUMNS.map((_, i) => (
              <col key={i} style={{ minWidth: "110px" }} />
            ))}
          </colgroup>

          <thead>
            <tr>
              <th className="pb-3" />
              {REFRACTION_COLUMNS.map((_, colIndex) => (
                <ColumnHeader
                  key={colIndex}
                  colIndex={colIndex}
                  isFinalCol={colIndex === colCount - 1}
                />
              ))}
            </tr>
          </thead>

          <tbody>
            {ROW_KEYS.map((rowKey) => {
              const section = isSectionHeader(rowKey);
              const eye     = getEyeForRow(rowKey);
              const label   = ROW_LABELS[rowKey];
              const isPD    = eye === "binocular";

              return (
                <React.Fragment key={rowKey}>
                  {section && (
                    <SectionRow section={section} colCount={colCount} />
                  )}

                  <tr>
                    <td
                      className="pr-3 text-right align-middle"
                      style={{
                        paddingTop: "4px",
                        paddingBottom: "4px",
                        verticalAlign: "middle",
                      }}
                    >
                      <span
                        className="text-xs font-semibold uppercase tracking-wide"
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "11px",
                          color: "var(--text-secondary)",
                        }}
                      >
                        {label}
                      </span>
                    </td>

                    {REFRACTION_COLUMNS.map((_, colIndex) => {
                      const focused =
                        focusedCell?.colIndex === colIndex &&
                        focusedCell?.rowKey === rowKey;

                      return (
                        <td
                          key={colIndex}
                          className="align-middle"
                          style={{
                            padding: "4px 6px",
                          }}
                          role="gridcell"
                        >
                          <RxCell
                            colIndex={colIndex}
                            rowKey={rowKey}
                            isFocused={focused}
                            isReadOnly={isReadOnly || isReadOnlyStore}
                            error={getCellError(colIndex, rowKey)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {allErrors.some((e) => e.length > 0) && (
        <div className="mt-3 space-y-1">
          {allErrors.map((errors, colIndex) =>
            errors.map((err, i) => (
              <div
                key={`${colIndex}-${i}`}
                className="flex items-start gap-2 px-3 py-1.5 rounded text-xs animate-slide-down"
                style={{
                  background: "rgba(248, 113, 113, 0.07)",
                  border: "1px solid rgba(248, 113, 113, 0.20)",
                  color: "var(--state-critical)",
                }}
              >
                <span className="flex-shrink-0 font-bold">
                  {REFRACTION_COLUMN_LABELS[REFRACTION_COLUMNS[colIndex]]}:
                </span>
                <span>{err.message}</span>
              </div>
            ))
          )}
        </div>
      )}

    </div>
  );
}