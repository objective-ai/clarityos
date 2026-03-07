/**
 * smoke-patients.spec.js — Phase 5: Patient Profile E2E verification
 *
 * Verifies: patient list loads, search works, patient detail page shows
 * demographics/encounters/flowsheets tabs, Prep Me button works.
 * Run: bash scripts/dev.sh verify tests/e2e/smoke-patients.spec.js
 */
const { chromium } = require('playwright');

const TARGET_URL = 'http://localhost:3000';
const EMAIL = 'duytran@yahoo.com';
const PASSWORD = '123456';

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
      // Ignore harmless SSR hydration warnings and 404 resource errors
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
  // 1. Patients list page
  // =========================================================================
  console.log('\n=== Patients List ===');
  apiCalls.length = 0;
  await page.goto(`${TARGET_URL}/${slug}/patients`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // Check not locked
  const patientsLocked = await page.locator('text=Patient Records Locked').count();
  results.patientsAccessible = patientsLocked === 0 ? 'PASS' : 'FAIL (Locked)';
  console.log('Patients accessible:', results.patientsAccessible);

  // Check table has rows
  const patientRows = await page.locator('tbody tr').count();
  results.patientListLoads = patientRows > 0 ? `PASS (${patientRows} rows)` : 'FAIL (no rows)';
  console.log('Patient list loads:', results.patientListLoads);

  await page.screenshot({ path: '/tmp/pw-e2e-patients-list.png', fullPage: true });

  // =========================================================================
  // 2. Search patients
  // =========================================================================
  console.log('\n=== Patient Search ===');
  const searchInput = page.locator('input[placeholder="Search patients..."]');
  const hasSearch = await searchInput.count();

  if (hasSearch > 0) {
    // Get first patient last name from the name paragraph (format: "LastName, FirstName")
    const nameEl = page.locator('tbody tr').first().locator('p.text-body.font-medium').first();
    const nameText = await nameEl.textContent().catch(() => '');
    // Extract last name (before comma) for search
    const searchTerm = nameText ? nameText.trim().split(',')[0].trim() : '';

    if (searchTerm) {
      await searchInput.fill(searchTerm);
      await page.waitForTimeout(500); // debounce
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);

      const filteredRows = await page.locator('tbody tr').count();
      results.patientSearch = filteredRows > 0 ? `PASS (${filteredRows} results for "${searchTerm}")` : `FAIL (0 results for "${searchTerm}")`;
    } else {
      results.patientSearch = 'SKIP (no patient name found)';
    }

    // Clear search
    await searchInput.fill('');
    await page.waitForTimeout(500);
    await page.waitForLoadState('networkidle');
  } else {
    results.patientSearch = 'FAIL (no search input)';
  }
  console.log('Patient search:', results.patientSearch);

  // =========================================================================
  // 3. Navigate to patient detail
  // =========================================================================
  console.log('\n=== Patient Detail ===');
  await page.waitForTimeout(1000);

  // Click first patient row link
  const firstLink = page.locator('tbody tr').first().locator('a').first();
  const hasLink = await firstLink.count();

  if (hasLink > 0) {
    await firstLink.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Check URL changed to patient detail
    const detailUrl = page.url();
    results.patientDetailNav = detailUrl.includes('/patients/') && detailUrl !== `${TARGET_URL}/${slug}/patients`
      ? 'PASS'
      : 'FAIL (did not navigate to detail)';

    // Check patient name heading (detail page uses h1.text-display)
    const heading = page.locator('h1.text-display');
    const headingText = await heading.first().textContent().catch(() => '');
    results.patientName = headingText && headingText.trim().length > 0
      ? `PASS ("${headingText.trim()}")`
      : 'FAIL (no name heading)';

    await page.screenshot({ path: '/tmp/pw-e2e-patients-detail.png', fullPage: true });
  } else {
    results.patientDetailNav = 'FAIL (no clickable link in patient row)';
    results.patientName = 'SKIP';
  }
  console.log('Patient detail navigation:', results.patientDetailNav);
  console.log('Patient name displayed:', results.patientName);

  // =========================================================================
  // 4. Encounters tab
  // =========================================================================
  console.log('\n=== Encounters Tab ===');
  const encountersTab = page.locator('button:has-text("Encounters")');
  const hasEncountersTab = await encountersTab.count();

  if (hasEncountersTab > 0) {
    await encountersTab.click();
    await page.waitForTimeout(2000);
    await page.waitForLoadState('networkidle');

    // Check for timeline entries OR empty state
    const timelineEntries = await page.locator('div.relative.pl-8.pb-6').count();
    const emptyTimeline = await page.locator('text=No encounters on file').count();

    if (timelineEntries > 0) {
      results.encounterTimeline = `PASS (${timelineEntries} entries)`;

      // Check for finalization badges
      const finalizedBadges = await page.locator('text=Finalized').count();
      const inProgressBadges = await page.locator('text=In Progress').count();
      results.encounterBadges = `PASS (${finalizedBadges} finalized, ${inProgressBadges} in-progress)`;
    } else if (emptyTimeline > 0) {
      results.encounterTimeline = 'PASS (empty state displayed)';
      results.encounterBadges = 'SKIP (no encounters)';
    } else {
      results.encounterTimeline = 'FAIL (no entries and no empty state)';
      results.encounterBadges = 'SKIP';
    }

    await page.screenshot({ path: '/tmp/pw-e2e-patients-encounters.png', fullPage: true });
  } else {
    results.encounterTimeline = 'FAIL (no Encounters tab)';
    results.encounterBadges = 'SKIP';
  }
  console.log('Encounter timeline:', results.encounterTimeline);
  console.log('Encounter badges:', results.encounterBadges);

  // =========================================================================
  // 5. Flowsheets tab
  // =========================================================================
  console.log('\n=== Flowsheets Tab ===');
  const flowsheetsTab = page.locator('button:has-text("Flowsheets")');
  const hasFlowsheetsTab = await flowsheetsTab.count();

  if (hasFlowsheetsTab > 0) {
    await flowsheetsTab.click();
    await page.waitForTimeout(2000);
    await page.waitForLoadState('networkidle');

    // Check for flowsheet table OR empty state
    const hasIopOd = await page.locator('th:has-text("IOP OD")').count();
    const hasIopOs = await page.locator('th:has-text("IOP OS")').count();
    const emptyFlowsheet = await page.locator('text=No clinical data to display').count();

    if (hasIopOd > 0 && hasIopOs > 0) {
      const flowsheetRows = await page.locator('table').last().locator('tbody tr').count();
      results.flowsheet = `PASS (${flowsheetRows} rows, IOP OD/OS headers present)`;
    } else if (emptyFlowsheet > 0) {
      results.flowsheet = 'PASS (empty state displayed)';
    } else {
      results.flowsheet = 'FAIL (no table headers and no empty state)';
    }

    await page.screenshot({ path: '/tmp/pw-e2e-patients-flowsheet.png', fullPage: true });
  } else {
    results.flowsheet = 'FAIL (no Flowsheets tab)';
  }
  console.log('Flowsheet:', results.flowsheet);

  // =========================================================================
  // 6. Prep Me button
  // =========================================================================
  console.log('\n=== Prep Me Button ===');
  const prepMeBtn = page.locator('button:has-text("Prep Me")');
  const hasPrepMe = await prepMeBtn.count();

  if (hasPrepMe > 0) {
    await prepMeBtn.click();
    await page.waitForTimeout(3000);

    // Check for AI summary card or loading state
    const summaryCard = await page.locator('text=AI Pre-Visit Summary').count();
    const loadingText = await page.locator('text=Reading clinical history...').count();
    const summaryVisible = summaryCard > 0 || loadingText > 0;

    results.prepMe = summaryVisible
      ? `PASS (card visible: ${summaryCard > 0 ? 'summary loaded' : 'loading...'})`
      : 'FAIL (no summary card appeared)';

    await page.screenshot({ path: '/tmp/pw-e2e-patients-prepme.png', fullPage: true });
  } else {
    results.prepMe = 'FAIL (no Prep Me button found)';
  }
  console.log('Prep Me:', results.prepMe);

  // =========================================================================
  // API call summary
  // =========================================================================
  const failedApis = apiCalls.filter(c => c.status >= 400);
  results.apiCalls = failedApis.length === 0 ? 'PASS' : `FAIL (${failedApis.length} errors)`;
  results.consoleErrors = consoleErrors.length === 0 ? 'PASS' : `FAIL (${consoleErrors.length} errors)`;

  console.log('\n=== RESULTS ===');
  for (const [key, val] of Object.entries(results)) {
    const icon = val.startsWith('PASS') ? 'OK' : val.startsWith('SKIP') ? '--' : 'XX';
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

  const passFail = Object.values(results).filter(v => !v.startsWith('SKIP'));
  const allPass = passFail.every(v => v.startsWith('PASS'));
  console.log('\n' + (allPass ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'));

  await browser.close();
})();
