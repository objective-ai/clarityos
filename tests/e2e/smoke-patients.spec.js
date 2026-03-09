/**
 * smoke-patients.spec.js — Phase 5: Patient Profile E2E verification
 *
 * Verifies: patient list loads, search works, patient detail page shows
 * demographics/encounters/flowsheets tabs, Prep Me button works.
 * Run: bash scripts/dev.sh verify tests/e2e/smoke-patients.spec.js
 */
const { launchBrowser, login, setupTracking, getFailedApiCalls, printResults, TARGET_URL } = require('./helpers/test-utils');

(async () => {
  const { browser, page } = await launchBrowser();
  const { apiCalls, consoleErrors } = setupTracking(page);
  const results = {};

  const slug = await login(page);
  if (!slug) {
    console.log('Login failed');
    await browser.close();
    return;
  }

  // 1. Patients list page
  apiCalls.length = 0;
  await page.goto(`${TARGET_URL}/${slug}/patients`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  const patientsLocked = await page.locator('text=Patient Records Locked').count();
  results.patientsAccessible = patientsLocked === 0 ? 'PASS' : 'FAIL (Locked)';

  const patientRows = await page.locator('tbody tr').count();
  results.patientListLoads = patientRows > 0 ? `PASS (${patientRows} rows)` : 'FAIL (no rows)';
  await page.screenshot({ path: '/tmp/pw-e2e-patients-list.png', fullPage: true });

  // 2. Search patients
  const searchInput = page.locator('input[placeholder="Search patients..."]');
  if (await searchInput.count() > 0) {
    const nameEl = page.locator('tbody tr').first().locator('p.text-body.font-medium').first();
    const nameText = await nameEl.textContent().catch(() => '');
    const searchTerm = nameText ? nameText.trim().split(',')[0].trim() : '';

    if (searchTerm) {
      await searchInput.fill(searchTerm);
      await page.waitForTimeout(500);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);

      const filteredRows = await page.locator('tbody tr').count();
      results.patientSearch = filteredRows > 0 ? `PASS (${filteredRows} results for "${searchTerm}")` : `FAIL (0 results for "${searchTerm}")`;
    } else {
      results.patientSearch = 'SKIP (no patient name found)';
    }

    await searchInput.fill('');
    await page.waitForTimeout(500);
    await page.waitForLoadState('networkidle');
  } else {
    results.patientSearch = 'FAIL (no search input)';
  }

  // 3. Navigate to patient detail
  await page.waitForTimeout(1000);
  const firstLink = page.locator('tbody tr').first().locator('a').first();

  if (await firstLink.count() > 0) {
    await firstLink.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const detailUrl = page.url();
    results.patientDetailNav = detailUrl.includes('/patients/') && detailUrl !== `${TARGET_URL}/${slug}/patients`
      ? 'PASS'
      : 'FAIL (did not navigate to detail)';

    const headingText = await page.locator('h1.text-display').first().textContent().catch(() => '');
    results.patientName = headingText && headingText.trim().length > 0
      ? `PASS ("${headingText.trim()}")`
      : 'FAIL (no name heading)';
    await page.screenshot({ path: '/tmp/pw-e2e-patients-detail.png', fullPage: true });
  } else {
    results.patientDetailNav = 'FAIL (no clickable link in patient row)';
    results.patientName = 'SKIP';
  }

  // 4. Encounters tab
  const encountersTab = page.locator('button:has-text("Encounters")');
  if (await encountersTab.count() > 0) {
    await encountersTab.click();
    await page.waitForTimeout(2000);
    await page.waitForLoadState('networkidle');

    const timelineEntries = await page.locator('div.relative.pl-8.pb-6').count();
    const emptyTimeline = await page.locator('text=No encounters on file').count();

    if (timelineEntries > 0) {
      results.encounterTimeline = `PASS (${timelineEntries} entries)`;
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

  // 5. Flowsheets tab
  const flowsheetsTab = page.locator('button:has-text("Flowsheets")');
  if (await flowsheetsTab.count() > 0) {
    await flowsheetsTab.click();
    await page.waitForTimeout(2000);
    await page.waitForLoadState('networkidle');

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

  // 6. Prep Me button
  const prepMeBtn = page.locator('button:has-text("Prep Me")');
  if (await prepMeBtn.count() > 0) {
    await prepMeBtn.click();
    await page.waitForTimeout(3000);

    const summaryCard = await page.locator('text=AI Pre-Visit Summary').count();
    const loadingText = await page.locator('text=Reading clinical history...').count();
    results.prepMe = (summaryCard > 0 || loadingText > 0)
      ? `PASS (card visible: ${summaryCard > 0 ? 'summary loaded' : 'loading...'})`
      : 'FAIL (no summary card appeared)';
    await page.screenshot({ path: '/tmp/pw-e2e-patients-prepme.png', fullPage: true });
  } else {
    results.prepMe = 'FAIL (no Prep Me button found)';
  }

  // Summary
  const failedApis = getFailedApiCalls(apiCalls, { exclude: [] });
  results.apiCalls = failedApis.length === 0 ? 'PASS' : `FAIL (${failedApis.length} errors)`;
  results.consoleErrors = consoleErrors.length === 0 ? 'PASS' : `FAIL (${consoleErrors.length} errors)`;

  printResults('Smoke Patients (Phase 5)', results);
  await browser.close();
})();
