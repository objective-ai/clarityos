"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Minus, Plus } from "lucide-react";

import { posApi } from "@/lib/pos/api";
import { printRefundReceipt } from "@/lib/pos/printReceipt";
import {
  useRefundDraftStore,
  selectRefundTotal,
} from "@/store/refundDraftStore";
import { useEntitlements } from "@/hooks/useEntitlements";
import type { Refund, Sale } from "@/types/sales";

/**
 * RefundDialog — 480px right-slide drawer (clones OrderDetailDrawer shell).
 *
 * Item picker + reason textarea + destructive "Issue refund — $X.XX" CTA.
 * Bound to `useRefundDraftStore`; payment split is auto-allocated proportionally
 * across the sale's succeeded payments (advanced split UI deferred — UI-SPEC
 * §Refund dialog "auto-allocate").
 *
 * Refund actions are OWNER/ADMIN only (POS-11). Other roles see the picker but
 * not the confirm button.
 */

interface RefundDialogProps {
  saleId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired after a refund is successfully issued (lets callers refresh). */
  onIssued?: (refund: Refund) => void;
}

const REFUND_ROLES = new Set(["owner", "admin"]);

/** Spread `total` proportionally across succeeded payments; last absorbs the rounding remainder. */
function allocateRefund(
  total: number,
  payments: { id: string; amount: string }[],
): Record<string, string> {
  const out: Record<string, string> = {};
  const paid = payments.reduce((s, p) => s + Number(p.amount), 0);
  if (paid <= 0 || payments.length === 0) return out;
  const totalCents = Math.round(total * 100);
  let allocated = 0;
  payments.forEach((p, i) => {
    const cents =
      i === payments.length - 1
        ? totalCents - allocated
        : Math.round(totalCents * (Number(p.amount) / paid));
    if (i < payments.length - 1) allocated += cents;
    out[p.id] = (Math.max(0, cents) / 100).toFixed(2);
  });
  return out;
}

export function RefundDialog({
  saleId,
  open,
  onOpenChange,
  onIssued,
}: RefundDialogProps) {
  const { role } = useEntitlements();
  const isOwnerOrAdmin = !!role && REFUND_ROLES.has(role);

  const [mounted, setMounted] = useState(false);
  const [sale, setSale] = useState<Sale | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [issued, setIssued] = useState<Refund | null>(null);
  const [printing, setPrinting] = useState(false);

  const beginFromSale = useRefundDraftStore((s) => s.beginFromSale);
  const reset = useRefundDraftStore((s) => s.reset);
  const selections = useRefundDraftStore((s) => s.selections);
  const reason = useRefundDraftStore((s) => s.reason);
  const submitting = useRefundDraftStore((s) => s.submitting);
  const submitError = useRefundDraftStore((s) => s.error);
  const toggleLine = useRefundDraftStore((s) => s.toggleLine);
  const setLineQty = useRefundDraftStore((s) => s.setLineQty);
  const setReason = useRefundDraftStore((s) => s.setReason);
  const setPaymentAmount = useRefundDraftStore((s) => s.setPaymentAmount);
  const submit = useRefundDraftStore((s) => s.submit);
  const refundTotal = useRefundDraftStore(selectRefundTotal);

  useEffect(() => setMounted(true), []);

  // ESC closes (clones AppointmentDetailDrawer/OrderDetailDrawer).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onOpenChange(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onOpenChange]);

  // Load the sale snapshot + seed the draft store when the drawer opens.
  useEffect(() => {
    if (!open || !saleId) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setIssued(null);
    posApi
      .getSale(saleId)
      .then((s) => {
        if (cancelled) return;
        setSale(s);
        beginFromSale(s);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Failed to load sale");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, saleId, beginFromSale]);

  // Reset the draft store on close so the next open starts clean.
  useEffect(() => {
    if (!open) {
      reset();
      setSale(null);
    }
  }, [open, reset]);

  // qty already refunded per sale-line (disables fully-refunded lines).
  const refundedQtyByLine: Record<string, number> = {};
  for (const r of sale?.refunds ?? []) {
    for (const li of r.lineItems) {
      refundedQtyByLine[li.saleLineItemId] =
        (refundedQtyByLine[li.saleLineItemId] ?? 0) + li.qty;
    }
  }

  const selectedCount = Object.values(selections).filter(
    (s) => s.selected && s.qty > 0,
  ).length;
  const reasonValid = reason.trim().length >= 3;
  const canIssue =
    isOwnerOrAdmin &&
    selectedCount > 0 &&
    reasonValid &&
    Number(refundTotal) > 0 &&
    !submitting;

  const handleConfirm = useCallback(async () => {
    if (!sale) return;
    // Auto-allocate the refund total proportionally across succeeded payments.
    const succeeded = sale.payments.filter((p) => p.status === "succeeded");
    const allocation = allocateRefund(Number(refundTotal), succeeded);
    for (const [paymentId, amount] of Object.entries(allocation)) {
      setPaymentAmount(paymentId, amount);
    }
    try {
      const refund = await submit();
      setIssued(refund);
      onIssued?.(refund);
    } catch {
      /* error surfaced via submitError */
    }
  }, [sale, refundTotal, setPaymentAmount, submit, onIssued]);

  const handlePrintRefund = useCallback(async () => {
    if (!issued) return;
    setPrinting(true);
    try {
      await printRefundReceipt(issued.id);
    } catch {
      /* swallow — print failures are non-fatal */
    } finally {
      setPrinting(false);
    }
  }, [issued]);

  if (!open && !sale) return null;
  if (!mounted) return null;

  const eligibleLines = (sale?.lines ?? []).filter((l) => {
    const refunded = refundedQtyByLine[l.id] ?? 0;
    return l.qty - refunded > 0;
  });

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />

      {/* Drawer panel — 480px right-slide */}
      <div
        className={`fixed right-0 top-0 bottom-0 z-50 w-[480px] max-md:w-full bg-[var(--bg-surface)] border-l border-[var(--border-default)] shadow-2xl flex flex-col transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          open ? "translate-x-0" : "translate-x-full pointer-events-none"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Issue refund"
      >
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="absolute top-4 right-4 z-10 p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-glass)] transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-[var(--border-subtle)]">
          <p className="text-overline" style={{ color: "var(--text-muted)" }}>
            Refund items
          </p>
          {sale?.receiptNumber && (
            <p className="text-caption font-mono-data" style={{ color: "var(--text-secondary)" }}>
              Receipt #{sale.receiptNumber}
            </p>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {loading ? (
            <p className="text-body" style={{ color: "var(--text-muted)" }}>
              Loading sale…
            </p>
          ) : loadError ? (
            <p className="text-body" style={{ color: "var(--state-critical)" }}>
              {loadError}
            </p>
          ) : issued ? (
            <div className="flex flex-col gap-4">
              <p className="text-body" style={{ color: "var(--state-normal)" }}>
                Refund issued — ${Number(issued.totalAmount).toFixed(2)}
              </p>
              <p className="text-caption" style={{ color: "var(--text-muted)" }}>
                Card refunds may take 5–10 business days to appear on the
                cardholder&apos;s statement.
              </p>
              <button
                type="button"
                onClick={handlePrintRefund}
                disabled={printing}
                className="py-3 rounded-md text-subhead disabled:opacity-45"
                style={{
                  background: "transparent",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-default)",
                  minHeight: "44px",
                }}
              >
                {printing ? "Printing…" : "Print refund receipt"}
              </button>
            </div>
          ) : eligibleLines.length === 0 ? (
            <div className="space-y-1">
              <p className="text-subhead" style={{ color: "var(--text-primary)" }}>
                Nothing to refund
              </p>
              <p className="text-body" style={{ color: "var(--text-muted)" }}>
                All lines on this sale have already been refunded.
              </p>
            </div>
          ) : (
            <>
              {/* Item picker */}
              <ul className="space-y-2">
                {(sale?.lines ?? []).map((line) => {
                  const refunded = refundedQtyByLine[line.id] ?? 0;
                  const remaining = line.qty - refunded;
                  const sel = selections[line.id];
                  const disabled = remaining <= 0;
                  return (
                    <li
                      key={line.id}
                      className="glass-card p-3 flex items-start gap-3"
                      style={disabled ? { opacity: 0.45 } : undefined}
                    >
                      <input
                        type="checkbox"
                        checked={!!sel?.selected}
                        disabled={disabled}
                        onChange={() => toggleLine(line.id)}
                        aria-label={`Refund ${line.description}`}
                        className="mt-1 h-4 w-4 accent-[var(--accent)]"
                      />
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-subhead truncate"
                          style={{
                            color: "var(--text-primary)",
                            textDecoration: disabled ? "line-through" : undefined,
                          }}
                        >
                          {line.description}
                        </p>
                        <p className="text-caption" style={{ color: "var(--text-muted)" }}>
                          {disabled
                            ? `Refunded (${refunded} of ${line.qty})`
                            : `$${Number(line.lineTotal).toFixed(2)} · ${remaining} of ${line.qty} refundable`}
                        </p>
                      </div>
                      {!disabled && sel?.selected && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            aria-label="Decrease quantity"
                            onClick={() => setLineQty(line.id, Math.max(1, sel.qty - 1))}
                            className="h-7 w-7 rounded-md flex items-center justify-center"
                            style={{ border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span
                            className="text-body font-mono-data w-6 text-center"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {sel.qty}
                          </span>
                          <button
                            type="button"
                            aria-label="Increase quantity"
                            onClick={() => setLineQty(line.id, Math.min(remaining, sel.qty + 1))}
                            className="h-7 w-7 rounded-md flex items-center justify-center"
                            style={{ border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>

              {/* Live refund total */}
              <div className="flex items-baseline justify-between pt-2 border-t border-[var(--border-subtle)]">
                <span className="text-overline" style={{ color: "var(--text-muted)" }}>
                  Refund total
                </span>
                <span
                  className="text-display font-mono-data data-value"
                  style={{ color: "var(--state-critical)" }}
                >
                  ${Number(refundTotal).toFixed(2)}
                </span>
              </div>

              {/* Reason */}
              <div className="flex flex-col gap-1">
                <label htmlFor="refund-reason" className="text-overline" style={{ color: "var(--text-muted)" }}>
                  Reason
                </label>
                <textarea
                  id="refund-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  maxLength={200}
                  placeholder="Why is this being refunded?"
                  className="glass-input w-full text-body resize-y"
                  aria-describedby="refund-reason-help"
                />
                <p id="refund-reason-help" className="text-caption" style={{ color: "var(--text-muted)" }}>
                  Shows up on the audit log and refund receipt.
                </p>
              </div>

              {submitError && (
                <div role="alert" className="text-caption" style={{ color: "var(--state-critical)" }}>
                  {submitError}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer CTA — OWNER/ADMIN only */}
        {!issued && !loading && !loadError && eligibleLines.length > 0 && (
          <div className="border-t border-[var(--border-subtle)] px-6 py-4">
            {isOwnerOrAdmin ? (
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!canIssue}
                className="w-full py-3 rounded-md text-subhead disabled:opacity-45"
                style={{
                  background: "var(--state-critical)",
                  color: "var(--bg-base)",
                  minHeight: "44px",
                }}
              >
                {submitting
                  ? "Issuing…"
                  : `Issue refund — $${Number(refundTotal).toFixed(2)}`}
              </button>
            ) : (
              <p className="text-caption text-center" style={{ color: "var(--text-muted)" }}>
                Refunds require an owner or admin.
              </p>
            )}
          </div>
        )}
      </div>
    </>,
    document.body,
  );
}
