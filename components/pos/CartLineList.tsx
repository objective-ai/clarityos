"use client";

import { usePosCartStore, selectLines } from "@/store/posCartStore";
import { DiscountPopover } from "./DiscountPopover";

/**
 * Cart line list (POS-01). Table-shaped — description, qty stepper, unit
 * price, discount popover, line total. Empty state mirrors UI-SPEC §Empty
 * states.
 *
 * Qty stepper writes through `usePosCartStore.updateLine` immediately (no
 * debounce — quantities are discrete edits, not streamed input).
 */

export function CartLineList() {
  const lines = usePosCartStore(selectLines);
  const updateLine = usePosCartStore((s) => s.updateLine);
  const removeLine = usePosCartStore((s) => s.removeLine);

  if (lines.length === 0) {
    return (
      <div
        className="glass-card text-center"
        style={{ padding: "48px 24px" }}
        role="region"
        aria-label="Empty cart"
      >
        <p className="text-heading mb-2" style={{ color: "var(--text-primary)" }}>
          No sale started
        </p>
        <p className="text-body" style={{ color: "var(--text-muted)" }}>
          Search for a patient or scan a product to begin. Walk-in sales without a
          patient stay assignable later.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* header */}
      <div
        className="grid items-center text-overline pb-2"
        style={{
          gridTemplateColumns: "1fr 100px 120px 140px 120px 40px",
          gap: "16px",
          color: "var(--text-muted)",
          borderBottom: "1px solid var(--border-default)",
        }}
      >
        <span>Description</span>
        <span>Qty</span>
        <span style={{ textAlign: "right" }}>Unit</span>
        <span style={{ textAlign: "right" }}>Discount</span>
        <span style={{ textAlign: "right" }}>Line total</span>
        <span />
      </div>

      {lines.map((line) => (
        <div
          key={line.id}
          className="grid items-center animate-fade-in-up hover-row"
          style={{
            gridTemplateColumns: "1fr 100px 120px 140px 120px 40px",
            gap: "16px",
            padding: "12px 0",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <div>
            <p className="text-subhead" style={{ color: "var(--text-primary)" }}>
              {line.description}
            </p>
            {line.discountReason && (
              <p className="text-caption" style={{ color: "var(--text-muted)" }}>
                {line.discountReason}
              </p>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Decrease quantity"
              onClick={() =>
                updateLine(line.id, { qty: Math.max(1, line.qty - 1) })
              }
              className="rounded-md text-body"
              style={{
                width: "32px",
                height: "32px",
                background: "var(--bg-glass)",
                border: "1px solid var(--border-default)",
                color: "var(--text-secondary)",
              }}
            >
              −
            </button>
            <span
              className="text-body font-mono-data"
              style={{
                minWidth: "24px",
                textAlign: "center",
                color: "var(--text-primary)",
              }}
            >
              {line.qty}
            </span>
            <button
              type="button"
              aria-label="Increase quantity"
              onClick={() => updateLine(line.id, { qty: line.qty + 1 })}
              className="rounded-md text-body"
              style={{
                width: "32px",
                height: "32px",
                background: "var(--bg-glass)",
                border: "1px solid var(--border-default)",
                color: "var(--text-secondary)",
              }}
            >
              +
            </button>
          </div>

          <span
            className="text-body font-mono-data"
            style={{ textAlign: "right", color: "var(--text-secondary)" }}
          >
            ${Number(line.unitPrice).toFixed(2)}
          </span>

          <div style={{ textAlign: "right" }}>
            <DiscountPopover line={line} />
          </div>

          <span
            className="text-subhead font-mono-data"
            style={{ textAlign: "right", color: "var(--text-primary)" }}
          >
            ${Number(line.lineTotal).toFixed(2)}
          </span>

          <button
            type="button"
            aria-label={`Remove ${line.description}`}
            onClick={() => removeLine(line.id)}
            className="rounded-md text-body"
            style={{
              width: "32px",
              height: "32px",
              background: "transparent",
              color: "var(--text-muted)",
              minHeight: "44px",
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
