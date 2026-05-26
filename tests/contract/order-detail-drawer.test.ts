/**
 * Phase 14 — Optical Order Configuration: OrderDetailDrawer routing + prop contract (Wave 0 stub).
 *
 * The drawer already exists from Phase 13 INV-15 (components/orders/OrderDetailDrawer.tsx).
 * Plan 14-10 extends it with Phase 14 read-only sections + Generate Job Ticket button and
 * wires routing: draft orders → configurator; non-draft orders → drawer.
 */
import { describe, it, expect } from 'vitest';

describe('OrderDetailDrawer routing', () => {
  it.skip('routes_draft_to_configurator — draft order click navigates to configurator page', () => {
    expect(true).toBeDefined();
  });

  it.skip('opens_drawer_for_placed — placed/dispensed orders open OrderDetailDrawer', () => {
    expect(true).toBeDefined();
  });

  it.skip('cancel_cta_gated_on_permission — Cancel CTA hidden when role lacks CANCEL_OPTICAL_ORDER', () => {
    expect(true).toBeDefined();
  });
});
