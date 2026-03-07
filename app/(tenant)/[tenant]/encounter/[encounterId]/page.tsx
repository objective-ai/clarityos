"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useEntitlements } from "@/hooks/useEntitlements";
import { useAiScribe, type ScribeStructuredData } from "@/hooks/useAiScribe";
import { Entitlement, ENTITLEMENT_META } from "@/lib/entitlements";
import type { EntitlementKey } from "@/types/session";
import type { RowKey } from "@/types/refraction";
import type { ExamSection, FindingsStoreKey, StructureFinding } from "@/types/exam-findings";
import type { EyeLaterality } from "@/types/diagnosis";
import { useEncounterStore, type EncounterStatus } from "@/store/encounterStore";
import { useVitalsStore } from "@/store/vitalsStore";
import { useExamFindingsStore } from "@/store/examFindingsStore";
import { useDiagnosisStore } from "@/store/diagnosisStore";
import { useRefractionStore } from "@/store/refractionStore";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { useSidebarCollapsed } from "@/contexts/SidebarContext";
import { EncounterBottomTabs } from "@/components/encounter/EncounterBottomTabs";
import { AuditTrailSidebar } from "@/components/encounter/AuditTrailSidebar";
import { FinalizeModal } from "@/components/encounter/FinalizeModal";
import { SuperbillModal } from "@/components/encounter/SuperbillModal";
import { VitalsForm } from "@/components/encounter/VitalsForm";
import { VitalsCard } from "@/components/encounter/VitalsCard";
import { RefractionGrid } from "@/components/encounter/RefractionGrid";
import { ExamFindings } from "@/components/encounter/ExamFindings";
import { ExamFindingsCard } from "@/components/encounter/ExamFindingsCard";
import { DiagnosisPicker } from "@/components/encounter/DiagnosisPicker";
import { ContinuitySidebar } from "@/components/encounter/ContinuitySidebar";
import { GlassCardSkeleton } from "@/components/ui/skeleton";
import { useProblemListStore } from "@/store/problemListStore";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// ---------------------------------------------------------------------------
// UpsellModal
// ---------------------------------------------------------------------------

interface UpsellModalProps {
  feature: EntitlementKey;
  onClose: () => void;
}

function UpsellModal({ feature, onClose }: UpsellModalProps) {
  const meta = ENTITLEMENT_META[feature];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm glass-card animate-slide-down overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-start justify-between gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-[var(--accent-dim)] border border-[var(--mono-border)]">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M9 2L10.8 6.5H15.5L11.8 9.2L13.5 14L9 11L4.5 14L6.2 9.2L2.5 6.5H7.2L9 2Z" stroke="var(--accent)" strokeWidth="1.3" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-overline text-[var(--accent)] mb-1">{meta.plan} Feature</div>
              <h3 className="text-subhead">{meta.label}</h3>
            </div>
            <button onClick={onClose} className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
              &times;
            </button>
          </div>
        </div>

        <div className="px-5 py-5">
          <p className="text-body mb-4">{meta.description}</p>
          <div className="rounded-xl p-4 mb-4 bg-[var(--bg-glass)] border border-[var(--glass-border)]">
            <div className="text-overline mb-2">What you unlock:</div>
            <ul className="space-y-2">
              {feature === "ai_scribe" && [
                "AI-generated SOAP notes in seconds",
                "Saves 12\u201315 min per encounter",
                "Learns your documentation style",
                "Streams directly into your text fields",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2 text-caption text-[var(--text-secondary)]">
                  <span className="text-[var(--state-normal)]">&check;</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <button className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all bg-[var(--accent)] text-[var(--text-inverse)] hover:brightness-110">
            Upgrade to {meta.plan} &rarr;
          </button>
          <button
            onClick={onClose}
            className="w-full py-3 text-xs mt-2 hover-btn text-[var(--text-muted)]"
          >
            Not right now
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI Scribe Widget — Ambient Data-Entry Scribe
// ---------------------------------------------------------------------------

// Refraction field mapping: AI JSON key -> RowKey (includes eye prefix)
const RX_FIELD_TO_ROW: Record<string, { od: RowKey; os: RowKey }> = {
  sphere:   { od: "od_sphere",   os: "os_sphere" },
  cylinder: { od: "od_cylinder", os: "os_cylinder" },
  axis:     { od: "od_axis",     os: "os_axis" },
  add:      { od: "od_add",      os: "os_add" },
};

// Final Rx column index in the refraction grid
const FINAL_RX_COL = 3;

function AiScribeWidget({ encounterId }: { encounterId: string }) {
  const { has } = useEntitlements();
  const hasAiScribe = has(Entitlement.AI_SCRIBE);
  const [showUpsell, setShowUpsell] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  const isFinalized = useEncounterStore(
    (s) => s.encounters[encounterId]?.isFinalized ?? false
  );

  // --- Dirty State Guard ---------------------------------------------------
  const isDirty = transcript.trim().length > 0 && !isFinalized;

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  // --- localStorage Auto-Save ----------------------------------------------
  const storageKey = `draft-transcript-${encounterId}`;

  // Save or clear draft as they type
  useEffect(() => {
    if (transcript.trim().length > 0) {
      localStorage.setItem(storageKey, transcript);
    } else {
      localStorage.removeItem(storageKey);
    }
  }, [transcript, storageKey]);

  // Recover draft on mount
  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved && !transcript) {
      setTranscript(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { generate, soapText, structuredData, isStreaming, isDone, error, reset } =
    useAiScribe(encounterId);

  // Store actions for Accept dispatch
  const setChiefComplaint = useEncounterStore((s) => s.setChiefComplaint);
  const setAiSummary = useEncounterStore((s) => s.setAiSummary);
  const aiSummaryText = useEncounterStore((s) => s.encounters[encounterId]?.aiSummaryText);
  const setVitalsField = useVitalsStore((s) => s.setField);
  const setStructureField = useExamFindingsStore((s) => s.setStructureField);
  const addDiagnosis = useDiagnosisStore((s) => s.addDiagnosis);
  const setCellValue = useRefractionStore((s) => s.setCellValue);

  const handleGenerate = useCallback(() => {
    if (!hasAiScribe) {
      setShowUpsell(true);
      return;
    }
    if (!transcript.trim()) return;
    setAccepted(false);
    generate(transcript);
  }, [hasAiScribe, transcript, generate]);

  const handleAccept = useCallback(() => {
    try {
      if (!structuredData) throw new Error("No structured data available.");
      const data = structuredData;
      setAcceptError(null);

      // Snapshot before/after diff for audit trail
      const diff: Record<string, { old: unknown; new: unknown }> = {};

      // 1. Chief complaint -- safe append with pipe separator
      if (data.chief_complaint) {
        const existing = useEncounterStore.getState().encounters[encounterId]?.chiefComplaint ?? "";
        diff["chief_complaint"] = { old: existing, new: data.chief_complaint };
        const updated = existing.trim() ? `${existing} | ${data.chief_complaint}` : data.chief_complaint;
        setChiefComplaint(encounterId, updated);
      }

      // 2. Vitals -- skip nulls to avoid overwriting existing values
      if (data.vitals) {
        const vitalsDraft = useVitalsStore.getState().encounters[encounterId]?.draft;
        for (const [field, value] of Object.entries(data.vitals)) {
          if (value != null) {
            const oldVal = vitalsDraft?.[field as keyof typeof vitalsDraft] ?? null;
            diff[`vitals.${field}`] = { old: oldVal, new: value };
            setVitalsField(encounterId, field as keyof ScribeStructuredData["vitals"] & string, value);
          }
        }
      }

      // 3. Exam findings -- dispatch per eye/structure/field
      if (data.exam_findings) {
        for (const [section, eyes] of Object.entries(data.exam_findings)) {
          if (!eyes) continue;
          for (const [eye, structures] of Object.entries(eyes)) {
            if (!structures) continue;
            const eyeLower = eye.toLowerCase() as "od" | "os";
            const findingsKey = `${encounterId}:${section}` as FindingsStoreKey;
            const sectionState = useExamFindingsStore.getState().findings[findingsKey];
            const eyeFindings = eyeLower === "od" ? sectionState?.draft.findings_od : sectionState?.draft.findings_os;

            for (const [structure, fields] of Object.entries(structures)) {
              if (!fields) continue;
              const aiFields = fields as Record<string, string | null>;
              const existing = eyeFindings?.[structure];

              if (aiFields.status != null) {
                diff[`exam.${section}.${eyeLower}.${structure}.status`] = {
                  old: existing?.status ?? null, new: aiFields.status,
                };
                setStructureField(encounterId, section as ExamSection, eyeLower, structure, "status", aiFields.status);
              }
              if (aiFields.notes != null) {
                diff[`exam.${section}.${eyeLower}.${structure}.finding`] = {
                  old: existing?.finding ?? null, new: aiFields.notes,
                };
                setStructureField(encounterId, section as ExamSection, eyeLower, structure, "finding", aiFields.notes);
              }
            }
          }
        }
      }

      // 4. Diagnoses
      if (data.diagnoses) {
        for (let i = 0; i < data.diagnoses.length; i++) {
          const dx = data.diagnoses[i];
          diff[`diagnoses.${i}`] = {
            old: null,
            new: { icdCode: dx.icdCode, description: dx.description, laterality: dx.laterality },
          };
          addDiagnosis(encounterId, {
            icd10Code: dx.icdCode,
            description: dx.description,
            eyeAffected: (dx.laterality as EyeLaterality) ?? null,
          });
        }
      }

      // 5. Refraction -- map to Final Rx column (index 3), with eye-prefixed RowKeys
      if (data.refraction) {
        const rxDraft = useRefractionStore.getState().columns[FINAL_RX_COL]?.draft;
        for (const [eye, rx] of Object.entries(data.refraction)) {
          if (!rx) continue;
          for (const [field, value] of Object.entries(rx as Record<string, string>)) {
            const mapping = RX_FIELD_TO_ROW[field];
            if (!mapping || value == null) continue;
            const rowKey = eye === "OD" ? mapping.od : mapping.os;
            const eyeKey = eye.toLowerCase() as "od" | "os";
            const oldVal = rxDraft?.[eyeKey]?.[field as keyof (typeof rxDraft)["od"]] ?? null;
            diff[`refraction.${eye}.${field}`] = { old: oldVal, new: value };
            setCellValue(FINAL_RX_COL, rowKey, value);
          }
        }
      }

      // 6. Save SOAP narrative to encounter store
      if (soapText) {
        setAiSummary(encounterId, soapText);
      }

      setAccepted(true);

      // Fire-and-forget audit log with before/after diff
      fetch(`/api/encounters/${encounterId}/ai-scribe/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes: diff }),
      }).catch((e) => console.error("Audit log failed:", e));
    } catch (err) {
      console.error("AI Accept Error:", err);
      // Fallback: save SOAP text so clinical data isn't lost
      if (soapText) {
        setAiSummary(encounterId, soapText);
      }
      setAcceptError("Failed to auto-fill grids. The SOAP note has been saved for manual review.");
    }
  }, [
    structuredData, soapText, encounterId,
    setChiefComplaint, setAiSummary, setVitalsField,
    setStructureField, addDiagnosis, setCellValue,
  ]);

  const handleClearAndEdit = useCallback(() => {
    reset();
    setAiSummary(encounterId, "");
    setAccepted(false);
    setAcceptError(null);
  }, [reset, encounterId, setAiSummary]);

  // Show saved summary if already accepted in a previous session
  const savedSummary = !soapText && !isStreaming && aiSummaryText;

  return (
    <>
      <Card className={hasAiScribe ? "glass-card-accent" : ""}>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>AI Scribe</CardTitle>
            <CardDescription>
              {hasAiScribe
                ? "Paste or dictate a transcript to auto-fill encounter fields"
                : "Premium feature \u2014 upgrade to unlock"}
            </CardDescription>
          </div>
          <Badge variant={hasAiScribe ? "default" : "outline"}>
            {hasAiScribe ? "Premium" : "Locked"}
          </Badge>
        </CardHeader>
        <CardContent>
          {/* Saved summary from previous accept */}
          {savedSummary ? (
            <div>
              <pre className="text-xs leading-relaxed whitespace-pre-wrap p-5 rounded-xl font-mono bg-[var(--bg-glass)] text-[var(--text-secondary)] border border-[var(--glass-border)]">
                {aiSummaryText}
              </pre>
              <div className="flex items-center gap-2 mt-3">
                <Badge variant="secondary" className="gap-1">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="opacity-70">
                    <path d="M2 5.5l2 2 4-4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Accepted
                </Badge>
                <button
                  onClick={handleClearAndEdit}
                  title="Clears the generated note so you can edit your transcript and try again."
                  className="text-xs px-3 py-1.5 rounded-xl font-medium text-[var(--text-muted)] border border-[var(--border-subtle)] hover-btn"
                >
                  Clear &amp; Edit
                </button>
              </div>
            </div>
          ) : !soapText && !isStreaming ? (
            /* Initial state -- transcript input */
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="ai-transcript" className="text-overline">
                  Clinical Transcript
                </label>
                <textarea
                  id="ai-transcript"
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  rows={4}
                  placeholder="Paste or dictate the clinical transcript here..."
                  className="w-full px-4 py-3 rounded-xl text-sm resize-y min-h-[6rem] glass-input placeholder:text-[var(--text-muted)]"
                />
              </div>

              {error && (
                <div className="text-xs text-[var(--state-danger)] px-3 py-2 rounded-lg bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.2)]">
                  {error}
                </div>
              )}

              <button
                onClick={handleGenerate}
                disabled={isStreaming || !transcript.trim()}
                className={`self-start px-6 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                  hasAiScribe
                    ? "bg-[var(--accent)] text-[var(--text-inverse)] hover:brightness-110 shadow-[var(--shadow-sm)]"
                    : "bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-default)] hover-btn"
                }`}
              >
                {hasAiScribe ? "Generate Note" : "Upgrade to Unlock"}
              </button>
            </div>
          ) : (
            /* Streaming / done state -- show SOAP text */
            <div>
              <pre className="text-xs leading-relaxed whitespace-pre-wrap p-5 rounded-xl font-mono bg-[var(--bg-glass)] text-[var(--text-secondary)] border border-[var(--glass-border)] min-h-[120px]">
                {soapText}
                {isStreaming && (
                  <span className="inline-block w-1.5 h-3.5 ml-0.5 -mb-0.5 animate-pulse bg-[var(--accent)]" />
                )}
              </pre>

              {isDone && !accepted && (
                <div className="mt-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleAccept}
                      disabled={!structuredData}
                      className="text-xs px-4 py-2 rounded-xl font-semibold bg-[var(--accent)] text-[var(--text-inverse)] hover:brightness-110 shadow-[var(--shadow-sm)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {"\u2713"} Accept &amp; Auto-Fill
                    </button>
                    <button
                      onClick={handleClearAndEdit}
                      title="Clears the generated note so you can edit your transcript and try again."
                      className="text-xs px-4 py-2 rounded-xl font-medium text-[var(--text-muted)] border border-[var(--border-subtle)] hover-btn"
                    >
                      Clear &amp; Edit
                    </button>
                  </div>
                  {acceptError && (
                    <p className="text-xs text-[var(--state-critical)]">{acceptError}</p>
                  )}
                </div>
              )}

              {accepted && (
                <div className="flex items-center gap-2 mt-4">
                  <Badge variant="secondary" className="gap-1">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="opacity-70">
                      <path d="M2 5.5l2 2 4-4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Fields auto-filled
                  </Badge>
                  <button
                    onClick={handleClearAndEdit}
                    title="Clears the generated note so you can edit your transcript and try again."
                    className="text-xs px-3 py-1.5 rounded-xl font-medium text-[var(--text-secondary)] border border-[var(--glass-border)] hover:text-[var(--text-primary)] hover:border-[var(--border-default)] hover-btn transition-colors"
                  >
                    Clear &amp; Edit
                  </button>
                </div>
              )}

              {isStreaming && (
                <div className="flex items-center gap-2 mt-3 text-[11px] text-[var(--text-muted)]">
                  <div className="w-3 h-3 rounded-full border-2 animate-spin border-[var(--accent)] border-t-transparent" />
                  Generating SOAP note...
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {showUpsell && (
        <UpsellModal
          feature={Entitlement.AI_SCRIBE}
          onClose={() => setShowUpsell(false)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Encounter Workflow Header
// ---------------------------------------------------------------------------

interface EncounterWorkflowHeaderProps {
  encounterId: string;
  isReadOnly: boolean;
}

function EncounterWorkflowHeader({ encounterId, isReadOnly }: EncounterWorkflowHeaderProps) {
  const encounterState = useEncounterStore((s) => s.encounters[encounterId]);
  const setChiefComplaint = useEncounterStore((s) => s.setChiefComplaint);
  const [draft, setDraft] = useState(encounterState?.chiefComplaint ?? "");

  // Debounced save -- 1.5s after last keystroke
  useEffect(() => {
    if (isReadOnly) return;
    const t = setTimeout(() => setChiefComplaint(encounterId, draft), 1500);
    return () => clearTimeout(t);
  }, [draft, encounterId, isReadOnly, setChiefComplaint]);

  // Sync draft when store changes externally (e.g., AI Scribe append)
  useEffect(() => {
    const storeValue = encounterState?.chiefComplaint ?? "";
    if (storeValue !== draft) setDraft(storeValue);
    // Only re-sync when the store value changes, not on draft changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encounterState?.chiefComplaint]);

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex flex-col gap-1.5">
          <div className="text-overline">Chief Complaint</div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => !isReadOnly && setChiefComplaint(encounterId, draft)}
            readOnly={isReadOnly}
            rows={3}
            placeholder="Reason for visit..."
            className={`w-full px-4 py-2.5 rounded-xl text-sm resize-none transition-colors ${
              isReadOnly
                ? "bg-transparent border-none text-[var(--text-primary)] cursor-default outline-none"
                : "glass-input"
            }`}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function EncounterPage({
  params,
}: {
  params: { tenant: string; encounterId: string };
}) {
  const { requireRole } = useEntitlements();
  const sidebarCollapsed = useSidebarCollapsed();
  const advanceStatus = useEncounterStore((s) => s.advanceStatus);
  const unlockEncounter = useEncounterStore((s) => s.unlockEncounter);
  const loadEncounter = useEncounterStore((s) => s.loadEncounter);
  const loadVitals = useVitalsStore((s) => s.loadVitals);
  const loadFindings = useExamFindingsStore((s) => s.loadFindings);
  const loadDiagnoses = useDiagnosisStore((s) => s.loadDiagnoses);
  const loadRefractions = useRefractionStore((s) => s.loadRefractions);
  const fetchProblems = useProblemListStore((s) => s.fetchProblems);
  const encounterState = useEncounterStore((s) => s.encounters[params.encounterId]);
  const isFinalized = encounterState?.isFinalized ?? false;
  const encounterLoadStatus = encounterState?.loadStatus ?? "idle";

  // patientId flows from encounterStore (set by loadEncounter)
  const patientId = useEncounterStore(
    (s) => s.encounters[params.encounterId]?.patientId ?? null
  );

  // Role-based read-only: technicians + doctors + owners can edit clinical data
  const canEditClinical = requireRole("doctor", "technician", "owner");
  const clinicalReadOnly = isFinalized || !canEditClinical;
  const canViewAudit = requireRole("admin", "owner");
  const [auditOpen, setAuditOpen] = useState(false);
  const finalizeModalOpen = useEncounterStore((s) => s.finalizeModalOpen);
  const setFinalizeModalOpen = useEncounterStore((s) => s.setFinalizeModalOpen);
  const [superbillOpen, setSuperbillOpen] = useState(false);

  // Store setters for revert functionality
  const revertChiefComplaint = useEncounterStore((s) => s.setChiefComplaint);
  const revertVitalsField = useVitalsStore((s) => s.setField);
  const revertStructureField = useExamFindingsStore((s) => s.setStructureField);
  const revertCellValue = useRefractionStore((s) => s.setCellValue);

  const handleRevertField = useCallback((field: string, oldValue: unknown) => {
    const eid = params.encounterId;
    if (field === "chief_complaint") {
      revertChiefComplaint(eid, (oldValue as string) ?? "");
    } else if (field.startsWith("vitals.")) {
      const vitalField = field.replace("vitals.", "");
      revertVitalsField(eid, vitalField as keyof ScribeStructuredData["vitals"] & string, oldValue);
    } else if (field.startsWith("exam.")) {
      const [, section, eye, structure, fieldName] = field.split(".");
      revertStructureField(eid, section as ExamSection, eye as "od" | "os", structure, fieldName as keyof StructureFinding, oldValue as string);
    } else if (field.startsWith("refraction.")) {
      const [, eye, rxField] = field.split(".");
      const mapping = RX_FIELD_TO_ROW[rxField];
      if (mapping) {
        const rowKey = eye === "OD" ? mapping.od : mapping.os;
        revertCellValue(FINAL_RX_COL, rowKey, (oldValue as string) ?? "");
      }
    }
  }, [params.encounterId, revertChiefComplaint, revertVitalsField, revertStructureField, revertCellValue]);

  // Parallel fetch all encounter sections on mount
  useEffect(() => {
    const encId = params.encounterId;
    loadEncounter(encId);
    loadVitals(encId);
    loadRefractions(encId);
    loadFindings(encId, "anterior_segment");
    loadFindings(encId, "posterior_segment");
    loadDiagnoses(encId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.encounterId]);

  // Fetch patient problem list once patientId is available from encounterStore
  useEffect(() => {
    if (!patientId) return;
    fetchProblems(patientId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  // Show full-page skeleton while encounter header is loading
  if (encounterLoadStatus === "loading" || encounterLoadStatus === "idle") {
    return (
      <div className="flex flex-col gap-6">
        <GlassCardSkeleton rows={2} />
        <GlassCardSkeleton rows={4} />
        <GlassCardSkeleton rows={6} />
      </div>
    );
  }

  // If encounter failed to load, show error state with retry
  if (encounterLoadStatus === "error") {
    return (
      <div className="glass-card p-8 text-center flex flex-col items-center gap-4">
        <p className="text-subhead text-[var(--state-critical)]">Could not load encounter</p>
        <p className="text-caption text-[var(--text-muted)]">
          {encounterState?.loadError ?? "Network error"}
        </p>
        <button
          type="button"
          onClick={() => loadEncounter(params.encounterId)}
          className="px-4 py-2 rounded-xl text-sm font-medium bg-[var(--accent)] text-[var(--text-inverse)] hover:brightness-110 transition-all"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 stagger">
      {/* Workflow header -- chief complaint + audit trail toggle */}
      <div id="section-complaint" className="flex flex-col gap-2">
        <EncounterWorkflowHeader
          encounterId={params.encounterId}
          isReadOnly={isFinalized}
        />
        {canViewAudit && (
          <button
            type="button"
            onClick={() => setAuditOpen(true)}
            className="self-end flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-lg hover-btn"
            style={{ color: "var(--text-secondary)", border: "1px solid var(--border-subtle)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            Audit Trail
          </button>
        )}
      </div>

      {/* Finalized banner */}
      {isFinalized && (
        <div className="flex items-center gap-3 px-5 py-3 rounded-xl bg-[rgba(34,197,94,0.08)] border border-[rgba(34,197,94,0.20)] text-sm text-[var(--state-normal)]">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
            <rect x="2.5" y="7" width="11" height="7.5" rx="2" stroke="currentColor" strokeWidth="1.3" />
            <path d="M5 7V5a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <span className="font-medium">Signed and finalized</span>
          {encounterState?.signedByName && (
            <span className="text-[var(--text-secondary)]">
              by {encounterState.signedByName}
              {encounterState.signedAt &&
                ` on ${new Date(encounterState.signedAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}`}
            </span>
          )}
          {!encounterState?.signedByName && (
            <span className="text-[var(--text-secondary)]">All fields are locked.</span>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={() => setSuperbillOpen(true)}
              className="text-xs px-3 py-1.5 rounded-lg font-semibold hover-btn transition-all"
              style={{
                background: "var(--accent)",
                color: "var(--text-inverse)",
              }}
            >
              Superbill
            </button>
            <Link
              href={`/${params.tenant}/schedule?followUp=true&patientId=${encodeURIComponent(encounterState?.patientId ?? "")}&providerId=${encodeURIComponent(encounterState?.providerId ?? "")}&patientName=${encodeURIComponent(encounterState?.patientName ?? "")}&providerName=${encodeURIComponent(encounterState?.providerName ?? "")}`}
              className="text-xs px-3 py-1.5 rounded-lg font-medium hover-btn text-[var(--accent)] border border-[var(--accent)]/30"
            >
              Schedule Follow-Up
            </Link>
            <Link
              href={`/${params.tenant}/patients/${encounterState?.patientChartNumber ?? encounterState?.patientId ?? ""}`}
              className="text-xs px-3 py-1.5 rounded-lg font-medium hover-btn text-[var(--text-secondary)] border border-[var(--border-subtle)]"
            >
              Back to Patient
            </Link>
            <Link
              href={`/${params.tenant}/schedule`}
              className="text-xs px-3 py-1.5 rounded-lg font-medium hover-btn text-[var(--text-secondary)] border border-[var(--border-subtle)]"
            >
              Back to Schedule
            </Link>
            <Badge variant="secondary">Locked</Badge>
            {process.env.NODE_ENV === "development" && (
              <button
                type="button"
                onClick={() => unlockEncounter(params.encounterId)}
                className="text-[11px] px-2 py-1 rounded-md font-medium border border-dashed border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--state-critical)] hover:border-[var(--state-critical)] transition-colors"
              >
                Dev: Unlock
              </button>
            )}
          </div>
        </div>
      )}

      <div id="section-vitals">
        {encounterState?.status === "pre_test" && canEditClinical ? (
          <VitalsForm encounterId={params.encounterId} />
        ) : (
          <VitalsCard encounterId={params.encounterId} isReadOnly={clinicalReadOnly} />
        )}
      </div>

      {/* Refraction */}
      <div id="section-rx">
        <Card>
          <CardContent className="p-6">
            <RefractionGrid
              encounterId={params.encounterId}
              initialRefractions={[]}
              isReadOnly={clinicalReadOnly}
            />
          </CardContent>
        </Card>
      </div>

      {/* Continuity Sidebar -- active master problems */}
      <ContinuitySidebar
        patientId={patientId ?? ""}
        encounterId={params.encounterId}
        isReadOnly={clinicalReadOnly}
      />

      {/* Exam Findings -- Anterior + Posterior side by side */}
      <div id="section-exam" className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardContent className="p-6">
            {isFinalized || !canEditClinical ? (
              <ExamFindingsCard encounterId={params.encounterId} section="anterior_segment" />
            ) : (
              <PermissionGate roles={["doctor", "owner"]} fallback={
                <ExamFindingsCard encounterId={params.encounterId} section="anterior_segment" />
              }>
                <ExamFindings encounterId={params.encounterId} isReadOnly={false} section="anterior_segment" />
              </PermissionGate>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            {isFinalized || !canEditClinical ? (
              <ExamFindingsCard encounterId={params.encounterId} section="posterior_segment" />
            ) : (
              <PermissionGate roles={["doctor", "owner"]} fallback={
                <ExamFindingsCard encounterId={params.encounterId} section="posterior_segment" />
              }>
                <ExamFindings encounterId={params.encounterId} isReadOnly={false} section="posterior_segment" />
              </PermissionGate>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Diagnoses -- full width, 2-column list */}
      <div id="section-dx">
        <PermissionGate roles={["doctor", "owner"]}>
          <Card>
            <CardContent className="p-6">
              <DiagnosisPicker encounterId={params.encounterId} isReadOnly={isFinalized} columns={2} />
            </CardContent>
          </Card>
        </PermissionGate>
      </div>

      <div id="section-plan">
        <PermissionGate roles={["doctor", "owner"]}>
          {!isFinalized ? (
            <AiScribeWidget encounterId={params.encounterId} />
          ) : encounterState?.aiSummaryText ? (
            <Card>
              <CardContent className="p-6">
                <div className="section-title mb-2">AI Scribe Summary</div>
                <p
                  className="text-sm leading-relaxed whitespace-pre-wrap"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {encounterState.aiSummaryText}
                </p>
              </CardContent>
            </Card>
          ) : null}
        </PermissionGate>
      </div>

      {/* Spacer so fixed bottom bar doesn't overlap content */}
      <div className="h-16" />

      {/* Bottom tab navigation */}
      <EncounterBottomTabs
        status={encounterState?.status ?? "pre_test"}
        isFinalized={isFinalized}
        sidebarCollapsed={sidebarCollapsed}
        patientId={patientId ?? ""}
        onAdvanceStatus={() => {
          if (encounterState?.status === "in_exam") {
            setFinalizeModalOpen(true);
          } else {
            advanceStatus(params.encounterId);
          }
        }}
      />

      {/* Audit trail sidebar (admin/owner only) */}
      {canViewAudit && (
        <AuditTrailSidebar
          encounterId={params.encounterId}
          isOpen={auditOpen}
          onClose={() => setAuditOpen(false)}
          isReadOnly={isFinalized}
          onRevert={handleRevertField}
        />
      )}

      {/* Finalize & Sign modal (single instance, triggered via Zustand) */}
      <FinalizeModal
        open={finalizeModalOpen}
        onOpenChange={setFinalizeModalOpen}
        encounterId={params.encounterId}
        providerName={encounterState?.providerName ?? "Unknown Provider"}
      />

      {/* Superbill modal (shown after finalization) */}
      <SuperbillModal
        open={superbillOpen}
        onOpenChange={setSuperbillOpen}
        encounterId={params.encounterId}
        patientName="Patient"
        providerName={encounterState?.providerName ?? "Unknown Provider"}
        encounterDate={encounterState?.encounterDate ?? new Date().toISOString().split("T")[0]}
      />
    </div>
  );
}
