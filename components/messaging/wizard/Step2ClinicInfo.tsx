"use client";

import { WizardStep } from "@/components/messaging/WizardStep";
import type { WizardState, UpdateFn } from "./types";

export function Step2ClinicInfo({
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
  return (
    <WizardStep
      stepNumber={2}
      totalSteps={7}
      title="Clinic Information"
      active
      completed={false}
      onContinue={onContinue}
      onBack={onBack}
    >
      <p className="mb-3" style={{ color: "var(--text-secondary)" }}>
        Confirm the clinic details we&apos;ll use in patient messages.
      </p>
      <div className="space-y-3">
        <label className="block">
          <span className="text-caption block mb-1" style={{ color: "var(--text-muted)" }}>
            Owner phone (E.164, used for the test send in step 7)
          </span>
          <input
            type="tel"
            value={state.ownerPhone}
            onChange={(e) => update({ ownerPhone: e.target.value })}
            placeholder="+14155551212"
            className="glass-input w-full"
            aria-label="Owner phone number"
          />
        </label>
        <label className="block">
          <span className="text-caption block mb-1" style={{ color: "var(--text-muted)" }}>
            Owner email (for the test send in step 7)
          </span>
          <input
            type="email"
            value={state.ownerEmail}
            onChange={(e) => update({ ownerEmail: e.target.value })}
            placeholder="owner@clinic.com"
            className="glass-input w-full"
            aria-label="Owner email"
          />
        </label>
      </div>
    </WizardStep>
  );
}
