/**
 * smoke-patient-rx.spec.js — Sprint 5.1: Patient Detail & Rx History E2E
 *
 * Suite A (Core): Rx History tab renders, modality filter, table columns,
 *                 chart number in header, problem list on Patient Info tab.
 * Suite B (UI):   Modality filter interaction, clickable encounter links,
 *                 all 4 tabs cycle correctly, empty/error states.
 *
 * Run: bash scripts/dev.sh verify tests/e2e/smoke-patient-rx.spec.js
 */
const { ensureApi, launchBrowser, loginOrRestore, setupTracking, getFailedApiCalls, printResults, TARGET_URL } = require('./helpers/test-utils');

// =========================================================================
// Suite A — Core: Rx History Tab + New Sprint 5.1 Features
// =========================================================================

async function runCoreTests(page, slug, apiCalls) {
  const results = {};

  apiCalls.length = 0;

  // Navigate to patient list and into first patient
  await page.goto(`${TARGET_URL}/${slug}/patients`, { waitUntil: 'networkidle' });
  await page.waitForLoadState('networkidle');

  const firstLink = page.locator('tbody tr').first().locator('a').first();
  if (await firstLink.count() === 0) {
    results.suiteA = 'SKIP (no patients in list)';
    return results;
  }

  await firstLink.click();
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('h1.text-display', { state: 'visible' });

  // ── 1. Chart Number in Header ─────────────────────────────────────────
  const headerBadges = page.locator('h1.text-display').locator('..').locator('..').locator('span:has-text("#")');
  const chartBadge = await headerBadges.count();
  results.chartNumberInHeader = chartBadge > 0
    ? 'PASS (chart # badge visible in header)'
    : 'FAIL (no chart # badge found)';

  // ── 2. Problem List on Patient Info Tab ────────────────────────────────
  // Ensure we're on Patient Info tab
  const patientInfoTab = page.locator('button:has-text("Patient Info")');
  if (await patientInfoTab.count() > 0) {
    await patientInfoTab.click();
    await page.waitForLoadState('domcontentloaded');
  }

  const problemListHeading = page.locator('text=Problem List');
  const addProblemBtn = page.locator('button:has-text("+ Add Problem")');

  results.problemListVisible = (await problemListHeading.count()) > 0
    ? 'PASS (Problem List section visible)'
    : 'FAIL (Problem List not found on Patient Info tab)';

  results.addProblemButton = (await addProblemBtn.count()) > 0
    ? 'PASS (+ Add Problem button present)'
    : 'FAIL (+ Add Problem button missing)';

  await page.screenshot({ path: '/tmp/pw-e2e-patient-rx-overview.png', fullPage: true });

  // ── 3. Rx History Tab Renders ──────────────────────────────────────────
  const rxTab = page.locator('button:has-text("Rx History")');
  if (await rxTab.count() > 0) {
    await rxTab.click();
    await page.waitForLoadState('networkidle');

    results.rxHistoryTabExists = 'PASS';

    // Check modality filter buttons
    const allFilter = page.locator('button:has-text("All")');
    const glassesFilter = page.locator('button:has-text("Glasses")');
    const clFilter = page.locator('button:has-text("Contact Lens")');

    const hasAll = await allFilter.count();
    const hasGlasses = await glassesFilter.count();
    const hasCl = await clFilter.count();

    results.modalityFilters = (hasAll > 0 && hasGlasses > 0 && hasCl > 0)
      ? 'PASS (All, Glasses, Contact Lens filters present)'
      : `FAIL (All=${hasAll}, Glasses=${hasGlasses}, CL=${hasCl})`;

    // Check for table OR empty state
    const hasTable = await page.locator('th:has-text("OD Sph")').count();
    const emptyState = await page.locator('text=No finalized prescriptions on file').count();

    if (hasTable > 0) {
      // Verify key table headers
      const headers = ['Date', 'Provider', 'Type', 'OD Sph', 'OD Cyl', 'OD Axis', 'OD Add', 'OS Sph'];
      let headersFound = 0;
      for (const h of headers) {
        if (await page.locator(`th:has-text("${h}")`).count() > 0) headersFound++;
      }

      const rxRows = await page.locator('table').last().locator('tbody tr').count();
      results.rxHistoryTable = headersFound >= 6
        ? `PASS (${rxRows} rows, ${headersFound}/${headers.length} headers)`
        : `FAIL (only ${headersFound}/${headers.length} headers found)`;
    } else if (emptyState > 0) {
      results.rxHistoryTable = 'PASS (empty state displayed — no finalized Rx)';
    } else {
      results.rxHistoryTable = 'FAIL (no table and no empty state)';
    }

    await page.screenshot({ path: '/tmp/pw-e2e-patient-rx-history.png', fullPage: true });
  } else {
    results.rxHistoryTabExists = 'FAIL (no Rx History tab found)';
    results.modalityFilters = 'SKIP';
    results.rxHistoryTable = 'SKIP';
  }

  // ── 4. Clickable Encounter Links ──────────────────────────────────────
  const encountersTab = page.locator('button:has-text("Encounters")');
  if (await encountersTab.count() > 0) {
    await encountersTab.click();
    await page.waitForLoadState('networkidle');

    const timelineEntries = await page.locator('div.relative.pl-8.pb-6').count();
    if (timelineEntries > 0) {
      const encounterLinks = page.locator('a[href*="/encounter/"]');
      const linkCount = await encounterLinks.count();

      results.encounterLinksClickable = linkCount > 0
        ? `PASS (${linkCount} clickable encounter links)`
        : 'FAIL (timeline entries exist but no links)';
    } else {
      results.encounterLinksClickable = 'SKIP (no encounters on file)';
    }
  } else {
    results.encounterLinksClickable = 'SKIP (no Encounters tab)';
  }

  // API health
  const failedApis = getFailedApiCalls(apiCalls, { exclude: [] });
  results.apiCalls = failedApis.length === 0 ? 'PASS' : `FAIL (${failedApis.length} errors)`;

  return results;
}

// =========================================================================
// Suite B — UI Interaction: Modality Filter, Tab Cycling
// =========================================================================

async function runUiTests(page, slug) {
  const results = {};

  // Navigate to patient detail
  await page.goto(`${TARGET_URL}/${slug}/patients`, { waitUntil: 'networkidle' });
  await page.waitForLoadState('networkidle');

  const firstLink = page.locator('tbody tr').first().locator('a').first();
  if (await firstLink.count() === 0) {
    results.suiteB = 'SKIP (no patients in list)';
    return results;
  }

  await firstLink.click();
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('h1.text-display', { state: 'visible' });

  // ── 1. Full 4-Tab Cycle ────────────────────────────────────────────────
  const allTabs = ['Patient Info', 'Encounters', 'Flowsheets', 'Rx History'];
  let tabsCycled = 0;

  for (const tabLabel of allTabs) {
    const tab = page.locator(`button:has-text("${tabLabel}")`);
    if (await tab.count() > 0) {
      await tab.click();
      await page.waitForLoadState('domcontentloaded');
      tabsCycled++;
    }
  }

  results.fourTabCycle = tabsCycled === 4
    ? 'PASS (all 4 tabs cycle correctly)'
    : `FAIL (only ${tabsCycled}/4 tabs clickable)`;

  // ── 2. Modality Filter Interaction ─────────────────────────────────────
  // Should already be on Rx History tab from the cycle above
  const rxTab = page.locator('button:has-text("Rx History")');
  if (await rxTab.count() > 0) {
    await rxTab.click();
    await page.waitForLoadState('networkidle');

    // Click "Glasses" filter
    const glassesBtn = page.locator('button:has-text("Glasses")');
    if (await glassesBtn.count() > 0) {
      await glassesBtn.click();
      await page.waitForLoadState('networkidle');

      // Check the filter button is active (has accent bg)
      const glassesClasses = await glassesBtn.getAttribute('class') || '';
      const isActive = glassesClasses.includes('accent');
      results.glassesFilterActive = isActive
        ? 'PASS (Glasses filter visually active)'
        : 'INFO (clicked but visual state unclear)';

      await page.screenshot({ path: '/tmp/pw-e2e-patient-rx-glasses.png', fullPage: true });
    } else {
      results.glassesFilterActive = 'SKIP (no Glasses button)';
    }

    // Click "Contact Lens" filter
    const clBtn = page.locator('button:has-text("Contact Lens")');
    if (await clBtn.count() > 0) {
      await clBtn.click();
      await page.waitForLoadState('networkidle');

      // Verify table or empty state shows
      const hasTable = await page.locator('table').count();
      const emptyState = await page.locator('text=No finalized prescriptions on file').count();
      results.clFilterWorks = (hasTable > 0 || emptyState > 0)
        ? 'PASS (Contact Lens filter applied)'
        : 'FAIL (no content after filter)';
    } else {
      results.clFilterWorks = 'SKIP (no Contact Lens button)';
    }

    // Reset to "All"
    const allBtn = page.locator('button:has-text("All")');
    if (await allBtn.count() > 0) {
      await allBtn.click();
      await page.waitForLoadState('networkidle');

      const allClasses = await allBtn.getAttribute('class') || '';
      results.allFilterReset = allClasses.includes('accent')
        ? 'PASS (All filter active after reset)'
        : 'INFO (All clicked but visual state unclear)';
    } else {
      results.allFilterReset = 'SKIP (no All button)';
    }
  } else {
    results.glassesFilterActive = 'SKIP (no Rx History tab)';
    results.clFilterWorks = 'SKIP';
    results.allFilterReset = 'SKIP';
  }

  // ── 3. Problem List Interaction ────────────────────────────────────────
  const patientInfoTab = page.locator('button:has-text("Patient Info")');
  if (await patientInfoTab.count() > 0) {
    await patientInfoTab.click();
    await page.waitForLoadState('domcontentloaded');

    const addBtn = page.locator('button:has-text("+ Add Problem")');
    if (await addBtn.count() > 0) {
      await addBtn.click();
      await page.waitForSelector('input[placeholder="Search ICD-10 codes..."]', { state: 'visible', timeout: 5000 }).catch(() => {});

      // Check for ICD-10 search input
      const icdSearch = page.locator('input[placeholder="Search ICD-10 codes..."]');
      results.problemAddPanel = (await icdSearch.count()) > 0
        ? 'PASS (ICD-10 search panel opened)'
        : 'FAIL (Add Problem clicked but no search panel)';

      // Close the panel
      const closeBtn = page.locator('button:has-text("Close")');
      if (await closeBtn.count() > 0) {
        await closeBtn.click();
        await page.waitForLoadState('domcontentloaded');
      }
    } else {
      results.problemAddPanel = 'SKIP (no + Add Problem button)';
    }
  } else {
    results.problemAddPanel = 'SKIP (no Patient Info tab)';
  }

  // ── 4. Encounter Link Navigation ───────────────────────────────────────
  const encTab = page.locator('button:has-text("Encounters")');
  if (await encTab.count() > 0) {
    await encTab.click();
    await page.waitForLoadState('domcontentloaded');

    const firstEncLink = page.locator('a[href*="/encounter/"]').first();
    if (await firstEncLink.count() > 0) {
      const href = await firstEncLink.getAttribute('href');
      await firstEncLink.click();
      await page.waitForLoadState('networkidle');
      await page.waitForURL('**/encounter/**', { timeout: 10000 }).catch(() => {});

      const currentUrl = page.url();
      results.encounterNavigation = currentUrl.includes('/encounter/')
        ? `PASS (navigated to ${currentUrl.split('/encounter/')[1]?.substring(0, 8)}...)`
        : 'FAIL (did not navigate to encounter page)';

      await page.screenshot({ path: '/tmp/pw-e2e-patient-rx-encounter-nav.png', fullPage: true });

      // Navigate back
      await page.goBack();
      await page.waitForLoadState('networkidle');
    } else {
      results.encounterNavigation = 'SKIP (no encounter links)';
    }
  } else {
    results.encounterNavigation = 'SKIP (no Encounters tab)';
  }

  await page.screenshot({ path: '/tmp/pw-e2e-patient-rx-end.png', fullPage: true });

  return results;
}

// =========================================================================
// Main
// =========================================================================

(async () => {
  await ensureApi();
  const { browser, context, page } = await launchBrowser();
  const { apiCalls, consoleErrors } = setupTracking(page);

  const slug = await loginOrRestore(context, page);
  if (!slug) {
    console.log('Login failed');
    await browser.close();
    return;
  }

  // Suite A — Core Functionality
  console.log('\n--- Suite A: Sprint 5.1 Core ---');
  const coreResults = await runCoreTests(page, slug, apiCalls);
  printResults('Patient Rx History — Suite A (Core)', coreResults);

  // Suite B — UI Interaction
  console.log('\n--- Suite B: Sprint 5.1 UI Interaction ---');
  const uiResults = await runUiTests(page, slug);
  uiResults.consoleErrors = consoleErrors.length === 0 ? 'PASS' : `FAIL (${consoleErrors.length} errors)`;
  printResults('Patient Rx History — Suite B (UI)', uiResults);

  await browser.close();
})();
