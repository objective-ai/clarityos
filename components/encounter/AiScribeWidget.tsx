"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useEntitlements } from "@/hooks/useEntitlements";
import { useAiScribe } from "@/hooks/useAiScribe";
import type { ScribeStructuredDataV2 } from "@/types/scribe";
import type { FindingsStoreKey } from "@/types/exam-findings";
import { Entitlement, ENTITLEMENT_META } from "@/lib/entitlements";
import type { EntitlementKey } from "@/types/session";
import { useEncounterStore } from "@/store/encounterStore";
import { useVitalsStore } from "@/store/vitalsStore";
import { useExamFindingsStore } from "@/store/examFindingsStore";
import { useDiagnosisStore } from "@/store/diagnosisStore";
import { useRefractionStore } from "@/store/refractionStore";
import { buildConflicts, type StoreSnapshots } from "./conflict-resolver/buildConflicts";
import { formatClinicTime, useClinicTimezone } from "@/lib/timezone";
import { SCRIBE_SCENARIOS } from "@/lib/scribe-scenarios";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";


// ---------------------------------------------------------------------------
// UpsellModal (moved from page.tsx)
// ---------------------------------------------------------------------------

function UpsellModal({ feature, onClose }: { feature: EntitlementKey; onClose: () => void }) {
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
              {[
                "AI-generated SOAP notes in seconds",
                "Saves 12\u201315 min per encounter",
                "Learns your documentation style",
                "Streams directly into your text fields",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2 text-caption text-[var(--text-secondary)]">
                  <span className="text-[var(--state-normal)]">✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <button className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all bg-[var(--accent)] text-[var(--text-inverse)] hover:brightness-110">
            Upgrade to {meta.plan} &rarr;
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 text-xs mt-2 cursor-pointer underline-offset-2 hover:underline text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
          >
            Not right now
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-views
// ---------------------------------------------------------------------------

function ManualApView({
  value,
  onChange,
  onSave,
  onShowUpsell,
  saved,
}: {
  value: string;
  onChange: (text: string) => void;
  onSave: () => void;
  onShowUpsell: () => void;
  saved: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={6}
        placeholder="1. [Diagnosis] — [Clinical decision]&#10;2. [Next steps / follow-up]"
        className="w-full px-4 py-3 rounded-xl text-sm resize-y min-h-[8rem] glass-input placeholder:text-[var(--text-muted)]"
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={!value.trim()}
          className="px-5 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-[var(--accent)] text-[var(--text-inverse)] hover:brightness-110 shadow-[var(--shadow-sm)]"
        >
          {saved ? "Saved ✓" : "Save"}
        </button>
        <span className="text-xs text-[var(--text-muted)]">Saved on finalize</span>
      </div>
      <div
        className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border cursor-pointer hover:border-[var(--accent)] transition-colors"
        style={{ background: "var(--accent-dim)", borderColor: "var(--mono-border)" }}
        onClick={onShowUpsell}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onShowUpsell()}
      >
        <svg width="14" height="14" viewBox="0 0 18 18" fill="none" className="flex-shrink-0">
          <path d="M9 2L10.8 6.5H15.5L11.8 9.2L13.5 14L9 11L4.5 14L6.2 9.2L2.5 6.5H7.2L9 2Z" stroke="var(--accent)" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
        <span className="text-xs text-[var(--text-secondary)]">
          <span className="font-semibold text-[var(--accent)]">AI Scribe</span> can auto-fill this from a transcript — saves 12–15 min per encounter
        </span>
        <span className="ml-auto text-[10px] font-semibold text-[var(--accent)] whitespace-nowrap">Upgrade →</span>
      </div>
    </div>
  );
}

function DraftView({
  transcript,
  onTranscriptChange,
  onGenerate,
  hasAiScribe,
  error,
  isGenerating,
}: {
  transcript: string;
  onTranscriptChange: (text: string) => void;
  onGenerate: () => void;
  hasAiScribe: boolean;
  error: string | null;
  isGenerating: boolean;
}) {
  // Local state for instant typing feedback; 1.5s debounce to persist to store
  const [localText, setLocalText] = useState(transcript);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Sync from store → local when store value changes externally (e.g. demo transcript init)
  useEffect(() => {
    setLocalText(transcript);
  }, [transcript]);

  const handleChange = useCallback(
    (value: string) => {
      setLocalText(value);
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => onTranscriptChange(value), 1500);
    },
    [onTranscriptChange],
  );

  const handleBlur = useCallback(() => {
    clearTimeout(debounceRef.current);
    onTranscriptChange(localText);
  }, [localText, onTranscriptChange]);

  // Cleanup timer on unmount
  useEffect(() => () => clearTimeout(debounceRef.current), []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="ai-transcript" className="text-overline">
          Clinical Transcript
        </label>
        <textarea
          id="ai-transcript"
          value={localText}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleBlur}
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
        onClick={onGenerate}
        disabled={isGenerating || !transcript.trim()}
        className={`self-start px-6 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
          hasAiScribe
            ? "bg-[var(--accent)] text-[var(--text-inverse)] hover:brightness-110 shadow-[var(--shadow-sm)]"
            : "bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-default)] hover-btn"
        }`}
      >
        {hasAiScribe ? "Generate Note" : "Upgrade to Unlock"}
      </button>
    </div>
  );
}

function StreamingView({ soapText }: { soapText: string }) {
  return (
    <div>
      <pre className="text-xs leading-relaxed whitespace-pre-wrap p-5 rounded-xl font-mono bg-[var(--bg-glass)] text-[var(--text-secondary)] border border-[var(--glass-border)] min-h-[120px]">
        {soapText}
        <span className="inline-block w-1.5 h-3.5 ml-0.5 -mb-0.5 animate-pulse bg-[var(--accent)]" />
      </pre>
      <div className="flex items-center gap-2 mt-3 text-[11px] text-[var(--text-muted)]">
        <div className="w-3 h-3 rounded-full border-2 animate-spin border-[var(--accent)] border-t-transparent" />
        Generating SOAP note...
      </div>
    </div>
  );
}

function AiReadyView({
  soapText,
  generatedAt,
  suggestionsCount,
  onEdit,
  onRedo,
  onReviewMerge,
  error,
  hasConflicts,
}: {
  soapText: string;
  generatedAt?: string;
  suggestionsCount: number;
  onEdit: () => void;
  onRedo: () => void;
  onReviewMerge: () => void;
  error: string | null;
  hasConflicts?: boolean;
}) {
  const tz = useClinicTimezone();
  const formattedTime = generatedAt
    ? formatClinicTime(generatedAt, tz)
    : null;

  return (
    <div>
      <pre className="text-xs leading-relaxed whitespace-pre-wrap p-5 rounded-xl font-mono bg-[var(--bg-glass)] text-[var(--text-secondary)] border border-[var(--glass-border)]">
        {soapText}
      </pre>

      {error && (
        <div className="mt-3 text-xs text-[var(--state-danger)] px-3 py-2 rounded-lg bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.2)]">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <Badge variant="secondary" className="gap-1">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="opacity-70">
            <path d="M2 5.5l2 2 4-4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          AI Generated{formattedTime ? ` · ${formattedTime}` : ""}
        </Badge>

        {suggestionsCount > 0 && (
          <button
            onClick={onReviewMerge}
            className={`text-xs px-4 py-2 rounded-xl font-semibold hover:brightness-110 shadow-[var(--shadow-sm)] transition-all ${
              hasConflicts
                ? "bg-amber-500 text-white"
                : "bg-[var(--accent)] text-[var(--text-inverse)]"
            }`}
          >
            Review & Merge
            <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/20 text-[10px] font-bold">
              {suggestionsCount}
            </span>
          </button>
        )}

        <button
          onClick={onEdit}
          className="text-xs px-3 py-1.5 rounded-xl font-medium text-[var(--text-secondary)] border border-[var(--glass-border)] hover-btn"
        >
          Edit Note
        </button>

        <button
          onClick={onRedo}
          title="Generate a new AI note from a new or updated transcript."
          className="text-xs px-3 py-1.5 rounded-xl font-medium text-[var(--text-muted)] border border-[var(--border-subtle)] hover-btn"
        >
          Redo Note
        </button>
      </div>
    </div>
  );
}

function EditingView({
  draft,
  onDraftChange,
  onSave,
  onCancel,
}: {
  draft: string;
  onDraftChange: (text: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div>
      <textarea
        value={draft}
        onChange={(e) => onDraftChange(e.target.value)}
        rows={12}
        className="w-full text-xs leading-relaxed whitespace-pre-wrap p-5 rounded-xl font-mono glass-input resize-y min-h-[200px]"
      />
      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={onSave}
          className="text-xs px-4 py-1.5 rounded-xl font-semibold bg-[var(--accent)] text-[var(--text-inverse)] hover:brightness-110 shadow-[var(--shadow-sm)] transition-all"
        >
          Save
        </button>
        <button
          onClick={onCancel}
          className="text-xs px-3 py-1.5 rounded-xl font-medium text-[var(--text-muted)] border border-[var(--border-subtle)] hover-btn"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main AiScribeWidget
// ---------------------------------------------------------------------------

export function AiScribeWidget({
  encounterId,
  onReviewMerge,
}: {
  encounterId: string;
  onReviewMerge?: () => void;
}) {
  const { has } = useEntitlements();
  const hasAiScribe = has(Entitlement.AI_SCRIBE);
  const [showUpsell, setShowUpsell] = useState(false);
  const [editDraft, setEditDraft] = useState("");
  const [manualApDraft, setManualApDraft] = useState("");
  const [manualApSaved, setManualApSaved] = useState(false);

  // Store selectors
  const transcript = useEncounterStore((s) => s.encounters[encounterId]?.aiScribeTranscript ?? "");
  const aiText = useEncounterStore((s) => s.encounters[encounterId]?.aiSummaryText ?? "");
  const generatedAt = useEncounterStore((s) => s.encounters[encounterId]?.aiSummaryGeneratedAt);
  const status = useEncounterStore((s) => s.encounters[encounterId]?.aiScribeStatus ?? "draft");

  // Store actions
  const setAiScribeTranscript = useEncounterStore((s) => s.setAiScribeTranscript);
  const setAiScribeStatus = useEncounterStore((s) => s.setAiScribeStatus);
  const setAiSummary = useEncounterStore((s) => s.setAiSummary);

  // AI Scribe hook
  const { generate, soapText, structuredDataV2, isStreaming, isDone, error, reset } =
    useAiScribe(encounterId);

  // --- Derive status: if aiText exists but status is still draft → set to ai_ready ---
  // Runs on hydration and whenever aiText changes (handles async Zustand persist)
  useEffect(() => {
    if (aiText && status === "draft") {
      setAiScribeStatus(encounterId, "ai_ready");
    }
  }, [aiText, status, encounterId, setAiScribeStatus]);

  const handleTranscriptChange = useCallback(
    (text: string) => {
      // Immediate local update via store (no local state needed, store IS the state)
      setAiScribeTranscript(encounterId, text);
    },
    [encounterId, setAiScribeTranscript],
  );

  // Store action for structured data
  const setAiStructuredData = useEncounterStore((s) => s.setAiStructuredData);
  const setAssessmentAndPlan = useEncounterStore((s) => s.setAssessmentAndPlan);
  const storedAssessmentAndPlan = useEncounterStore((s) => s.encounters[encounterId]?.assessmentAndPlan ?? "");
  const storeStructuredData = useEncounterStore(
    (s) => s.encounters[encounterId]?.aiStructuredData ?? null
  );

  // Hydrate manual A&P draft from store on mount
  useEffect(() => {
    if (storedAssessmentAndPlan && !manualApDraft) {
      setManualApDraft(storedAssessmentAndPlan);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedAssessmentAndPlan]);

  const handleManualApSave = useCallback(() => {
    setAssessmentAndPlan(encounterId, manualApDraft);
    setManualApSaved(true);
    setTimeout(() => setManualApSaved(false), 2000);
  }, [encounterId, manualApDraft, setAssessmentAndPlan]);

  // --- Transition: streaming → ai_ready on done ---
  useEffect(() => {
    if (isDone && status === "streaming" && soapText) {
      setAiSummary(encounterId, soapText);
      setAiScribeStatus(encounterId, "ai_ready");
      // Store structured data for the inline merge panel
      if (structuredDataV2) {
        setAiStructuredData(encounterId, structuredDataV2);
      }
    }
  }, [isDone, status, soapText, structuredDataV2, encounterId, setAiSummary, setAiScribeStatus, setAiStructuredData]);

  // --- Recover from interrupted streaming on reload ---
  useEffect(() => {
    if (status === "streaming" && !isStreaming) {
      setAiScribeStatus(encounterId, aiText ? "ai_ready" : "draft");
    }
  }, [status, isStreaming, aiText, encounterId, setAiScribeStatus]);

  // --- Actions ---
  const handleGenerate = useCallback(() => {
    if (!hasAiScribe) {
      setShowUpsell(true);
      return;
    }
    if (!transcript.trim()) return;
    setAiScribeStatus(encounterId, "streaming");
    generate(transcript);
  }, [hasAiScribe, transcript, encounterId, generate, setAiScribeStatus]);

  const handleEdit = useCallback(() => {
    setEditDraft(aiText);
    setAiScribeStatus(encounterId, "editing");
  }, [aiText, encounterId, setAiScribeStatus]);

  const handleSaveEdit = useCallback(() => {
    setAiSummary(encounterId, editDraft);
    setAiScribeStatus(encounterId, "ai_ready");
  }, [editDraft, encounterId, setAiSummary, setAiScribeStatus]);

  const handleCancelEdit = useCallback(() => {
    setAiScribeStatus(encounterId, "ai_ready");
  }, [encounterId, setAiScribeStatus]);

  const handleRedo = useCallback(() => {
    reset();
    setAiSummary(encounterId, "");
    setAiStructuredData(encounterId, null);
    setAssessmentAndPlan(encounterId, "");
    setAiScribeStatus(encounterId, "draft");
  }, [reset, encounterId, setAiSummary, setAiStructuredData, setAssessmentAndPlan, setAiScribeStatus]);

  // Count ALL AI suggestions (not just exam) by running buildConflicts against store snapshots.
  // Falls back to store's persisted aiStructuredData so the button survives page reloads.
  const MANIFEST_RX_COL = 2;
  const { suggestionsCount, hasConflicts } = useMemo(() => {
    const data = structuredDataV2 ?? storeStructuredData;
    if (!data) return { suggestionsCount: 0, hasConflicts: false };

    const encounter = useEncounterStore.getState().encounters[encounterId];
    const vitals = useVitalsStore.getState().encounters[encounterId]?.draft;
    const anteriorKey = `${encounterId}:anterior_segment` as FindingsStoreKey;
    const posteriorKey = `${encounterId}:posterior_segment` as FindingsStoreKey;
    const anteriorSlice = useExamFindingsStore.getState().findings[anteriorKey];
    const posteriorSlice = useExamFindingsStore.getState().findings[posteriorKey];
    const examAnterior = anteriorSlice?.draft;
    const examPosterior = posteriorSlice?.draft;
    const diagnoses = useDiagnosisStore.getState().encounters[encounterId]?.diagnoses ?? [];
    const refractionCol = useRefractionStore.getState().columns[MANIFEST_RX_COL];

    const snapshots: StoreSnapshots = {
      chiefComplaint: encounter?.chiefComplaint ?? null,
      assessmentAndPlan: encounter?.assessmentAndPlan ?? null,
      vitals: vitals ? (vitals as unknown as Record<string, unknown>) : null,
      examAnterior: examAnterior ? {
        findings_od: examAnterior.findings_od as Record<string, { status: string; finding?: string }>,
        findings_os: examAnterior.findings_os as Record<string, { status: string; finding?: string }>,
      } : null,
      examPosterior: examPosterior ? {
        findings_od: examPosterior.findings_od as Record<string, { status: string; finding?: string }>,
        findings_os: examPosterior.findings_os as Record<string, { status: string; finding?: string }>,
      } : null,
      diagnoses: diagnoses.map((d) => ({
        icd10Code: d.icd10Code,
        description: d.description,
        eyeAffected: d.eyeAffected,
      })),
      refractionManifest: refractionCol?.draft ? {
        od: refractionCol.draft.od as unknown as Record<string, unknown>,
        os: refractionCol.draft.os as unknown as Record<string, unknown>,
      } : null,
      examAnteriorSaved: anteriorSlice?.committed != null,
      examPosteriorSaved: posteriorSlice?.committed != null,
    };

    const rows = buildConflicts(data, snapshots);
    return {
      suggestionsCount: rows.length,
      hasConflicts: rows.some((r) => r.hasConflict),
    };
  }, [structuredDataV2, storeStructuredData, encounterId]);

  // --- Render ---
  const renderView = () => {
    // Core plan users get a manual A&P editor instead of the AI Scribe draft view
    if (!hasAiScribe && status === "draft") {
      return (
        <ManualApView
          value={manualApDraft}
          onChange={(text) => { setManualApDraft(text); setManualApSaved(false); }}
          onSave={handleManualApSave}
          onShowUpsell={() => setShowUpsell(true)}
          saved={manualApSaved}
        />
      );
    }

    switch (status) {
      case "draft":
        return (
          <DraftView
            transcript={transcript}
            onTranscriptChange={handleTranscriptChange}
            onGenerate={handleGenerate}
            hasAiScribe={hasAiScribe}
            error={error}
            isGenerating={isStreaming}
          />
        );

      case "streaming":
        return <StreamingView soapText={soapText} />;

      case "ai_ready":
        return (
          <AiReadyView
            soapText={aiText}
            generatedAt={generatedAt}
            suggestionsCount={suggestionsCount}
            onEdit={handleEdit}
            onRedo={handleRedo}
            onReviewMerge={() => onReviewMerge?.()}
            error={error}
            hasConflicts={hasConflicts}
          />
        );

      case "editing":
        return (
          <EditingView
            draft={editDraft}
            onDraftChange={setEditDraft}
            onSave={handleSaveEdit}
            onCancel={handleCancelEdit}
          />
        );

      default:
        return null;
    }
  };

  return (
    <>
      <Card className={hasAiScribe ? "glass-card-accent" : ""}>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>{hasAiScribe ? "AI Scribe" : "Assessment & Plan"}</CardTitle>
            <CardDescription>
              {hasAiScribe
                ? "Paste or dictate a transcript to auto-fill encounter fields"
                : "Document your clinical decisions and next steps"}
            </CardDescription>
          </div>
          {hasAiScribe && process.env.NODE_ENV === "development" && (
            <select
              className="text-xs px-2 py-1 rounded bg-[var(--bg-glass)] border border-[var(--border-subtle)] text-[var(--text-secondary)] max-w-[160px]"
              defaultValue=""
              onChange={(e) => {
                const scenario = SCRIBE_SCENARIOS.find((s) => s.id === e.target.value);
                if (scenario) setAiScribeTranscript(encounterId, scenario.transcript);
                e.target.value = "";
              }}
            >
              <option value="" disabled>[DEV] Load scenario</option>
              {SCRIBE_SCENARIOS.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
          {hasAiScribe && (
            <Badge variant="default">Premium</Badge>
          )}
        </CardHeader>
        <CardContent>{renderView()}</CardContent>
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
