/**
 * Phase 14 — Optical Order Configuration: end-to-end coverage (Wave 0 stub).
 *
 * Six scenarios covering all 7 ROADMAP success criteria (OPT14-18).
 * Implementation lands in Plan 14-11 after Plans 14-01..14-10 ship.
 */
import { test, expect } from './fixtures';

test.describe('Optical Order Configuration E2E', () => {
  test.skip('queue → Configure Order CTA → opens configurator with Final Rx prefilled', async ({ page }) => {
    // OPT14-01 / OPT14-13 — verifies entry-point #1 and Final Rx auto-population.
    expect(page).toBeDefined();
  });

  test.skip('autosave triggers PATCH after 1.5s + on blur', async ({ apiCalls }) => {
    // OPT14-12 — debounce + flush-on-blur via opticalOrderConfigStore.
    expect(apiCalls).toBeDefined();
  });

  test.skip('place fails with field_errors when seg_height missing for progressive', async ({ page }) => {
    // OPT14-04 / Pitfall 7 — place handler validation gate.
    expect(page).toBeDefined();
  });

  test.skip('place succeeds → Generate Job Ticket downloads PDF', async ({ page }) => {
    // OPT14-06 — reportlab PDF stream through BFF.
    expect(page).toBeDefined();
  });

  test.skip('draft-pending pill renders on queue card and routes to configurator', async ({ page }) => {
    // OPT14-14 — absorbs 2026-05-08-optical-queue-draft-order-indicator todo.
    expect(page).toBeDefined();
  });

  test.skip('non-draft order opens OrderDetailDrawer instead of configurator', async ({ page }) => {
    // OPT14-15 — drawer routing for placed/dispensed orders.
    expect(page).toBeDefined();
  });
});
