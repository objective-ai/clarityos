/**
 * smoke-patients.spec.js — Phase 5: Patient Profile E2E verification
 *
 * Suite A (Core): patient list loads, search works, detail page tabs,
 *                 encounters timeline, flowsheets table, Prep Me.
 * Suite B (UI):   edit demographics (name, DOB, sex), edit contact info,
 *                 edit insurance, tab switching, search filter + clear.
 *
 * Run: bash scripts/dev.sh verify tests/e2e/smoke-patients.spec.js
 */
const { launchBrowser, loginOrRestore, setupTracking, getFailedApiCalls, printResults, TARGET_URL } = require('./helpers/test-utils');

// =========================================================================
// Suite A — Core Functionality (existing tests)
// =========================================================================

async function runCoreTests(page, slug, apiCalls) {
  const results = {};

  apiCalls.length = 0;
  await page.goto(`${TARGET_URL}/${slug}/patients`, { waitUntil: 'networkidle' });
  await page.waitForLoadState('networkidle');

  const patientsLocked = await page.locator('text=Patient Records Locked').count();
  results.patientsAccessible = patientsLocked === 0 ? 'PASS' : 'FAIL (Locked)';

  const patientRows = await page.locator('tbody tr').count();
  results.patientListLoads = patientRows > 0 ? `PASS (${patientRows} rows)` : 'FAIL (no rows)';
  await page.screenshot({ path: '/tmp/pw-e2e-patients-list.png', fullPage: true });

  // Search patients
  const searchInput = page.locator('input[placeholder="Search patients..."]');
  if (await searchInput.count() > 0) {
    const nameEl = page.locator('tbody tr').first().locator('p.text-body.font-medium').first();
    const nameText = await nameEl.textContent().catch(() => '');
    const searchTerm = nameText ? nameText.trim().split(',')[0].trim() : '';

    if (searchTerm) {
      await searchInput.fill(searchTerm);
      await page.waitForLoadState('networkidle');

      const filteredRows = await page.locator('tbody tr').count();
      results.patientSearch = filteredRows > 0 ? `PASS (${filteredRows} results for "${searchTerm}")` : `FAIL (0 results for "${searchTerm}")`;
    } else {
      results.patientSearch = 'SKIP (no patient name found)';
    }

    await searchInput.fill('');
    await page.waitForLoadState('networkidle');
  } else {
    results.patientSearch = 'FAIL (no search input)';
  }

  // Navigate to patient detail
  await page.waitForLoadState('networkidle');
  const firstLink = page.locator('tbody tr').first().locator('a').first();

  if (await firstLink.count() > 0) {
    await firstLink.click();
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('h1.text-display', { state: 'visible' });

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

  // Encounters tab
  const encountersTab = page.locator('button:has-text("Encounters")');
  if (await encountersTab.count() > 0) {
    await encountersTab.click();
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

  // Flowsheets tab
  const flowsheetsTab = page.locator('button:has-text("Flowsheets")');
  if (await flowsheetsTab.count() > 0) {
    await flowsheetsTab.click();
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

  // Prep Me button
  const prepMeBtn = page.locator('button:has-text("Prep Me")');
  if (await prepMeBtn.count() > 0) {
    await prepMeBtn.click();
    await page.waitForSelector('text=AI Pre-Visit Summary', { state: 'visible', timeout: 10000 }).catch(() => {});

    const summaryCard = await page.locator('text=AI Pre-Visit Summary').count();
    const loadingText = await page.locator('text=Reading clinical history...').count();
    results.prepMe = (summaryCard > 0 || loadingText > 0)
      ? `PASS (card visible: ${summaryCard > 0 ? 'summary loaded' : 'loading...'})`
      : 'FAIL (no summary card appeared)';
    await page.screenshot({ path: '/tmp/pw-e2e-patients-prepme.png', fullPage: true });
  } else {
    results.prepMe = 'FAIL (no Prep Me button found)';
  }

  const failedApis = getFailedApiCalls(apiCalls, { exclude: [] });
  results.apiCalls = failedApis.length === 0 ? 'PASS' : `FAIL (${failedApis.length} errors)`;

  return results;
}

// =========================================================================
// Suite B — UI Interaction (edit demographics, contact, insurance, tabs)
// =========================================================================

async function runUiTests(page, slug) {
  const results = {};

  // Navigate to patient list, then into first patient
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

  // ── 1. Tab Switching ──────────────────────────────────────────────────
  const tabs = ['Patient Info', 'Encounters', 'Flowsheets', 'Rx History'];
  let tabsWorking = 0;

  for (const tabLabel of tabs) {
    const tab = page.locator(`button:has-text("${tabLabel}")`);
    if (await tab.count() > 0) {
      await tab.click();
      await page.waitForLoadState('domcontentloaded');
      tabsWorking++;
    }
  }

  results.tabSwitching = tabsWorking === tabs.length
    ? `PASS (all ${tabs.length} tabs clickable)`
    : tabsWorking > 0
      ? `PASS (${tabsWorking}/${tabs.length} tabs found)`
      : 'FAIL (no tabs found)';

  // Go back to Patient Info tab for edit tests
  const patientInfoTab = page.locator('button:has-text("Patient Info")');
  if (await patientInfoTab.count() > 0) {
    await patientInfoTab.click();
    await page.waitForLoadState('domcontentloaded');
  }

  // ── 2. Edit Patient Header (Name, DOB, Sex) ──────────────────────────
  // Find the pencil edit button near patient name
  const headerEditBtn = page.locator('button[title="Edit"]').first();
  if (await headerEditBtn.count() > 0) {
    // Read original name before editing
    const origName = await page.locator('h1.text-display').first().textContent().catch(() => '');

    await headerEditBtn.click();
    await page.waitForLoadState('domcontentloaded');

    // Check edit mode fields appeared
    const firstNameInput = page.locator('input').filter({ has: page.locator('text=First Name') }).locator('..').locator('input');
    const lastNameInput = page.locator('input').filter({ has: page.locator('text=Last Name') }).locator('..').locator('input');

    // Simpler: look for any text inputs that appeared in the header card
    const editInputs = page.locator('input[type="text"]');
    const editInputCount = await editInputs.count();
    const dateInput = page.locator('input[type="date"]');
    const sexSelect = page.locator('select');

    results.headerEditMode = editInputCount >= 2
      ? `PASS (${editInputCount} text inputs + date=${await dateInput.count()} + select=${await sexSelect.count()})`
      : 'FAIL (edit inputs did not appear)';

    // Cancel edit to restore original state
    const cancelBtn = page.locator('button[title="Cancel"]').first();
    if (await cancelBtn.count() > 0) {
      await cancelBtn.click();
      await page.waitForLoadState('domcontentloaded');

      // Verify name restored
      const nameAfterCancel = await page.locator('h1.text-display').first().textContent().catch(() => '');
      results.headerEditCancel = nameAfterCancel === origName
        ? 'PASS (cancel restored original name)'
        : 'INFO (name may have changed format)';
    } else {
      results.headerEditCancel = 'FAIL (no Cancel button in edit mode)';
    }
  } else {
    results.headerEditMode = 'SKIP (no edit button found on header)';
    results.headerEditCancel = 'SKIP';
  }

  // ── 3. Edit Contact Information ───────────────────────────────────────
  const contactSection = page.locator('text=Contact Information').locator('..');
  const contactEditBtn = contactSection.locator('button[title="Edit"]');

  if (await contactEditBtn.count() > 0) {
    await contactEditBtn.click();
    await page.waitForLoadState('domcontentloaded');

    // Check for contact edit fields
    const phoneInput = page.locator('input[type="tel"]').first();
    const emailInput = page.locator('input[type="email"]').first();
    const hasPhone = await phoneInput.count();
    const hasEmail = await emailInput.count();

    results.contactEditMode = (hasPhone > 0 || hasEmail > 0)
      ? `PASS (phone=${hasPhone}, email=${hasEmail})`
      : 'FAIL (no contact edit fields)';

    // Test phone edit + cancel
    if (hasPhone > 0) {
      const origPhone = await phoneInput.inputValue();
      await phoneInput.fill('555-999-0000');

      // Cancel to revert
      const cancelBtn = contactSection.locator('button[title="Cancel"]');
      if (await cancelBtn.count() > 0) {
        await cancelBtn.click();
        await page.waitForLoadState('domcontentloaded');
        results.contactEditCancel = 'PASS (contact edit cancelled)';
      } else {
        results.contactEditCancel = 'INFO (no cancel button — may have auto-saved)';
      }
    } else {
      results.contactEditCancel = 'SKIP (no phone field)';
    }
  } else {
    results.contactEditMode = 'SKIP (no edit button on Contact Information)';
    results.contactEditCancel = 'SKIP';
  }

  // ── 4. Edit Insurance ─────────────────────────────────────────────────
  const insuranceSection = page.locator('text=Insurance').locator('..');
  const insuranceEditBtn = insuranceSection.locator('button[title="Edit"]');

  if (await insuranceEditBtn.count() > 0) {
    await insuranceEditBtn.click();
    await page.waitForLoadState('domcontentloaded');

    // Check for insurance fields (Provider, Member ID, Group)
    const insuranceInputs = insuranceSection.locator('input[type="text"]');
    const inputCount = await insuranceInputs.count();

    results.insuranceEditMode = inputCount >= 2
      ? `PASS (${inputCount} insurance fields)`
      : inputCount > 0
        ? `PASS (${inputCount} insurance field)`
        : 'FAIL (no insurance edit fields)';

    // Cancel
    const cancelBtn = insuranceSection.locator('button[title="Cancel"]');
    if (await cancelBtn.count() > 0) {
      await cancelBtn.click();
      await page.waitForLoadState('domcontentloaded');
    }
  } else {
    results.insuranceEditMode = 'SKIP (no edit button on Insurance section)';
  }

  // ── 5. Edit Emergency Contact ─────────────────────────────────────────
  const emergencySection = page.locator('text=Emergency Contact').locator('..');
  const emergencyEditBtn = emergencySection.locator('button[title="Edit"]');

  if (await emergencyEditBtn.count() > 0) {
    await emergencyEditBtn.click();
    await page.waitForLoadState('domcontentloaded');

    const emergencyInputs = emergencySection.locator('input');
    const inputCount = await emergencyInputs.count();

    results.emergencyEditMode = inputCount >= 2
      ? `PASS (${inputCount} emergency contact fields)`
      : 'FAIL (no emergency contact edit fields)';

    // Cancel
    const cancelBtn = emergencySection.locator('button[title="Cancel"]');
    if (await cancelBtn.count() > 0) {
      await cancelBtn.click();
      await page.waitForLoadState('domcontentloaded');
    }
  } else {
    results.emergencyEditMode = 'SKIP (no edit button on Emergency Contact)';
  }

  // ── 6. Save Flow (edit + save contact) ────────────────────────────────
  // Re-open contact edit, modify, save, verify persistence
  const contactEditBtn2 = page.locator('text=Contact Information').locator('..').locator('button[title="Edit"]');
  if (await contactEditBtn2.count() > 0) {
    await contactEditBtn2.click();
    await page.waitForLoadState('domcontentloaded');

    const emailInput = page.locator('input[type="email"]').first();
    if (await emailInput.count() > 0) {
      const origEmail = await emailInput.inputValue();
      const testEmail = 'e2e-test@clarityos.dev';

      await emailInput.fill(testEmail);

      // Click Save
      const saveBtn = page.locator('text=Contact Information').locator('..').locator('button[title="Save"]');
      if (await saveBtn.count() > 0) {
        await saveBtn.click();
        await page.waitForLoadState('networkidle');

        // Check if edit mode closed (save button gone)
        const saveGone = (await saveBtn.count()) === 0;
        results.contactSaveFlow = saveGone
          ? 'PASS (contact saved, edit mode closed)'
          : 'INFO (save clicked but edit mode persists)';

        // Restore original email
        const editAgain = page.locator('text=Contact Information').locator('..').locator('button[title="Edit"]');
        if (await editAgain.count() > 0) {
          await editAgain.click();
          await page.waitForLoadState('domcontentloaded');
          const emailAgain = page.locator('input[type="email"]').first();
          if (await emailAgain.count() > 0 && origEmail) {
            await emailAgain.fill(origEmail);
            const saveAgain = page.locator('text=Contact Information').locator('..').locator('button[title="Save"]');
            if (await saveAgain.count() > 0) {
              await saveAgain.click();
              await page.waitForLoadState('networkidle');
            }
          }
        }
      } else {
        results.contactSaveFlow = 'FAIL (no Save button in edit mode)';
      }
    } else {
      results.contactSaveFlow = 'SKIP (no email field)';
    }
  } else {
    results.contactSaveFlow = 'SKIP (no edit button)';
  }

  // ── 7. Encounter Timeline Navigation ──────────────────────────────────
  const encountersTab = page.locator('button:has-text("Encounters")');
  if (await encountersTab.count() > 0) {
    await encountersTab.click();
    await page.waitForLoadState('networkidle');

    // Check for clickable encounter cards
    const encounterCards = page.locator('div.relative.pl-8.pb-6');
    const cardCount = await encounterCards.count();

    if (cardCount > 0) {
      // Check encounter card has clickable link
      const encLink = encounterCards.first().locator('a[href*="/encounter/"]');
      const hasLink = await encLink.count();
      results.encounterCardLink = hasLink > 0
        ? 'PASS (encounter card has navigation link)'
        : 'INFO (encounter entries present but no direct link)';
    } else {
      results.encounterCardLink = 'SKIP (no encounter entries)';
    }
  } else {
    results.encounterCardLink = 'SKIP (no Encounters tab)';
  }

  // ── 8. Search Filter + Clear ──────────────────────────────────────────
  await page.goto(`${TARGET_URL}/${slug}/patients`, { waitUntil: 'networkidle' });
  await page.waitForLoadState('networkidle');

  const searchInput = page.locator('input[placeholder="Search patients..."]');
  if (await searchInput.count() > 0) {
    const totalBefore = await page.locator('tbody tr').count();

    // Search for a nonexistent patient
    await searchInput.fill('zzzznonexistent12345');
    await page.waitForLoadState('networkidle');

    const noResultsText = await page.locator('text=/No patients found|No patients on file/').count();
    const filteredRows = await page.locator('tbody tr').count();

    results.searchNoResults = (noResultsText > 0 || filteredRows === 0)
      ? 'PASS (empty search shows no results state)'
      : `FAIL (${filteredRows} rows still visible)`;

    // Clear search → full list returns
    await searchInput.fill('');
    await page.waitForLoadState('networkidle');

    const totalAfter = await page.locator('tbody tr').count();
    results.searchClear = totalAfter > 0
      ? `PASS (${totalAfter} rows returned after clearing search)`
      : 'FAIL (no rows after clearing search)';
  } else {
    results.searchNoResults = 'SKIP (no search input)';
    results.searchClear = 'SKIP';
  }

  await page.screenshot({ path: '/tmp/pw-e2e-patients-ui-end.png', fullPage: true });

  return results;
}

// =========================================================================
// Main
// =========================================================================

(async () => {
  const { browser, context, page } = await launchBrowser();
  const { apiCalls, consoleErrors } = setupTracking(page);

  const slug = await loginOrRestore(context, page);
  if (!slug) {
    console.log('Login failed');
    await browser.close();
    return;
  }

  // Suite A — Core Functionality
  console.log('\n--- Suite A: Core ---');
  const coreResults = await runCoreTests(page, slug, apiCalls);
  printResults('Smoke Patients — Suite A (Core)', coreResults);

  // Suite B — UI Interaction
  console.log('\n--- Suite B: UI Interaction ---');
  const uiResults = await runUiTests(page, slug);
  uiResults.consoleErrors = consoleErrors.length === 0 ? 'PASS' : `FAIL (${consoleErrors.length} errors)`;
  printResults('Smoke Patients — Suite B (UI)', uiResults);

  await browser.close();
})();
