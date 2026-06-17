/**
 * Typed wrapper around the Phase 15 BFF surface (Plan 15-08).
 *
 * Routes live under:
 *   - /api/sales/...
 *   - /api/sales/{id}/lines/...
 *   - /api/sales/{id}/payments/...
 *   - /api/sales/{id}/payments/stripe-confirm/
 *   - /api/sales/{id}/close/
 *   - /api/sales/{id}/refunds/...
 *   - /api/sales/{id}/receipt/  (+ /email/)
 *   - /api/refunds/...
 *
 * JSON endpoints flow through apiFetch (camelize on response, snakify on body).
 * Binary endpoints (receipt PDFs) are streamed from the BFF as application/pdf;
 * those are fetched directly inside `lib/pos/printReceipt.ts`, NOT here.
 */

import { apiFetch } from "@/lib/api-client";
import type {
  DailyClosePayload,
  DailyCloseResponse,
  Payment,
  PaymentCreatePayload,
  Refund,
  RefundCreatePayload,
  Sale,
  SaleCreatePayload,
  SaleLineItem,
  StripeIntentResponse,
} from "@/types/sales";

/* ------------------------------------------------------------------ */
/* line-item                                                           */
/* ------------------------------------------------------------------ */

export interface AddLinePayload {
  sourceType: "superbill" | "optical_order" | "product" | "adhoc";
  sourceId: string | null;
  description: string;
  qty: number;
  unitPrice: string;
  discountAmount: string;
  discountReason: string | null;
  taxable: boolean;
}

/* ------------------------------------------------------------------ */
/* api surface                                                         */
/* ------------------------------------------------------------------ */

export const posApi = {
  /** POST /api/sales/ — open a new sale. */
  openSale: (payload: SaleCreatePayload): Promise<Sale> =>
    apiFetch<Sale>("/api/sales/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  /** GET /api/sales/{id}/ — refresh a sale with full lines + payments + refunds. */
  getSale: (saleId: string): Promise<Sale> =>
    apiFetch<Sale>(`/api/sales/${saleId}/`),

  /** PATCH /api/sales/{id}/ — patch notes / patient. */
  patchSale: (saleId: string, patch: Partial<Pick<Sale, "notes" | "patientId">>): Promise<Sale> =>
    apiFetch<Sale>(`/api/sales/${saleId}/`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  /** DELETE /api/sales/{id}/ — void an open sale (no payments). */
  voidSale: (saleId: string): Promise<void> =>
    apiFetch<void>(`/api/sales/${saleId}/`, { method: "DELETE" }),

  /** POST /api/sales/{id}/lines/ — append a cart line. Returns the full sale. */
  addLine: (saleId: string, payload: AddLinePayload): Promise<Sale> =>
    apiFetch<Sale>(`/api/sales/${saleId}/lines/`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  /** PATCH /api/sales/{id}/lines/{lineId}/ — partial update. Returns the full sale. */
  updateLine: (
    saleId: string,
    lineId: string,
    patch: Partial<SaleLineItem>,
  ): Promise<Sale> =>
    apiFetch<Sale>(`/api/sales/${saleId}/lines/${lineId}/`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  /** DELETE /api/sales/{id}/lines/{lineId}/ — drop a line. Returns the full sale. */
  removeLine: (saleId: string, lineId: string): Promise<Sale> =>
    apiFetch<Sale>(`/api/sales/${saleId}/lines/${lineId}/`, { method: "DELETE" }),

  /**
   * POST /api/sales/{id}/payments/ — record a payment.
   *
   * For cash / external_card / write_off this returns a `Payment` (the line is
   * appended on the backend and surfaces via the next `getSale`).
   *
   * For stripe_card the backend creates a PaymentIntent and returns a
   * `StripeIntentResponse` (publishableKey + clientSecret + paymentId).
   */
  recordPayment: (
    saleId: string,
    payload: PaymentCreatePayload,
  ): Promise<Payment | StripeIntentResponse> =>
    apiFetch<Payment | StripeIntentResponse>(`/api/sales/${saleId}/payments/`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  /**
   * POST /api/sales/{id}/payments/stripe-confirm/ — finalize a Stripe payment
   * AFTER `stripe.confirmPayment` resolves with a succeeded PaymentIntent.
   *
   * Body: `{ paymentIntentId }`. The backend re-retrieves the intent to
   * authoritatively flip Payment.status → succeeded; webhook is a safety net.
   */
  confirmStripePayment: (saleId: string, paymentIntentId: string): Promise<Payment> =>
    apiFetch<Payment>(`/api/sales/${saleId}/payments/stripe-confirm/`, {
      method: "POST",
      body: JSON.stringify({ paymentIntentId }),
    }),

  /** DELETE /api/sales/{id}/payments/{paymentId}/ — cancel a pending Stripe intent. */
  cancelPendingPayment: (saleId: string, paymentId: string): Promise<void> =>
    apiFetch<void>(`/api/sales/${saleId}/payments/${paymentId}/`, {
      method: "DELETE",
    }),

  /** POST /api/sales/{id}/close/ — finalize the sale and assign a receipt #. */
  closeSale: (saleId: string): Promise<Sale> =>
    apiFetch<Sale>(`/api/sales/${saleId}/close/`, { method: "POST" }),

  /** GET /api/sales/{id}/refunds/ — list refunds for a sale. */
  listRefunds: (saleId: string): Promise<Refund[]> =>
    apiFetch<Refund[]>(`/api/sales/${saleId}/refunds/`),

  /** POST /api/refunds/?sale_id={id} — issue a refund. */
  issueRefund: (saleId: string, payload: RefundCreatePayload): Promise<Refund> =>
    apiFetch<Refund>(`/api/refunds/?sale_id=${encodeURIComponent(saleId)}`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  /** GET /api/refunds/{id}/ — fetch a single refund. */
  getRefund: (refundId: string): Promise<Refund> =>
    apiFetch<Refund>(`/api/refunds/${refundId}/`),

  /** POST /api/sales/{id}/receipt/email/ — email receipt PDF via Postmark. */
  emailReceipt: (saleId: string, emailOverride?: string | null): Promise<{ ok: true }> =>
    apiFetch<{ ok: true }>(`/api/sales/${saleId}/receipt/email/`, {
      method: "POST",
      body: JSON.stringify(emailOverride ? { emailOverride } : {}),
    }),

  /** GET /api/pos/daily-close/?date={iso} — totals + reconciliation for a date. */
  getDailyClose: (date: string): Promise<DailyCloseResponse> =>
    apiFetch<DailyCloseResponse>(
      `/api/pos/daily-close/?date=${encodeURIComponent(date)}`,
    ),

  /** POST /api/pos/daily-close/ — record counted cash + variance and close the day. */
  saveDailyClose: (payload: DailyClosePayload): Promise<DailyCloseResponse> =>
    apiFetch<DailyCloseResponse>(`/api/pos/daily-close/`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};

export type PosApi = typeof posApi;
