"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useEntitlements } from "@/hooks/useEntitlements";
import type { ScribeStructuredData } from "@/hooks/useAiScribe";
import { Entitlement } from "@/lib/entitlements";
import type { RowKey } from "@/types/refraction";
import type { ExamSection, FindingsStoreKey, StructureFinding } from "@/types/exam-findings";
import { useEncounterStore, type EncounterStatus } from "@/store/encounterStore";
import { apiFetch } from "@/lib/api-client";
import { useVitalsStore } from "@/store/vitalsStore";
import { useExamFindingsStore } from "@/store/examFindingsStore";
import { useDiagnosisStore } from "@/store/diagnosisStore";
import { useRefractionStore } from "@/store/refractionStore";
import { AiScribeWidget } from "@/components/encounter/AiScribeWidget";
import dynamic from "next/dynamic";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { useSidebarCollapsed } from "@/contexts/SidebarContext";
import { EncounterBottomTabs } from "@/components/encounter/EncounterBottomTabs";
import { GlassCardSkeleton } from "@/components/ui/skeleton";

const AuditTrailSidebar = dynamic(
  () => import("@/components/encounter/AuditTrailSidebar").then((m) => ({ default: m.AuditTrailSidebar })),
  { loading: () => <div className="animate-pulse h-48 bg-white/5 rounded-xl" />, ssr: false },
);
const FinalizeModal = dynamic(
  () => import("@/components/encounter/FinalizeModal").then((m) => ({ default: m.FinalizeModal })),
  { loading: () => <div className="animate-pulse h-32 bg-white/5 rounded-xl" />, ssr: false },
);
const SuperbillModal = dynamic(
  () => import("@/components/encounter/SuperbillModal").then((m) => ({ default: m.SuperbillModal })),
  { loading: () => <div className="animate-pulse h-32 bg-white/5 rounded-xl" />, ssr: false },
);
const VitalsForm = dynamic(
  () => import("@/components/encounter/VitalsForm").then((m) => ({ default: m.VitalsForm })),
  { loading: () => <div className="animate-pulse h-48 bg-white/5 rounded-xl" />, ssr: false },
);
const VitalsCard = dynamic(
  () => import("@/components/encounter/VitalsCard").then((m) => ({ default: m.VitalsCard })),
  { loading: () => <div className="animate-pulse h-48 bg-white/5 rounded-xl" />, ssr: false },
);
const RefractionGrid = dynamic(
  () => import("@/components/encounter/RefractionGrid").then((m) => ({ default: m.RefractionGrid })),
  { loading: () => <div className="animate-pulse h-48 bg-white/5 rounded-xl" />, ssr: false },
);
const ExamFindings = dynamic(
  () => import("@/components/encounter/ExamFindings").then((m) => ({ default: m.ExamFindings })),
  { loading: () => <div className="animate-pulse h-48 bg-white/5 rounded-xl" />, ssr: false },
);
const ExamFindingsCard = dynamic(
  () => import("@/components/encounter/ExamFindingsCard").then((m) => ({ default: m.ExamFindingsCard })),
  { loading: () => <div className="animate-pulse h-32 bg-white/5 rounded-xl" />, ssr: false },
);
const DiagnosisPicker = dynamic(
  () => import("@/components/encounter/DiagnosisPicker").then((m) => ({ default: m.DiagnosisPicker })),
  { loading: () => <div className="animate-pulse h-48 bg-white/5 rounded-xl" />, ssr: false },
);
const ContinuitySidebar = dynamic(
  () => import("@/components/encounter/ContinuitySidebar").then((m) => ({ default: m.ContinuitySidebar })),
  { loading: () => <div className="animate-pulse h-32 bg-white/5 rounded-xl" />, ssr: false },
);
const AddendumSection = dynamic(
  () => import("@/components/encounter/AddendumSection").then((m) => ({ default: m.AddendumSection })),
  { loading: () => <div className="animate-pulse h-32 bg-white/5 rounded-xl" />, ssr: false },
);
const PrepMeCard = dynamic(
  () => import("@/components/encounter/PrepMeCard").then((m) => ({ default: m.PrepMeCard })),
  { loading: () => <div className="animate-pulse h-12 bg-white/5 rounded-xl" />, ssr: false },
);
const ExamMergePanel = dynamic(
  () => import("@/components/encounter/merge-panel/ExamMergePanel").then((m) => ({ default: m.ExamMergePanel })),
  { loading: () => <div className="animate-pulse h-48 bg-white/5 rounded-xl" />, ssr: false },
);
import { useProblemListStore } from "@/store/problemListStore";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Refraction field mapping (used for audit-trail revert)
const RX_FIELD_TO_ROW: Record<string, { od: RowKey; os: RowKey }> = {
  sphere:   { od: "od_sphere",   os: "os_sphere" },
  cylinder: { od: "od_cylinder", os: "os_cylinder" },
  axis:     { od: "od_axis",     os: "os_axis" },
  add:      { od: "od_add",      os: "os_add" },
};
const FINAL_RX_COL = 3;

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
  const { requireRole, has } = useEntitlements();
  const hasAiScribe = has(Entitlement.AI_SCRIBE);
  const sidebarCollapsed = useSidebarCollapsed();
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
  const aiStructuredData = encounterState?.aiStructuredData ?? null;
  const setAiStructuredData = useEncounterStore((s) => s.setAiStructuredData);

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
  const [statusError, setStatusError] = useState<string | null>(null);

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

  // --- Cross-store dirty guard: warn before closing with unsaved clinical data -
  const vitalsDirty = useVitalsStore(
    (s) => s.encounters[params.encounterId]?.saveStatus === "dirty"
  );
  const refractionDirty = useRefractionStore(
    (s) => s.encounterId === params.encounterId && s.columns.some((c) => c.saveStatus === "dirty")
  );
  const examAnteriorDirty = useExamFindingsStore(
    (s) => s.findings[`${params.encounterId}:anterior_segment` as FindingsStoreKey]?.saveStatus === "dirty"
  );
  const examPosteriorDirty = useExamFindingsStore(
    (s) => s.findings[`${params.encounterId}:posterior_segment` as FindingsStoreKey]?.saveStatus === "dirty"
  );
  const hasUnsavedClinical = vitalsDirty || refractionDirty || examAnteriorDirty || examPosteriorDirty;

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsavedClinical) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedClinical]);

  // --- Status transition handlers ---
  const handleAdvanceStatus = useCallback(async () => {
    setStatusError(null);
    if (encounterState?.status === "in_exam") {
      setFinalizeModalOpen(true);
    } else if (encounterState?.status === "pre_test") {
      if (!encounterState?.appointmentId) {
        setStatusError("Cannot advance status: this encounter has no linked appointment.");
        return;
      }
      try {
        await apiFetch(`/api/appointments/${encounterState.appointmentId}/start-exam-phase`, { method: "POST" });
        await loadEncounter(params.encounterId);
      } catch (e) {
        setStatusError(e instanceof Error ? e.message : "Failed to start exam phase.");
      }
    }
  }, [encounterState?.status, encounterState?.appointmentId, setFinalizeModalOpen, loadEncounter, params.encounterId]);

  const handleRevertToPretest = useCallback(async () => {
    setStatusError(null);
    if (!encounterState?.appointmentId) {
      setStatusError("Cannot revert: this encounter has no linked appointment.");
      return;
    }
    try {
      await apiFetch(`/api/appointments/${encounterState.appointmentId}/revert-to-pretest`, { method: "POST" });
      await loadEncounter(params.encounterId);
    } catch (e) {
      setStatusError(e instanceof Error ? e.message : "Failed to revert to pre-test.");
    }
  }, [encounterState?.appointmentId, loadEncounter, params.encounterId]);

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
      {/* Prep Me — AI pre-visit summary (returning patients only) */}
      {patientId && !isFinalized && hasAiScribe && (
        <PrepMeCard patientId={patientId} />
      )}

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
        {canEditClinical && !isFinalized ? (
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

      {/* Exam Findings -- Inline merge panel when AI data available, else normal side-by-side */}
      <div id="section-exam">
        {aiStructuredData?.exam_findings && !isFinalized && canEditClinical ? (
          <PermissionGate roles={["doctor", "owner"]} fallback={
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card><CardContent className="p-6"><ExamFindingsCard encounterId={params.encounterId} section="anterior_segment" /></CardContent></Card>
              <Card><CardContent className="p-6"><ExamFindingsCard encounterId={params.encounterId} section="posterior_segment" /></CardContent></Card>
            </div>
          }>
            <ExamMergePanel
              encounterId={params.encounterId}
              structuredData={aiStructuredData}
              onDismiss={() => setAiStructuredData(params.encounterId, null)}
            />
          </PermissionGate>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
        )}
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

      {/* Addenda — post-finalization amendments (doctors & owners only) */}
      {isFinalized && (
        <div id="section-addenda">
          <PermissionGate roles={["doctor", "owner"]}>
            <AddendumSection encounterId={params.encounterId} />
          </PermissionGate>
        </div>
      )}

      {/* Spacer so fixed bottom bar doesn't overlap content */}
      <div className="h-16" />

      {/* Status action error (shown above bottom bar) */}
      {statusError && (
        <div
          className="fixed z-40 px-4 py-2 rounded-lg text-xs font-medium flex items-center gap-2"
          style={{
            bottom: 56,
            left: sidebarCollapsed ? 68 : 228,
            right: 16,
            background: "rgba(239,68,68,0.12)",
            border: "1px solid rgba(239,68,68,0.3)",
            color: "var(--state-critical)",
          }}
        >
          <span>{statusError}</span>
          <button type="button" onClick={() => setStatusError(null)} className="ml-auto opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Bottom tab navigation */}
      <EncounterBottomTabs
        status={encounterState?.status ?? "pre_test"}
        isFinalized={isFinalized}
        sidebarCollapsed={sidebarCollapsed}
        patientId={patientId ?? ""}
        onAdvanceStatus={handleAdvanceStatus}
        onRevertToPretest={handleRevertToPretest}
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
