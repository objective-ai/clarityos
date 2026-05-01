"use client";

import { useState } from "react";
import { WizardStep } from "@/components/messaging/WizardStep";
import { messagingApi } from "@/lib/api/messaging";
import type { WizardState, UpdateFn } from "./types";

export function Step7TestSend({
  state,
  update,
  onBack,
}: {
  state: WizardState;
  update: UpdateFn;
  onBack: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sent = !!state.step7TestSentAt;
  const activated = !!state.activatedAt;

  async function handleSend() {
    setBusy(true);
    setError(null);
    try {
      await messagingApi.onboardingTestSend(state.ownerPhone, state.ownerEmail);
      update({ step7TestSentAt: new Date().toISOString() });
    } catch (e) {
      setError((e as Error).message ?? "Failed to send test");
    } finally {
      setBusy(false);
    }
  }

  async function handleActivate() {
    setBusy(true);
    setError(null);
    try {
      await messagingApi.activateMessaging();
      update({ activatedAt: new Date().toISOString() });
    } catch (e) {
      setError((e as Error).message ?? "Failed to activate messaging");
    } finally {
      setBusy(false);
    }
  }

  return (
    <WizardStep
      stepNumber={7}
      totalSteps={7}
      title="Test Send"
      active
      completed={activated}
      onBack={activated ? undefined : onBack}
    >
      {activated ? (
        <div>
          <p className="text-subhead mb-2" style={{ color: "var(--state-normal)" }}>
            You&apos;re all set.
          </p>
          <p className="text-body" style={{ color: "var(--text-secondary)" }}>
            ClarityOS will send appointment reminders automatically. You can
            tweak templates and cadence anytime in Messaging Settings.
          </p>
        </div>
      ) : !sent ? (
        <div className="space-y-3">
          <p style={{ color: "var(--text-secondary)" }}>
            We&apos;ll send a test SMS and a test email to your owner contact
            so you can confirm everything works end-to-end.
          </p>
          <p className="text-caption" style={{ color: "var(--text-muted)" }}>
            Phone: {state.ownerPhone || "—"} · Email: {state.ownerEmail || "—"}
          </p>
          <button
            type="button"
            onClick={handleSend}
            disabled={busy || !state.ownerPhone || !state.ownerEmail}
            className="glass-button px-4 py-2"
          >
            {busy ? "Sending…" : "Send Test Message"}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p style={{ color: "var(--text-secondary)" }}>
            Test sent. Check your phone and inbox — once both arrive, confirm
            below to activate messaging clinic-wide.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleActivate}
              disabled={busy}
              className="glass-button px-4 py-2"
            >
              {busy ? "Activating…" : "I Received Them"}
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={busy}
              className="px-4 py-2 text-caption"
              style={{ color: "var(--text-secondary)" }}
            >
              Resend if needed
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="text-caption mt-2" style={{ color: "var(--state-critical)" }}>
          {error}
        </p>
      )}
    </WizardStep>
  );
}
