"use client";

import dynamic from "next/dynamic";
import { useCallback } from "react";
import { useVitalsStore, useVitalsState } from "@/store/vitalsStore";
import { useEncounterStore } from "@/store/encounterStore";
import type { VitalsDraft } from "@/types/vitals";

// ---------------------------------------------------------------------------
// Dynamic import — VitalsForm is a heavy client component
// ---------------------------------------------------------------------------

const VitalsForm = dynamic(
  () => import("@/components/encounter/VitalsForm").then((m) => ({ default: m.VitalsForm })),
  { ssr: false }
);

// ---------------------------------------------------------------------------
// All Normal defaults (exported for testability)
// ---------------------------------------------------------------------------

export const ALL_NORMAL_DEFAULTS: Partial<VitalsDraft> = {
  pupils_equal_round_reactive: true,
  relative_afferent_pupillary_defect: false,
  confrontation: "Full",
  motility: "Full",
  color_vision: "Normal",
  npc: "Normal",
  cover_test_notes: "Ortho",
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PreTestViewProps {
  encounterId: string;
  tenantSlug: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PreTestView({ encounterId }: PreTestViewProps) {
  const setField = useVitalsStore((s) => s.setField);
  const flushSave = useVitalsStore((s) => s.flushSave);
  const advanceStatus = useEncounterStore((s) => s.advanceStatus);
  const vitalsState = useVitalsState(encounterId);
  const saveStatus = vitalsState?.saveStatus ?? "idle";

  const handleAllNormal = useCallback(() => {
    for (const [field, value] of Object.entries(ALL_NORMAL_DEFAULTS)) {
      setField(encounterId, field as keyof VitalsDraft, value);
    }
    flushSave(encounterId);
  }, [encounterId, setField, flushSave]);

  const handleReadyForDoctor = useCallback(() => {
    flushSave(encounterId);
    advanceStatus(encounterId);
  }, [encounterId, flushSave, advanceStatus]);

  return (
    <div className="flex flex-col gap-6">
      {/* All Normal button — top right */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleAllNormal}
          className="px-4 py-2 rounded-xl glass-card text-sm font-medium text-[var(--accent)] border border-[var(--accent)]/30 hover:bg-[var(--accent)]/10 transition-colors"
        >
          All Normal
        </button>
      </div>

      {/* VitalsForm in accordion mode */}
      <div id="section-vitals">
        <VitalsForm
          encounterId={encounterId}
          accordionMode={true}
        />
      </div>

      {/* Ready for Doctor — bottom, full width, prominent */}
      <button
        type="button"
        onClick={handleReadyForDoctor}
        disabled={saveStatus === "saving"}
        className="w-full py-3 rounded-xl font-semibold text-white bg-[var(--accent)] hover:bg-[var(--accent)]/90 transition-colors disabled:opacity-50"
      >
        Ready for Doctor
      </button>
    </div>
  );
}

export default PreTestView;
