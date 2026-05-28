import { describe, it } from 'vitest';

// Wave-0 skeleton. Plan 15-09 flips `describe.skip` → `describe` once
// `lib/pos/printReceipt.ts` exists with the hidden-iframe + blob URL flow.
describe.skip('printReceipt', () => {
  it.todo('creates a hidden iframe, sets blob src, invokes window.print');
  it.todo('revokes the blob URL after print dialog closes');
});
