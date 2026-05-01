"use client";

import { useEffect } from "react";
import { WizardStep } from "@/components/messaging/WizardStep";
import type { WizardState, UpdateFn } from "./types";

export function Step5RecallPreset({
  state,
  update,
  onContinue,
  onBack,
}: {
  state: WizardState;
  update: UpdateFn;
  onContinue: () => void;
  onBack: () => void;
}) {
  useEffect(() => {
    if (!state.step5RecallPreset) update({ step5RecallPreset: "staff-approved" });
  }, [state.step5RecallPreset, update]);

  return (
    <WizardStep
      stepNumber={5}
      totalSteps={7}
      title="Recall Strategy"
      active
      completed={!!state.step5RecallPreset}
      onContinue={onContinue}
      onBack={onBack}
    >
      <p className="mb-3" style={{ color: "var(--text-secondary)" }}>
        How should annual recall messages go out?
      </p>
      <label className="flex items-start gap-3">
        <input
          type="radio"
          name="recall-preset"
          value="staff-approved"
          checked={state.step5RecallPreset === "staff-approved"}
          onChange={() => update({ step5RecallPreset: "staff-approved" })}
        />
        <span>
          <strong>Staff-approved queue (recommended)</strong>
          <span className="block text-caption" style={{ color: "var(--text-muted)" }}>
            Patients due for recall pile up in a queue. Staff click &quot;Send
            All Recalls&quot; weekly to fan out.
          </span>
        </span>
      </label>
    </WizardStep>
  );
}
