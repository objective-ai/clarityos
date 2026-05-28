"use client";

import { create } from "zustand";
import { devtools } from "zustand/middleware";

import { posApi } from "@/lib/pos/api";
import type {
  Refund,
  RefundCreatePayload,
  RefundLineSpec,
  RefundPaymentSpec,
  Sale,
} from "@/types/sales";

/**
 * Phase 15-09 — refund draft store.
 *
 * Holds the in-progress refund the user is composing inside `RefundDialog`
 * (drawer). The dialog opens against a Sale snapshot; the user picks lines,
 * the store derives totals, and finally calls `submit()` which POSTs to
 * `/api/refunds/?sale_id=...`.
 *
 * Restock + optical-order cancel cascade are handled server-side (Plan 15-05),
 * not here. The store only owns FE draft state + the network call.
 */

interface RefundDraftState {
  saleId: string | null;
  /** Per-line picker state: lineItemId → { qty, amount, refundable }. */
  selections: Record<string, { qty: number; amount: string; selected: boolean }>;
  reason: string;
  /** Per-payment refund split: paymentId → amount (string Decimal). */
  paymentSplit: Record<string, string>;
  submitting: boolean;
  error: string | null;

  /* lifecycle */
  beginFromSale: (sale: Sale) => void;
  reset: () => void;

  /* draft mutations */
  toggleLine: (lineItemId: string) => void;
  setLineQty: (lineItemId: string, qty: number) => void;
  setReason: (reason: string) => void;
  setPaymentAmount: (paymentId: string, amount: string) => void;

  /* submit */
  submit: () => Promise<Refund>;
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function pricePerUnit(line: { qty: number; lineTotal: string }): number {
  if (line.qty <= 0) return 0;
  return Number(line.lineTotal) / line.qty;
}

/* ------------------------------------------------------------------ */
/* store                                                               */
/* ------------------------------------------------------------------ */

export const useRefundDraftStore = create<RefundDraftState>()(
  devtools(
    (set, get) => ({
      saleId: null,
      selections: {},
      reason: "",
      paymentSplit: {},
      submitting: false,
      error: null,

      beginFromSale: (sale) => {
        const selections: RefundDraftState["selections"] = {};
        for (const line of sale.lines ?? []) {
          selections[line.id] = {
            qty: line.qty,
            amount: line.lineTotal,
            selected: false,
          };
        }
        const paymentSplit: Record<string, string> = {};
        for (const p of sale.payments ?? []) {
          if (p.status === "succeeded") paymentSplit[p.id] = "0.00";
        }
        set({
          saleId: sale.id,
          selections,
          reason: "",
          paymentSplit,
          submitting: false,
          error: null,
        });
      },

      reset: () =>
        set({
          saleId: null,
          selections: {},
          reason: "",
          paymentSplit: {},
          submitting: false,
          error: null,
        }),

      toggleLine: (lineItemId) =>
        set((s) => {
          const current = s.selections[lineItemId];
          if (!current) return s;
          return {
            selections: {
              ...s.selections,
              [lineItemId]: { ...current, selected: !current.selected },
            },
          };
        }),

      setLineQty: (lineItemId, qty) =>
        set((s) => {
          const current = s.selections[lineItemId];
          if (!current) return s;
          const safeQty = Math.max(0, Math.floor(qty));
          // Recompute the amount proportionally — staff can still override
          // in a future iteration if we expose an amount input.
          const unit = pricePerUnit({ qty: current.qty, lineTotal: current.amount });
          const nextAmount = (unit * safeQty).toFixed(2);
          return {
            selections: {
              ...s.selections,
              [lineItemId]: { ...current, qty: safeQty, amount: nextAmount },
            },
          };
        }),

      setReason: (reason) => set({ reason }),

      setPaymentAmount: (paymentId, amount) =>
        set((s) => ({ paymentSplit: { ...s.paymentSplit, [paymentId]: amount } })),

      submit: async () => {
        const { saleId, selections, paymentSplit, reason } = get();
        if (!saleId) throw new Error("No sale to refund");
        if (!reason || reason.trim().length < 3) {
          throw new Error(
            "A reason is required for every refund. This shows up in the audit log.",
          );
        }
        const lineRefunds: RefundLineSpec[] = Object.entries(selections)
          .filter(([, sel]) => sel.selected && sel.qty > 0)
          .map(([saleLineItemId, sel]) => ({
            saleLineItemId,
            qty: sel.qty,
            amount: sel.amount,
          }));
        if (lineRefunds.length === 0) {
          throw new Error("Pick at least one line to refund.");
        }
        const paymentRefunds: RefundPaymentSpec[] = Object.entries(paymentSplit)
          .filter(([, amount]) => Number(amount) > 0)
          .map(([paymentId, amount]) => ({ paymentId, amount }));
        if (paymentRefunds.length === 0) {
          throw new Error("Choose at least one payment to refund against.");
        }

        const payload: RefundCreatePayload = {
          lineRefunds,
          paymentRefunds,
          reason: reason.trim(),
        };

        set({ submitting: true, error: null });
        try {
          const refund = await posApi.issueRefund(saleId, payload);
          set({ submitting: false });
          return refund;
        } catch (e) {
          const message = e instanceof Error ? e.message : "Refund failed";
          set({ submitting: false, error: message });
          throw e;
        }
      },
    }),
    { name: "refundDraft" },
  ),
);

/* selectors */

export const selectRefundTotal = (s: RefundDraftState): string => {
  let total = 0;
  for (const sel of Object.values(s.selections)) {
    if (sel.selected) total += Number(sel.amount);
  }
  return total.toFixed(2);
};
