/**
 * Phase 14 — Optical Order Configuration: OpticalOrderResponse Phase 14 extensions (Wave 0 stub).
 *
 * Asserts the 6 new keys Plan 14-01 adds to OpticalOrderResponse via Pydantic
 * `model_dump(by_alias=true)`. Per OPT14-17, FE must see camelCase aliases for
 * every Phase 14 column on the order response.
 *
 * Implementation lands in Plan 14-09 (FE configurator) — these literal-key
 * assertions snapshot the wire shape so the BE schema (14-01) and FE types
 * (14-08) stay in lock-step.
 */
import { describe, it, expect } from 'vitest';

describe('OpticalOrderResponse Phase 14 extensions', () => {
  it.skip('exposes finalRefractionId on the response', () => {
    expect('finalRefractionId').toBeDefined();
  });

  it.skip('exposes habitualRefractionId on the response', () => {
    expect('habitualRefractionId').toBeDefined();
  });

  it.skip('exposes visionPlan on the response', () => {
    expect('visionPlan').toBeDefined();
  });

  it.skip('exposes fitting on the response', () => {
    expect('fitting').toBeDefined();
  });

  it.skip('exposes jobTicketGeneratedAt on the response', () => {
    expect('jobTicketGeneratedAt').toBeDefined();
  });

  it.skip('exposes suggestionResolutions on the response', () => {
    expect('suggestionResolutions').toBeDefined();
  });
});
