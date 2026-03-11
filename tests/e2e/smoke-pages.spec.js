/**
 * smoke-pages.spec.js — Page access + entitlements verification
 *
 * Verifies: schedule and patients pages load without "Locked" messages,
 * all API calls return 200, no console errors.
 * Run: bash scripts/dev.sh verify tests/e2e/smoke-pages.spec.js
 */
const { launchBrowser, loginOrRestore, setupTracking, getFailedApiCalls, printResults, TARGET_URL } = require('./helpers/test-utils');

(async () => {
  const { browser, context, page } = await launchBrowser();
  const { apiCalls, consoleErrors } = setupTracking(page);
  const results = {};

  const slug = await loginOrRestore(context, page);
  if (!slug) {
    console.log('Login failed');
    await browser.close();
    return;
  }

  // Schedule page
  apiCalls.length = 0;
  await page.goto(`${TARGET_URL}/${slug}/schedule`, { waitUntil: 'networkidle' });
  await page.waitForSelector('h1, h2, text=Scheduling Locked', { timeout: 10000 }).catch(() => {});

  const scheduleLocked = await page.locator('text=Scheduling Locked').count();
  results.schedule = scheduleLocked === 0 ? 'PASS' : 'FAIL (Locked)';
  await page.screenshot({ path: '/tmp/pw-e2e-schedule.png', fullPage: true });

  // Patients page
  apiCalls.length = 0;
  await page.goto(`${TARGET_URL}/${slug}/patients`, { waitUntil: 'networkidle' });
  await page.waitForSelector('tbody tr, text=Patient Records Locked, text=No patients', { timeout: 10000 }).catch(() => {});

  const patientsLocked = await page.locator('text=Patient Records Locked').count();
  results.patients = patientsLocked === 0 ? 'PASS' : 'FAIL (Locked)';
  await page.screenshot({ path: '/tmp/pw-e2e-patients.png', fullPage: true });

  // Summary
  const failedApis = getFailedApiCalls(apiCalls, { exclude: [] });
  results.apiCalls = failedApis.length === 0 ? 'PASS' : `FAIL (${failedApis.length} errors)`;
  results.consoleErrors = consoleErrors.length === 0 ? 'PASS' : `FAIL (${consoleErrors.length} errors)`;

  printResults('Smoke Pages', results);
  await browser.close();
})();
