// Generated to mirror backend/schemas/sales.py by_alias output.
// POS-16: keep keys in lockstep — contract tests fail loud on drift.

export type SaleStatus = 'open' | 'paid' | 'refunded' | 'voided';
export type PaymentMethod = 'cash' | 'stripe_card' | 'external_card' | 'write_off';
export type PaymentStatus =
  | 'pending'
  | 'succeeded'
  | 'failed'
  | 'refunded'
  | 'partial_refund';
export type SaleSource = 'superbill' | 'optical_order' | 'product' | 'adhoc';

export interface SaleLineItem {
  id: string;
  saleId: string;
  sourceType: SaleSource;
  sourceId: string | null;
  description: string;
  qty: number;
  unitPrice: string; // Decimal — string
  discountAmount: string;
  discountReason: string | null;
  taxable: boolean;
  lineTotal: string;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  saleId: string;
  method: PaymentMethod;
  amount: string;
  tendered: string | null;
  changeDue: string | null;
  processorPaymentId: string | null;
  processorChargeId: string | null;
  last4: string | null;
  cardBrand: string | null;
  authCode: string | null;
  status: PaymentStatus;
  reasonNote: string | null;
  createdAt: string;
}

export interface RefundLineItem {
  id: string;
  refundId: string;
  saleLineItemId: string;
  qty: number;
  amount: string;
}

export interface RefundPayment {
  id: string;
  refundId: string;
  paymentId: string;
  amount: string;
  processorRefundId: string | null;
}

export interface Refund {
  id: string;
  saleId: string;
  totalAmount: string;
  reason: string;
  processorRefundId: string | null;
  refundedById: string | null;
  createdAt: string;
  lineItems: RefundLineItem[];
  paymentRefunds: RefundPayment[];
}

export interface Sale {
  id: string;
  tenantId: string;
  patientId: string | null;
  status: SaleStatus;
  subtotal: string;
  tax: string;
  discountTotal: string;
  total: string;
  receiptNumber: string | null;
  receiptUrl: string | null;
  notes: string | null;
  openedAt: string;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lines: SaleLineItem[];
  payments: Payment[];
  refunds: Refund[];
  remaining: string;
}

export interface SalePrefillItem {
  kind: 'superbill' | 'optical_order';
  sourceId: string;
}

export interface SaleCreatePayload {
  patientId?: string | null;
  notes?: string | null;
  prefill?: SalePrefillItem[];
}

export interface PaymentCreatePayload {
  method: PaymentMethod;
  amount: string;
  tendered?: string | null;
  changeDue?: string | null;
  last4?: string | null;
  authCode?: string | null;
  reasonNote?: string | null;
}

export interface StripeIntentResponse {
  paymentId: string;
  clientSecret: string;
  publishableKey: string;
  intentId: string;
}

export interface RefundLineSpec {
  saleLineItemId: string;
  qty: number;
  amount: string;
}

export interface RefundPaymentSpec {
  paymentId: string;
  amount: string;
}

export interface RefundCreatePayload {
  lineRefunds: RefundLineSpec[];
  paymentRefunds: RefundPaymentSpec[];
  reason: string;
}

export interface DailyCloseBucket {
  key: string;
  count: number;
  total: string;
}

export interface DailyCloseSummary {
  salesCount: number;
  gross: string;
  refunds: string;
  net: string;
}

export interface DailyCloseResponse {
  closeDate: string; // YYYY-MM-DD
  summary: DailyCloseSummary;
  byMethod: DailyCloseBucket[];
  byCategory: DailyCloseBucket[];
  expectedCash: string;
  countedCash: string | null;
  variance: string | null;
  stripePayoutEstimate: string | null;
  runId: string | null;
  runAt: string | null;
  notes: string | null;
  isClosed: boolean;
}

export interface DailyClosePayload {
  closeDate: string;
  countedCash: string;
  notes?: string | null;
}

export interface PaymentConfigUpdatePayload {
  stripePublishableKey?: string | null;
  stripeSecretKey?: string | null;
  stripeWebhookSecret?: string | null;
}

export interface PaymentConfigResponse {
  stripePublishableKey: string | null;
  hasSecretKey: boolean;
  hasWebhookSecret: boolean;
  salesTaxRate: string;
}
