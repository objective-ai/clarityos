import { describe, it } from 'vitest';

// Wave-0 skeleton. Plan 15-09 flips `describe.skip` → `describe` once the
// StripePaymentForm component, Elements wrapper, and clientSecret prop wiring
// land. Until then this file exists so the verification matrix has a real
// target instead of "MISSING".
describe.skip('StripePaymentForm', () => {
  it.todo('renders PaymentElement with clientSecret');
  it.todo('disables submit while confirmPayment is in flight');
  it.todo('surfaces server-confirmed status, not stripe.confirmPayment result');
});
