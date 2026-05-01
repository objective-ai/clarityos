"use client";

import { WizardStep } from "@/components/messaging/WizardStep";
import type { WizardState, UpdateFn } from "./types";

export function Step1Acknowledge({
  state,
  update,
  onContinue,
}: {
  state: WizardState;
  update: UpdateFn;
  onContinue: () => void;
}) {
  const acknowledged = !!state.step1AcknowledgedAt;

  function handleToggle(checked: boolean) {
    update({
      step1AcknowledgedAt: checked ? new Date().toISOString() : null,
    });
  }

  return (
    <WizardStep
      stepNumber={1}
      totalSteps={7}
      title="Compliance Acknowledgment"
      active
      completed={false}
      onContinue={onContinue}
      continueDisabled={!acknowledged}
    >
      <p className="mb-4" style={{ color: "var(--text-secondary)" }}>
        Before enabling patient messaging, please confirm:
      </p>
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => handleToggle(e.target.checked)}
          aria-label="Acknowledge BAA and TCPA compliance"
        />
        <span className="text-body">
          I confirm that ClarityOS&apos;s BAA with Twilio and Postmark is signed,
          that messages will only be sent to patients who have provided
          appropriate TCPA / HIPAA consent, and that opt-out requests will be
          honored within 24 hours.
        </span>
      </label>
    </WizardStep>
  );
}
