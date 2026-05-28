"use client";

import { useState } from "react";
import { usePosCartStore } from "@/store/posCartStore";

/**
 * Write-off form (POS-11). OWNER + ADMIN only — visibility is gated upstream
 * in PaymentPanel via `requireRole`; this component does not re-check the
 * role (single source of truth for the gate).
 *
 * `reason_note` is mandatory (min length 3) and is mirrored in the audit
 * log (`WRITE_OFF_RECORDED`) plus the receipt PDF.
 *
 * Money input: type=text + inputMode=decimal per Pitfall 12.
 */

export interface WriteOffPaymentFormProps {
  defaultAmount: string;
  onPaid?: () => void;
}

const MIN_REASON_LEN = 3;

export function WriteOffPaymentForm({
  defaultAmount,
  onPaid,
}: WriteOffPaymentFormProps) {
  const addWriteOff = usePosCartStore((s) => s.addWriteOff);
  const saving = usePosCartStore((s) => s.saving);
  const [amount, setAmount] = useState(defaultAmount);
  const [reasonNote, setReasonNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reasonValid = reasonNote.trim().length >= MIN_REASON_LEN;
  const canSubmit = !saving && Number(amount) > 0 && reasonValid;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await addWriteOff(amount, reasonNote);
      setReasonNote("");
      onPaid?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to record write-off");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="wo-amount" className="text-overline" style={{ color: "var(--text-muted)" }}>
          Amount
        </label>
        <input
          id="wo-amount"
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
        <label htmlFor="wo-reason" className="text-overline" style={{ color: "var(--text-muted)" }}>
          Reason (required)
        </label>
        <textarea
          id="wo-reason"
          value={reasonNote}
          onChange={(e) => setReasonNote(e.target.value)}
          rows={3}
          placeholder="e.g. Patient hardship, billing error correction, courtesy adjustment"
          className="glass-input"
          aria-invalid={reasonNote.length > 0 && !reasonValid}
          required
        />
        <p className="text-caption" style={{ color: "var(--text-muted)" }}>
          Captured in the audit log under WRITE_OFF_RECORDED.
        </p>
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
        {saving ? "Recording…" : "Record write-off"}
      </button>
    </form>
  );
}
