"use client";

import { useEffect, useState } from "react";
import { Shield, AlertTriangle, FileText, Eye, Stethoscope, Pill } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useEncounterStore } from "@/store/encounterStore";
import { useVitalsDraft } from "@/store/vitalsStore";
import { isIopElevated } from "@/types/vitals";
import { useDiagnoses } from "@/store/diagnosisStore";
import { useRefractionStore } from "@/store/refractionStore";
import { formatDiopter, formatAxis, formatAdd } from "@/lib/rx-format";
import { apiFetch } from "@/lib/api-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FinalizeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  encounterId: string;
  providerName: string;
}

// ---------------------------------------------------------------------------
// Summary Section wrapper
// ---------------------------------------------------------------------------

function SummarySection({
  title,
  icon,
  children,
  warning,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  warning?: string;
}) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ border: "1px solid var(--border-subtle)" }}
    >
      <div className="flex items-center justify-between mb-2">
        <div
          className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide"
          style={{ color: "var(--text-secondary)" }}
        >
          {icon}
          {title}
        </div>
        {warning && (
          <Badge variant="outline" className="text-[10px] gap-1" style={{ color: "var(--state-caution)" }}>
            <AlertTriangle size={10} />
            {warning}
          </Badge>
        )}
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rx value display helper
// ---------------------------------------------------------------------------

function RxValue({ value, formatter }: { value: number | null; formatter: (v: number | null) => string }) {
  const text = formatter(value);
  return (
    <span className="font-mono text-xs" style={{ color: text ? "var(--text-primary)" : "var(--text-muted)" }}>
      {text || "\u2014"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FinalizeModal({
  open,
  onOpenChange,
  encounterId,
  providerName,
}: FinalizeModalProps) {
  // ── Internal state ──────────────────────────────────────────────────────
  const [assessmentPlan, setAssessmentPlan] = useState("");
  const [attested, setAttested] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // ── Store reads ─────────────────────────────────────────────────────────
  const chiefComplaint = useEncounterStore(
    (s) => s.encounters[encounterId]?.chiefComplaint ?? ""
  );
  const finalizeEncounter = useEncounterStore((s) => s.finalizeEncounter);
  const setFinalizeModalOpen = useEncounterStore((s) => s.setFinalizeModalOpen);

  const vitalsDraft = useVitalsDraft(encounterId);
  const allDiagnoses = useDiagnoses(encounterId);
  const activeDiagnoses = allDiagnoses.filter((dx) => dx.status === "Active");
  const finalRxDraft = useRefractionStore((s) => s.columns[3]?.draft);

  // ── Derived ─────────────────────────────────────────────────────────────
  const hasIop = vitalsDraft?.iop_od != null || vitalsDraft?.iop_os != null;
  const hasBp = !!vitalsDraft?.blood_pressure;
  const vitalsEmpty = !hasIop && !hasBp;
  const hasDiagnoses = activeDiagnoses.length > 0;
  const hasRx =
    finalRxDraft?.od?.sphere != null ||
    finalRxDraft?.os?.sphere != null;

  const canSubmit =
    attested &&
    assessmentPlan.trim().length >= 10 &&
    hasDiagnoses &&
    !isSubmitting;

  // ── Reset on close ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) {
      setAssessmentPlan("");
      setAttested(false);
      setIsSubmitting(false);
      setErrorMessage(null);
    }
  }, [open]);

  // ── Submit handler ──────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await apiFetch<{
        signed_by_name?: string;
        signed_at?: string;
      }>(`/api/encounters/${encounterId}/finalize`, {
        method: "POST",
        body: JSON.stringify({
          assessment_and_plan: assessmentPlan.trim(),
        }),
      });

      finalizeEncounter(
        encounterId,
        response.signed_by_name ?? providerName,
        response.signed_at ?? new Date().toISOString()
      );
      setFinalizeModalOpen(false);
    } catch (err) {
      // Dev fallback — finalize locally when backend is unreachable
      if (process.env.NODE_ENV === "development") {
        finalizeEncounter(
          encounterId,
          providerName,
          new Date().toISOString()
        );
        setFinalizeModalOpen(false);
        return;
      }
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to finalize encounter"
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl flex flex-col"
        style={{ maxHeight: "85vh" }}
      >
        <DialogHeader className="px-6 pt-6 pb-0 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Shield size={20} style={{ color: "var(--accent)" }} />
            <DialogTitle className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
              Sign &amp; Finalize Encounter
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs" style={{ color: "var(--text-muted)" }}>
            Review the clinical summary below. This action is irreversible &mdash; all fields will become read-only.
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable summary */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {/* 1. Chief Complaint */}
          <SummarySection
            title="Chief Complaint"
            icon={<FileText size={13} />}
          >
            {chiefComplaint ? (
              <p className="text-sm" style={{ color: "var(--text-primary)" }}>
                {chiefComplaint}
              </p>
            ) : (
              <p className="text-sm italic" style={{ color: "var(--text-muted)" }}>
                Not recorded
              </p>
            )}
          </SummarySection>

          {/* 2. Vitals */}
          <SummarySection
            title="Vitals"
            icon={<Stethoscope size={13} />}
            warning={vitalsEmpty ? "Not Recorded" : undefined}
          >
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-[11px] block mb-0.5" style={{ color: "var(--text-muted)" }}>
                  IOP (OD)
                </span>
                <span
                  className="font-medium"
                  style={{
                    color: isIopElevated(vitalsDraft?.iop_od ?? null)
                      ? "var(--state-critical)"
                      : "var(--text-primary)",
                  }}
                >
                  {vitalsDraft?.iop_od != null ? `${vitalsDraft.iop_od} mmHg` : "\u2014"}
                </span>
              </div>
              <div>
                <span className="text-[11px] block mb-0.5" style={{ color: "var(--text-muted)" }}>
                  IOP (OS)
                </span>
                <span
                  className="font-medium"
                  style={{
                    color: isIopElevated(vitalsDraft?.iop_os ?? null)
                      ? "var(--state-critical)"
                      : "var(--text-primary)",
                  }}
                >
                  {vitalsDraft?.iop_os != null ? `${vitalsDraft.iop_os} mmHg` : "\u2014"}
                </span>
              </div>
              <div>
                <span className="text-[11px] block mb-0.5" style={{ color: "var(--text-muted)" }}>
                  Blood Pressure
                </span>
                <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                  {vitalsDraft?.blood_pressure ?? "\u2014"}
                </span>
              </div>
            </div>
          </SummarySection>

          {/* 3. Diagnoses */}
          <SummarySection
            title="Diagnoses"
            icon={<Eye size={13} />}
            warning={!hasDiagnoses ? "Required" : undefined}
          >
            {hasDiagnoses ? (
              <div className="space-y-1.5">
                {activeDiagnoses.map((dx) => (
                  <div
                    key={dx.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <Badge variant="secondary" className="text-[10px] font-mono flex-shrink-0">
                      {dx.icd10Code}
                    </Badge>
                    <span style={{ color: "var(--text-primary)" }}>
                      {dx.description}
                    </span>
                    {dx.eyeAffected && (
                      <Badge variant="outline" className="text-[10px] flex-shrink-0">
                        {dx.eyeAffected}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm" style={{ color: "var(--state-caution)" }}>
                At least one ICD-10 diagnosis is required to finalize this encounter.
              </p>
            )}
          </SummarySection>

          {/* 4. Final Rx */}
          <SummarySection
            title="Final Refraction"
            icon={<Pill size={13} />}
            warning={!hasRx ? "Not Recorded" : undefined}
          >
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left text-[11px] font-medium pb-1" style={{ color: "var(--text-muted)" }} />
                  <th className="text-center text-[11px] font-medium pb-1" style={{ color: "var(--text-muted)" }}>Sph</th>
                  <th className="text-center text-[11px] font-medium pb-1" style={{ color: "var(--text-muted)" }}>Cyl</th>
                  <th className="text-center text-[11px] font-medium pb-1" style={{ color: "var(--text-muted)" }}>Axis</th>
                  <th className="text-center text-[11px] font-medium pb-1" style={{ color: "var(--text-muted)" }}>Add</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="pr-3 font-medium" style={{ color: "var(--text-secondary)" }}>OD</td>
                  <td className="text-center"><RxValue value={finalRxDraft?.od?.sphere ?? null} formatter={formatDiopter} /></td>
                  <td className="text-center"><RxValue value={finalRxDraft?.od?.cylinder ?? null} formatter={formatDiopter} /></td>
                  <td className="text-center"><RxValue value={finalRxDraft?.od?.axis ?? null} formatter={formatAxis} /></td>
                  <td className="text-center"><RxValue value={finalRxDraft?.od?.add ?? null} formatter={formatAdd} /></td>
                </tr>
                <tr>
                  <td className="pr-3 font-medium" style={{ color: "var(--text-secondary)" }}>OS</td>
                  <td className="text-center"><RxValue value={finalRxDraft?.os?.sphere ?? null} formatter={formatDiopter} /></td>
                  <td className="text-center"><RxValue value={finalRxDraft?.os?.cylinder ?? null} formatter={formatDiopter} /></td>
                  <td className="text-center"><RxValue value={finalRxDraft?.os?.axis ?? null} formatter={formatAxis} /></td>
                  <td className="text-center"><RxValue value={finalRxDraft?.os?.add ?? null} formatter={formatAdd} /></td>
                </tr>
              </tbody>
            </table>
          </SummarySection>

          {/* 5. Assessment & Plan */}
          <SummarySection
            title="Assessment & Plan"
            icon={<FileText size={13} />}
          >
            <textarea
              value={assessmentPlan}
              onChange={(e) => setAssessmentPlan(e.target.value)}
              placeholder="Clinical assessment and plan (min 10 characters)..."
              rows={4}
              className="w-full rounded-xl px-4 py-3 text-sm resize-none input-focus placeholder:text-[var(--text-muted)]"
              style={{
                background: "var(--bg-glass)",
                color: "var(--text-primary)",
                border: "1px solid var(--glass-border)",
              }}
            />
            <span className="text-[10px] block text-right mt-1" style={{ color: "var(--text-muted)" }}>
              {assessmentPlan.trim().length}/10 min
            </span>
          </SummarySection>
        </div>

        {/* Fixed footer */}
        <div
          className="flex-shrink-0 px-6 pb-6 pt-4 space-y-4"
          style={{ borderTop: "1px solid var(--border-subtle)" }}
        >
          {/* Attestation */}
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={attested}
              onChange={(e) => setAttested(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded"
              style={{ accentColor: "var(--accent)" }}
            />
            <span className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              I attest that I have reviewed this encounter and the clinical data is accurate.
            </span>
          </label>

          {/* Error */}
          {errorMessage && (
            <p className="text-xs" style={{ color: "var(--state-critical)" }}>
              {errorMessage}
            </p>
          )}

          {/* Disabled reason hint */}
          {!hasDiagnoses && attested && (
            <p className="text-xs" style={{ color: "var(--state-caution)" }}>
              Cannot finalize without at least one diagnosis.
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{
                background: "var(--accent)",
                color: "var(--text-inverse)",
              }}
            >
              {isSubmitting ? (
                <>
                  <span
                    className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin"
                    aria-hidden
                  />
                  Finalizing...
                </>
              ) : (
                <>
                  <Shield size={14} />
                  Sign &amp; Seal Chart
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium hover-btn"
              style={{
                background: "var(--bg-glass)",
                color: "var(--text-secondary)",
                border: "1px solid var(--glass-border)",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
