"use client";

import { useCallback, useEffect, useRef } from "react";
import { CheckCircle } from "lucide-react";
import { useVitalsStore, useVitalsState } from "@/store/vitalsStore";
import { isIopElevated } from "@/types/vitals";
import type { VitalsDraft, IopMethod } from "@/types/vitals";
import { Badge } from "@/components/ui/badge";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VitalsFormProps {
  encounterId: string;
  onNormalSection?: (section: string) => void;
  /** Increment to trigger all-normal from parent (avoids cross-component reactivity issues) */
  allNormalTrigger?: number;
}

// ---------------------------------------------------------------------------
// Save status badge
// ---------------------------------------------------------------------------

function SaveStatusBadge({ status }: { status: string }) {
  if (status === "idle") return null;

  const config: Record<string, { label: string; variant: "default" | "warning" | "destructive" | "outline" }> = {
    dirty: { label: "Unsaved", variant: "outline" },
    saving: { label: "Saving…", variant: "default" },
    saved: { label: "Saved", variant: "default" },
    error: { label: "Error", variant: "destructive" },
  };

  const c = config[status];
  if (!c) return null;

  return (
    <Badge variant={c.variant} className="gap-1.5">
      {status === "saving" && (
        <span className="w-2 h-2 rounded-full border border-current border-t-transparent animate-spin" />
      )}
      {c.label}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Shared input styles
// ---------------------------------------------------------------------------

const NORMAL_BTN_CLASS =
  "text-xs px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)]/40 transition-colors";

const INPUT_COMPACT =
  "w-full px-2 py-1.5 rounded-lg text-xs glass-input";

const LABEL_COMPACT = "text-xs uppercase tracking-wider text-[var(--text-muted)] mb-0.5 block";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VitalsForm({ encounterId, onNormalSection, allNormalTrigger }: VitalsFormProps) {
  const vitalsState = useVitalsState(encounterId);
  const setField = useVitalsStore((s) => s.setField);
  const flushSave = useVitalsStore((s) => s.flushSave);

  const draft = vitalsState?.draft;
  const saveStatus = vitalsState?.saveStatus ?? "idle";

  const getError = useCallback(
    (field: string) => {
      const errors = vitalsState?.errors ?? [];
      return errors.find((e) => e.field === field)?.message;
    },
    [vitalsState?.errors]
  );

  const handleChange = useCallback(
    (field: keyof VitalsDraft, value: unknown) => {
      setField(encounterId, field, value);
    },
    [encounterId, setField]
  );

  const handleBlur = useCallback(() => {
    flushSave(encounterId);
  }, [encounterId, flushSave]);

  // Per-section Normal handlers
  const handleVaNormal = useCallback(() => {
    setField(encounterId, "ucva_od", "20/20");
    setField(encounterId, "ucva_os", "20/20");
    setField(encounterId, "bcva_od", "20/20");
    setField(encounterId, "bcva_os", "20/20");
    onNormalSection?.("va");
  }, [encounterId, setField, onNormalSection]);

  const handlePupilNormal = useCallback(() => {
    setField(encounterId, "pupils_equal_round_reactive", true);
    setField(encounterId, "relative_afferent_pupillary_defect", false);
    setField(encounterId, "confrontation", "Full");
    setField(encounterId, "motility", "Full");
    setField(encounterId, "npc", "Normal");
    setField(encounterId, "cover_test_notes", "Ortho");
    onNormalSection?.("pupil");
  }, [encounterId, setField, onNormalSection]);

  const handleInstrumentsNormal = useCallback(() => {
    setField(encounterId, "color_vision", "Normal");
    onNormalSection?.("instruments");
  }, [encounterId, setField, onNormalSection]);

  // All Normal trigger from parent — runs all section handlers within this component's context
  const prevTrigger = useRef(allNormalTrigger);
  useEffect(() => {
    if (allNormalTrigger !== undefined && allNormalTrigger !== prevTrigger.current) {
      prevTrigger.current = allNormalTrigger;
      handleVaNormal();
      handlePupilNormal();
      handleInstrumentsNormal();
      flushSave(encounterId);
    }
  }, [allNormalTrigger, handleVaNormal, handlePupilNormal, handleInstrumentsNormal, flushSave, encounterId]);

  if (!draft) return null;

  const odElevated = isIopElevated(draft.iop_od);
  const osElevated = isIopElevated(draft.iop_os);

  return (
      <div className="flex flex-col gap-3">
        {/* Header row — title + All Normal + save status */}
        <div className="flex items-center gap-3">
          <h3 className="text-xs font-semibold text-[var(--text-primary)]">Pre-Test</h3>
          <button type="button" onClick={() => { handleVaNormal(); handlePupilNormal(); handleInstrumentsNormal(); flushSave(encounterId); }} className={NORMAL_BTN_CLASS}>All Normal</button>
          <div className="ml-auto"><SaveStatusBadge status={saveStatus} /></div>
        </div>

        {/* 2-column grid with bordered sections */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

          {/* ── Left Column: VA + Instruments ─────────── */}
          <div className="flex flex-col gap-3">

            {/* Visual Acuity */}
            <div id="section-pretest-va" className="rounded-xl p-3 bg-[var(--bg-glass)] border border-[var(--glass-border)]">
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Visual Acuity</span>
                <button type="button" onClick={handleVaNormal} className="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors" title="Set normal values"><CheckCircle size={14} /></button>
              </div>
              <div className="grid grid-cols-[auto_1fr_1fr] gap-x-3 gap-y-1.5 items-center">
                <div /><div className="text-xs uppercase tracking-wider text-[var(--text-muted)] text-center">OD</div><div className="text-xs uppercase tracking-wider text-[var(--text-muted)] text-center">OS</div>
                <div className="text-xs text-[var(--text-secondary)]">UCVA</div>
                <input id="acc_ucva_od" type="text" value={draft.ucva_od ?? ""} onChange={(e) => handleChange("ucva_od", e.target.value || null)} onBlur={handleBlur} placeholder="20/" className={INPUT_COMPACT} />
                <input id="acc_ucva_os" type="text" value={draft.ucva_os ?? ""} onChange={(e) => handleChange("ucva_os", e.target.value || null)} onBlur={handleBlur} placeholder="20/" className={INPUT_COMPACT} />
                <div className="text-xs text-[var(--text-secondary)]">BCVA</div>
                <input id="acc_bcva_od" type="text" value={draft.bcva_od ?? ""} onChange={(e) => handleChange("bcva_od", e.target.value || null)} onBlur={handleBlur} placeholder="20/" className={INPUT_COMPACT} />
                <input id="acc_bcva_os" type="text" value={draft.bcva_os ?? ""} onChange={(e) => handleChange("bcva_os", e.target.value || null)} onBlur={handleBlur} placeholder="20/" className={INPUT_COMPACT} />
                <div className="text-xs text-[var(--text-secondary)]">Near</div>
                <input id="acc_near_va_od" type="text" value={draft.near_va_od ?? ""} onChange={(e) => handleChange("near_va_od", e.target.value || null)} onBlur={handleBlur} placeholder="J1" className={INPUT_COMPACT} />
                <input id="acc_near_va_os" type="text" value={draft.near_va_os ?? ""} onChange={(e) => handleChange("near_va_os", e.target.value || null)} onBlur={handleBlur} placeholder="J1" className={INPUT_COMPACT} />
              </div>
            </div>

            {/* Instruments */}
            <div id="section-pretest-instruments" className="rounded-xl p-3 bg-[var(--bg-glass)] border border-[var(--glass-border)]">
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Instruments</span>
                <button type="button" onClick={handleInstrumentsNormal} className="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors" title="Set normal values"><CheckCircle size={14} /></button>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-2">
                <div>
                  <label className={LABEL_COMPACT} htmlFor="acc_iop_od">IOP OD</label>
                  <div className="relative"><input id="acc_iop_od" type="number" min={0} max={80} step={0.5} value={draft.iop_od ?? ""} onChange={(e) => handleChange("iop_od", e.target.value === "" ? null : parseFloat(e.target.value))} onBlur={handleBlur} placeholder="—" className={`${INPUT_COMPACT} pr-10 ${odElevated ? "border-[rgba(251,191,36,0.5)]" : ""}`} /><span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)]">mmHg</span></div>
                  {odElevated && <span className="text-xs text-[var(--state-warning)]">elevated</span>}
                </div>
                <div>
                  <label className={LABEL_COMPACT} htmlFor="acc_iop_os">IOP OS</label>
                  <div className="relative"><input id="acc_iop_os" type="number" min={0} max={80} step={0.5} value={draft.iop_os ?? ""} onChange={(e) => handleChange("iop_os", e.target.value === "" ? null : parseFloat(e.target.value))} onBlur={handleBlur} placeholder="—" className={`${INPUT_COMPACT} pr-10 ${osElevated ? "border-[rgba(251,191,36,0.5)]" : ""}`} /><span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)]">mmHg</span></div>
                  {osElevated && <span className="text-xs text-[var(--state-warning)]">elevated</span>}
                </div>
                <div>
                  <label className={LABEL_COMPACT} htmlFor="acc_iop_method">Method</label>
                  <select id="acc_iop_method" value={draft.iop_method ?? ""} onChange={(e) => handleChange("iop_method", e.target.value === "" ? null : (e.target.value as IopMethod))} onBlur={handleBlur} className={INPUT_COMPACT}><option value="">Select…</option><option value="goldmann">Goldmann</option><option value="icare">iCare</option><option value="air_puff">Air Puff</option></select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className={LABEL_COMPACT} htmlFor="autorefractor">Autorefractor</label><input id="autorefractor" type="text" value={draft.autorefractor ?? ""} onChange={(e) => handleChange("autorefractor", e.target.value || null)} onBlur={handleBlur} placeholder="OD/OS" className={INPUT_COMPACT} /></div>
                <div><label className={LABEL_COMPACT} htmlFor="keratometer">Keratometer</label><input id="keratometer" type="text" value={draft.keratometer ?? ""} onChange={(e) => handleChange("keratometer", e.target.value || null)} onBlur={handleBlur} placeholder="OD/OS" className={INPUT_COMPACT} /></div>
                <div><label className={LABEL_COMPACT} htmlFor="entrance_rx">Entrance Rx</label><input id="entrance_rx" type="text" value={draft.entrance_rx ?? ""} onChange={(e) => handleChange("entrance_rx", e.target.value || null)} onBlur={handleBlur} placeholder="OD/OS" className={INPUT_COMPACT} /></div>
                <div><label className={LABEL_COMPACT} htmlFor="color_vision">Color Vision</label><input id="color_vision" type="text" value={draft.color_vision ?? ""} onChange={(e) => handleChange("color_vision", e.target.value || null)} onBlur={handleBlur} placeholder="Normal" className={INPUT_COMPACT} /></div>
              </div>
            </div>

          </div>

          {/* ── Right Column: Pupils + Systemic ──────── */}
          <div className="flex flex-col gap-3">

            {/* Pupils & Motility */}
            <div id="section-pretest-pupils" className="rounded-xl p-3 bg-[var(--bg-glass)] border border-[var(--glass-border)]">
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Pupils &amp; Motility</span>
                <button type="button" onClick={handlePupilNormal} className="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors" title="Set normal values"><CheckCircle size={14} /></button>
              </div>
              <div className="flex items-center gap-2 mb-2">
                <button type="button" onClick={() => handleChange("pupils_equal_round_reactive", !draft.pupils_equal_round_reactive)} onBlur={handleBlur}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all border ${draft.pupils_equal_round_reactive ? "bg-[var(--accent-dim)] text-[var(--accent)] border-[var(--mono-border)]" : "bg-[var(--bg-elevated)] text-[var(--text-muted)] border-[var(--border-default)]"}`}>
                  PERRL {draft.pupils_equal_round_reactive ? "\u2713" : "\u2717"}
                </button>
                <button type="button" onClick={() => handleChange("relative_afferent_pupillary_defect", !draft.relative_afferent_pupillary_defect)} onBlur={handleBlur}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all border ${draft.relative_afferent_pupillary_defect ? "bg-[rgba(239,68,68,0.08)] text-[var(--state-critical)] border-[rgba(239,68,68,0.3)]" : "bg-[var(--bg-elevated)] text-[var(--text-muted)] border-[var(--border-default)]"}`}>
                  RAPD {draft.relative_afferent_pupillary_defect ? "+" : "–"}
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div><label className={LABEL_COMPACT} htmlFor="confrontation">Confrontation</label><input id="confrontation" type="text" value={draft.confrontation ?? ""} onChange={(e) => handleChange("confrontation", e.target.value || null)} onBlur={handleBlur} placeholder="Full" className={INPUT_COMPACT} /></div>
                <div><label className={LABEL_COMPACT} htmlFor="motility">Motility</label><input id="motility" type="text" value={draft.motility ?? ""} onChange={(e) => handleChange("motility", e.target.value || null)} onBlur={handleBlur} placeholder="Full" className={INPUT_COMPACT} /></div>
                <div><label className={LABEL_COMPACT} htmlFor="npc">NPC</label><input id="npc" type="text" value={draft.npc ?? ""} onChange={(e) => handleChange("npc", e.target.value || null)} onBlur={handleBlur} placeholder="Normal" className={INPUT_COMPACT} /></div>
                <div><label className={LABEL_COMPACT} htmlFor="acc_cover_test_notes">Cover Test</label><input id="acc_cover_test_notes" type="text" value={draft.cover_test_notes ?? ""} onChange={(e) => handleChange("cover_test_notes", e.target.value || null)} onBlur={handleBlur} placeholder="Ortho" className={INPUT_COMPACT} /></div>
                <div><label className={LABEL_COMPACT} htmlFor="pupils_od_mm">Pupil OD</label><input id="pupils_od_mm" type="number" step={0.5} min={1} max={9} value={draft.pupils_od_mm ?? ""} onChange={(e) => handleChange("pupils_od_mm", e.target.value ? Number(e.target.value) : null)} onBlur={handleBlur} placeholder="mm" className={INPUT_COMPACT} /></div>
                <div><label className={LABEL_COMPACT} htmlFor="pupils_os_mm">Pupil OS</label><input id="pupils_os_mm" type="number" step={0.5} min={1} max={9} value={draft.pupils_os_mm ?? ""} onChange={(e) => handleChange("pupils_os_mm", e.target.value ? Number(e.target.value) : null)} onBlur={handleBlur} placeholder="mm" className={INPUT_COMPACT} /></div>
              </div>
            </div>

            {/* Systemic */}
            <div id="section-pretest-systemic" className="rounded-xl p-3 bg-[var(--bg-glass)] border border-[var(--glass-border)]">
              <div className="mb-1.5"><span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Systemic</span></div>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                  <label className={LABEL_COMPACT} htmlFor="acc_blood_pressure">Blood Pressure</label>
                  <input id="acc_blood_pressure" type="text" value={draft.blood_pressure ?? ""} onChange={(e) => handleChange("blood_pressure", e.target.value || null)} onBlur={handleBlur} placeholder="120/80" className={INPUT_COMPACT} />
                  {getError("blood_pressure") && <p className="text-xs text-[var(--state-critical)] mt-0.5">{getError("blood_pressure")}</p>}
                </div>
                <div>
                  <label className={LABEL_COMPACT} htmlFor="acc_pulse">Pulse</label>
                  <div className="relative"><input id="acc_pulse" type="number" min={30} max={250} value={draft.pulse ?? ""} onChange={(e) => handleChange("pulse", e.target.value === "" ? null : parseInt(e.target.value, 10))} onBlur={handleBlur} placeholder="—" className={`${INPUT_COMPACT} pr-8`} /><span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)]">bpm</span></div>
                  {getError("pulse") && <p className="text-xs text-[var(--state-critical)] mt-0.5">{getError("pulse")}</p>}
                </div>
              </div>
              <div>
                <label className={LABEL_COMPACT} htmlFor="acc_technician_notes">Technician Notes</label>
                <textarea id="acc_technician_notes" rows={2} value={draft.technician_notes ?? ""} onChange={(e) => handleChange("technician_notes", e.target.value || null)} onBlur={handleBlur} placeholder="Additional notes…" className={`${INPUT_COMPACT} resize-y`} />
              </div>
            </div>

          </div>

        </div>
      </div>
    );
}

export default VitalsForm;
