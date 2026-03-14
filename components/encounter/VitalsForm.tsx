"use client";

import { useCallback } from "react";
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VitalsFormProps {
  encounterId: string;
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VitalsForm({ encounterId }: VitalsFormProps) {
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

  if (!draft) return null;

  const odElevated = isIopElevated(draft.iop_od);
  const osElevated = isIopElevated(draft.iop_os);

  return (
    <Card className="glass-card-accent">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Vitals &amp; Pre-Test</CardTitle>
          <CardDescription>Technician data entry</CardDescription>
        </div>
        <SaveStatusBadge status={saveStatus} />
      </CardHeader>
      <CardContent className="space-y-6">
        {/* ── Section A: Intraocular Pressure ─────────────────────── */}
        <div className="rounded-xl p-5 bg-[var(--bg-glass)] border border-[var(--glass-border)]">
          <div className="text-overline mb-4">Intraocular Pressure</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {/* IOP OD */}
            <div>
              <label className={LABEL_CLASS} htmlFor="iop_od">
                OD (Right)
              </label>
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
                  className={`${INPUT_CLASS} pr-14 ${
                    odElevated ? "border-[rgba(251,191,36,0.5)]" : ""
                  }`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[var(--text-muted)]">
                  mmHg
                </span>
              </div>
              {odElevated && (
                <Badge variant="warning" className="mt-1.5 text-[10px]">
                  elevated
                </Badge>
              )}
              {getError("iop_od") && (
                <p className="text-[11px] text-[var(--state-critical)] mt-1">{getError("iop_od")}</p>
              )}
            </div>

            {/* IOP OS */}
            <div>
              <label className={LABEL_CLASS} htmlFor="iop_os">
                OS (Left)
              </label>
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
                  className={`${INPUT_CLASS} pr-14 ${
                    osElevated ? "border-[rgba(251,191,36,0.5)]" : ""
                  }`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[var(--text-muted)]">
                  mmHg
                </span>
              </div>
              {osElevated && (
                <Badge variant="warning" className="mt-1.5 text-[10px]">
                  elevated
                </Badge>
              )}
              {getError("iop_os") && (
                <p className="text-[11px] text-[var(--state-critical)] mt-1">{getError("iop_os")}</p>
              )}
            </div>

            {/* IOP Method */}
            <div className="col-span-2 sm:col-span-1">
              <label className={LABEL_CLASS} htmlFor="iop_method">
                Method
              </label>
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

        {/* ── Section B: Visual Acuity ────────────────────────────── */}
        <div className="rounded-xl p-5 bg-[var(--bg-glass)] border border-[var(--glass-border)]">
          <div className="text-overline mb-4">Visual Acuity</div>
          <div className="grid grid-cols-[auto_1fr_1fr] gap-x-4 gap-y-3 items-center">
            {/* Header */}
            <div />
            <div className="text-overline text-center">OD</div>
            <div className="text-overline text-center">OS</div>

            {/* UCVA */}
            <div className="text-overline" style={{ textTransform: "none" }}>
              UCVA
            </div>
            <input
              id="ucva_od"
              type="text"
              value={draft.ucva_od ?? ""}
              onChange={(e) => handleChange("ucva_od", e.target.value || null)}
              onBlur={handleBlur}
              placeholder="20/"
              className={INPUT_CLASS}
            />
            <input
              id="ucva_os"
              type="text"
              value={draft.ucva_os ?? ""}
              onChange={(e) => handleChange("ucva_os", e.target.value || null)}
              onBlur={handleBlur}
              placeholder="20/"
              className={INPUT_CLASS}
            />

            {/* BCVA */}
            <div className="text-overline" style={{ textTransform: "none" }}>
              BCVA
            </div>
            <input
              id="bcva_od"
              type="text"
              value={draft.bcva_od ?? ""}
              onChange={(e) => handleChange("bcva_od", e.target.value || null)}
              onBlur={handleBlur}
              placeholder="20/"
              className={INPUT_CLASS}
            />
            <input
              id="bcva_os"
              type="text"
              value={draft.bcva_os ?? ""}
              onChange={(e) => handleChange("bcva_os", e.target.value || null)}
              onBlur={handleBlur}
              placeholder="20/"
              className={INPUT_CLASS}
            />

            {/* Near VA */}
            <div className="text-overline" style={{ textTransform: "none" }}>
              Near
            </div>
            <input
              id="near_va_od"
              type="text"
              value={draft.near_va_od ?? ""}
              onChange={(e) => handleChange("near_va_od", e.target.value || null)}
              onBlur={handleBlur}
              placeholder="J1"
              className={INPUT_CLASS}
            />
            <input
              id="near_va_os"
              type="text"
              value={draft.near_va_os ?? ""}
              onChange={(e) => handleChange("near_va_os", e.target.value || null)}
              onBlur={handleBlur}
              placeholder="J1"
              className={INPUT_CLASS}
            />
          </div>
        </div>

        {/* ── Section C: Systemic ─────────────────────────────────── */}
        <div className="rounded-xl p-5 bg-[var(--bg-glass)] border border-[var(--glass-border)]">
          <div className="text-overline mb-4">Systemic</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLASS} htmlFor="blood_pressure">
                Blood Pressure
              </label>
              <input
                id="blood_pressure"
                type="text"
                value={draft.blood_pressure ?? ""}
                onChange={(e) => handleChange("blood_pressure", e.target.value || null)}
                onBlur={handleBlur}
                placeholder="120/80"
                className={INPUT_CLASS}
              />
              {getError("blood_pressure") && (
                <p className="text-[11px] text-[var(--state-critical)] mt-1">
                  {getError("blood_pressure")}
                </p>
              )}
            </div>
            <div>
              <label className={LABEL_CLASS} htmlFor="pulse">
                Pulse
              </label>
              <div className="relative">
                <input
                  id="pulse"
                  type="number"
                  min={30}
                  max={250}
                  value={draft.pulse ?? ""}
                  onChange={(e) =>
                    handleChange("pulse", e.target.value === "" ? null : parseInt(e.target.value, 10))
                  }
                  onBlur={handleBlur}
                  placeholder="—"
                  className={`${INPUT_CLASS} pr-12`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[var(--text-muted)]">
                  bpm
                </span>
              </div>
              {getError("pulse") && (
                <p className="text-[11px] text-[var(--state-critical)] mt-1">{getError("pulse")}</p>
              )}
            </div>
          </div>
        </div>

        {/* ── Section D: Pupils & Notes ───────────────────────────── */}
        <div className="rounded-xl p-5 bg-[var(--bg-glass)] border border-[var(--glass-border)]">
          <div className="text-overline mb-4">Pupils &amp; Notes</div>

          {/* Toggle chips */}
          <div className="flex items-center gap-3 mb-4">
            <button
              type="button"
              onClick={() =>
                handleChange("pupils_equal_round_reactive", !draft.pupils_equal_round_reactive)
              }
              onBlur={handleBlur}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all border min-h-[var(--touch-target)] ${
                draft.pupils_equal_round_reactive
                  ? "bg-[var(--accent-dim)] text-[var(--accent)] border-[var(--mono-border)]"
                  : "bg-[var(--bg-elevated)] text-[var(--text-muted)] border-[var(--border-default)]"
              }`}
            >
              PERRL {draft.pupils_equal_round_reactive ? "\u2713" : "\u2717"}
            </button>

            <button
              type="button"
              onClick={() =>
                handleChange(
                  "relative_afferent_pupillary_defect",
                  !draft.relative_afferent_pupillary_defect
                )
              }
              onBlur={handleBlur}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all border min-h-[var(--touch-target)] ${
                draft.relative_afferent_pupillary_defect
                  ? "bg-[rgba(239,68,68,0.08)] text-[var(--state-critical)] border-[rgba(239,68,68,0.3)]"
                  : "bg-[var(--bg-elevated)] text-[var(--text-muted)] border-[var(--border-default)]"
              }`}
            >
              RAPD {draft.relative_afferent_pupillary_defect ? "+" : "–"}
            </button>
          </div>

          {/* Text areas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLASS} htmlFor="cover_test_notes">
                Cover Test
              </label>
              <textarea
                id="cover_test_notes"
                rows={2}
                value={draft.cover_test_notes ?? ""}
                onChange={(e) => handleChange("cover_test_notes", e.target.value || null)}
                onBlur={handleBlur}
                placeholder="Cover/uncover findings…"
                className={`${INPUT_CLASS} resize-none`}
              />
            </div>
            <div>
              <label className={LABEL_CLASS} htmlFor="technician_notes">
                Technician Notes
              </label>
              <textarea
                id="technician_notes"
                rows={2}
                value={draft.technician_notes ?? ""}
                onChange={(e) => handleChange("technician_notes", e.target.value || null)}
                onBlur={handleBlur}
                placeholder="Additional notes…"
                className={`${INPUT_CLASS} resize-none`}
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
