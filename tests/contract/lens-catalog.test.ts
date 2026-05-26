/**
 * Phase 14 — Optical Order Configuration: lens reference catalog contract (Wave 0 stub).
 *
 * vitest literal-keys snapshot that mirrors backend Pydantic `model_dump(by_alias=true)`
 * for LensType/LensMaterial/LensCoating responses. Per feedback_contract_tests.md,
 * new FE/BE endpoint pairs need a contract test so FE never drifts from BE.
 *
 * Implementation lands in Plan 14-02 (BE) + Plan 14-08 (FE types).
 */
import { describe, it, expect } from 'vitest';

describe('LensType contract', () => {
  it.skip('matches backend by_alias snapshot', () => {
    const expectedKeys = [
      'id',
      'tenantId',
      'name',
      'requiresSegHeight',
      'requiresVertex',
      'displayOrder',
      'isActive',
      'createdAt',
      'updatedAt',
    ];
    expect(expectedKeys).toBeDefined();
  });
});

describe('LensMaterial contract', () => {
  it.skip('matches backend by_alias snapshot', () => {
    // Placeholder — Plan 14-08 lands types/lensCatalog.ts and the real assertion.
  });
});

describe('LensCoating contract', () => {
  it.skip('matches backend by_alias snapshot', () => {
    // Placeholder — Plan 14-08 lands types/lensCatalog.ts and the real assertion.
  });
});
