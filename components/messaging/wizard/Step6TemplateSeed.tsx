"use client";

import { useState } from "react";
import { WizardStep } from "@/components/messaging/WizardStep";
import { messagingApi } from "@/lib/api/messaging";
import type { WizardState, UpdateFn } from "./types";

export function Step6TemplateSeed({
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seeded = state.step6SeededCount !== null;

  async function handleSeed() {
    if (!state.step6PracticeType) return;
    setBusy(true);
    setError(null);
    try {
      const res = await messagingApi.seedTemplates(state.step6PracticeType);
      update({ step6SeededCount: res.seeded });
    } catch (e) {
      setError((e as Error).message ?? "Failed to seed templates");
    } finally {
      setBusy(false);
    }
  }

  return (
    <WizardStep
      stepNumber={6}
      totalSteps={7}
      title="Template Pack"
      active
      completed={seeded}
      onContinue={onContinue}
      onBack={onBack}
      continueDisabled={!seeded}
    >
      <p className="mb-3" style={{ color: "var(--text-secondary)" }}>
        Pick the practice type — we&apos;ll seed default reminder + recall
        templates you can edit later in Settings.
      </p>
      <label className="block mb-3">
        <span className="text-caption block mb-1" style={{ color: "var(--text-muted)" }}>
          Practice type
        </span>
        <select
          aria-label="practice type"
          value={state.step6PracticeType ?? ""}
          onChange={(e) =>
            update({
              step6PracticeType: e.target.value as
                | "optometry"
                | "ophthalmology"
                | "general"
                | null,
              step6SeededCount: null,
            })
          }
          className="glass-input w-full"
        >
          <option value="">Select practice type…</option>
          <option value="optometry">Optometry</option>
          <option value="ophthalmology">Ophthalmology</option>
          <option value="general">General</option>
        </select>
      </label>
      {!seeded && (
        <button
          type="button"
          onClick={handleSeed}
          disabled={busy || !state.step6PracticeType}
          className="glass-button px-4 py-2"
        >
          {busy ? "Seeding…" : "Seed Templates"}
        </button>
      )}
      {seeded && (
        <p className="text-body" style={{ color: "var(--state-normal)" }}>
          Seeded {state.step6SeededCount} default templates.
        </p>
      )}
      {error && (
        <p className="text-caption mt-2" style={{ color: "var(--state-critical)" }}>
          {error}
        </p>
      )}
    </WizardStep>
  );
}
