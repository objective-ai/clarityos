"use client";

import { useCallback, useEffect, useRef } from "react";
import { useVitalsStore, useVitalsState } from "@/store/vitalsStore";
import { isIopElevated } from "@/types/vitals";
import type { VitalsDraft, IopMethod } from "@/types/vitals";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VitalsFormProps {
  encounterId: string;
  accordionMode?: boolean;
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

const INPUT_CLASS =
  "w-full px-3 py-2.5 rounded-xl text-xs glass-input min-h-[var(--touch-target)]";

const LABEL_CLASS = "text-overline mb-1.5 block";

const NORMAL_BTN_CLASS =
  "text-xs px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)]/40 transition-colors";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VitalsForm({ encounterId, accordionMode = false, onNormalSection, allNormalTrigger }: VitalsFormProps) {
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

  // ── Flat sections (doctor mode — existing behavior) ──────────────────────

  const iopSection = (
    <div className="rounded-xl p-3 bg-[var(--bg-glass)] border border-[var(--glass-border)]">
      <div className="text-overline mb-2">Intraocular Pressure</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {/* IOP OD */}
        <div>
          <label className={LABEL_CLASS} htmlFor="iop_od">OD (Right)</label>
          <div className="relative">
            <input
              id="iop_od"
              type="number"
              min={0}
              max={80}
              step={0.5}
              value={draft.iop_od ?? ""}
              onChange={(e) =>
                handleChange("iop_od", e.target.value === "" ? null : parseFloat(e.target.value))
              }
              onBlur={handleBlur}
              placeholder="—"
              className={`${INPUT_CLASS} pr-14 ${odElevated ? "border-[rgba(251,191,36,0.5)]" : ""}`}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)]">mmHg</span>
          </div>
          {odElevated && <Badge variant="warning" className="mt-1.5 text-xs">elevated</Badge>}
          {getError("iop_od") && <p className="text-xs text-[var(--state-critical)] mt-1">{getError("iop_od")}</p>}
        </div>

        {/* IOP OS */}
        <div>
          <label className={LABEL_CLASS} htmlFor="iop_os">OS (Left)</label>
          <div className="relative">
            <input
              id="iop_os"
              type="number"
              min={0}
              max={80}
              step={0.5}
              value={draft.iop_os ?? ""}
              onChange={(e) =>
                handleChange("iop_os", e.target.value === "" ? null : parseFloat(e.target.value))
              }
              onBlur={handleBlur}
              placeholder="—"
              className={`${INPUT_CLASS} pr-14 ${osElevated ? "border-[rgba(251,191,36,0.5)]" : ""}`}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)]">mmHg</span>
          </div>
          {osElevated && <Badge variant="warning" className="mt-1.5 text-xs">elevated</Badge>}
          {getError("iop_os") && <p className="text-xs text-[var(--state-critical)] mt-1">{getError("iop_os")}</p>}
        </div>

        {/* IOP Method */}
        <div className="col-span-2 sm:col-span-1">
          <label className={LABEL_CLASS} htmlFor="iop_method">Method</label>
          <select
            id="iop_method"
            value={draft.iop_method ?? ""}
            onChange={(e) =>
              handleChange("iop_method", e.target.value === "" ? null : (e.target.value as IopMethod))
            }
            onBlur={handleBlur}
            className={INPUT_CLASS}
          >
            <option value="">Select…</option>
            <option value="goldmann">Goldmann</option>
            <option value="icare">iCare</option>
            <option value="air_puff">Air Puff</option>
          </select>
        </div>
      </div>
    </div>
  );

  const vaSection = (
    <div className="rounded-xl p-3 bg-[var(--bg-glass)] border border-[var(--glass-border)]">
      <div className="text-overline mb-2">Visual Acuity</div>
      <div className="grid grid-cols-[auto_1fr_1fr] gap-x-3 gap-y-2 items-center">
        <div /><div className="text-overline text-center">OD</div><div className="text-overline text-center">OS</div>
        <div className="text-overline" style={{ textTransform: "none" }}>UCVA</div>
        <input id="ucva_od" type="text" value={draft.ucva_od ?? ""} onChange={(e) => handleChange("ucva_od", e.target.value || null)} onBlur={handleBlur} placeholder="20/" className={INPUT_CLASS} />
        <input id="ucva_os" type="text" value={draft.ucva_os ?? ""} onChange={(e) => handleChange("ucva_os", e.target.value || null)} onBlur={handleBlur} placeholder="20/" className={INPUT_CLASS} />
        <div className="text-overline" style={{ textTransform: "none" }}>BCVA</div>
        <input id="bcva_od" type="text" value={draft.bcva_od ?? ""} onChange={(e) => handleChange("bcva_od", e.target.value || null)} onBlur={handleBlur} placeholder="20/" className={INPUT_CLASS} />
        <input id="bcva_os" type="text" value={draft.bcva_os ?? ""} onChange={(e) => handleChange("bcva_os", e.target.value || null)} onBlur={handleBlur} placeholder="20/" className={INPUT_CLASS} />
        <div className="text-overline" style={{ textTransform: "none" }}>Near</div>
        <input id="near_va_od" type="text" value={draft.near_va_od ?? ""} onChange={(e) => handleChange("near_va_od", e.target.value || null)} onBlur={handleBlur} placeholder="J1" className={INPUT_CLASS} />
        <input id="near_va_os" type="text" value={draft.near_va_os ?? ""} onChange={(e) => handleChange("near_va_os", e.target.value || null)} onBlur={handleBlur} placeholder="J1" className={INPUT_CLASS} />
      </div>
    </div>
  );

  const systemicSection = (
    <div className="rounded-xl p-3 bg-[var(--bg-glass)] border border-[var(--glass-border)]">
      <div className="text-overline mb-2">Systemic</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className={LABEL_CLASS} htmlFor="blood_pressure">Blood Pressure</label>
          <input id="blood_pressure" type="text" value={draft.blood_pressure ?? ""} onChange={(e) => handleChange("blood_pressure", e.target.value || null)} onBlur={handleBlur} placeholder="120/80" className={INPUT_CLASS} />
          {getError("blood_pressure") && <p className="text-xs text-[var(--state-critical)] mt-1">{getError("blood_pressure")}</p>}
        </div>
        <div>
          <label className={LABEL_CLASS} htmlFor="pulse">Pulse</label>
          <div className="relative">
            <input id="pulse" type="number" min={30} max={250} value={draft.pulse ?? ""} onChange={(e) => handleChange("pulse", e.target.value === "" ? null : parseInt(e.target.value, 10))} onBlur={handleBlur} placeholder="—" className={`${INPUT_CLASS} pr-12`} />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)]">bpm</span>
          </div>
          {getError("pulse") && <p className="text-xs text-[var(--state-critical)] mt-1">{getError("pulse")}</p>}
        </div>
      </div>
    </div>
  );

  const pupilsSection = (
    <div className="rounded-xl p-3 bg-[var(--bg-glass)] border border-[var(--glass-border)]">
      <div className="text-overline mb-2">Pupils &amp; Notes</div>
      <div className="flex items-center gap-2 mb-2">
        <button
          type="button"
          onClick={() => handleChange("pupils_equal_round_reactive", !draft.pupils_equal_round_reactive)}
          onBlur={handleBlur}
          className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all border ${
            draft.pupils_equal_round_reactive
              ? "bg-[var(--accent-dim)] text-[var(--accent)] border-[var(--mono-border)]"
              : "bg-[var(--bg-elevated)] text-[var(--text-muted)] border-[var(--border-default)]"
          }`}
        >
          PERRL {draft.pupils_equal_round_reactive ? "\u2713" : "\u2717"}
        </button>
        <button
          type="button"
          onClick={() => handleChange("relative_afferent_pupillary_defect", !draft.relative_afferent_pupillary_defect)}
          onBlur={handleBlur}
          className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all border ${
            draft.relative_afferent_pupillary_defect
              ? "bg-[rgba(239,68,68,0.08)] text-[var(--state-critical)] border-[rgba(239,68,68,0.3)]"
              : "bg-[var(--bg-elevated)] text-[var(--text-muted)] border-[var(--border-default)]"
          }`}
        >
          RAPD {draft.relative_afferent_pupillary_defect ? "+" : "–"}
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className={LABEL_CLASS} htmlFor="cover_test_notes">Cover Test</label>
          <textarea id="cover_test_notes" rows={2} value={draft.cover_test_notes ?? ""} onChange={(e) => handleChange("cover_test_notes", e.target.value || null)} onBlur={handleBlur} placeholder="Cover/uncover findings…" className={`${INPUT_CLASS} resize-y`} />
        </div>
        <div>
          <label className={LABEL_CLASS} htmlFor="technician_notes">Technician Notes</label>
          <textarea id="technician_notes" rows={2} value={draft.technician_notes ?? ""} onChange={(e) => handleChange("technician_notes", e.target.value || null)} onBlur={handleBlur} placeholder="Additional notes…" className={`${INPUT_CLASS} resize-y`} />
        </div>
      </div>
    </div>
  );

  // ── Accordion mode (technician / pre-test) ───────────────────────────────

  if (accordionMode) {
    return (
      <Card className="glass-card-accent">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Vitals &amp; Pre-Test</CardTitle>
            <CardDescription>Technician data entry</CardDescription>
          </div>
          <SaveStatusBadge status={saveStatus} />
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" defaultValue={["va", "pupil", "instruments", "systemic"]}>

            {/* ── Visual Acuity ─────────────────────────── */}
            <AccordionItem value="va" id="section-pretest-va">
              <AccordionTrigger>Visual Acuity</AccordionTrigger>
              <AccordionContent>
                <div className="flex justify-end mb-3">
                  <button type="button" onClick={handleVaNormal} className={NORMAL_BTN_CLASS}>
                    Normal
                  </button>
                </div>
                <div className="grid grid-cols-[auto_1fr_1fr] gap-x-3 gap-y-2 items-center">
                  <div /><div className="text-overline text-center">OD</div><div className="text-overline text-center">OS</div>
                  <div className="text-overline" style={{ textTransform: "none" }}>UCVA</div>
                  <input id="acc_ucva_od" type="text" value={draft.ucva_od ?? ""} onChange={(e) => handleChange("ucva_od", e.target.value || null)} onBlur={handleBlur} placeholder="20/" className={INPUT_CLASS} />
                  <input id="acc_ucva_os" type="text" value={draft.ucva_os ?? ""} onChange={(e) => handleChange("ucva_os", e.target.value || null)} onBlur={handleBlur} placeholder="20/" className={INPUT_CLASS} />
                  <div className="text-overline" style={{ textTransform: "none" }}>BCVA</div>
                  <input id="acc_bcva_od" type="text" value={draft.bcva_od ?? ""} onChange={(e) => handleChange("bcva_od", e.target.value || null)} onBlur={handleBlur} placeholder="20/" className={INPUT_CLASS} />
                  <input id="acc_bcva_os" type="text" value={draft.bcva_os ?? ""} onChange={(e) => handleChange("bcva_os", e.target.value || null)} onBlur={handleBlur} placeholder="20/" className={INPUT_CLASS} />
                  <div className="text-overline" style={{ textTransform: "none" }}>Near</div>
                  <input id="acc_near_va_od" type="text" value={draft.near_va_od ?? ""} onChange={(e) => handleChange("near_va_od", e.target.value || null)} onBlur={handleBlur} placeholder="J1" className={INPUT_CLASS} />
                  <input id="acc_near_va_os" type="text" value={draft.near_va_os ?? ""} onChange={(e) => handleChange("near_va_os", e.target.value || null)} onBlur={handleBlur} placeholder="J1" className={INPUT_CLASS} />
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* ── Pupil & Motility ──────────────────────── */}
            <AccordionItem value="pupil" id="section-pretest-pupils">
              <AccordionTrigger>Pupil &amp; Motility</AccordionTrigger>
              <AccordionContent>
                <div className="flex justify-end mb-3">
                  <button type="button" onClick={handlePupilNormal} className={NORMAL_BTN_CLASS}>
                    Normal
                  </button>
                </div>

                {/* PERRL / RAPD toggles */}
                <div className="flex items-center gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => handleChange("pupils_equal_round_reactive", !draft.pupils_equal_round_reactive)}
                    onBlur={handleBlur}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all border ${
                      draft.pupils_equal_round_reactive
                        ? "bg-[var(--accent-dim)] text-[var(--accent)] border-[var(--mono-border)]"
                        : "bg-[var(--bg-elevated)] text-[var(--text-muted)] border-[var(--border-default)]"
                    }`}
                  >
                    PERRL {draft.pupils_equal_round_reactive ? "\u2713" : "\u2717"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleChange("relative_afferent_pupillary_defect", !draft.relative_afferent_pupillary_defect)}
                    onBlur={handleBlur}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all border ${
                      draft.relative_afferent_pupillary_defect
                        ? "bg-[rgba(239,68,68,0.08)] text-[var(--state-critical)] border-[rgba(239,68,68,0.3)]"
                        : "bg-[var(--bg-elevated)] text-[var(--text-muted)] border-[var(--border-default)]"
                    }`}
                  >
                    RAPD {draft.relative_afferent_pupillary_defect ? "+" : "–"}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {/* Confrontation */}
                  <div>
                    <label className={LABEL_CLASS} htmlFor="confrontation">Confrontation Fields</label>
                    <input id="confrontation" type="text" value={draft.confrontation ?? ""} onChange={(e) => handleChange("confrontation", e.target.value || null)} onBlur={handleBlur} placeholder="Full" className={INPUT_CLASS} />
                  </div>

                  {/* Motility */}
                  <div>
                    <label className={LABEL_CLASS} htmlFor="motility">Motility</label>
                    <input id="motility" type="text" value={draft.motility ?? ""} onChange={(e) => handleChange("motility", e.target.value || null)} onBlur={handleBlur} placeholder="Full" className={INPUT_CLASS} />
                  </div>

                  {/* NPC */}
                  <div>
                    <label className={LABEL_CLASS} htmlFor="npc">NPC</label>
                    <input id="npc" type="text" value={draft.npc ?? ""} onChange={(e) => handleChange("npc", e.target.value || null)} onBlur={handleBlur} placeholder="Normal" className={INPUT_CLASS} />
                  </div>

                  {/* Cover Test */}
                  <div>
                    <label className={LABEL_CLASS} htmlFor="acc_cover_test_notes">Cover Test</label>
                    <input id="acc_cover_test_notes" type="text" value={draft.cover_test_notes ?? ""} onChange={(e) => handleChange("cover_test_notes", e.target.value || null)} onBlur={handleBlur} placeholder="Ortho" className={INPUT_CLASS} />
                  </div>

                  {/* Pupils OD mm */}
                  <div>
                    <label className={LABEL_CLASS} htmlFor="pupils_od_mm">Pupils OD (mm)</label>
                    <input id="pupils_od_mm" type="number" step={0.5} min={1} max={9} value={draft.pupils_od_mm ?? ""} onChange={(e) => handleChange("pupils_od_mm", e.target.value ? Number(e.target.value) : null)} onBlur={handleBlur} placeholder="mm" className={INPUT_CLASS} />
                  </div>

                  {/* Pupils OS mm */}
                  <div>
                    <label className={LABEL_CLASS} htmlFor="pupils_os_mm">Pupils OS (mm)</label>
                    <input id="pupils_os_mm" type="number" step={0.5} min={1} max={9} value={draft.pupils_os_mm ?? ""} onChange={(e) => handleChange("pupils_os_mm", e.target.value ? Number(e.target.value) : null)} onBlur={handleBlur} placeholder="mm" className={INPUT_CLASS} />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* ── Instrument Readings ───────────────────── */}
            <AccordionItem value="instruments" id="section-pretest-instruments">
              <AccordionTrigger>Instrument Readings</AccordionTrigger>
              <AccordionContent>
                <div className="flex justify-end mb-3">
                  <button type="button" onClick={handleInstrumentsNormal} className={NORMAL_BTN_CLASS}>
                    Normal
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
                  {/* IOP OD */}
                  <div>
                    <label className={LABEL_CLASS} htmlFor="acc_iop_od">IOP OD</label>
                    <div className="relative">
                      <input id="acc_iop_od" type="number" min={0} max={80} step={0.5} value={draft.iop_od ?? ""} onChange={(e) => handleChange("iop_od", e.target.value === "" ? null : parseFloat(e.target.value))} onBlur={handleBlur} placeholder="—" className={`${INPUT_CLASS} pr-14 ${odElevated ? "border-[rgba(251,191,36,0.5)]" : ""}`} />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)]">mmHg</span>
                    </div>
                    {odElevated && <Badge variant="warning" className="mt-1.5 text-xs">elevated</Badge>}
                  </div>

                  {/* IOP OS */}
                  <div>
                    <label className={LABEL_CLASS} htmlFor="acc_iop_os">IOP OS</label>
                    <div className="relative">
                      <input id="acc_iop_os" type="number" min={0} max={80} step={0.5} value={draft.iop_os ?? ""} onChange={(e) => handleChange("iop_os", e.target.value === "" ? null : parseFloat(e.target.value))} onBlur={handleBlur} placeholder="—" className={`${INPUT_CLASS} pr-14 ${osElevated ? "border-[rgba(251,191,36,0.5)]" : ""}`} />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)]">mmHg</span>
                    </div>
                    {osElevated && <Badge variant="warning" className="mt-1.5 text-xs">elevated</Badge>}
                  </div>

                  {/* IOP Method */}
                  <div className="col-span-2 sm:col-span-1">
                    <label className={LABEL_CLASS} htmlFor="acc_iop_method">Method</label>
                    <select id="acc_iop_method" value={draft.iop_method ?? ""} onChange={(e) => handleChange("iop_method", e.target.value === "" ? null : (e.target.value as IopMethod))} onBlur={handleBlur} className={INPUT_CLASS}>
                      <option value="">Select…</option>
                      <option value="goldmann">Goldmann</option>
                      <option value="icare">iCare</option>
                      <option value="air_puff">Air Puff</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {/* Autorefractor */}
                  <div>
                    <label className={LABEL_CLASS} htmlFor="autorefractor">Autorefractor</label>
                    <textarea id="autorefractor" rows={2} value={draft.autorefractor ?? ""} onChange={(e) => handleChange("autorefractor", e.target.value || null)} onBlur={handleBlur} placeholder={"OD: ...\nOS: ..."} className={`${INPUT_CLASS} resize-y`} />
                  </div>

                  {/* Keratometer */}
                  <div>
                    <label className={LABEL_CLASS} htmlFor="keratometer">Keratometer</label>
                    <textarea id="keratometer" rows={2} value={draft.keratometer ?? ""} onChange={(e) => handleChange("keratometer", e.target.value || null)} onBlur={handleBlur} placeholder={"OD: ...\nOS: ..."} className={`${INPUT_CLASS} resize-y`} />
                  </div>

                  {/* Entrance Rx */}
                  <div>
                    <label className={LABEL_CLASS} htmlFor="entrance_rx">Entrance Rx</label>
                    <textarea id="entrance_rx" rows={2} value={draft.entrance_rx ?? ""} onChange={(e) => handleChange("entrance_rx", e.target.value || null)} onBlur={handleBlur} placeholder={"OD: ...\nOS: ..."} className={`${INPUT_CLASS} resize-y`} />
                  </div>

                  {/* Color Vision */}
                  <div>
                    <label className={LABEL_CLASS} htmlFor="color_vision">Color Vision</label>
                    <input id="color_vision" type="text" value={draft.color_vision ?? ""} onChange={(e) => handleChange("color_vision", e.target.value || null)} onBlur={handleBlur} placeholder="Normal" className={INPUT_CLASS} />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* ── Systemic ──────────────────────────────── */}
            <AccordionItem value="systemic" id="section-pretest-systemic">
              <AccordionTrigger>Systemic</AccordionTrigger>
              <AccordionContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className={LABEL_CLASS} htmlFor="acc_blood_pressure">Blood Pressure</label>
                    <input id="acc_blood_pressure" type="text" value={draft.blood_pressure ?? ""} onChange={(e) => handleChange("blood_pressure", e.target.value || null)} onBlur={handleBlur} placeholder="120/80" className={INPUT_CLASS} />
                    {getError("blood_pressure") && <p className="text-xs text-[var(--state-critical)] mt-1">{getError("blood_pressure")}</p>}
                  </div>
                  <div>
                    <label className={LABEL_CLASS} htmlFor="acc_pulse">Pulse</label>
                    <div className="relative">
                      <input id="acc_pulse" type="number" min={30} max={250} value={draft.pulse ?? ""} onChange={(e) => handleChange("pulse", e.target.value === "" ? null : parseInt(e.target.value, 10))} onBlur={handleBlur} placeholder="—" className={`${INPUT_CLASS} pr-12`} />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)]">bpm</span>
                    </div>
                    {getError("pulse") && <p className="text-xs text-[var(--state-critical)] mt-1">{getError("pulse")}</p>}
                  </div>
                  <div className="sm:col-span-2">
                    <label className={LABEL_CLASS} htmlFor="acc_technician_notes">Technician Notes</label>
                    <textarea id="acc_technician_notes" rows={2} value={draft.technician_notes ?? ""} onChange={(e) => handleChange("technician_notes", e.target.value || null)} onBlur={handleBlur} placeholder="Additional notes…" className={`${INPUT_CLASS} resize-y`} />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

          </Accordion>
        </CardContent>
      </Card>
    );
  }

  // ── Flat mode (doctor mode — existing layout) ────────────────────────────

  return (
    <Card className="glass-card-accent">
      <CardHeader className="flex flex-row items-center justify-between py-2 px-3">
        <div>
          <CardTitle>Vitals &amp; Pre-Test</CardTitle>
          <CardDescription>Technician data entry</CardDescription>
        </div>
        <SaveStatusBadge status={saveStatus} />
      </CardHeader>
      <CardContent className="space-y-3 px-3 pb-3 pt-0">
        {iopSection}
        {vaSection}
        {systemicSection}
        {pupilsSection}
      </CardContent>
    </Card>
  );
}

export default VitalsForm;
