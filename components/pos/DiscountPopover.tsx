"use client";

import { useEffect, useRef, useState } from "react";
import { usePosCartStore } from "@/store/posCartStore";
import type { SaleLineItem } from "@/types/sales";

/**
 * Hand-rolled popover ($/% toggle + mandatory reason).
 *
 * Phase 15 doesn't pull in `@radix-ui/react-popover` (avoiding a new dep) —
 * uses click-outside + ESC instead. The trigger renders inline in the cart
 * row; the panel is absolutely positioned beneath it.
 *
 * `discountReason` is REQUIRED (POS-15, min 3 chars). Audited as
 * SALE_DISCOUNT_APPLIED.
 */

const MIN_REASON_LEN = 3;

export interface DiscountPopoverProps {
  line: Pick<SaleLineItem, "id" | "unitPrice" | "qty" | "discountAmount" | "discountReason">;
}

export function DiscountPopover({ line }: DiscountPopoverProps) {
  const updateLine = usePosCartStore((s) => s.updateLine);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"dollar" | "percent">("dollar");
  const [value, setValue] = useState(line.discountAmount || "0");
  const [reason, setReason] = useState(line.discountReason ?? "");
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  function computeDollarAmount(): string {
    const v = Number(value);
    if (!isFinite(v) || v <= 0) return "0";
    if (mode === "dollar") return v.toFixed(2);
    const lineGross = Number(line.unitPrice) * line.qty;
    return ((lineGross * v) / 100).toFixed(2);
  }

  async function handleApply() {
    setError(null);
    if (reason.trim().length < MIN_REASON_LEN) {
      setError(
        "Discounts require a short reason. This shows up on the receipt and in the audit log.",
      );
      return;
    }
    try {
      await updateLine(line.id, {
        discountAmount: computeDollarAmount(),
        discountReason: reason.trim(),
      });
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to apply discount");
    }
  }

  const existing = Number(line.discountAmount) > 0;

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-caption underline-offset-4 hover:underline"
        style={{
          color: existing ? "var(--accent)" : "var(--text-muted)",
          minHeight: "44px",
          padding: "0 8px",
        }}
        aria-expanded={open}
      >
        {existing ? `−$${Number(line.discountAmount).toFixed(2)}` : "Apply discount"}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-full mt-1 z-30 glass-card animate-fade-in"
          style={{ width: "280px", padding: "16px" }}
          role="dialog"
          aria-label="Apply line discount"
        >
          <div className="flex items-center gap-2 mb-3">
            <button
              type="button"
              onClick={() => setMode("dollar")}
              className="flex-1 py-2 rounded-md text-caption transition-colors"
              style={{
                background: mode === "dollar" ? "var(--accent-dim)" : "transparent",
                color: mode === "dollar" ? "var(--accent)" : "var(--text-secondary)",
                border: "1px solid var(--border-default)",
              }}
            >
              $
            </button>
            <button
              type="button"
              onClick={() => setMode("percent")}
              className="flex-1 py-2 rounded-md text-caption transition-colors"
              style={{
                background: mode === "percent" ? "var(--accent-dim)" : "transparent",
                color: mode === "percent" ? "var(--accent)" : "var(--text-secondary)",
                border: "1px solid var(--border-default)",
              }}
            >
              %
            </button>
          </div>

          <div className="flex flex-col gap-1 mb-3">
            <label
              htmlFor={`disc-amount-${line.id}`}
              className="text-overline"
              style={{ color: "var(--text-muted)" }}
            >
              Amount ({mode === "dollar" ? "$" : "%"})
            </label>
            <input
              id={`disc-amount-${line.id}`}
              type="text"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="glass-input font-mono-data"
              style={{ minHeight: "44px" }}
            />
          </div>

          <div className="flex flex-col gap-1 mb-3">
            <label
              htmlFor={`disc-reason-${line.id}`}
              className="text-overline"
              style={{ color: "var(--text-muted)" }}
            >
              Reason (required)
            </label>
            <textarea
              id={`disc-reason-${line.id}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="e.g. Loyalty, package deal"
              className="glass-input"
            />
          </div>

          {error && (
            <div
              role="alert"
              className="text-caption mb-2"
              style={{ color: "var(--state-critical)" }}
            >
              {error}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-1 py-2 rounded-md text-body"
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
              className="flex-1 py-2 rounded-md text-body"
              style={{
                background: "var(--accent)",
                color: "var(--bg-base)",
                minHeight: "44px",
              }}
            >
              Apply discount
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
