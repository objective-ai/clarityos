"use client";

/**
 * components/encounter/validation-station/RefractionMiniGrid.tsx
 *
 * Compact 2-row (OD / OS) x 4-column (Sph | Cyl | Axis | Add) refraction grid
 * for the AI Scribe Validation Station right-pane.
 *
 * Read mode  — values render as monospaced text, confidence badge per row.
 * Edit mode  — each cell becomes a small glass-style text input.
 *
 * Props
 * ─────
 *   refraction  — { OD?, OS? } from ScribeRefractionV2 (scribe.ts)
 *   editMode    — boolean toggle from parent ValidationStation
 *   onChange    — (eye, field, value) callback; parent owns the draft state
 */

import { ConfidenceBadge } from "./ConfidenceBadge";
import type { ScribeEyeRefractionV2 } from "@/types/scribe";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface RefractionMiniGridProps {
  refraction?: {
    OD?: ScribeEyeRefractionV2;
    OS?: ScribeEyeRefractionV2;
  };
  editMode: boolean;
  onChange: (eye: "OD" | "OS", field: string, value: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Column definitions
// ─────────────────────────────────────────────────────────────────────────────

const COLUMNS: { key: keyof Omit<ScribeEyeRefractionV2, "confidence">; label: string }[] = [
  { key: "sphere",   label: "Sph" },
  { key: "cylinder", label: "Cyl" },
  { key: "axis",     label: "Axis" },
  { key: "add",      label: "Add" },
];

const EYES: Array<"OD" | "OS"> = ["OD", "OS"];

const EYE_LABEL: Record<"OD" | "OS", string> = {
  OD: "OD",
  OS: "OS",
};

// ─────────────────────────────────────────────────────────────────────────────
// CellInput — inline edit input for a single refraction field
// ─────────────────────────────────────────────────────────────────────────────

function CellInput({
  value,
  eye,
  field,
  onChange,
}: {
  value: string;
  eye: "OD" | "OS";
  field: string;
  onChange: (eye: "OD" | "OS", field: string, value: string) => void;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(eye, field, e.target.value)}
      className="w-full text-center outline-none rounded"
      style={{
        fontFamily: "var(--font-mono), monospace",
        fontSize: 12,
        fontWeight: 500,
        height: 28,
        padding: "0 4px",
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-default)",
        borderLeft: "2px solid var(--accent)",
        color: value ? "var(--text-primary)" : "var(--text-muted)",
        transition: "border-color 150ms ease, box-shadow 150ms ease",
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = "var(--accent)";
        e.currentTarget.style.boxShadow = "0 0 0 2px var(--accent-dim)";
        e.currentTarget.select();
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = "var(--border-default)";
        e.currentTarget.style.boxShadow = "none";
      }}
      aria-label={`${eye} ${field}`}
      placeholder="—"
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CellValue — read-only display for a single refraction field
// ─────────────────────────────────────────────────────────────────────────────

function CellValue({ value }: { value: string }) {
  const isEmpty = !value || value.trim() === "";
  return (
    <span
      className="block w-full text-center tabular-nums"
      style={{
        fontFamily: "var(--font-mono), monospace",
        fontSize: 12,
        fontWeight: isEmpty ? 400 : 600,
        color: isEmpty ? "var(--text-muted)" : "var(--text-primary)",
        letterSpacing: "0.03em",
      }}
    >
      {isEmpty ? "—" : value}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EyeRow — one full row (OD or OS) with 4 data cells + confidence badge
// ─────────────────────────────────────────────────────────────────────────────

function EyeRow({
  eye,
  eyeData,
  editMode,
  onChange,
}: {
  eye: "OD" | "OS";
  eyeData: ScribeEyeRefractionV2 | undefined;
  editMode: boolean;
  onChange: RefractionMiniGridProps["onChange"];
}) {
  const isOD = eye === "OD";

  return (
    <tr>
      {/* Eye label */}
      <td
        className="pr-2 text-right align-middle whitespace-nowrap"
        style={{ width: 32 }}
      >
        <span
          className="inline-flex items-center justify-center rounded px-1.5 text-[10px] font-bold uppercase tracking-wide"
          style={{
            fontFamily: "var(--font-mono), monospace",
            background: isOD
              ? "rgba(96, 165, 250, 0.12)"
              : "rgba(167, 139, 250, 0.12)",
            color: isOD ? "#60A5FA" : "#A78BFA",
            border: isOD
              ? "1px solid rgba(96, 165, 250, 0.25)"
              : "1px solid rgba(167, 139, 250, 0.25)",
            minWidth: 26,
            height: 20,
          }}
        >
          {EYE_LABEL[eye]}
        </span>
      </td>

      {/* Data cells */}
      {COLUMNS.map(({ key }) => {
        const cellValue = eyeData?.[key] ?? "";
        return (
          <td
            key={key}
            className="align-middle"
            style={{ padding: "3px 3px" }}
          >
            {editMode ? (
              <CellInput
                value={cellValue}
                eye={eye}
                field={key}
                onChange={onChange}
              />
            ) : (
              <CellValue value={cellValue} />
            )}
          </td>
        );
      })}

      {/* Confidence badge */}
      <td className="pl-2 align-middle" style={{ width: 24 }}>
        {eyeData ? (
          <ConfidenceBadge level={eyeData.confidence} />
        ) : (
          <span
            className="inline-block rounded-full"
            style={{ width: 7, height: 7, background: "var(--border-default)" }}
            title="No data"
          />
        )}
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RefractionMiniGrid — main export
// ─────────────────────────────────────────────────────────────────────────────

export function RefractionMiniGrid({
  refraction,
  editMode,
  onChange,
}: RefractionMiniGridProps) {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: "var(--bg-glass)",
        border: "1px solid var(--glass-border)",
      }}
    >
      <table className="w-full border-collapse" style={{ tableLayout: "fixed" }}>
        {/* Column widths */}
        <colgroup>
          <col style={{ width: 34 }} />
          {COLUMNS.map((c) => (
            <col key={c.key} />
          ))}
          <col style={{ width: 28 }} />
        </colgroup>

        {/* Header */}
        <thead>
          <tr
            style={{
              borderBottom: "1px solid var(--border-subtle)",
            }}
          >
            {/* blank corner above eye-label column */}
            <th />

            {COLUMNS.map(({ key, label }) => (
              <th
                key={key}
                className="text-center pb-1.5 pt-2"
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.07em",
                  color: "var(--text-muted)",
                }}
              >
                {label}
              </th>
            ))}

            {/* blank corner above badge column */}
            <th />
          </tr>
        </thead>

        {/* Body */}
        <tbody>
          {EYES.map((eye, i) => (
            <tr
              key={eye}
              style={
                i < EYES.length - 1
                  ? { borderBottom: "1px solid var(--border-subtle)" }
                  : undefined
              }
            >
              {/* Eye label */}
              <td
                className="pr-2 text-right align-middle whitespace-nowrap"
                style={{ paddingTop: 6, paddingBottom: 6, paddingLeft: 8, width: 34 }}
              >
                <span
                  className="inline-flex items-center justify-center rounded text-[10px] font-bold uppercase tracking-wide"
                  style={{
                    fontFamily: "var(--font-mono), monospace",
                    background:
                      eye === "OD"
                        ? "rgba(96, 165, 250, 0.12)"
                        : "rgba(167, 139, 250, 0.12)",
                    color: eye === "OD" ? "#60A5FA" : "#A78BFA",
                    border:
                      eye === "OD"
                        ? "1px solid rgba(96, 165, 250, 0.25)"
                        : "1px solid rgba(167, 139, 250, 0.25)",
                    minWidth: 26,
                    height: 20,
                    paddingLeft: 6,
                    paddingRight: 6,
                  }}
                >
                  {eye}
                </span>
              </td>

              {/* Data cells */}
              {COLUMNS.map(({ key }) => {
                const eyeData = refraction?.[eye];
                const cellValue = eyeData?.[key] ?? "";
                return (
                  <td
                    key={key}
                    className="align-middle"
                    style={{ padding: "4px 3px" }}
                  >
                    {editMode ? (
                      <CellInput
                        value={cellValue}
                        eye={eye}
                        field={key}
                        onChange={onChange}
                      />
                    ) : (
                      <CellValue value={cellValue} />
                    )}
                  </td>
                );
              })}

              {/* Confidence badge */}
              <td
                className="align-middle text-center"
                style={{ paddingRight: 8, width: 28 }}
              >
                {refraction?.[eye] ? (
                  <ConfidenceBadge level={refraction[eye]!.confidence} />
                ) : (
                  <span
                    className="inline-block rounded-full"
                    style={{
                      width: 7,
                      height: 7,
                      background: "var(--border-default)",
                    }}
                    title="No data"
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
