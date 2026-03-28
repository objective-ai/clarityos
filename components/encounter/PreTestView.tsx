"use client";

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
  return (
    <div id="section-vitals">
      <VitalsForm encounterId={encounterId} accordionMode={true} />
    </div>
  );
}

export default PreTestView;
