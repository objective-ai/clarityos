import { describe, it } from 'vitest';

// Wave-0 skeleton. Plan 15-03 lands the camelCase SaleResponse / PaymentResponse
// / RefundResponse / DailyCloseResponse TS types; this file flips active once
// the backend Pydantic `by_alias=True` snapshot exists.
//
// See feedback_contract_tests.md for the literal-keys contract pattern.
describe.skip('sales.contract', () => {
  it.todo('SaleResponse exposes camelCase keys mirroring backend Pydantic by_alias');
  it.todo('PaymentResponse exposes camelCase keys mirroring backend Pydantic by_alias');
  it.todo('RefundResponse exposes camelCase keys mirroring backend Pydantic by_alias');
  it.todo('DailyCloseResponse exposes camelCase keys mirroring backend Pydantic by_alias');
});
