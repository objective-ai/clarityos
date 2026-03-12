"use client";

import type {
  ScribeStructuredDataV2,
  ScribeVitalsV2,
  ScribeExamFindingsV2,
  ScribeStructureFindingV2,
  ScribeDiagnosisV2,
  ConfidenceLevel,
} from "@/types/scribe";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { RefractionMiniGrid } from "./RefractionMiniGrid";
import { DiagnosisPills } from "./DiagnosisPills";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FieldReviewerProps {
  data: ScribeStructuredDataV2;
  editMode: boolean;
  onChange: (updated: ScribeStructuredDataV2) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-overline mb-2 mt-5 first:mt-0">{children}</div>
  );
}

function FieldRow({
  label,
  value,
  confidence,
  editMode,
  onChange,
  placeholder,
  multiline,
}: {
  label: string;
  value: string | number | null | undefined;
  confidence?: ConfidenceLevel;
  editMode: boolean;
  onChange?: (val: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const display = value != null && value !== "" ? String(value) : "";

  return (
    <div className="flex items-start gap-2">
      <span className="text-[11px] text-[var(--text-muted)] w-20 shrink-0 pt-1.5 text-right">
        {label}
      </span>
      {editMode && onChange ? (
        multiline ? (
          <textarea
            value={display}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            rows={3}
            className="flex-1 px-2.5 py-1.5 rounded-lg text-xs glass-input resize-y min-h-[60px]"
          />
        ) : (
          <input
            type="text"
            value={display}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="flex-1 px-2.5 py-1.5 rounded-lg text-xs glass-input"
          />
        )
      ) : (
        <span className={`flex-1 text-xs px-2.5 py-1.5 rounded-lg ${display ? "text-[var(--text-primary)]" : "text-[var(--text-muted)] italic"}`}>
          {display || placeholder || "—"}
        </span>
      )}
      {confidence && <ConfidenceBadge level={confidence} className="mt-2" />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vitals Grid
// ---------------------------------------------------------------------------

function VitalsSection({
  vitals,
  editMode,
  onChange,
}: {
  vitals?: ScribeVitalsV2;
  editMode: boolean;
  onChange: (field: string, value: string) => void;
}) {
  if (!vitals) return null;

  const fields: { label: string; key: keyof ScribeVitalsV2; suffix?: string }[] = [
    { label: "VA OD", key: "va_od_distance" },
    { label: "VA OS", key: "va_os_distance" },
    { label: "Near OD", key: "va_od_near" },
    { label: "Near OS", key: "va_os_near" },
    { label: "IOP OD", key: "iop_od", suffix: " mmHg" },
    { label: "IOP OS", key: "iop_os", suffix: " mmHg" },
    { label: "BP Sys", key: "bp_systolic" },
    { label: "BP Dia", key: "bp_diastolic" },
    { label: "Pupils OD", key: "pupils_od" },
    { label: "Pupils OS", key: "pupils_os" },
  ];

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
      {fields.map(({ label, key }) => {
        const field = vitals[key];
        if (!field) return null;
        return (
          <FieldRow
            key={key}
            label={label}
            value={field.value}
            confidence={field.confidence}
            editMode={editMode}
            onChange={(val) => onChange(key, val)}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exam Findings Section
// ---------------------------------------------------------------------------

function ExamFindingsSection({
  title,
  findings,
  editMode,
  onChange,
}: {
  title: string;
  findings?: Record<string, Record<string, ScribeStructureFindingV2>>;
  editMode: boolean;
  onChange: (eye: string, structure: string, field: string, value: string) => void;
}) {
  if (!findings) return null;

  const eyes = Object.entries(findings);
  if (eyes.length === 0) return null;

  return (
    <>
      <SectionHeader>{title}</SectionHeader>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {eyes.map(([eye, structures]) => (
          <div key={eye} className="space-y-1">
            <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              {eye}
            </div>
            {Object.entries(structures).map(([structure, finding]) => (
              <div
                key={structure}
                className="flex items-center gap-2 px-2.5 py-1 rounded-lg"
              >
                <span className="text-[11px] text-[var(--text-muted)] w-28 shrink-0 truncate">
                  {structure.replace(/_/g, " ")}
                </span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${
                    finding.status === "normal"
                      ? "bg-[rgba(34,197,94,0.1)] text-[var(--state-normal)]"
                      : "bg-[rgba(239,68,68,0.1)] text-[var(--state-critical)]"
                  }`}
                >
                  {finding.status}
                </span>
                {finding.notes && (
                  editMode ? (
                    <input
                      type="text"
                      value={finding.notes}
                      onChange={(e) => onChange(eye, structure, "notes", e.target.value)}
                      className="flex-1 text-[11px] px-2 py-0.5 rounded glass-input"
                    />
                  ) : (
                    <span className="flex-1 text-[11px] text-[var(--text-secondary)] truncate">
                      {finding.notes}
                    </span>
                  )
                )}
                <ConfidenceBadge level={finding.confidence} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Main FieldReviewer
// ---------------------------------------------------------------------------

export function FieldReviewer({ data, editMode, onChange }: FieldReviewerProps) {
  // Deep-update helper: creates a new object with the updated path
  function updateData(updater: (draft: ScribeStructuredDataV2) => void) {
    const clone = structuredClone(data);
    updater(clone);
    onChange(clone);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--glass-border)]">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
          Proposed Fields
        </h3>
        {editMode && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-medium">
            Editing
          </span>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-1">
        {/* Chief Complaint */}
        <SectionHeader>Chief Complaint</SectionHeader>
        <FieldRow
          label="CC"
          value={data.chief_complaint.value}
          confidence={data.chief_complaint.confidence}
          editMode={editMode}
          onChange={(val) =>
            updateData((d) => {
              d.chief_complaint = { ...d.chief_complaint, value: val };
            })
          }
          placeholder="Chief complaint..."
        />

        {/* Vitals */}
        <SectionHeader>Vitals</SectionHeader>
        <VitalsSection
          vitals={data.vitals}
          editMode={editMode}
          onChange={(key, val) =>
            updateData((d) => {
              if (d.vitals) {
                const k = key as keyof ScribeVitalsV2;
                (d.vitals[k] as { value: string | number | null; confidence: ConfidenceLevel }).value = val;
              }
            })
          }
        />

        {/* Refraction */}
        <SectionHeader>Refraction</SectionHeader>
        <RefractionMiniGrid
          refraction={data.refraction}
          editMode={editMode}
          onChange={(eye, field, val) =>
            updateData((d) => {
              if (d.refraction?.[eye]) {
                (d.refraction[eye] as unknown as Record<string, string>)[field] = val;
              }
            })
          }
        />

        {/* Anterior Segment */}
        <ExamFindingsSection
          title="Anterior Segment"
          findings={data.exam_findings?.anterior as Record<string, Record<string, ScribeStructureFindingV2>> | undefined}
          editMode={editMode}
          onChange={(eye, structure, field, val) =>
            updateData((d) => {
              const section = d.exam_findings?.anterior;
              if (section) {
                const eyeData = section[eye as "OD" | "OS"];
                if (eyeData?.[structure]) {
                  (eyeData[structure] as unknown as Record<string, string>)[field] = val;
                }
              }
            })
          }
        />

        {/* Posterior Segment */}
        <ExamFindingsSection
          title="Posterior Segment"
          findings={data.exam_findings?.posterior as Record<string, Record<string, ScribeStructureFindingV2>> | undefined}
          editMode={editMode}
          onChange={(eye, structure, field, val) =>
            updateData((d) => {
              const section = d.exam_findings?.posterior;
              if (section) {
                const eyeData = section[eye as "OD" | "OS"];
                if (eyeData?.[structure]) {
                  (eyeData[structure] as unknown as Record<string, string>)[field] = val;
                }
              }
            })
          }
        />

        {/* Diagnoses */}
        <SectionHeader>Diagnoses</SectionHeader>
        <DiagnosisPills
          diagnoses={data.diagnoses ?? []}
          editMode={editMode}
          onRemove={(index) =>
            updateData((d) => {
              d.diagnoses = d.diagnoses?.filter((_, i) => i !== index);
            })
          }
          onUpdate={(index, updated) =>
            updateData((d) => {
              if (d.diagnoses?.[index]) {
                Object.assign(d.diagnoses[index], updated);
              }
            })
          }
        />

        {/* Assessment & Plan */}
        <SectionHeader>Assessment & Plan</SectionHeader>
        <FieldRow
          label="A&P"
          value={data.assessment_and_plan.value}
          confidence={data.assessment_and_plan.confidence}
          editMode={editMode}
          onChange={(val) =>
            updateData((d) => {
              d.assessment_and_plan = { ...d.assessment_and_plan, value: val };
            })
          }
          placeholder="Assessment and plan..."
          multiline
        />
      </div>
    </div>
  );
}
