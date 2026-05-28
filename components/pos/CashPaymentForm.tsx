"use client";

import { useState } from "react";
import { usePosCartStore } from "@/store/posCartStore";

/**
 * Cash payment form (POS-01).
 *
 * Money inputs use type=text + inputMode=decimal per Pitfall 12. Currency
 * fields deliberately avoid the numeric-input type because browsers strip
 * decimals, allow `e`, and the native steppers are useless for ringing up
 * sales.
 *
 * Validates `tendered >= amount` client-side; the store enforces the same
 * rule before posting so we surface a friendly inline error either way.
 */

export interface CashPaymentFormProps {
  /** Default to the sale's remaining amount. */
  defaultAmount: string;
  onPaid?: () => void;
}

export function CashPaymentForm({ defaultAmount, onPaid }: CashPaymentFormProps) {
  const addCashPayment = usePosCartStore((s) => s.addCashPayment);
  const saving = usePosCartStore((s) => s.saving);
  const [amount, setAmount] = useState(defaultAmount);
  const [tendered, setTendered] = useState("");
  const [error, setError] = useState<string | null>(null);

  const change = (() => {
    const a = Number(amount);
    const t = Number(tendered);
    if (!isFinite(a) || !isFinite(t) || t < a) return null;
    return (t - a).toFixed(2);
  })();

  const canSubmit =
    !saving &&
    Number(amount) > 0 &&
    Number(tendered) >= Number(amount) &&
    Number(tendered) > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (Number(tendered) < Number(amount)) {
      setError(
        "Tendered amount is less than the payment amount. Increase tendered or adjust the payment amount.",
      );
      return;
    }
    try {
      await addCashPayment(amount, tendered);
      setTendered("");
      onPaid?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to record cash payment");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label
          htmlFor="cash-amount"
          className="text-overline"
          style={{ color: "var(--text-muted)" }}
        >
          Amount
        </label>
        <input
          id="cash-amount"
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-describedby="cash-change"
          className="glass-input font-mono-data"
          style={{ minHeight: "44px" }}
          required
        />
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="cash-tendered"
          className="text-overline"
          style={{ color: "var(--text-muted)" }}
        >
          Cash tendered
        </label>
        <input
          id="cash-tendered"
          type="text"
          inputMode="decimal"
          value={tendered}
          onChange={(e) => setTendered(e.target.value)}
          placeholder="0.00"
          aria-describedby="cash-change"
          className="glass-input font-mono-data"
          style={{ minHeight: "44px" }}
          required
        />
        <p
          id="cash-change"
          className="text-caption font-mono-data"
          style={{ color: "var(--text-secondary)" }}
        >
          {change === null
            ? "Change due —"
            : `Change due $${change}`}
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="text-caption animate-slide-down"
          style={{ color: "var(--state-critical)" }}
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="py-3 rounded-md text-subhead transition-colors disabled:opacity-45"
        style={{
          background: "var(--accent)",
          color: "var(--bg-base)",
          minHeight: "44px",
        }}
      >
        {saving ? "Recording…" : "Record cash payment"}
      </button>
    </form>
  );
}
