/**
 * smoke-auth.spec.js — Phase 1: Security & Auth E2E verification
 *
 * Verifies: unauthenticated redirect to /login, login works,
 * logout clears ePHI from localStorage/stores, no UUIDs in URLs.
 * Run: bash scripts/dev.sh verify tests/e2e/smoke-auth.spec.js
 */
const { ensureApi, launchBrowser, loginOrRestore, setupTracking, printResults, TARGET_URL } = require('./helpers/test-utils');

(async () => {
  await ensureApi();
  const { browser, context, page } = await launchBrowser();
  const { consoleErrors } = setupTracking(page);
  const results = {};

  // =========================================================================
  // 1. Unauthenticated redirect — visit tenant page without login
  // =========================================================================
  await page.goto(`${TARGET_URL}/sunview/dashboard`, { waitUntil: 'networkidle' });
  await page.waitForURL('**/login**', { timeout: 10000 }).catch(() => {});

  results.unauthRedirect = page.url().includes('/login')
    ? 'PASS (redirected to /login)'
    : `FAIL (stayed on: ${page.url()})`;

  await page.goto(`${TARGET_URL}/sunview/patients`, { waitUntil: 'networkidle' });
  await page.waitForURL('**/login**', { timeout: 10000 }).catch(() => {});
  results.unauthRedirect2 = page.url().includes('/login')
    ? 'PASS (patients → /login)'
    : `FAIL (stayed on: ${page.url()})`;

  await page.goto(`${TARGET_URL}/sunview/encounter/e0000000-0000-0000-0000-000000000003`, { waitUntil: 'networkidle' });
  await page.waitForURL('**/login**', { timeout: 10000 }).catch(() => {});
  results.unauthRedirect3 = page.url().includes('/login')
    ? 'PASS (encounter → /login)'
    : `FAIL (stayed on: ${page.url()})`;

  await page.screenshot({ path: '/tmp/pw-e2e-auth-unauth.png', fullPage: true });

  // =========================================================================
  // 2. Login — slug-based redirect, no UUIDs
  // =========================================================================
  const slug = await loginOrRestore(context, page);
  const loginUrl = page.url();
  const hasUuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.test(loginUrl);

  results.loginRedirect = (slug && slug !== 'login')
    ? `PASS (redirected to /${slug})`
    : 'FAIL (still on /login)';
  results.noUuidInUrl = hasUuid
    ? 'FAIL (UUID found in URL)'
    : 'PASS (slug-based URL)';

  await page.screenshot({ path: '/tmp/pw-e2e-auth-login.png', fullPage: true });

  // =========================================================================
  // 3. Browse to encounter to populate localStorage with clinical data
  // =========================================================================
  await page.goto(`${TARGET_URL}/${slug}/encounter/e0000000-0000-0000-0000-000000000003`, { waitUntil: 'networkidle' });
  await page.waitForLoadState('networkidle');

  const lsKeysBefore = await page.evaluate(() => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) keys.push(key);
    }
    return keys;
  });

  const clinicalKeysBefore = lsKeysBefore.filter(k =>
    k.startsWith('clarity-') || k.startsWith('encounter-') || k.startsWith('draft-transcript-') || k.startsWith('clinical-')
  );
  results.clinicalDataPresent = clinicalKeysBefore.length > 0
    ? `PASS (${clinicalKeysBefore.length} keys: ${clinicalKeysBefore.slice(0, 5).join(', ')})`
    : 'INFO (no clinical localStorage keys — stores may use memory only)';

  // =========================================================================
  // 4. Logout — click Log Out button, verify redirect + data cleared
  // =========================================================================
  const logoutBtn = page.locator('button:has-text("Log Out")');
  const logoutIcon = page.locator('button[title="Log out"]');
  const hasLogoutBtn = await logoutBtn.count();
  const hasLogoutIcon = await logoutIcon.count();

  if (hasLogoutBtn > 0 || hasLogoutIcon > 0) {
    const btnToClick = hasLogoutBtn > 0 ? logoutBtn : logoutIcon;
    await btnToClick.click();
    await page.waitForURL('**/login**', { timeout: 10000 }).catch(() => {});
    await page.waitForLoadState('networkidle').catch(() => {});

    results.logoutRedirect = page.url().includes('/login')
      ? 'PASS (redirected to /login)'
      : `FAIL (still on: ${page.url()})`;

    const lsKeysAfter = await page.evaluate(() => {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) keys.push(key);
      }
      return keys;
    });

    const clinicalKeysAfter = lsKeysAfter.filter(k =>
      k.startsWith('encounter-') || k.startsWith('draft-transcript-') || k.startsWith('clinical-')
    );
    results.ephiCleared = clinicalKeysAfter.length === 0
      ? 'PASS (ePHI keys cleared from localStorage)'
      : `FAIL (${clinicalKeysAfter.length} ePHI keys remain: ${clinicalKeysAfter.join(', ')})`;

    await page.screenshot({ path: '/tmp/pw-e2e-auth-logout.png', fullPage: true });
  } else {
    results.logoutRedirect = 'FAIL (no Log Out button found)';
    results.ephiCleared = 'SKIP';
  }

  // =========================================================================
  // 5. After logout — tenant routes should redirect to /login again
  // =========================================================================
  await page.goto(`${TARGET_URL}/sunview/schedule`, { waitUntil: 'networkidle' });
  await page.waitForURL('**/login**', { timeout: 10000 }).catch(() => {});

  results.postLogoutProtection = page.url().includes('/login')
    ? 'PASS (redirected to /login after logout)'
    : `FAIL (accessible after logout: ${page.url()})`;

  results.consoleErrors = consoleErrors.length === 0 ? 'PASS' : `FAIL (${consoleErrors.length} errors)`;

  printResults('Smoke Auth (Phase 1)', results);
  await browser.close();
})();
