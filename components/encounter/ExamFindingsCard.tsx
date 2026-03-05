"use client";

import { useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import {
  useExamFindingsStore,
  useFindingsState,
} from "@/store/examFindingsStore";
import { getFieldMeta } from "@/lib/exam-findings-fields";
import type { ExamSection, FindingsDraft } from "@/types/exam-findings";

// ---------------------------------------------------------------------------
// Section metadata
// ---------------------------------------------------------------------------

const SECTIONS: { key: ExamSection; label: string }[] = [
  { key: "anterior_segment", label: "Anterior Segment" },
  { key: "posterior_segment", label: "Posterior Segment" },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ExamFindingsCardProps {
  encounterId: string;
  initialAnterior?: Partial<FindingsDraft>;
  initialPosterior?: Partial<FindingsDraft>;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ExamFindingsCard({
  encounterId,
  initialAnterior,
  initialPosterior,
}: ExamFindingsCardProps) {
  const store = useExamFindingsStore();

  useEffect(() => {
    store.init(encounterId, "anterior_segment", initialAnterior);
    store.init(encounterId, "posterior_segment", initialPosterior);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encounterId]);

  return (
    <div className="space-y-3">
      <h2 className="section-title">Exam Findings</h2>
      {SECTIONS.map((sec) => (
        <ReadOnlySection
          key={sec.key}
          encounterId={encounterId}
          section={sec.key}
          label={sec.label}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Read-only section
// ---------------------------------------------------------------------------

function ReadOnlySection({
  encounterId,
  section,
  label,
}: {
  encounterId: string;
  section: ExamSection;
  label: string;
}) {
  const state = useFindingsState(encounterId, section);
  const fields = getFieldMeta(section);

  if (!state) return null;

  const { draft } = state;

  // If WNL, show compact summary
  if (draft.is_normal_wnl) {
    return (
      <div className="rounded-xl bg-[var(--bg-glass)] border border-[var(--glass-border)] px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="text-overline text-[var(--text-primary)]">{label}</span>
          <Badge variant="success">WNL</Badge>
        </div>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          All structures within normal limits
        </p>
        {draft.provider_notes && (
          <p className="text-xs text-[var(--text-secondary)] mt-2 italic">
            {draft.provider_notes}
          </p>
        )}
      </div>
    );
  }

  // Show only abnormal findings
  const abnormals = fields.filter((field) => {
    const od = draft.findings_od[field.key];
    const os = draft.findings_os[field.key];
    return (
      (od && od.status !== field.defaultStatus) ||
      (os && os.status !== field.defaultStatus)
    );
  });

  const normals = fields.filter((field) => {
    const od = draft.findings_od[field.key];
    const os = draft.findings_os[field.key];
    return (
      (!od || od.status === field.defaultStatus) &&
      (!os || os.status === field.defaultStatus)
    );
  });

  return (
    <div className="rounded-xl bg-[var(--bg-glass)] border border-[var(--glass-border)] px-5 py-3">
      <span className="text-overline text-[var(--text-primary)]">{label}</span>

      {/* Normal structures summary */}
      {normals.length > 0 && (
        <p className="text-xs text-[var(--text-muted)] mt-1">
          WNL: {normals.map((f) => f.label).join(", ")}
        </p>
      )}

      {/* Abnormal findings detail */}
      {abnormals.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {abnormals.map((field) => {
            const od = draft.findings_od[field.key];
            const os = draft.findings_os[field.key];
            const odAbnormal = od && od.status !== field.defaultStatus;
            const osAbnormal = os && os.status !== field.defaultStatus;

            return (
              <div
                key={field.key}
                className="flex items-start gap-2 text-xs"
              >
                <span className="font-medium text-[var(--text-secondary)] min-w-[100px]">
                  {field.label}:
                </span>
                <div className="flex gap-3">
                  {odAbnormal && (
                    <span>
                      <Badge variant="warning" className="mr-1">OD</Badge>
                      {od.status}
                      {od.finding && ` — ${od.finding}`}
                    </span>
                  )}
                  {osAbnormal && (
                    <span>
                      <Badge variant="warning" className="mr-1">OS</Badge>
                      {os.status}
                      {os.finding && ` — ${os.finding}`}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {draft.provider_notes && (
        <p className="text-xs text-[var(--text-secondary)] mt-2 italic">
          {draft.provider_notes}
        </p>
      )}
    </div>
  );
}
