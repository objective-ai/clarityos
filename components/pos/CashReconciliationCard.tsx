"use client";

import { useState } from "react";

/**
 * Cash reconciliation card for the daily-close page.
 *
 * Expected cash is computed server-side (read-only). Staff enter the counted
 * cash; variance is derived live. Saving records a DailyCloseRun — variance is
 * captured for audit, never blocked (UI-SPEC §Daily-close page).
 */

interface CashReconciliationCardProps {
  expectedCash: string;
  isClosed: boolean;
  initialCountedCash?: string | null;
  initialVariance?: string | null;
  onSave: (countedCash: string, notes: string) => void | Promise<void>;
}

export function CashReconciliationCard({
  expectedCash,
  isClosed,
  initialCountedCash,
  initialVariance,
  onSave,
}: CashReconciliationCardProps) {
  const [countedCash, setCountedCash] = useState(initialCountedCash ?? "");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const expected = Number(expectedCash) || 0;
  const counted = countedCash === "" ? null : Number(countedCash);
  const variance =
    isClosed && initialVariance != null
      ? Number(initialVariance)
      : counted == null
        ? null
        : counted - expected;

  // >= 0 (balanced or over) is normal; < 0 (short) is critical.
  const varianceColor =
    variance == null
      ? "var(--text-muted)"
      : variance < 0
        ? "var(--state-critical)"
        : "var(--state-normal)";

  const canSave = !isClosed && countedCash.trim() !== "" && !saving;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave(countedCash, notes);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="glass-card-accent" style={{ padding: "24px" }}>
      <p className="text-overline mb-4" style={{ color: "var(--text-muted)" }}>
        Cash reconciliation
      </p>

      <div className="flex flex-col gap-4">
        {/* Expected cash — read-only */}
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-body" style={{ color: "var(--text-secondary)" }}>
            Expected cash
          </span>
          <span className="text-subhead font-mono-data" style={{ color: "var(--text-primary)" }}>
            ${expected.toFixed(2)}
          </span>
        </div>

        {/* Counted cash — decimal text input (Pitfall 12: never type=number) */}
        <div className="flex flex-col gap-1">
          <label htmlFor="counted-cash" className="text-overline" style={{ color: "var(--text-muted)" }}>
            Counted cash
          </label>
          <input
            id="counted-cash"
            type="text"
            inputMode="decimal"
            value={isClosed ? (initialCountedCash ?? "") : countedCash}
            onChange={(e) => setCountedCash(e.target.value.replace(/[^0-9.]/g, ""))}
            disabled={isClosed}
            placeholder="0.00"
            className="glass-input font-mono-data"
            style={{ minHeight: "44px" }}
            aria-describedby="variance-value"
          />
        </div>

        {/* Variance — live */}
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-body" style={{ color: "var(--text-secondary)" }}>
            Variance
          </span>
          <span id="variance-value" className="text-subhead font-mono-data" style={{ color: varianceColor }}>
            {variance == null
              ? "—"
              : `${variance < 0 ? "-" : ""}$${Math.abs(variance).toFixed(2)}`}
          </span>
        </div>

        {/* Notes */}
        {!isClosed && (
          <div className="flex flex-col gap-1">
            <label htmlFor="close-notes" className="text-overline" style={{ color: "var(--text-muted)" }}>
              Notes
            </label>
            <textarea
              id="close-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional — anything notable about today's drawer."
              className="glass-input w-full text-body resize-y"
            />
          </div>
        )}

        {isClosed ? (
          <p className="text-caption" style={{ color: "var(--text-muted)" }}>
            This date is already closed. Totals are read-only.
          </p>
        ) : (
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="py-3 rounded-md text-subhead disabled:opacity-45"
            style={{
              background: "var(--accent)",
              color: "var(--bg-base)",
              minHeight: "44px",
            }}
          >
            {saving ? "Saving…" : "Save and close day"}
          </button>
        )}
      </div>
    </section>
  );
}
