"use client";

interface CostCapBarProps {
  spentCents: number;
  capCents: number;
}

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function CostCapBar({ spentCents, capCents }: CostCapBarProps) {
  const ratio = capCents > 0 ? Math.min(spentCents / capCents, 1) : 0;
  const pct = ratio * 100;

  let color = "var(--state-normal)";
  if (ratio >= 1) color = "var(--state-critical)";
  else if (ratio >= 0.8) color = "var(--state-warning)";

  return (
    <div className="flex flex-col gap-1">
      <div
        className="h-2 w-full overflow-hidden rounded-full"
        style={{ background: "var(--bg-overlay)" }}
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Daily messaging spend: ${dollars(spentCents)} of ${dollars(capCents)}`}
      >
        <div
          className="h-full transition-all duration-300"
          style={{
            width: `${pct}%`,
            background: color,
          }}
        />
      </div>
      <div className="text-caption" style={{ color: "var(--text-muted)" }}>
        {dollars(spentCents)} used of {dollars(capCents)} today
      </div>
    </div>
  );
}
