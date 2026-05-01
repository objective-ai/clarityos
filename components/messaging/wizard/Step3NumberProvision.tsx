"use client";

import { useState } from "react";
import { WizardStep } from "@/components/messaging/WizardStep";
import { messagingApi } from "@/lib/api/messaging";
import type { WizardState, UpdateFn } from "./types";

export function Step3NumberProvision({
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
  const [areaCode, setAreaCode] = useState(state.step3AreaCode ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const provisioned = state.step3PhoneNumber;

  async function handleProvision() {
    setBusy(true);
    setError(null);
    try {
      const res = await messagingApi.provisionNumber(areaCode);
      update({ step3PhoneNumber: res.phone_number, step3AreaCode: areaCode });
    } catch (e) {
      setError((e as Error).message ?? "Failed to provision number");
    } finally {
      setBusy(false);
    }
  }

  return (
    <WizardStep
      stepNumber={3}
      totalSteps={7}
      title="Phone Number"
      active
      completed={!!provisioned}
      onContinue={onContinue}
      onBack={onBack}
      continueDisabled={!provisioned}
    >
      {provisioned ? (
        <div>
          <p className="text-body mb-2">
            Your clinic&apos;s messaging number:
          </p>
          <p className="text-subhead" style={{ color: "var(--accent)" }}>
            {provisioned}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p style={{ color: "var(--text-secondary)" }}>
            Enter your clinic&apos;s 3-digit area code. We&apos;ll provision a
            local Twilio number that matches.
          </p>
          <input
            type="text"
            inputMode="numeric"
            maxLength={3}
            value={areaCode}
            onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, ""))}
            placeholder="415"
            aria-label="area code"
            className="glass-input w-32"
          />
          <div>
            <button
              type="button"
              onClick={handleProvision}
              disabled={busy || areaCode.length !== 3}
              className="glass-button px-4 py-2"
            >
              {busy ? "Provisioning…" : "Provision Number"}
            </button>
          </div>
          {error && (
            <p className="text-caption" style={{ color: "var(--state-critical)" }}>
              {error}
            </p>
          )}
        </div>
      )}
    </WizardStep>
  );
}
