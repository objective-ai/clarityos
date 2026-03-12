"use client";

/**
 * components/encounter/validation-station/DiagnosisPills.tsx
 *
 * Clickable ICD-10 diagnosis pills for the AI Scribe Validation Station.
 *
 * Read mode
 *   [H52.13 — Myopia, bilateral — OU]  [confidence dot]
 *
 * Edit mode
 *   Same pill, but:
 *     - Clicking the code/description area opens inline text inputs
 *     - A × remove button is visible at the end of each pill
 *
 * Laterality colour coding (matches DiagnosisPicker.tsx convention):
 *   OD → blue   (#93C5FD border, #DBEAFE bg, #1E40AF text)
 *   OS → purple (#C4B5FD border, #EDE9FE bg, #5B21B6 text)
 *   OU → teal   (#5EEAD4 border, #CCFBF1 bg, #115E59 text)
 */

import { useState } from "react";
import { ConfidenceBadge } from "./ConfidenceBadge";
import type { ScribeDiagnosisV2 } from "@/types/scribe";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface DiagnosisPillsProps {
  diagnoses: ScribeDiagnosisV2[];
  editMode: boolean;
  onRemove: (index: number) => void;
  onUpdate: (index: number, updated: Partial<ScribeDiagnosisV2>) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Laterality styling (consistent with DiagnosisPicker)
// ─────────────────────────────────────────────────────────────────────────────

const LATERALITY_STYLE: Record<
  ScribeDiagnosisV2["laterality"],
  { border: string; bg: string; text: string; pillBorder: string }
> = {
  OD: {
    border: "#93C5FD",
    bg: "#DBEAFE",
    text: "#1E40AF",
    pillBorder: "rgba(147, 197, 253, 0.35)",
  },
  OS: {
    border: "#C4B5FD",
    bg: "#EDE9FE",
    text: "#5B21B6",
    pillBorder: "rgba(196, 181, 253, 0.35)",
  },
  OU: {
    border: "#5EEAD4",
    bg: "#CCFBF1",
    text: "#115E59",
    pillBorder: "rgba(94, 234, 212, 0.35)",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// LateralityBadge — small coloured chip inside each pill
// ─────────────────────────────────────────────────────────────────────────────

function LateralityBadge({
  laterality,
}: {
  laterality: ScribeDiagnosisV2["laterality"];
}) {
  const s = LATERALITY_STYLE[laterality];
  return (
    <span
      className="inline-flex items-center justify-center rounded-full text-[10px] font-bold font-mono tracking-wide flex-shrink-0"
      style={{
        background: s.bg,
        color: s.text,
        border: `1px solid ${s.border}`,
        minWidth: 26,
        height: 18,
        paddingLeft: 5,
        paddingRight: 5,
      }}
      aria-label={
        laterality === "OD"
          ? "Right eye"
          : laterality === "OS"
          ? "Left eye"
          : "Both eyes"
      }
    >
      {laterality}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DiagnosisPill — single pill, handles its own "is editing" local state
// ─────────────────────────────────────────────────────────────────────────────

function DiagnosisPill({
  dx,
  index,
  editMode,
  onRemove,
  onUpdate,
}: {
  dx: ScribeDiagnosisV2;
  index: number;
  editMode: boolean;
  onRemove: (index: number) => void;
  onUpdate: (index: number, updated: Partial<ScribeDiagnosisV2>) => void;
}) {
  const [isInlineEditing, setIsInlineEditing] = useState(false);
  const [draftCode, setDraftCode] = useState(dx.icdCode);
  const [draftDesc, setDraftDesc] = useState(dx.description);

  const s = LATERALITY_STYLE[dx.laterality];

  function commitEdit() {
    const trimCode = draftCode.trim();
    const trimDesc = draftDesc.trim();
    if (trimCode !== dx.icdCode || trimDesc !== dx.description) {
      onUpdate(index, {
        icdCode: trimCode || dx.icdCode,
        description: trimDesc || dx.description,
      });
    }
    setIsInlineEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitEdit();
    }
    if (e.key === "Escape") {
      setDraftCode(dx.icdCode);
      setDraftDesc(dx.description);
      setIsInlineEditing(false);
    }
  }

  // When entering inline-edit mode, sync draft values with current props
  function handlePillClick() {
    if (!editMode || isInlineEditing) return;
    setDraftCode(dx.icdCode);
    setDraftDesc(dx.description);
    setIsInlineEditing(true);
  }

  const pillBorderColor = isInlineEditing
    ? "var(--accent)"
    : s.pillBorder;

  const pillBoxShadow = isInlineEditing
    ? "0 0 0 2px var(--accent-dim)"
    : "none";

  return (
    <div
      role={editMode && !isInlineEditing ? "button" : undefined}
      tabIndex={editMode && !isInlineEditing ? 0 : undefined}
      onClick={handlePillClick}
      onKeyDown={
        editMode && !isInlineEditing
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handlePillClick();
              }
            }
          : undefined
      }
      className="inline-flex items-center gap-1.5 max-w-full"
      style={{
        background: "var(--bg-elevated)",
        border: `1px solid ${pillBorderColor}`,
        borderRadius: 999,
        padding: "4px 10px 4px 8px",
        boxShadow: pillBoxShadow,
        cursor: editMode && !isInlineEditing ? "pointer" : "default",
        transition: "border-color 150ms ease, box-shadow 150ms ease",
        minWidth: 0,
      }}
      aria-label={`Diagnosis: ${dx.icdCode} — ${dx.description} (${dx.laterality})`}
    >
      {/* ICD code + description */}
      {isInlineEditing ? (
        // Inline edit: two small text inputs side-by-side
        <span className="flex items-center gap-1.5 min-w-0">
          <input
            autoFocus
            type="text"
            value={draftCode}
            onChange={(e) => setDraftCode(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={commitEdit}
            className="rounded outline-none text-center"
            style={{
              fontFamily: "var(--font-mono), monospace",
              fontSize: 11,
              fontWeight: 700,
              width: 72,
              height: 22,
              padding: "0 4px",
              background: "var(--bg-overlay)",
              border: "1px solid var(--accent)",
              color: "var(--accent)",
              letterSpacing: "0.03em",
            }}
            aria-label="Edit ICD-10 code"
          />
          <span style={{ color: "var(--border-strong)", fontSize: 10 }}>—</span>
          <input
            type="text"
            value={draftDesc}
            onChange={(e) => setDraftDesc(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={commitEdit}
            className="rounded outline-none"
            style={{
              fontFamily: "inherit",
              fontSize: 11,
              fontWeight: 400,
              minWidth: 80,
              maxWidth: 200,
              width: "14ch",
              height: 22,
              padding: "0 4px",
              background: "var(--bg-overlay)",
              border: "1px solid var(--border-default)",
              color: "var(--text-primary)",
            }}
            aria-label="Edit diagnosis description"
          />
        </span>
      ) : (
        // Read display
        <span className="flex items-center gap-1.5 min-w-0">
          <span
            className="font-mono font-bold flex-shrink-0"
            style={{
              fontSize: 11,
              color: "var(--accent)",
              letterSpacing: "0.03em",
            }}
          >
            {dx.icdCode}
          </span>
          <span
            className="flex-shrink-0"
            style={{ color: "var(--text-muted)", fontSize: 10 }}
          >
            —
          </span>
          <span
            className="truncate"
            style={{
              fontSize: 11,
              color: "var(--text-secondary)",
              maxWidth: 180,
            }}
            title={dx.description}
          >
            {dx.description}
          </span>
        </span>
      )}

      {/* Laterality badge */}
      <LateralityBadge laterality={dx.laterality} />

      {/* Confidence badge */}
      <ConfidenceBadge level={dx.confidence} className="flex-shrink-0" />

      {/* Remove button — only in edit mode */}
      {editMode && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(index);
          }}
          className="hover-danger flex-shrink-0 flex items-center justify-center rounded-full transition-colors"
          style={{
            width: 16,
            height: 16,
            marginLeft: 2,
            color: "var(--text-muted)",
            background: "transparent",
            border: "none",
            padding: 0,
            lineHeight: 1,
            fontSize: 13,
            cursor: "pointer",
          }}
          aria-label={`Remove diagnosis ${dx.icdCode}`}
        >
          &times;
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DiagnosisPills — main export
// ─────────────────────────────────────────────────────────────────────────────

export function DiagnosisPills({
  diagnoses,
  editMode,
  onRemove,
  onUpdate,
}: DiagnosisPillsProps) {
  if (diagnoses.length === 0) {
    return (
      <p
        className="text-caption"
        style={{ color: "var(--text-muted)", fontStyle: "italic" }}
      >
        No diagnoses extracted
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {diagnoses.map((dx, i) => (
        <DiagnosisPill
          key={i}
          dx={dx}
          index={i}
          editMode={editMode}
          onRemove={onRemove}
          onUpdate={onUpdate}
        />
      ))}
    </div>
  );
}
