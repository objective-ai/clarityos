/**
 * smoke-encounter.spec.js — Phase 2: API Integration E2E verification
 *
 * Verifies: encounter page loads real clinical data (vitals, refractions,
 * diagnoses, problem list) from the API — not mock data.
 * Run: node tests/e2e/smoke-encounter.spec.js
 */
const { chromium } = require('playwright');

const TARGET_URL = 'http://localhost:3000';
const EMAIL = 'duytran@yahoo.com';
const PASSWORD = '123456';

// Known finalized encounter from seed data
const TEST_ENCOUNTER_ID = 'e0000000-0000-0000-0000-000000000003';

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  const apiCalls = [];
  const consoleErrors = [];

  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/api/')) {
      apiCalls.push({ url, status: response.status() });
    }
  });

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
  // Login
  // =========================================================================
  console.log('=== Login ===');
  await page.goto(`${TARGET_URL}/login`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#email', { timeout: 15000 });
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle', timeout: 20000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForURL('**/sunview/**', { timeout: 15000 }).catch(() => {});

  const urlAfterLogin = page.url();
  const slugMatch = urlAfterLogin.match(/localhost:3000\/([^/]+)/);
  const slug = slugMatch ? slugMatch[1] : null;

  if (!slug || slug === 'login') {
    console.log('Login failed — still on:', urlAfterLogin);
    await browser.close();
    return;
  }
  console.log('Logged in, slug:', slug);

  // =========================================================================
  // 1. Navigate to encounter page
  // =========================================================================
  console.log('\n=== Encounter Page ===');
  apiCalls.length = 0;
  await page.goto(`${TARGET_URL}/${slug}/encounter/${TEST_ENCOUNTER_ID}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);

  results.encounterLoads = page.url().includes(`/encounter/${TEST_ENCOUNTER_ID}`)
    ? 'PASS'
    : 'FAIL (redirected away)';
  console.log('Encounter loads:', results.encounterLoads);

  await page.screenshot({ path: '/tmp/pw-e2e-encounter-page.png', fullPage: true });

  // =========================================================================
  // 2. Verify API calls were made to real endpoints (not mock data)
  // =========================================================================
  console.log('\n=== API Calls Verification ===');
  const encounterApiUrls = apiCalls
    .filter(c => c.url.includes(`/encounters/${TEST_ENCOUNTER_ID}`))
    .map(c => {
      const match = c.url.match(/\/encounters\/[^/]+\/([^?/]+)/);
      return match ? match[1] : 'encounter-detail';
    });

  const uniqueEndpoints = [...new Set(encounterApiUrls)];
  console.log('Endpoints called:', uniqueEndpoints.join(', '));

  // Check that real API endpoints were hit (not mock data)
  const hasEncounterApi = apiCalls.some(c => c.url.includes(`/encounters/${TEST_ENCOUNTER_ID}`) && c.status < 400);
  results.realApiCalled = hasEncounterApi
    ? `PASS (${uniqueEndpoints.length} endpoints: ${uniqueEndpoints.slice(0, 6).join(', ')})`
    : 'FAIL (no successful encounter API calls)';
  console.log('Real API called:', results.realApiCalled);

  // =========================================================================
  // 3. Vitals section — check for IOP or vitals form
  // =========================================================================
  console.log('\n=== Vitals ===');
  const vitalsApi = apiCalls.find(c => c.url.includes('/vitals') && c.status < 400);
  const iopText = await page.locator('text=/IOP/').count();
  const vitalsLabel = await page.locator('text=/mmHg|Blood Pressure/').count();

  results.vitalsSection = (vitalsApi || iopText > 0 || vitalsLabel > 0)
    ? `PASS (API: ${vitalsApi ? vitalsApi.status : 'N/A'}, IOP label: ${iopText}, vitals: ${vitalsLabel})`
    : 'FAIL (no vitals data found)';
  console.log('Vitals:', results.vitalsSection);

  // =========================================================================
  // 4. Refractions section — check for refraction grid
  // =========================================================================
  console.log('\n=== Refractions ===');
  // Refractions load inline from encounter response (encounter.refractions), not a separate API call
  // Grid headers: Habitual, Auto, Manifest, Final Rx
  const refractionHeaders = await page.locator('text=/Habitual|Manifest|Final Rx/').count();
  const refractionGrid = await page.locator('text=/OD|OS/').count();
  const sphText = await page.locator('text=/Sph|Sphere/').count();

  results.refractionsSection = (refractionHeaders > 0 || sphText > 0)
    ? `PASS (grid headers: ${refractionHeaders}, OD/OS: ${refractionGrid}, Sph: ${sphText})`
    : (refractionGrid > 0)
      ? `PASS (OD/OS labels found: ${refractionGrid})`
      : 'FAIL (no refraction data found)';
  console.log('Refractions:', results.refractionsSection);

  // =========================================================================
  // 5. Diagnoses section — check for ICD-10 codes
  // =========================================================================
  console.log('\n=== Diagnoses ===');
  const diagnosisApi = apiCalls.find(c => c.url.includes('/diagnoses') && c.status < 400);
  // Check for ICD-10 code badges or diagnosis text
  const icdCodes = await page.locator('text=/[A-Z]\\d{2}(\\.\\d+)?/').count();
  const diagnosisLabel = await page.locator('text=/Diagnos/').count();

  results.diagnosesSection = (diagnosisApi || icdCodes > 0 || diagnosisLabel > 0)
    ? `PASS (API: ${diagnosisApi ? diagnosisApi.status : 'N/A'}, ICD codes: ${icdCodes}, label: ${diagnosisLabel})`
    : 'FAIL (no diagnosis data found)';
  console.log('Diagnoses:', results.diagnosesSection);

  // =========================================================================
  // 6. Encounter metadata — patient name in TopNav
  // =========================================================================
  console.log('\n=== Encounter Metadata ===');
  // TopNav should show patient name when on encounter route
  const topNavPatient = await page.locator('text=/Rodriguez|James/').count();
  results.patientInTopNav = topNavPatient > 0
    ? 'PASS (patient name visible in TopNav)'
    : 'INFO (patient name not found — may use different test patient)';
  console.log('Patient in TopNav:', results.patientInTopNav);

  // =========================================================================
  // 7. Audit trail — check sidebar or audit log endpoint
  // =========================================================================
  console.log('\n=== Audit Trail ===');
  const auditApi = apiCalls.find(c => c.url.includes('/audit-logs'));
  results.auditTrail = auditApi
    ? `PASS (audit-logs API called, status: ${auditApi.status})`
    : 'INFO (audit-logs endpoint not called on this page load)';
  console.log('Audit trail:', results.auditTrail);

  // =========================================================================
  // 8. No mock data imports — verify data came from API, not hardcoded
  // =========================================================================
  console.log('\n=== Real Data Verification ===');
  // Check that encounter API returned 200 (real data) not fallback
  const successfulEncounterApis = apiCalls.filter(
    c => c.url.includes(`/encounters/${TEST_ENCOUNTER_ID}`) && c.status === 200
  );
  results.realData = successfulEncounterApis.length > 0
    ? `PASS (${successfulEncounterApis.length} successful API responses)`
    : 'FAIL (no 200 responses from encounter API)';
  console.log('Real data:', results.realData);

  // =========================================================================
  // Results
  // =========================================================================
  // Exclude expected 404s from exam-findings (no data = 404, normal)
  const failedApis = apiCalls.filter(c => c.status >= 400 && !c.url.includes('/exam-findings/'));
  results.apiCalls = failedApis.length === 0 ? 'PASS' : `FAIL (${failedApis.length} errors)`;
  results.consoleErrors = consoleErrors.length === 0 ? 'PASS' : `FAIL (${consoleErrors.length} errors)`;

  console.log('\n=== RESULTS ===');
  for (const [key, val] of Object.entries(results)) {
    const icon = val.startsWith('PASS') ? 'OK' : val.startsWith('SKIP') || val.startsWith('INFO') ? '--' : 'XX';
    console.log(`  [${icon}] ${key}: ${val}`);
  }

  if (failedApis.length > 0) {
    console.log('\nFailed API calls:');
    for (const c of failedApis) {
      console.log(`  [${c.status}] ${c.url.substring(0, 120)}`);
    }
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
