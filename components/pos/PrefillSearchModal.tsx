"use client";

import { useState } from "react";
import type { SalePrefillItem } from "@/types/sales";

/**
 * Lightweight modal: patient context already chosen upstream — this surface
 * lets the cashier pull in Superbill(s) and OpticalOrder(s) by ID.
 *
 * Full free-text patient search is deferred to a follow-up plan; the modal
 * intentionally accepts UUIDs for the V1 walk-up flow.
 */

export interface PrefillSearchModalProps {
  patientId: string | null;
  onClose: () => void;
  onPrefill: (items: SalePrefillItem[]) => void | Promise<void>;
}

export function PrefillSearchModal({
  patientId,
  onClose,
  onPrefill,
}: PrefillSearchModalProps) {
  const [kind, setKind] = useState<"superbill" | "optical_order">("superbill");
  const [sourceId, setSourceId] = useState("");
  const [items, setItems] = useState<SalePrefillItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  function handleAdd() {
    setError(null);
    if (!sourceId.trim()) {
      setError("Paste a Superbill or Optical Order ID.");
      return;
    }
    setItems((prev) => [...prev, { kind, sourceId: sourceId.trim() }]);
    setSourceId("");
  }

  async function handleApply() {
    if (items.length === 0) {
      setError("Add at least one item to prefill.");
      return;
    }
    await onPrefill(items);
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Prefill cart from records"
      className="fixed inset-0 z-40 flex items-center justify-center animate-fade-in"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="glass-card flex flex-col gap-4"
        style={{ width: "100%", maxWidth: "520px", padding: "24px" }}
      >
        <header className="flex items-center justify-between">
          <h2 className="text-heading" style={{ color: "var(--text-primary)" }}>
            Add items to cart
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{
              background: "transparent",
              color: "var(--text-muted)",
              minHeight: "44px",
              minWidth: "44px",
            }}
          >
            ×
          </button>
        </header>

        {!patientId && (
          <p className="text-caption" style={{ color: "var(--text-muted)" }}>
            No patient selected yet. Prefill is only available for patient-linked sales.
          </p>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setKind("superbill")}
            className="flex-1 py-2 rounded-md text-caption"
            style={{
              background: kind === "superbill" ? "var(--accent-dim)" : "transparent",
              color: kind === "superbill" ? "var(--accent)" : "var(--text-secondary)",
              border: "1px solid var(--border-default)",
              minHeight: "44px",
            }}
          >
            Superbill
          </button>
          <button
            type="button"
            onClick={() => setKind("optical_order")}
            className="flex-1 py-2 rounded-md text-caption"
            style={{
              background: kind === "optical_order" ? "var(--accent-dim)" : "transparent",
              color: kind === "optical_order" ? "var(--accent)" : "var(--text-secondary)",
              border: "1px solid var(--border-default)",
              minHeight: "44px",
            }}
          >
            Optical order
          </button>
        </div>

        <div className="flex items-end gap-2">
          <div className="flex-1 flex flex-col gap-1">
            <label
              htmlFor="prefill-source-id"
              className="text-overline"
              style={{ color: "var(--text-muted)" }}
            >
              {kind === "superbill" ? "Superbill ID" : "Optical order ID"}
            </label>
            <input
              id="prefill-source-id"
              type="text"
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              placeholder="uuid-here"
              className="glass-input font-mono-data"
              style={{ minHeight: "44px" }}
              disabled={!patientId}
            />
          </div>
          <button
            type="button"
            onClick={handleAdd}
            disabled={!patientId}
            className="py-2 px-4 rounded-md text-body disabled:opacity-45"
            style={{
              background: "transparent",
              color: "var(--text-primary)",
              border: "1px solid var(--border-default)",
              minHeight: "44px",
            }}
          >
            Add
          </button>
        </div>

        {items.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="text-overline" style={{ color: "var(--text-muted)" }}>
              Items
            </p>
            {items.map((it, i) => (
              <div
                key={`${it.kind}-${it.sourceId}-${i}`}
                className="flex items-center justify-between text-caption font-mono-data"
                style={{ color: "var(--text-secondary)" }}
              >
                <span>
                  {it.kind} {it.sourceId.slice(0, 8)}…
                </span>
                <button
                  type="button"
                  aria-label="Remove"
                  onClick={() =>
                    setItems((prev) => prev.filter((_, idx) => idx !== i))
                  }
                  style={{
                    background: "transparent",
                    color: "var(--text-muted)",
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div role="alert" className="text-caption" style={{ color: "var(--state-critical)" }}>
            {error}
          </div>
        )}

        <div className="flex items-center gap-2 mt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 rounded-md text-body"
            style={{
              background: "transparent",
              color: "var(--text-secondary)",
              border: "1px solid var(--border-default)",
              minHeight: "44px",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={items.length === 0}
            className="flex-1 py-3 rounded-md text-subhead disabled:opacity-45"
            style={{
              background: "var(--accent)",
              color: "var(--bg-base)",
              minHeight: "44px",
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
