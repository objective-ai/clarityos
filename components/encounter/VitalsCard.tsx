"use client";

import { useVitalsDraft } from "@/store/vitalsStore";
import { isIopElevated } from "@/types/vitals";
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

interface VitalsCardProps {
  encounterId: string;
  isReadOnly?: boolean;
}

// ---------------------------------------------------------------------------
// IOP Method label
// ---------------------------------------------------------------------------

const IOP_METHOD_LABELS: Record<string, string> = {
  goldmann: "Goldmann",
  icare: "iCare",
  air_puff: "Air Puff",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VitalsCard({ encounterId, isReadOnly = false }: VitalsCardProps) {
  const draft = useVitalsDraft(encounterId);

  if (!draft) return null;

  const odElevated = isIopElevated(draft.iop_od);
  const osElevated = isIopElevated(draft.iop_os);

  return (
    <Card className={isReadOnly ? "opacity-75" : ""}>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Vitals &amp; Pre-Test</CardTitle>
          <CardDescription>Recorded by technician</CardDescription>
        </div>
        {isReadOnly && (
          <Badge variant="outline" className="gap-1.5 text-[var(--text-muted)]">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="1.5" y="5.5" width="9" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
              <path d="M3.5 5.5V4a2.5 2.5 0 015 0v1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            Locked
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* IOP */}
          <div className="rounded-xl p-3 bg-[var(--bg-glass)] border border-[var(--glass-border)]">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Intraocular Pressure</div>
              {draft.iop_method && (
                <span className="text-[11px] text-[var(--text-muted)]">
                  {IOP_METHOD_LABELS[draft.iop_method] ?? draft.iop_method}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { eye: "OD", val: draft.iop_od, elevated: odElevated },
                { eye: "OS", val: draft.iop_os, elevated: osElevated },
              ].map(({ eye, val, elevated }) => (
                <div
                  key={eye}
                  className={`flex flex-col items-center p-3 rounded-xl border ${
                    elevated
                      ? "bg-[rgba(251,191,36,0.06)] border-[rgba(251,191,36,0.20)]"
                      : "bg-[var(--bg-elevated)] border-[var(--border-subtle)]"
                  }`}
                >
                  <span className="text-overline">{eye}</span>
                  <span
                    className={`text-3xl data-value my-1 ${
                      elevated ? "text-[var(--state-warning)]" : ""
                    }`}
                  >
                    {val ?? "—"}
                  </span>
                  <span className="text-[11px] text-[var(--text-muted)]">
                    mmHg{" "}
                    {elevated && (
                      <Badge variant="warning" className="ml-1 text-[10px] px-1.5 py-0">
                        elevated
                      </Badge>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Visual Acuity */}
          <div className="rounded-xl p-3 bg-[var(--bg-glass)] border border-[var(--glass-border)]">
            <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-2">Visual Acuity</div>
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="text-left pb-2 text-overline">Measure</th>
                  <th className="text-center pb-2 text-overline">OD</th>
                  <th className="text-center pb-2 text-overline">OS</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "UCVA", od: draft.ucva_od, os: draft.ucva_os },
                  { label: "BCVA", od: draft.bcva_od, os: draft.bcva_os },
                  { label: "Near", od: draft.near_va_od, os: draft.near_va_os },
                ].map((row) => (
                  <tr key={row.label} className="border-t border-[var(--border-subtle)]">
                    <td className="py-1.5 text-overline" style={{ textTransform: "none" }}>
                      {row.label}
                    </td>
                    <td className="py-1.5 text-center text-base data-value">
                      {row.od ?? "—"}
                    </td>
                    <td className="py-1.5 text-center text-base data-value">
                      {row.os ?? "—"}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-[var(--border-subtle)]">
                  <td className="py-1.5 text-overline" style={{ textTransform: "none" }}>
                    BP
                  </td>
                  <td colSpan={2} className="py-1.5 text-center text-base data-value">
                    {draft.blood_pressure ?? "—"}
                  </td>
                </tr>
                <tr className="border-t border-[var(--border-subtle)]">
                  <td className="py-1.5 text-overline" style={{ textTransform: "none" }}>
                    Pulse
                  </td>
                  <td colSpan={2} className="py-1.5 text-center text-base data-value">
                    {draft.pulse != null ? `${draft.pulse} bpm` : "—"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Pupil & Notes row */}
        {(draft.pupils_equal_round_reactive !== undefined ||
          draft.relative_afferent_pupillary_defect ||
          draft.cover_test_notes ||
          draft.technician_notes) && (
          <div className="flex items-center gap-3 flex-wrap mt-3 pt-3 border-t border-[var(--border-subtle)]">
            <Badge variant={draft.pupils_equal_round_reactive ? "default" : "warning"}>
              PERRL: {draft.pupils_equal_round_reactive ? "Yes" : "No"}
            </Badge>
            {draft.relative_afferent_pupillary_defect && (
              <Badge variant="destructive">RAPD +</Badge>
            )}
            {draft.cover_test_notes && (
              <span className="text-xs text-[var(--text-secondary)]">
                Cover test: {draft.cover_test_notes}
              </span>
            )}
            {draft.technician_notes && (
              <span className="text-xs text-[var(--text-secondary)]">
                Note: {draft.technician_notes}
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
