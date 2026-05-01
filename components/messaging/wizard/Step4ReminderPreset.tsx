"use client";

import { useEffect } from "react";
import { WizardStep } from "@/components/messaging/WizardStep";
import type { WizardState, UpdateFn } from "./types";

export function Step4ReminderPreset({
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
    if (!state.step4ReminderPreset) update({ step4ReminderPreset: "3-touch" });
  }, [state.step4ReminderPreset, update]);

  return (
    <WizardStep
      stepNumber={4}
      totalSteps={7}
      title="Reminder Cadence"
      active
      completed={!!state.step4ReminderPreset}
      onContinue={onContinue}
      onBack={onBack}
    >
      <p className="mb-3" style={{ color: "var(--text-secondary)" }}>
        Choose how often patients receive appointment reminders.
      </p>
      <label className="flex items-start gap-3">
        <input
          type="radio"
          name="reminder-preset"
          value="3-touch"
          checked={state.step4ReminderPreset === "3-touch"}
          onChange={() => update({ step4ReminderPreset: "3-touch" })}
        />
        <span>
          <strong>3-touch (recommended)</strong>
          <span className="block text-caption" style={{ color: "var(--text-muted)" }}>
            7 days before, 72 hours before, and 24 hours before. Sends pause
            once the patient confirms.
          </span>
        </span>
      </label>
    </WizardStep>
  );
}
