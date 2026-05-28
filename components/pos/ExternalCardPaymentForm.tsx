"use client";

import { useState } from "react";
import { usePosCartStore } from "@/store/posCartStore";

/**
 * External-terminal card payment (Square Terminal, Verifone, etc.) — staff
 * runs the card on an external device and records the result here. No
 * processor calls. We capture last4 + optional auth code so it shows on the
 * receipt and reconciles with the merchant statement.
 *
 * Money inputs: type=text + inputMode=decimal per Pitfall 12.
 */

export interface ExternalCardPaymentFormProps {
  defaultAmount: string;
  onPaid?: () => void;
}

export function ExternalCardPaymentForm({
  defaultAmount,
  onPaid,
}: ExternalCardPaymentFormProps) {
  const addExternalCardPayment = usePosCartStore((s) => s.addExternalCardPayment);
  const saving = usePosCartStore((s) => s.saving);
  const [amount, setAmount] = useState(defaultAmount);
  const [last4, setLast4] = useState("");
  const [authCode, setAuthCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const last4Valid = /^\d{4}$/.test(last4);
  const canSubmit = !saving && Number(amount) > 0 && last4Valid;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await addExternalCardPayment(amount, last4, authCode || undefined);
      setLast4("");
      setAuthCode("");
      onPaid?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to record card payment");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="ext-amount" className="text-overline" style={{ color: "var(--text-muted)" }}>
          Amount
        </label>
        <input
          id="ext-amount"
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="glass-input font-mono-data"
          style={{ minHeight: "44px" }}
          required
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="ext-last4" className="text-overline" style={{ color: "var(--text-muted)" }}>
          Card last 4
        </label>
        <input
          id="ext-last4"
          type="text"
          inputMode="numeric"
          value={last4}
          maxLength={4}
          onChange={(e) => setLast4(e.target.value.replace(/\D/g, ""))}
          placeholder="1234"
          className="glass-input font-mono-data"
          style={{ minHeight: "44px" }}
          required
          aria-invalid={last4.length > 0 && !last4Valid}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="ext-auth" className="text-overline" style={{ color: "var(--text-muted)" }}>
          Auth code (optional)
        </label>
        <input
          id="ext-auth"
          type="text"
          value={authCode}
          onChange={(e) => setAuthCode(e.target.value)}
          placeholder="A1B2C3"
          className="glass-input font-mono-data"
          style={{ minHeight: "44px" }}
        />
      </div>

      {error && (
        <div role="alert" className="text-caption animate-slide-down" style={{ color: "var(--state-critical)" }}>
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="py-3 rounded-md text-subhead transition-colors disabled:opacity-45"
        style={{ background: "var(--accent)", color: "var(--bg-base)", minHeight: "44px" }}
      >
        {saving ? "Recording…" : "Record card payment"}
      </button>
    </form>
  );
}
