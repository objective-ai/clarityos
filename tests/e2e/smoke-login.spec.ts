/**
 * smoke-login.spec.ts — Login + slug URL verification
 *
 * With storageState, the browser starts authenticated.
 * Verifies: slug-based URL (no UUIDs), not stuck on /login, no console errors.
 */
import { test, expect } from './fixtures';

const TENANT = 'sunview';

test.describe('Smoke Login', () => {

  test('authenticated session uses slug-based URL with no UUIDs @smoke', async ({ page, consoleErrors }) => {
    await page.goto(`/${TENANT}/schedule`, { waitUntil: 'networkidle' });

    const finalUrl = page.url();
    expect(finalUrl, 'should not remain on /login').not.toContain('/login');
    expect(finalUrl, 'should use tenant slug').toContain(`/${TENANT}`);
    expect(finalUrl, 'should not contain UUID in URL').not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/
    );
    expect(consoleErrors, `Console errors: ${consoleErrors.join(', ')}`).toHaveLength(0);
  });

});
