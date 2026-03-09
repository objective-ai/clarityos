/**
 * smoke-login.spec.js — Login + slug URL verification
 *
 * Verifies: login flow, JWT token success, slug-based redirect (no UUIDs).
 * Run: bash scripts/dev.sh verify tests/e2e/smoke-login.spec.js
 */
const { launchBrowser, login, setupTracking, printResults } = require('./helpers/test-utils');

(async () => {
  const { browser, page } = await launchBrowser();
  const { consoleErrors } = setupTracking(page);
  const results = {};

  // Login
  const slug = await login(page);
  const finalUrl = page.url();

  const hasUuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.test(finalUrl);
  const isOnLogin = finalUrl.includes('/login');

  results.noUuidInUrl = hasUuid ? 'FAIL (UUID found in URL)' : 'PASS';
  results.redirectedFromLogin = isOnLogin ? 'FAIL (still on /login)' : 'PASS';
  results.tenantSlug = slug ? `PASS (slug: ${slug})` : 'FAIL (no slug)';
  results.consoleErrors = consoleErrors.length === 0 ? 'PASS' : `FAIL (${consoleErrors.length} errors)`;

  await page.screenshot({ path: '/tmp/pw-e2e-smoke-login.png', fullPage: true });

  printResults('Smoke Login', results);
  await browser.close();
})();
