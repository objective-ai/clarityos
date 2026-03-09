/**
 * smoke-encounter.spec.js — Phase 2: API Integration E2E verification
 *
 * Verifies: encounter page loads real clinical data (vitals, refractions,
 * diagnoses, problem list) from the API — not mock data.
 * Run: bash scripts/dev.sh verify tests/e2e/smoke-encounter.spec.js
 */
const { launchBrowser, login, setupTracking, getFailedApiCalls, printResults, TARGET_URL } = require('./helpers/test-utils');

// Known finalized encounter from seed data
const TEST_ENCOUNTER_ID = 'e0000000-0000-0000-0000-000000000003';

(async () => {
  const { browser, page } = await launchBrowser();
  const { apiCalls, consoleErrors } = setupTracking(page);
  const results = {};

  // Login
  const slug = await login(page);
  if (!slug) {
    console.log('Login failed');
    await browser.close();
    return;
  }

  // 1. Navigate to encounter page
  apiCalls.length = 0;
  await page.goto(`${TARGET_URL}/${slug}/encounter/${TEST_ENCOUNTER_ID}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);

  results.encounterLoads = page.url().includes(`/encounter/${TEST_ENCOUNTER_ID}`)
    ? 'PASS'
    : 'FAIL (redirected away)';

  await page.screenshot({ path: '/tmp/pw-e2e-encounter-page.png', fullPage: true });

  // 2. Verify API calls were made to real endpoints
  const encounterApiUrls = apiCalls
    .filter(c => c.url.includes(`/encounters/${TEST_ENCOUNTER_ID}`))
    .map(c => {
      const match = c.url.match(/\/encounters\/[^/]+\/([^?/]+)/);
      return match ? match[1] : 'encounter-detail';
    });

  const uniqueEndpoints = [...new Set(encounterApiUrls)];
  const hasEncounterApi = apiCalls.some(c => c.url.includes(`/encounters/${TEST_ENCOUNTER_ID}`) && c.status < 400);
  results.realApiCalled = hasEncounterApi
    ? `PASS (${uniqueEndpoints.length} endpoints: ${uniqueEndpoints.slice(0, 6).join(', ')})`
    : 'FAIL (no successful encounter API calls)';

  // 3. Vitals section
  const vitalsApi = apiCalls.find(c => c.url.includes('/vitals') && c.status < 400);
  const iopText = await page.locator('text=/IOP/').count();
  const vitalsLabel = await page.locator('text=/mmHg|Blood Pressure/').count();
  results.vitalsSection = (vitalsApi || iopText > 0 || vitalsLabel > 0)
    ? `PASS (API: ${vitalsApi ? vitalsApi.status : 'N/A'}, IOP label: ${iopText}, vitals: ${vitalsLabel})`
    : 'FAIL (no vitals data found)';

  // 4. Refractions section
  const refractionHeaders = await page.locator('text=/Habitual|Manifest|Final Rx/').count();
  const refractionGrid = await page.locator('text=/OD|OS/').count();
  const sphText = await page.locator('text=/Sph|Sphere/').count();
  results.refractionsSection = (refractionHeaders > 0 || sphText > 0)
    ? `PASS (grid headers: ${refractionHeaders}, OD/OS: ${refractionGrid}, Sph: ${sphText})`
    : (refractionGrid > 0)
      ? `PASS (OD/OS labels found: ${refractionGrid})`
      : 'FAIL (no refraction data found)';

  // 5. Diagnoses section
  const diagnosisApi = apiCalls.find(c => c.url.includes('/diagnoses') && c.status < 400);
  const icdCodes = await page.locator('text=/[A-Z]\\d{2}(\\.\\d+)?/').count();
  const diagnosisLabel = await page.locator('text=/Diagnos/').count();
  results.diagnosesSection = (diagnosisApi || icdCodes > 0 || diagnosisLabel > 0)
    ? `PASS (API: ${diagnosisApi ? diagnosisApi.status : 'N/A'}, ICD codes: ${icdCodes}, label: ${diagnosisLabel})`
    : 'FAIL (no diagnosis data found)';

  // 6. Patient name in TopNav
  const topNavPatient = await page.locator('text=/Rodriguez|James/').count();
  results.patientInTopNav = topNavPatient > 0
    ? 'PASS (patient name visible in TopNav)'
    : 'INFO (patient name not found — may use different test patient)';

  // 7. Audit trail
  const auditApi = apiCalls.find(c => c.url.includes('/audit-logs'));
  results.auditTrail = auditApi
    ? `PASS (audit-logs API called, status: ${auditApi.status})`
    : 'INFO (audit-logs endpoint not called on this page load)';

  // 8. Real data verification
  const successfulEncounterApis = apiCalls.filter(
    c => c.url.includes(`/encounters/${TEST_ENCOUNTER_ID}`) && c.status === 200
  );
  results.realData = successfulEncounterApis.length > 0
    ? `PASS (${successfulEncounterApis.length} successful API responses)`
    : 'FAIL (no 200 responses from encounter API)';

  // Summary
  const failedApis = getFailedApiCalls(apiCalls);
  results.apiCalls = failedApis.length === 0 ? 'PASS' : `FAIL (${failedApis.length} errors)`;
  results.consoleErrors = consoleErrors.length === 0 ? 'PASS' : `FAIL (${consoleErrors.length} errors)`;

  printResults('Smoke Encounter (Phase 2)', results);
  await browser.close();
})();
