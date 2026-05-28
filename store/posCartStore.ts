"use client";

import { create } from "zustand";
import { devtools } from "zustand/middleware";

import { posApi } from "@/lib/pos/api";
import type { AddLinePayload } from "@/lib/pos/api";
import type {
  Payment,
  Sale,
  SaleCreatePayload,
  SaleLineItem,
  StripeIntentResponse,
} from "@/types/sales";

/* ------------------------------------------------------------------ */
/* state shape                                                         */
/* ------------------------------------------------------------------ */

interface PosCartState {
  sale: Sale | null;
  loading: boolean;
  saving: boolean;
  error: string | null;

  /* lifecycle */
  openSale: (payload: SaleCreatePayload) => Promise<Sale>;
  loadSale: (saleId: string) => Promise<Sale>;
  refresh: () => Promise<void>;
  reset: () => void;

  /* lines */
  addLine: (
    line: Omit<AddLinePayload, "discountAmount" | "discountReason" | "taxable" | "sourceType" | "sourceId"> & {
      sourceType?: AddLinePayload["sourceType"];
      sourceId?: string | null;
      discountAmount?: string;
      discountReason?: string | null;
      taxable?: boolean;
    },
  ) => Promise<void>;
  updateLine: (lineId: string, patch: Partial<SaleLineItem>) => Promise<void>;
  removeLine: (lineId: string) => Promise<void>;

  /* payments */
  addCashPayment: (amount: string, tendered: string) => Promise<Payment>;
  addExternalCardPayment: (
    amount: string,
    last4: string,
    authCode?: string,
  ) => Promise<Payment>;
  addWriteOff: (amount: string, reasonNote: string) => Promise<Payment>;
  initiateStripePayment: (amount: string) => Promise<StripeIntentResponse>;
  confirmStripePayment: (paymentIntentId: string) => Promise<Payment>;
  cancelStripePayment: (paymentId: string) => Promise<void>;

  /* close + void */
  closeSale: () => Promise<Sale>;
  voidSale: () => Promise<void>;
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function requireSale(state: PosCartState): Sale {
  if (!state.sale) throw new Error("No active sale");
  return state.sale;
}

function formatChange(amount: string, tendered: string): string {
  const change = Number(tendered) - Number(amount);
  return change.toFixed(2);
}

/* ------------------------------------------------------------------ */
/* store                                                               */
/* ------------------------------------------------------------------ */

export const usePosCartStore = create<PosCartState>()(
  devtools(
    (set, get) => ({
      sale: null,
      loading: false,
      saving: false,
      error: null,

      openSale: async (payload) => {
        set({ loading: true, error: null });
        try {
          const sale = await posApi.openSale(payload);
          set({ sale, loading: false });
          return sale;
        } catch (e) {
          const message = e instanceof Error ? e.message : "Failed to open sale";
          set({ error: message, loading: false });
          throw e;
        }
      },

      loadSale: async (saleId) => {
        set({ loading: true, error: null });
        try {
          const sale = await posApi.getSale(saleId);
          set({ sale, loading: false });
          return sale;
        } catch (e) {
          const message = e instanceof Error ? e.message : "Failed to load sale";
          set({ error: message, loading: false });
          throw e;
        }
      },

      refresh: async () => {
        const sale = get().sale;
        if (!sale) return;
        const fresh = await posApi.getSale(sale.id);
        set({ sale: fresh });
      },

      reset: () => set({ sale: null, error: null, loading: false, saving: false }),

      /* ---------------- lines ---------------- */

      addLine: async (line) => {
        const sale = requireSale(get());
        set({ saving: true });
        try {
          const payload: AddLinePayload = {
            sourceType: line.sourceType ?? "adhoc",
            sourceId: line.sourceId ?? null,
            description: line.description,
            qty: line.qty,
            unitPrice: line.unitPrice,
            discountAmount: line.discountAmount ?? "0",
            discountReason: line.discountReason ?? null,
            taxable: line.taxable ?? true,
          };
          const updated = await posApi.addLine(sale.id, payload);
          set({ sale: updated, saving: false });
        } catch (e) {
          set({ saving: false });
          throw e;
        }
      },

      updateLine: async (lineId, patch) => {
        const sale = requireSale(get());
        set({ saving: true });
        try {
          const updated = await posApi.updateLine(sale.id, lineId, patch);
          set({ sale: updated, saving: false });
        } catch (e) {
          set({ saving: false });
          throw e;
        }
      },

      removeLine: async (lineId) => {
        const sale = requireSale(get());
        set({ saving: true });
        try {
          const updated = await posApi.removeLine(sale.id, lineId);
          set({ sale: updated, saving: false });
        } catch (e) {
          set({ saving: false });
          throw e;
        }
      },

      /* ---------------- payments ---------------- */

      addCashPayment: async (amount, tendered) => {
        const sale = requireSale(get());
        if (Number(tendered) < Number(amount)) {
          throw new Error(
            "Tendered amount is less than the payment amount. Increase tendered or adjust the payment amount.",
          );
        }
        set({ saving: true });
        try {
          const payment = (await posApi.recordPayment(sale.id, {
            method: "cash",
            amount,
            tendered,
            changeDue: formatChange(amount, tendered),
          })) as Payment;
          const refreshed = await posApi.getSale(sale.id);
          set({ sale: refreshed, saving: false });
          return payment;
        } catch (e) {
          set({ saving: false });
          throw e;
        }
      },

      addExternalCardPayment: async (amount, last4, authCode) => {
        const sale = requireSale(get());
        set({ saving: true });
        try {
          const payment = (await posApi.recordPayment(sale.id, {
            method: "external_card",
            amount,
            last4,
            authCode: authCode ?? null,
          })) as Payment;
          const refreshed = await posApi.getSale(sale.id);
          set({ sale: refreshed, saving: false });
          return payment;
        } catch (e) {
          set({ saving: false });
          throw e;
        }
      },

      addWriteOff: async (amount, reasonNote) => {
        const sale = requireSale(get());
        if (!reasonNote || reasonNote.trim().length < 3) {
          throw new Error(
            "A reason is required for write-offs. This shows up in the audit log.",
          );
        }
        set({ saving: true });
        try {
          const payment = (await posApi.recordPayment(sale.id, {
            method: "write_off",
            amount,
            reasonNote: reasonNote.trim(),
          })) as Payment;
          const refreshed = await posApi.getSale(sale.id);
          set({ sale: refreshed, saving: false });
          return payment;
        } catch (e) {
          set({ saving: false });
          throw e;
        }
      },

      initiateStripePayment: async (amount) => {
        const sale = requireSale(get());
        set({ saving: true });
        try {
          const intent = (await posApi.recordPayment(sale.id, {
            method: "stripe_card",
            amount,
          })) as StripeIntentResponse;
          // Refresh so the pending Payment row shows in the panel.
          const refreshed = await posApi.getSale(sale.id);
          set({ sale: refreshed, saving: false });
          return intent;
        } catch (e) {
          set({ saving: false });
          throw e;
        }
      },

      confirmStripePayment: async (paymentIntentId) => {
        const sale = requireSale(get());
        set({ saving: true });
        try {
          const payment = await posApi.confirmStripePayment(sale.id, paymentIntentId);
          const refreshed = await posApi.getSale(sale.id);
          set({ sale: refreshed, saving: false });
          return payment;
        } catch (e) {
          set({ saving: false });
          throw e;
        }
      },

      cancelStripePayment: async (paymentId) => {
        const sale = requireSale(get());
        set({ saving: true });
        try {
          await posApi.cancelPendingPayment(sale.id, paymentId);
          const refreshed = await posApi.getSale(sale.id);
          set({ sale: refreshed, saving: false });
        } catch (e) {
          set({ saving: false });
          throw e;
        }
      },

      /* ---------------- close / void ---------------- */

      closeSale: async () => {
        const sale = requireSale(get());
        set({ saving: true });
        try {
          const closed = await posApi.closeSale(sale.id);
          set({ sale: closed, saving: false });
          return closed;
        } catch (e) {
          set({ saving: false });
          throw e;
        }
      },

      voidSale: async () => {
        const sale = requireSale(get());
        set({ saving: true });
        try {
          await posApi.voidSale(sale.id);
          set({ sale: null, saving: false });
        } catch (e) {
          set({ saving: false });
          throw e;
        }
      },
    }),
    { name: "posCart" },
  ),
);

/* ------------------------------------------------------------------ */
/* selectors                                                           */
/* ------------------------------------------------------------------ */

export const selectRemaining = (s: PosCartState): string =>
  s.sale?.remaining ?? "0.00";

export const selectLines = (s: PosCartState): SaleLineItem[] =>
  s.sale?.lines ?? [];

export const selectPayments = (s: PosCartState): Payment[] =>
  s.sale?.payments ?? [];

export const selectIsClosable = (s: PosCartState): boolean => {
  if (!s.sale) return false;
  if (s.sale.status !== "open") return false;
  if ((s.sale.payments ?? []).length === 0) return false;
  return Number(s.sale.remaining) <= 0;
};
