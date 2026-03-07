/**
 * smoke-auth.spec.js — Phase 1: Security & Auth E2E verification
 *
 * Verifies: unauthenticated redirect to /login, login works,
 * logout clears ePHI from localStorage/stores, no UUIDs in URLs.
 * Run: node tests/e2e/smoke-auth.spec.js
 */
const { chromium } = require('playwright');

const TARGET_URL = 'http://localhost:3000';
const EMAIL = 'duytran@yahoo.com';
const PASSWORD = '123456';

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const consoleErrors = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (text.includes('data-theme') || text.includes('Extra attributes from the server')) return;
      if (text.includes('Failed to load resource')) return;
      consoleErrors.push(text);
    }
  });

  const results = {};

  // =========================================================================
  // 1. Unauthenticated redirect — visit tenant page without login
  // =========================================================================
  console.log('=== Unauthenticated Redirect ===');
  await page.goto(`${TARGET_URL}/sunview/dashboard`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  const unauthUrl = page.url();
  results.unauthRedirect = unauthUrl.includes('/login')
    ? 'PASS (redirected to /login)'
    : `FAIL (stayed on: ${unauthUrl})`;
  console.log('Unauth redirect:', results.unauthRedirect);

  // Try another protected route
  await page.goto(`${TARGET_URL}/sunview/patients`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const unauthUrl2 = page.url();
  results.unauthRedirect2 = unauthUrl2.includes('/login')
    ? 'PASS (patients → /login)'
    : `FAIL (stayed on: ${unauthUrl2})`;
  console.log('Unauth redirect (patients):', results.unauthRedirect2);

  // Try encounter route
  await page.goto(`${TARGET_URL}/sunview/encounter/e0000000-0000-0000-0000-000000000003`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const unauthUrl3 = page.url();
  results.unauthRedirect3 = unauthUrl3.includes('/login')
    ? 'PASS (encounter → /login)'
    : `FAIL (stayed on: ${unauthUrl3})`;
  console.log('Unauth redirect (encounter):', results.unauthRedirect3);

  await page.screenshot({ path: '/tmp/pw-e2e-auth-unauth.png', fullPage: true });

  // =========================================================================
  // 2. Login — slug-based redirect, no UUIDs
  // =========================================================================
  console.log('\n=== Login ===');
  await page.goto(`${TARGET_URL}/login`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#email', { timeout: 15000 });
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle', timeout: 20000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForURL('**/sunview/**', { timeout: 15000 }).catch(() => {});

  const loginUrl = page.url();
  const hasUuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.test(loginUrl);
  const slugMatch = loginUrl.match(/localhost:3000\/([^/]+)/);
  const slug = slugMatch ? slugMatch[1] : null;

  results.loginRedirect = (slug && slug !== 'login')
    ? `PASS (redirected to /${slug})`
    : 'FAIL (still on /login)';
  results.noUuidInUrl = hasUuid
    ? 'FAIL (UUID found in URL)'
    : 'PASS (slug-based URL)';
  console.log('Login redirect:', results.loginRedirect);
  console.log('No UUID in URL:', results.noUuidInUrl);

  await page.screenshot({ path: '/tmp/pw-e2e-auth-login.png', fullPage: true });

  // =========================================================================
  // 3. Browse to encounter to populate localStorage with clinical data
  // =========================================================================
  console.log('\n=== Populate Clinical Data ===');
  await page.goto(`${TARGET_URL}/${slug}/encounter/e0000000-0000-0000-0000-000000000003`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // Check localStorage has clinical data before logout
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
  console.log('Clinical data before logout:', results.clinicalDataPresent);

  // =========================================================================
  // 4. Logout — click Log Out button, verify redirect + data cleared
  // =========================================================================
  console.log('\n=== Logout ===');

  // Find and click Log Out button (in sidebar — may be collapsed with title="Log out")
  const logoutBtn = page.locator('button:has-text("Log Out")');
  const logoutIcon = page.locator('button[title="Log out"]');
  const hasLogoutBtn = await logoutBtn.count();
  const hasLogoutIcon = await logoutIcon.count();

  if (hasLogoutBtn > 0 || hasLogoutIcon > 0) {
    const btnToClick = hasLogoutBtn > 0 ? logoutBtn : logoutIcon;
    await btnToClick.click();
    await page.waitForTimeout(3000);
    await page.waitForLoadState('networkidle').catch(() => {});

    const logoutUrl = page.url();
    results.logoutRedirect = logoutUrl.includes('/login')
      ? 'PASS (redirected to /login)'
      : `FAIL (still on: ${logoutUrl})`;

    // Check clinical data cleared from localStorage
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
    // Sidebar might be collapsed — try expanding first
    results.logoutRedirect = 'FAIL (no Log Out button found)';
    results.ephiCleared = 'SKIP';
  }
  console.log('Logout redirect:', results.logoutRedirect);
  console.log('ePHI cleared:', results.ephiCleared);

  // =========================================================================
  // 5. After logout — tenant routes should redirect to /login again
  // =========================================================================
  console.log('\n=== Post-Logout Protection ===');
  await page.goto(`${TARGET_URL}/sunview/schedule`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const postLogoutUrl = page.url();
  results.postLogoutProtection = postLogoutUrl.includes('/login')
    ? 'PASS (redirected to /login after logout)'
    : `FAIL (accessible after logout: ${postLogoutUrl})`;
  console.log('Post-logout protection:', results.postLogoutProtection);

  // =========================================================================
  // Results
  // =========================================================================
  results.consoleErrors = consoleErrors.length === 0 ? 'PASS' : `FAIL (${consoleErrors.length} errors)`;

  console.log('\n=== RESULTS ===');
  for (const [key, val] of Object.entries(results)) {
    const icon = val.startsWith('PASS') ? 'OK' : val.startsWith('SKIP') || val.startsWith('INFO') ? '--' : 'XX';
    console.log(`  [${icon}] ${key}: ${val}`);
  }

  if (consoleErrors.length > 0) {
    console.log('\nConsole errors:');
    for (const e of consoleErrors) {
      console.log(`  ${e.substring(0, 200)}`);
    }
  }

  const passFail = Object.values(results).filter(v => !v.startsWith('SKIP') && !v.startsWith('INFO'));
  const allPass = passFail.every(v => v.startsWith('PASS'));
  console.log('\n' + (allPass ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'));

  await browser.close();
})();
