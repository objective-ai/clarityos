"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useEntitlements } from "@/hooks/useEntitlements";
import { Entitlement } from "@/lib/entitlements";
import type { RowKey } from "@/types/refraction";
import type { ExamSection, FindingsStoreKey, StructureFinding } from "@/types/exam-findings";
import { useEncounterStore } from "@/store/encounterStore";
import { apiFetch } from "@/lib/api-client";
import { useVitalsStore, useVitalsDraft } from "@/store/vitalsStore";
import type { VitalsDraft } from "@/types/vitals";
import { useExamFindingsStore } from "@/store/examFindingsStore";
import { useDiagnosisStore, useDiagnoses } from "@/store/diagnosisStore";
import { useRefractionStore } from "@/store/refractionStore";
import { AiScribeWidget } from "@/components/encounter/AiScribeWidget";
import dynamic from "next/dynamic";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { useSidebarCollapsed } from "@/contexts/SidebarContext";
import { EncounterBottomTabs } from "@/components/encounter/EncounterBottomTabs";
import { formatClinicDate, clinicToday, useClinicTimezone } from "@/lib/timezone";
import { GlassCardSkeleton } from "@/components/ui/skeleton";

const AuditTrailSidebar = dynamic(
  () => import("@/components/encounter/AuditTrailSidebar").then((m) => ({ default: m.AuditTrailSidebar })),
  { loading: () => <div className="animate-pulse h-48 bg-white/5 rounded-xl" />, ssr: false },
);
const FinalizeModal = dynamic(
  () => import("@/components/encounter/FinalizeModal").then((m) => ({ default: m.FinalizeModal })),
  { loading: () => <div className="animate-pulse h-32 bg-white/5 rounded-xl" />, ssr: false },
);
const BillingWorkflowDialog = dynamic(
  () => import("@/components/billing/BillingWorkflow").then((m) => ({ default: m.BillingWorkflowDialog })),
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
const InlineReviewSection = dynamic(
  () => import("@/components/encounter/review-section/InlineReviewSection").then((m) => ({ default: m.InlineReviewSection })),
  { loading: () => <div className="animate-pulse h-48 bg-white/5 rounded-xl" />, ssr: false },
);
const PreTestView = dynamic(
  () => import("@/components/encounter/PreTestView").then((m) => ({ default: m.PreTestView })),
  { ssr: false },
);
const StickyMicButton = dynamic(
  () => import("@/components/encounter/StickyMicButton").then((m) => ({ default: m.StickyMicButton })),
  { ssr: false },
);
const PreTestBottomBar = dynamic(
  () => import("@/components/encounter/PreTestBottomBar").then((m) => ({ default: m.PreTestBottomBar })),
  { ssr: false },
);
import { useProblemListStore } from "@/store/problemListStore";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { applyResolutions } from "@/components/encounter/conflict-resolver/applyResolutions";
import type { ConflictRow } from "@/components/encounter/conflict-resolver/buildConflicts";

// Refraction field mapping (used for audit-trail revert)
const RX_FIELD_TO_ROW: Record<string, { od: RowKey; os: RowKey }> = {
  sphere:   { od: "od_sphere",   os: "os_sphere" },
  cylinder: { od: "od_cylinder", os: "os_cylinder" },
  axis:     { od: "od_axis",     os: "os_axis" },
  add:      { od: "od_add",      os: "os_add" },
};
const FINAL_RX_COL = 3;

// ---------------------------------------------------------------------------
// Undo Snapshot (staged commit flow)
// ---------------------------------------------------------------------------

interface UndoSnapshot {
  encounter: {
    chiefComplaint: string;
    assessmentAndPlan: string;
  };
  vitals: unknown;
  examAnterior: unknown;
  examPosterior: unknown;
  diagnoses: unknown;
  refractionColumns: unknown;
  appliedCount: number;
}

function captureUndoSnapshot(encounterId: string): Omit<UndoSnapshot, "appliedCount"> {
  const enc = useEncounterStore.getState().encounters[encounterId];
  const anteriorKey = `${encounterId}:anterior_segment`;
  const posteriorKey = `${encounterId}:posterior_segment`;

  return {
    encounter: {
      chiefComplaint: enc?.chiefComplaint ?? "",
      assessmentAndPlan: enc?.assessmentAndPlan ?? "",
    },
    vitals: structuredClone(useVitalsStore.getState().encounters[encounterId] ?? null),
    examAnterior: structuredClone(useExamFindingsStore.getState().findings[anteriorKey as FindingsStoreKey] ?? null),
    examPosterior: structuredClone(useExamFindingsStore.getState().findings[posteriorKey as FindingsStoreKey] ?? null),
    diagnoses: structuredClone(useDiagnosisStore.getState().encounters[encounterId]?.diagnoses ?? []),
    refractionColumns: structuredClone(useRefractionStore.getState().columns),
  };
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
  const clinicTz = useClinicTimezone();
  const encounterState = useEncounterStore((s) => s.encounters[params.encounterId]);
  const isFinalized = encounterState?.isFinalized ?? false;
  const encounterLoadStatus = encounterState?.loadStatus ?? "idle";
  const encounterStatus = useEncounterStore((s) => s.encounters[params.encounterId]?.status);
  const isPreTest = encounterStatus === "pre_test";
  const prevIsPreTest = useRef(isPreTest);
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
  const [reviewMode, setReviewMode] = useState(false);
  const undoRef = useRef<UndoSnapshot | null>(null);
  const [undoToast, setUndoToast] = useState<{ count: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const [exitingReview, setExitingReview] = useState(false);

  // Required-field gate for the Finalize button
  const vitalsDraftForFinalize = useVitalsDraft(params.encounterId);
  const allDiagnosesForFinalize = useDiagnoses(params.encounterId);
  const canFinalize =
    (encounterState?.chiefComplaint ?? "").trim().length > 0 &&
    !!(vitalsDraftForFinalize?.ucva_od || vitalsDraftForFinalize?.ucva_os ||
       vitalsDraftForFinalize?.bcva_od || vitalsDraftForFinalize?.bcva_os) &&
    allDiagnosesForFinalize.filter((dx) => dx.status.toLowerCase() === "active").length > 0 &&
    (encounterState?.assessmentAndPlan ?? "").trim().length >= 10;

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
      revertVitalsField(eid, vitalField as keyof VitalsDraft, oldValue);
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

  // Scroll to Rx section when transitioning from pre-test to in-exam
  useEffect(() => {
    if (prevIsPreTest.current && !isPreTest) {
      setTimeout(() => {
        document.getElementById("section-rx")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 300);
    }
    prevIsPreTest.current = isPreTest;
  }, [isPreTest]);

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
    if (encounterState?.status !== "in_exam") return;
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
  }, [encounterState?.status, encounterState?.appointmentId, loadEncounter, params.encounterId]);

  // --- Staged Commit: commit handler ---
  const handleCommit = useCallback(async (
    autoRows: ConflictRow[],
    reviewRows: ConflictRow[],
    soapText: string,
  ) => {
    // 1. Snapshot before writing
    const snapshot = captureUndoSnapshot(params.encounterId);

    // 2. Pre-filter: auto-tier (all use_ai) + review-tier (only use_ai)
    const rowsToApply = [
      ...autoRows.filter((r) => r.resolution === "use_ai"),
      ...reviewRows.filter((r) => r.resolution === "use_ai"),
    ];

    // 3. Apply
    const count = await applyResolutions(params.encounterId, rowsToApply, soapText);

    // 4. Store snapshot with count
    undoRef.current = { ...snapshot, appliedCount: count };

    // 5. Exit animation
    setExitingReview(true);
    setTimeout(() => {
      setReviewMode(false);
      setExitingReview(false);
      setAiStructuredData(params.encounterId, null);
    }, 200);

    // 6. Show undo toast
    const timer = setTimeout(() => {
      undoRef.current = null;
      setUndoToast(null);
    }, 8000);
    setUndoToast({ count, timer });
  }, [params.encounterId, setAiStructuredData]);

  // --- Staged Commit: undo handler ---
  const handleUndo = useCallback(() => {
    const snapshot = undoRef.current;
    if (!snapshot) return;

    const eid = params.encounterId;

    // Restore encounter fields (A&P included per spec)
    useEncounterStore.getState().setChiefComplaint(eid, snapshot.encounter.chiefComplaint);
    useEncounterStore.getState().setAssessmentAndPlan(eid, snapshot.encounter.assessmentAndPlan);

    // Restore vitals
    if (snapshot.vitals) {
      const vitalsState = useVitalsStore.getState();
      useVitalsStore.setState({
        encounters: { ...vitalsState.encounters, [eid]: snapshot.vitals },
      } as Partial<typeof vitalsState>);
    }

    // Restore exam findings
    const anteriorKey = `${eid}:anterior_segment`;
    const posteriorKey = `${eid}:posterior_segment`;
    if (snapshot.examAnterior) {
      const examState = useExamFindingsStore.getState();
      useExamFindingsStore.setState({
        findings: { ...examState.findings, [anteriorKey]: snapshot.examAnterior },
      } as Partial<typeof examState>);
    }
    if (snapshot.examPosterior) {
      const examState = useExamFindingsStore.getState();
      useExamFindingsStore.setState({
        findings: { ...examState.findings, [posteriorKey]: snapshot.examPosterior },
      } as Partial<typeof examState>);
    }

    // Restore refraction
    if (snapshot.refractionColumns) {
      const rxState = useRefractionStore.getState();
      useRefractionStore.setState({
        columns: snapshot.refractionColumns,
      } as Partial<typeof rxState>);
    }

    // NOTE: Diagnoses NOT auto-removed (clinical safety per spec)

    // Fire audit log for revert
    fetch(`/api/encounters/${eid}/ai-scribe/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ changes: { reverted: true, count: snapshot.appliedCount } }),
    }).catch(() => {});

    // Clean up toast
    if (undoToast?.timer) clearTimeout(undoToast.timer);
    undoRef.current = null;
    setUndoToast(null);

    // Re-open review mode
    setReviewMode(true);
  }, [params.encounterId, undoToast]);

  // Clear pending undo timer on unmount to prevent state updates after navigation
  useEffect(() => {
    return () => {
      if (undoToast?.timer) clearTimeout(undoToast.timer);
    };
  }, [undoToast]);

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

      {/* ------------------------------------------------------------------ */}
      {/* PRE-TEST MODE                                                        */}
      {/* ------------------------------------------------------------------ */}
      {isPreTest ? (
        <>
          {/* Workflow header — chief complaint always visible */}
          <div id="section-complaint" className="flex flex-col gap-2">
            <EncounterWorkflowHeader
              encounterId={params.encounterId}
              isReadOnly={false}
            />
          </div>

          {/* Pre-test workflow: accordion vitals */}
          <PreTestView
            encounterId={params.encounterId}
            tenantSlug={params.tenant}
          />

          {/* Bottom padding for fixed bar */}
          <div className="h-14" />

          {/* Sticky bottom bar with section tabs + Ready for Doctor */}
          <PreTestBottomBar
            encounterId={params.encounterId}
            sidebarCollapsed={sidebarCollapsed}
          />
        </>
      ) : (
        <>
          {/* ---------------------------------------------------------------- */}
          {/* DOCTOR EXAM MODE                                                  */}
          {/* ---------------------------------------------------------------- */}

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
                className="self-end flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg hover-btn"
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
                    ` on ${formatClinicDate(encounterState.signedAt)}`}
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
                    className="text-xs px-2 py-1 rounded-md font-medium border border-dashed border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--state-critical)] hover:border-[var(--state-critical)] transition-colors"
                  >
                    Dev: Unlock
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Review Mode: inline review section replaces clinical forms */}
          {(reviewMode || exitingReview) ? (
            <div className={exitingReview ? "animate-fade-out" : ""}>
              <InlineReviewSection
                encounterId={params.encounterId}
                onClose={() => setReviewMode(false)}
                onCommit={handleCommit}
              />
            </div>
          ) : (
            <>
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

              {/* Exam Findings -- always normal side-by-side view */}
              <div id="section-exam">
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

            </>
          )}

          {/* Addenda — post-finalization amendments (doctors & owners only) */}
          {isFinalized && (
            <div id="section-addenda">
              <PermissionGate roles={["doctor", "owner"]}>
                <AddendumSection encounterId={params.encounterId} />
              </PermissionGate>
            </div>
          )}

          {/* AI Scribe widget — AFTER clinical sections and Addenda, before bottom tabs.
              id="section-plan" is the scroll-spy anchor for the Plan tab.
              id="ai-scribe-section" is used by StickyMicButton Done action to scroll here. */}
          <div id="section-plan">
          <div id="ai-scribe-section">
            <PermissionGate roles={["doctor", "owner"]}>
              {!isFinalized ? (
                <AiScribeWidget
                  encounterId={params.encounterId}
                  onReviewMerge={() => setReviewMode(true)}
                />
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
          </div>

          {/* Bottom tab navigation — removed from DOM in pre-test mode */}
          <EncounterBottomTabs
            status={encounterState?.status ?? "in_exam"}
            isFinalized={isFinalized}
            sidebarCollapsed={sidebarCollapsed}
            patientId={patientId ?? ""}
            canFinalize={canFinalize}
            onAdvanceStatus={handleAdvanceStatus}
            onRevertToPretest={handleRevertToPretest}
          />

          {/* Sticky mic FAB — only during in_exam for doctor/owner */}
          {encounterStatus === "in_exam" && (
            <PermissionGate roles={["doctor", "owner"]}>
              <StickyMicButton encounterId={params.encounterId} />
            </PermissionGate>
          )}
        </>
      )}

      {/* Spacer so fixed bottom bar doesn't overlap content */}
      <div className="h-16" />

      {/* Undo toast */}
      {undoToast && (
        <div className="fixed bottom-20 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--glass-border)] shadow-[var(--shadow-lg)] animate-fade-in">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3.5 7.5l2.5 2.5 4.5-5" />
          </svg>
          <span className="text-xs font-medium text-[var(--text-primary)]">
            {undoToast.count} field{undoToast.count !== 1 ? "s" : ""} applied
          </span>
          <button
            type="button"
            onClick={handleUndo}
            className="text-xs px-3 py-1.5 rounded-lg font-semibold text-[var(--accent)] border border-[var(--accent)]/30 hover:bg-[var(--accent)]/10 transition-colors"
          >
            Undo
          </button>
          {/* 8-second progress bar */}
          <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-xl overflow-hidden">
            <div
              className="h-full bg-[var(--accent)]/30"
              style={{ animation: "shrink-bar 8s linear forwards" }}
            />
          </div>
        </div>
      )}

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
        patientId={patientId ?? ""}
      />

      {/* Superbill modal (shown after finalization) */}
      <BillingWorkflowDialog
        open={superbillOpen}
        onOpenChange={setSuperbillOpen}
        encounterId={params.encounterId}
        patientId={encounterState?.patientId ?? ""}
        patientName={encounterState?.patientName ?? "Patient"}
        providerName={encounterState?.providerName ?? "Unknown Provider"}
        encounterDate={encounterState?.encounterDate ?? clinicToday(clinicTz)}
      />
    </div>
  );
}
