"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

// ---------------------------------------------------------------------------
// Dynamic import — VitalsForm is a heavy client component
// ---------------------------------------------------------------------------

const VitalsForm = dynamic(
  () => import("@/components/encounter/VitalsForm").then((m) => ({ default: m.VitalsForm })),
  { ssr: false }
);

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
  const [allNormalTrigger, setAllNormalTrigger] = useState(0);

  return (
    <div className="flex flex-col gap-6">
      {/* All Normal button — top right */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setAllNormalTrigger((n) => n + 1)}
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
          allNormalTrigger={allNormalTrigger}
        />
      </div>
    </div>
  );
}

export default PreTestView;
