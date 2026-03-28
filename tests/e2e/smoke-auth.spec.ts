/**
 * smoke-auth.spec.ts — Phase 1: Security & Auth E2E verification
 *
 * @auth tests run in the `auth-flows` project (no storageState — unauthenticated browser).
 * Standard tests run in the `chromium` project (with storageState — already logged in).
 */
import { test, expect } from './fixtures';

const TENANT = 'sunview';
const ENCOUNTER_ID = 'e0000000-0000-0000-0000-000000000003';

test.describe('Smoke Auth', () => {

  // ── Unauthenticated redirect tests (run without storageState) ─────────────

  test('unauthenticated routes redirect to /login @auth', async ({ page }) => {
    await page.goto(`/${TENANT}/dashboard`, { waitUntil: 'networkidle' });
    await page.waitForURL('**/login**', { timeout: 10000 }).catch(() => {});
    expect(page.url(), 'dashboard should redirect to /login').toContain('/login');

    await page.goto(`/${TENANT}/patients`, { waitUntil: 'networkidle' });
    await page.waitForURL('**/login**', { timeout: 10000 }).catch(() => {});
    expect(page.url(), 'patients should redirect to /login').toContain('/login');

    await page.goto(`/${TENANT}/encounter/${ENCOUNTER_ID}`, { waitUntil: 'networkidle' });
    await page.waitForURL('**/login**', { timeout: 10000 }).catch(() => {});
    expect(page.url(), 'encounter should redirect to /login').toContain('/login');
  });

  test('login redirects to slug-based URL with no UUIDs @auth', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'networkidle' });
    await page.waitForSelector('#email', { timeout: 15000 });
    await page.fill('#email', 'duytran@yahoo.com');
    await page.fill('#password', '123456');

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 20000 }).catch(() => {}),
      page.click('button[type="submit"]'),
    ]);
    await page.waitForURL('**/sunview/**', { timeout: 15000 }).catch(() => {});

    const finalUrl = page.url();
    expect(finalUrl, 'should leave /login after login').not.toContain('/login');
    expect(finalUrl, 'should use slug-based URL').toContain(`/${TENANT}`);
    expect(finalUrl, 'should not contain UUID in URL').not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/
    );
  });

  // ── Authenticated tests (run with storageState) ───────────────────────────

  test('logout clears ePHI from localStorage and redirects to /login @smoke', async ({ page }) => {
    await page.goto(`/${TENANT}/encounter/${ENCOUNTER_ID}`, { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');

    const lsKeysBefore = await page.evaluate(() => {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) keys.push(key);
      }
      return keys.filter(k =>
        k.startsWith('clarity-') || k.startsWith('encounter-') ||
        k.startsWith('draft-transcript-') || k.startsWith('clinical-')
      );
    });
    // Info only — stores may use memory rather than localStorage
    void lsKeysBefore;

    const logoutTarget = page.locator('button:has-text("Log Out"), button[title="Log out"]');
    await expect(logoutTarget.first()).toBeVisible({ timeout: 10000 });
    await logoutTarget.first().click();

    await page.waitForURL('**/login**', { timeout: 10000 }).catch(() => {});
    expect(page.url(), 'should redirect to /login after logout').toContain('/login');

    const clinicalKeysAfter = await page.evaluate(() => {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (
          key.startsWith('encounter-') ||
          key.startsWith('draft-transcript-') ||
          key.startsWith('clinical-')
        )) keys.push(key);
      }
      return keys;
    });
    expect(clinicalKeysAfter, `ePHI keys remain after logout: ${clinicalKeysAfter.join(', ')}`).toHaveLength(0);
  });

});
