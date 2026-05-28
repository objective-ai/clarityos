import { describe, expectTypeOf, it } from 'vitest';
import type {
  DailyCloseResponse,
  Payment,
  Refund,
  Sale,
  SaleLineItem,
} from './sales';

// POS-16: literal-key contract — keys here MUST match
// backend/tests/test_sales_contract.py EXPECTED_*_KEYS sets.
// Any drift fails TS compilation, surfacing the contract break before runtime.
describe('sales.contract — literal keys mirror Pydantic by_alias', () => {
  it('Sale has exact key set', () => {
    expectTypeOf<keyof Sale>().toEqualTypeOf<
      | 'id'
      | 'tenantId'
      | 'patientId'
      | 'status'
      | 'subtotal'
      | 'tax'
      | 'discountTotal'
      | 'total'
      | 'receiptNumber'
      | 'receiptUrl'
      | 'notes'
      | 'openedAt'
      | 'closedAt'
      | 'createdAt'
      | 'updatedAt'
      | 'lines'
      | 'payments'
      | 'refunds'
      | 'remaining'
    >();
  });

  it('SaleLineItem has exact key set', () => {
    expectTypeOf<keyof SaleLineItem>().toEqualTypeOf<
      | 'id'
      | 'saleId'
      | 'sourceType'
      | 'sourceId'
      | 'description'
      | 'qty'
      | 'unitPrice'
      | 'discountAmount'
      | 'discountReason'
      | 'taxable'
      | 'lineTotal'
      | 'createdAt'
      | 'updatedAt'
    >();
  });

  it('Payment has exact key set', () => {
    expectTypeOf<keyof Payment>().toEqualTypeOf<
      | 'id'
      | 'saleId'
      | 'method'
      | 'amount'
      | 'tendered'
      | 'changeDue'
      | 'processorPaymentId'
      | 'processorChargeId'
      | 'last4'
      | 'cardBrand'
      | 'authCode'
      | 'status'
      | 'reasonNote'
      | 'createdAt'
    >();
  });

  it('Refund has exact key set', () => {
    expectTypeOf<keyof Refund>().toEqualTypeOf<
      | 'id'
      | 'saleId'
      | 'totalAmount'
      | 'reason'
      | 'processorRefundId'
      | 'refundedById'
      | 'createdAt'
      | 'lineItems'
      | 'paymentRefunds'
    >();
  });

  it('DailyCloseResponse has exact key set', () => {
    expectTypeOf<keyof DailyCloseResponse>().toEqualTypeOf<
      | 'closeDate'
      | 'summary'
      | 'byMethod'
      | 'byCategory'
      | 'expectedCash'
      | 'countedCash'
      | 'variance'
      | 'stripePayoutEstimate'
      | 'runId'
      | 'runAt'
      | 'notes'
      | 'isClosed'
    >();
  });
});
