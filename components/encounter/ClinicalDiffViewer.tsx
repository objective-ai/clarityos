"use client";

import { useState } from "react";
import { Undo2, ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiffEntry {
  old?: unknown;
  new?: unknown;
}

interface ClinicalDiffViewerProps {
  changes: Record<string, DiffEntry>;
  encounterId: string;
  onRevert?: (field: string, oldValue: unknown) => void;
  isReadOnly?: boolean;
}

// ---------------------------------------------------------------------------
// Human-readable field labels
// ---------------------------------------------------------------------------

const FIELD_LABELS: Record<string, string> = {
  chief_complaint: "Chief Complaint",

  // Vitals
  "vitals.iop_od": "IOP (Right Eye)",
  "vitals.iop_os": "IOP (Left Eye)",
  "vitals.va_od_distance": "VA Distance (OD)",
  "vitals.va_os_distance": "VA Distance (OS)",
  "vitals.va_od_near": "VA Near (OD)",
  "vitals.va_os_near": "VA Near (OS)",
  "vitals.bp_systolic": "Blood Pressure (Systolic)",
  "vitals.bp_diastolic": "Blood Pressure (Diastolic)",
  "vitals.pupils_od": "Pupils (OD)",
  "vitals.pupils_os": "Pupils (OS)",

  // Refraction
  "refraction.OD.sphere": "Rx Sphere (OD)",
  "refraction.OD.cylinder": "Rx Cylinder (OD)",
  "refraction.OD.axis": "Rx Axis (OD)",
  "refraction.OD.add": "Rx Add (OD)",
  "refraction.OS.sphere": "Rx Sphere (OS)",
  "refraction.OS.cylinder": "Rx Cylinder (OS)",
  "refraction.OS.axis": "Rx Axis (OS)",
  "refraction.OS.add": "Rx Add (OS)",
};

function getLabel(field: string): string {
  if (FIELD_LABELS[field]) return FIELD_LABELS[field];

  // Dynamic exam findings: exam.{section}.{eye}.{structure}.{field}
  if (field.startsWith("exam.")) {
    const parts = field.split(".");
    if (parts.length >= 5) {
      const structure = parts[3].replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      const eye = parts[2].toUpperCase();
      const fieldName = parts[4] === "finding" ? "Notes" : parts[4].replace(/\b\w/g, (c) => c.toUpperCase());
      return `${structure} (${eye}) ${fieldName}`;
    }
  }

  // Fallback — prettify dot notation
  return field.replace(/\./g, " > ").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(val: unknown): string {
  if (val == null || val === "") return "Empty";
  if (typeof val === "string") return val.length > 80 ? val.slice(0, 80) + "..." : val;
  return String(val);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ClinicalDiffViewer({
  changes,
  encounterId,
  onRevert,
  isReadOnly = false,
}: ClinicalDiffViewerProps) {
  const [expanded, setExpanded] = useState(true);

  const entries = Object.entries(changes);
  if (entries.length === 0) return null;

  // Separate diagnoses from field changes
  const diagnosisEntries = entries.filter(([k]) => k.startsWith("diagnoses."));
  const fieldEntries = entries.filter(([k]) => !k.startsWith("diagnoses."));

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center gap-1 text-[11px] font-medium hover:underline"
        style={{ color: "var(--accent)" }}
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {entries.length} change{entries.length !== 1 ? "s" : ""} by AI
      </button>

      {expanded && (
        <div
          className="mt-2 rounded-xl overflow-hidden text-[11px]"
          style={{ border: "1px solid var(--border-subtle)" }}
        >
          {/* Field-level changes */}
          {fieldEntries.map(([field, diff]) => (
            <div
              key={field}
              className="flex items-center gap-2 px-3 py-2 hover-row"
              style={{ borderBottom: "1px solid var(--border-subtle)" }}
            >
              {/* Label */}
              <span
                className="font-medium flex-shrink-0 min-w-[120px]"
                style={{ color: "var(--text-secondary)" }}
              >
                {getLabel(field)}
              </span>

              {/* Old value */}
              <span
                className="line-through flex-shrink-0 max-w-[140px] truncate"
                style={{ color: "var(--state-critical)", opacity: 0.8 }}
                title={formatValue(diff.old)}
              >
                {formatValue(diff.old)}
              </span>

              {/* Arrow */}
              <span style={{ color: "var(--text-muted)" }}>&rarr;</span>

              {/* New value */}
              <span
                className="font-semibold flex-1 truncate"
                style={{ color: "var(--state-normal)" }}
                title={formatValue(diff.new)}
              >
                {formatValue(diff.new)}
              </span>

              {/* Revert button */}
              {onRevert && !isReadOnly && diff.old !== undefined && (
                <button
                  type="button"
                  onClick={() => onRevert(field, diff.old)}
                  title="Revert to previous value"
                  className="flex-shrink-0 p-1 rounded-md hover:bg-[var(--bg-glass)] transition-colors"
                  style={{ color: "var(--text-muted)" }}
                >
                  <Undo2 size={12} />
                </button>
              )}
            </div>
          ))}

          {/* Diagnoses added */}
          {diagnosisEntries.length > 0 && (
            <div
              className="px-3 py-2"
              style={{ borderBottom: "1px solid var(--border-subtle)" }}
            >
              <span
                className="font-medium block mb-1.5"
                style={{ color: "var(--text-secondary)" }}
              >
                Diagnoses Added
              </span>
              <div className="flex flex-wrap gap-1.5">
                {diagnosisEntries.map(([field, diff]) => {
                  const dx = diff.new as { icdCode?: string; description?: string; laterality?: string } | undefined;
                  if (!dx) return null;
                  return (
                    <Badge key={field} variant="default" className="text-[10px]">
                      {dx.icdCode} {dx.laterality ? `(${dx.laterality})` : ""} — {dx.description}
                    </Badge>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
