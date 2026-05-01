"use client";

import { useEffect, useState } from "react";
import { Step1Acknowledge } from "@/components/messaging/wizard/Step1Acknowledge";
import { Step2ClinicInfo } from "@/components/messaging/wizard/Step2ClinicInfo";
import { Step3NumberProvision } from "@/components/messaging/wizard/Step3NumberProvision";
import { Step4ReminderPreset } from "@/components/messaging/wizard/Step4ReminderPreset";
import { Step5RecallPreset } from "@/components/messaging/wizard/Step5RecallPreset";
import { Step6TemplateSeed } from "@/components/messaging/wizard/Step6TemplateSeed";
import { Step7TestSend } from "@/components/messaging/wizard/Step7TestSend";
import type { WizardState } from "@/components/messaging/wizard/types";

const STORAGE_KEY = "messaging-onboarding-state";

const INITIAL: WizardState = {
  currentStep: 1,
  step1AcknowledgedAt: null,
  step3PhoneNumber: null,
  step3AreaCode: null,
  step4ReminderPreset: null,
  step5RecallPreset: null,
  step6PracticeType: null,
  step6SeededCount: null,
  step7TestSentAt: null,
  activatedAt: null,
  ownerPhone: "",
  ownerEmail: "",
};

export default function OnboardingWizardPage() {
  const [state, setState] = useState<WizardState>(INITIAL);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setState({ ...INITIAL, ...JSON.parse(stored) });
      } catch {
        // ignore parse errors — start fresh
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, hydrated]);

  function update(partial: Partial<WizardState>) {
    setState((s) => ({ ...s, ...partial }));
  }

  function back() {
    update({ currentStep: Math.max(1, state.currentStep - 1) });
  }
  function next() {
    update({ currentStep: Math.min(7, state.currentStep + 1) });
  }

  return (
    <div className="max-w-[640px] mx-auto p-6">
      <h1 className="text-heading mb-2">Messaging Onboarding</h1>
      <p className="text-caption mb-4" style={{ color: "var(--text-muted)" }}>
        7 steps. Progress is saved automatically — you can leave and come back.
      </p>
      <div
        role="progressbar"
        aria-valuenow={state.currentStep}
        aria-valuemin={1}
        aria-valuemax={7}
        aria-label="Wizard progress"
        className="flex gap-2 mb-6 justify-center"
      >
        {[1, 2, 3, 4, 5, 6, 7].map((n) => (
          <div
            key={n}
            className="w-3 h-3 rounded-full"
            style={{
              backgroundColor:
                n === state.currentStep
                  ? "var(--accent)"
                  : n < state.currentStep
                  ? "var(--accent)"
                  : "var(--text-muted)",
              opacity: n < state.currentStep ? 0.5 : 1,
            }}
          />
        ))}
      </div>

      {state.currentStep === 1 && (
        <Step1Acknowledge state={state} update={update} onContinue={next} />
      )}
      {state.currentStep === 2 && (
        <Step2ClinicInfo
          state={state}
          update={update}
          onContinue={next}
          onBack={back}
        />
      )}
      {state.currentStep === 3 && (
        <Step3NumberProvision
          state={state}
          update={update}
          onContinue={next}
          onBack={back}
        />
      )}
      {state.currentStep === 4 && (
        <Step4ReminderPreset
          state={state}
          update={update}
          onContinue={next}
          onBack={back}
        />
      )}
      {state.currentStep === 5 && (
        <Step5RecallPreset
          state={state}
          update={update}
          onContinue={next}
          onBack={back}
        />
      )}
      {state.currentStep === 6 && (
        <Step6TemplateSeed
          state={state}
          update={update}
          onContinue={next}
          onBack={back}
        />
      )}
      {state.currentStep === 7 && (
        <Step7TestSend state={state} update={update} onBack={back} />
      )}
    </div>
  );
}
