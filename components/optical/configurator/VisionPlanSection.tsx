"use client";

import { useOpticalOrderConfigStore } from "@/store/opticalOrderConfigStore";

const VISION_PLAN_FIELDS: Array<[string, string]> = [
  ["name", "Plan Name"],
  ["member_id", "Member ID"],
  ["group_number", "Group #"],
  ["authorization_number", "Auth #"],
  ["copay", "Copay"],
  ["allowance", "Allowance"],
];

interface Props {
  visionPlan: Record<string, any> | null | undefined;
}

export function VisionPlanSection({ visionPlan }: Props) {
  const { patchVisionPlan, flush } = useOpticalOrderConfigStore();
  return (
    <section className="rounded border border-[var(--glass-border)] bg-[var(--bg-glass)] p-4">
      <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
        Vision Plan
      </h2>
      <div className="grid grid-cols-2 gap-3 text-xs">
        {VISION_PLAN_FIELDS.map(([key, label]) => (
          <label key={key} className="flex flex-col gap-1">
            <span className="text-[var(--text-muted)]">{label}</span>
            <input
              type="text"
              value={visionPlan?.[key] ?? ""}
              onChange={(e) =>
                patchVisionPlan({
                  ...(visionPlan ?? {}),
                  [key]: e.target.value,
                })
              }
              onBlur={() => flush()}
              className="rounded border border-[var(--glass-border)] bg-transparent px-2 py-1 text-[var(--text-primary)]"
            />
          </label>
        ))}
      </div>
    </section>
  );
}
