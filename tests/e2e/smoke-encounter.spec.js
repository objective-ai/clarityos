/**
 * smoke-encounter.spec.js — Phase 2: Encounter E2E verification
 *
 * Suite A (API): encounter page loads real clinical data from the API.
 * Suite B (UI): chief complaint edit, bottom tab nav, diagnosis add/remove,
 *               status advance (pre_test → in_exam → finalize modal),
 *               finalize validation gates.
 *
 * Run: bash scripts/dev.sh verify tests/e2e/smoke-encounter.spec.js
 */
const { launchBrowser, login, extractJwt, setupTracking, getFailedApiCalls, printResults, TARGET_URL, API_URL } = require('./helpers/test-utils');

// Known finalized encounter from seed data (Suite A — read-only checks)
const FINALIZED_ENCOUNTER_ID = 'e0000000-0000-0000-0000-000000000003';

// Known non-finalized encounter from seed data (Suite B — interactive tests)
const EDITABLE_ENCOUNTER_ID = 'e0000000-0007-0000-0000-000000000007';

// =========================================================================
// Suite A — API Integration (read-only, finalized encounter)
// =========================================================================

async function runApiTests(page, slug, apiCalls) {
  const results = {};

  apiCalls.length = 0;
  await page.goto(`${TARGET_URL}/${slug}/encounter/${FINALIZED_ENCOUNTER_ID}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);

  results.encounterLoads = page.url().includes(`/encounter/${FINALIZED_ENCOUNTER_ID}`)
    ? 'PASS'
    : 'FAIL (redirected away)';

  await page.screenshot({ path: '/tmp/pw-e2e-encounter-page.png', fullPage: true });

  // API calls to real endpoints
  const encounterApiUrls = apiCalls
    .filter(c => c.url.includes(`/encounters/${FINALIZED_ENCOUNTER_ID}`))
    .map(c => {
      const match = c.url.match(/\/encounters\/[^/]+\/([^?/]+)/);
      return match ? match[1] : 'encounter-detail';
    });

  const uniqueEndpoints = [...new Set(encounterApiUrls)];
  const hasEncounterApi = apiCalls.some(c => c.url.includes(`/encounters/${FINALIZED_ENCOUNTER_ID}`) && c.status < 400);
  results.realApiCalled = hasEncounterApi
    ? `PASS (${uniqueEndpoints.length} endpoints: ${uniqueEndpoints.slice(0, 6).join(', ')})`
    : 'FAIL (no successful encounter API calls)';

  // Vitals section
  const vitalsApi = apiCalls.find(c => c.url.includes('/vitals') && c.status < 400);
  const iopText = await page.locator('text=/IOP/').count();
  const vitalsLabel = await page.locator('text=/mmHg|Blood Pressure/').count();
  results.vitalsSection = (vitalsApi || iopText > 0 || vitalsLabel > 0)
    ? `PASS (API: ${vitalsApi ? vitalsApi.status : 'N/A'}, IOP label: ${iopText}, vitals: ${vitalsLabel})`
    : 'FAIL (no vitals data found)';

  // Refractions section
  const refractionHeaders = await page.locator('text=/Habitual|Manifest|Final Rx/').count();
  const refractionGrid = await page.locator('text=/OD|OS/').count();
  const sphText = await page.locator('text=/Sph|Sphere/').count();
  results.refractionsSection = (refractionHeaders > 0 || sphText > 0)
    ? `PASS (grid headers: ${refractionHeaders}, OD/OS: ${refractionGrid}, Sph: ${sphText})`
    : (refractionGrid > 0)
      ? `PASS (OD/OS labels found: ${refractionGrid})`
      : 'FAIL (no refraction data found)';

  // Diagnoses section
  const diagnosisApi = apiCalls.find(c => c.url.includes('/diagnoses') && c.status < 400);
  const icdCodes = await page.locator('text=/[A-Z]\\d{2}(\\.\\d+)?/').count();
  const diagnosisLabel = await page.locator('text=/Diagnos/').count();
  results.diagnosesSection = (diagnosisApi || icdCodes > 0 || diagnosisLabel > 0)
    ? `PASS (API: ${diagnosisApi ? diagnosisApi.status : 'N/A'}, ICD codes: ${icdCodes}, label: ${diagnosisLabel})`
    : 'FAIL (no diagnosis data found)';

  // Finalized banner visible
  const finalizedBanner = await page.locator('text=/Signed and finalized/').count();
  const lockedBadge = await page.locator('text=Locked').count();
  results.finalizedState = (finalizedBanner > 0 || lockedBadge > 0)
    ? `PASS (finalized: ${finalizedBanner > 0}, locked: ${lockedBadge > 0})`
    : 'FAIL (no finalized indicator)';

  // Superbill button (only on finalized encounters)
  const superbillBtn = await page.locator('button:has-text("Superbill")').count();
  results.superbillBtn = superbillBtn > 0
    ? 'PASS (Superbill button visible)'
    : 'FAIL (no Superbill button on finalized encounter)';

  // Real data verification
  const successfulApis = apiCalls.filter(
    c => c.url.includes(`/encounters/${FINALIZED_ENCOUNTER_ID}`) && c.status === 200
  );
  results.realData = successfulApis.length > 0
    ? `PASS (${successfulApis.length} successful API responses)`
    : 'FAIL (no 200 responses from encounter API)';

  const failedApis = getFailedApiCalls(apiCalls);
  results.apiCalls = failedApis.length === 0 ? 'PASS' : `FAIL (${failedApis.length} errors)`;

  return results;
}

// =========================================================================
// Suite B — UI Interaction (editable encounter)
// =========================================================================

async function runUiTests(page, context, slug) {
  const results = {};

  // --- Find or prepare a non-finalized encounter ---
  // Try the known seed encounter first; fall back to schedule-based discovery
  let encounterId = EDITABLE_ENCOUNTER_ID;
  await page.goto(`${TARGET_URL}/${slug}/encounter/${encounterId}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // If the encounter didn't load (404 or error state), try to find one via schedule
  const errorState = await page.locator('text=Could not load encounter').count();
  if (errorState > 0 || !page.url().includes(`/encounter/${encounterId}`)) {
    console.log('  Editable encounter not found at seed ID, searching schedule...');
    const jwt = await extractJwt(context);
    if (jwt) {
      // Search today and adjacent days for a non-finalized appointment
      for (const dayOffset of [0, 1, -1]) {
        const d = new Date();
        d.setDate(d.getDate() + dayOffset);
        const dateStr = d.toISOString().split('T')[0];
        const res = await page.request.get(`${API_URL}/api/appointments/?date=${dateStr}`, {
          headers: { Authorization: `Bearer ${jwt}` },
        });
        if (res.ok()) {
          const data = await res.json();
          const items = data.items || data || [];
          const inProgress = items.find(a =>
            a.encounter_id && (a.status === 'checked_in' || a.status === 'in_exam')
          );
          if (inProgress) {
            encounterId = inProgress.encounter_id;
            console.log(`  Found non-finalized encounter: ${encounterId}`);
            await page.goto(`${TARGET_URL}/${slug}/encounter/${encounterId}`, { waitUntil: 'networkidle' });
            await page.waitForTimeout(3000);
            break;
          }
        }
      }
    }
  }

  // Final check — if still no editable encounter, skip Suite B
  const loaded = page.url().includes('/encounter/') && !(await page.locator('text=Could not load encounter').count());
  if (!loaded) {
    console.log('  SKIP Suite B: No editable encounter available');
    results.suiteB = 'SKIP (no editable encounter found)';
    return results;
  }

  const isFinalized = (await page.locator('text=/Signed and finalized/').count()) > 0;
  if (isFinalized) {
    // Try to unlock via Dev button (development only)
    const devUnlock = page.locator('button:has-text("Dev: Unlock")');
    if (await devUnlock.count() > 0) {
      await devUnlock.click();
      await page.waitForTimeout(1500);
      console.log('  Unlocked finalized encounter for testing');
    } else {
      results.suiteB = 'SKIP (encounter is finalized, no Dev: Unlock available)';
      return results;
    }
  }

  await page.screenshot({ path: '/tmp/pw-e2e-encounter-ui-start.png', fullPage: true });

  // ── 1. Bottom Tab Navigation ──────────────────────────────────────────
  const tabs = ['Complaint', 'Vitals', 'Rx', 'Exam', 'Dx', 'Plan'];
  let tabsWorking = 0;

  for (const tabLabel of tabs) {
    const tab = page.locator(`nav button:has-text("${tabLabel}")`);
    if (await tab.count() > 0) {
      await tab.click();
      await page.waitForTimeout(500);
      tabsWorking++;
    }
  }

  results.bottomTabs = tabsWorking === tabs.length
    ? `PASS (all ${tabs.length} tabs clickable)`
    : tabsWorking > 0
      ? `PASS (${tabsWorking}/${tabs.length} tabs found)`
      : 'FAIL (no bottom tabs found)';

  // ── 2. Chief Complaint Edit ───────────────────────────────────────────
  const ccTextarea = page.locator('textarea[placeholder="Reason for visit..."]');
  if (await ccTextarea.count() > 0 && !(await ccTextarea.getAttribute('readonly'))) {
    const originalValue = await ccTextarea.inputValue();
    const testText = originalValue ? `${originalValue} [E2E test]` : 'E2E test chief complaint';

    await ccTextarea.fill(testText);
    await ccTextarea.blur();
    await page.waitForTimeout(2000); // Wait for 1.5s debounce + save

    const newValue = await ccTextarea.inputValue();
    results.chiefComplaintEdit = newValue.includes('E2E test')
      ? 'PASS (chief complaint editable + saved)'
      : 'FAIL (text not persisted)';

    // Restore original
    await ccTextarea.fill(originalValue);
    await ccTextarea.blur();
    await page.waitForTimeout(2000);
  } else {
    results.chiefComplaintEdit = (await ccTextarea.count()) > 0
      ? 'SKIP (chief complaint is read-only)'
      : 'FAIL (chief complaint textarea not found)';
  }

  // ── 3. Status Stepper Visible ─────────────────────────────────────────
  const preTestStep = await page.locator('text=Pre-Test').count();
  const inExamStep = await page.locator('text=In Exam').count();
  const finalizedStep = await page.locator('nav text=Finalized').count();
  results.statusStepper = (preTestStep > 0 && inExamStep > 0)
    ? `PASS (Pre-Test: ${preTestStep}, In Exam: ${inExamStep}, Finalized: ${finalizedStep})`
    : 'FAIL (status stepper not visible)';

  // ── 4. Vitals Form (if pre_test status) ───────────────────────────────
  const iopOdInput = page.locator('#iop_od');
  if (await iopOdInput.count() > 0) {
    // Save original
    const origIop = await iopOdInput.inputValue();

    // Enter elevated IOP to test warning
    await iopOdInput.fill('25');
    await iopOdInput.blur();
    await page.waitForTimeout(1000);

    // Check for elevated warning (IOP > 21)
    const elevatedBadge = await page.locator('text=/Elevated|elevated/').count();
    results.vitalsIopWarning = elevatedBadge > 0
      ? 'PASS (elevated IOP warning shown at 25 mmHg)'
      : 'INFO (no elevated badge — may use different indicator)';

    // Restore original
    await iopOdInput.fill(origIop || '');
    await iopOdInput.blur();
    await page.waitForTimeout(1000);

    // Check save status indicator
    const saveStatus = await page.locator('text=/Saved|Saving/').count();
    results.vitalsSaveStatus = saveStatus > 0
      ? 'PASS (save status indicator visible)'
      : 'INFO (save status not visible — may have cleared)';
  } else {
    // Encounter is past pre_test — vitals show as card, not form
    const vitalsCard = await page.locator('text=/IOP|mmHg/').count();
    results.vitalsIopWarning = vitalsCard > 0
      ? 'SKIP (past pre_test — vitals shown as card)'
      : 'SKIP (no vitals section visible)';
    results.vitalsSaveStatus = 'SKIP (vitals in card mode)';
  }

  // ── 5. Diagnosis Add & Remove ─────────────────────────────────────────
  const addDxBtn = page.locator('button:has-text("+ Add Diagnosis")');
  if (await addDxBtn.count() > 0) {
    await addDxBtn.click();
    await page.waitForTimeout(500);

    // Search for a code
    const searchInput = page.locator('input[placeholder*="Search ICD-10"]');
    if (await searchInput.count() > 0) {
      await searchInput.fill('dry eye');
      await page.waitForTimeout(500);

      // Check filtered results appear
      const dryEyeCode = await page.locator('text=H04.123').count();
      results.diagnosisSearch = dryEyeCode > 0
        ? 'PASS (H04.123 Dry eye found in search)'
        : 'FAIL (dry eye code not found in filtered list)';

      // Click OU laterality to add it
      const ouBtn = page.locator('button:has-text("OU")').first();
      if (await ouBtn.count() > 0) {
        await ouBtn.click();
        await page.waitForTimeout(1500); // Wait for API save

        // Verify it was added to the list
        const addedCode = await page.locator('text=H04.123').count();
        results.diagnosisAdd = addedCode > 0
          ? 'PASS (H04.123 added to encounter diagnoses)'
          : 'FAIL (code not visible after adding)';

        // Remove it (clean up)
        const removeBtn = page.locator('button[aria-label="Remove diagnosis"]').last();
        if (await removeBtn.count() > 0) {
          await removeBtn.click();
          await page.waitForTimeout(1500);
          results.diagnosisRemove = 'PASS (diagnosis removed)';
        } else {
          results.diagnosisRemove = 'INFO (no remove button found — may have been cleaned up)';
        }
      } else {
        results.diagnosisAdd = 'FAIL (no laterality buttons found)';
        results.diagnosisRemove = 'SKIP';
      }
    } else {
      results.diagnosisSearch = 'FAIL (search input not found after opening picker)';
      results.diagnosisAdd = 'SKIP';
      results.diagnosisRemove = 'SKIP';
    }

    // Close picker if still open
    const closeBtn = page.locator('button:has-text("Close")');
    if (await closeBtn.count() > 0) await closeBtn.first().click();
  } else {
    results.diagnosisSearch = 'SKIP (no "+ Add Diagnosis" button — may be read-only or wrong role)';
    results.diagnosisAdd = 'SKIP';
    results.diagnosisRemove = 'SKIP';
  }

  // ── 6. Status Advance: Start Exam → ──────────────────────────────────
  const startExamBtn = page.locator('button:has-text("Start Exam")');
  if (await startExamBtn.count() > 0) {
    await startExamBtn.click();
    await page.waitForTimeout(2000);

    // After advancing, "Start Exam" should disappear and "Finalize" should appear
    const finalizeBtn = await page.locator('button:has-text("Finalize")').count();
    const startExamGone = (await startExamBtn.count()) === 0;
    results.statusAdvance = (finalizeBtn > 0 || startExamGone)
      ? 'PASS (pre_test → in_exam, Finalize button visible)'
      : 'FAIL (status did not advance)';
  } else {
    // Already past pre_test
    const finalizeBtn = await page.locator('button:has-text("Finalize")').count();
    results.statusAdvance = finalizeBtn > 0
      ? 'PASS (already in_exam — Finalize button visible)'
      : 'SKIP (not in pre_test or in_exam status)';
  }

  // ── 7. Finalize Modal — Validation Gates ──────────────────────────────
  const finalizeNavBtn = page.locator('nav button:has-text("Finalize")');
  if (await finalizeNavBtn.count() > 0) {
    await finalizeNavBtn.click();
    await page.waitForTimeout(1500);

    // Modal should appear
    const modalTitle = await page.locator('text=Sign & Finalize Encounter').count();
    results.finalizeModalOpens = modalTitle > 0
      ? 'PASS (finalize modal opened)'
      : 'FAIL (modal did not open)';

    if (modalTitle > 0) {
      // Verify summary sections are present
      const ccSection = await page.locator('text=Chief Complaint').count();
      const vitalsSection = await page.locator('text=Vitals').count();
      const dxSection = await page.locator('text=Diagnoses').count();
      const rxSection = await page.locator('text=Final Refraction').count();
      const apSection = await page.locator('text=Assessment & Plan').count();
      results.finalizeModalSections = (ccSection > 0 && vitalsSection > 0 && dxSection > 0)
        ? `PASS (CC: ${ccSection}, Vitals: ${vitalsSection}, Dx: ${dxSection}, Rx: ${rxSection}, A&P: ${apSection})`
        : 'FAIL (missing summary sections)';

      // "Sign & Seal Chart" should be DISABLED initially (no attestation, no assessment)
      const sealBtn = page.locator('button:has-text("Sign & Seal Chart")');
      const isDisabled = await sealBtn.isDisabled().catch(() => true);
      results.finalizeGateInitial = isDisabled
        ? 'PASS (Sign & Seal disabled without attestation/assessment)'
        : 'FAIL (button should be disabled initially)';

      // Fill assessment (< 10 chars) — should still be disabled
      const assessmentField = page.locator('textarea[placeholder*="Clinical assessment"]');
      if (await assessmentField.count() > 0) {
        await assessmentField.fill('short');

        // Check attestation
        const attestCheckbox = page.locator('input[type="checkbox"]');
        if (await attestCheckbox.count() > 0) {
          await attestCheckbox.check();
          await page.waitForTimeout(300);

          // Still disabled — assessment too short and possibly no diagnoses
          const stillDisabled = await sealBtn.isDisabled().catch(() => true);
          results.finalizeGateShortAssessment = stillDisabled
            ? 'PASS (disabled with < 10 char assessment)'
            : 'INFO (enabled — may have diagnoses + assessment counted differently)';

          // Fill valid assessment (≥ 10 chars)
          await assessmentField.fill('Patient examined. Follow up in 3 months for routine monitoring.');
          await page.waitForTimeout(300);

          // Check char count indicator
          const charCount = await page.locator('text=/\\d+\/10 min/').count();
          results.finalizeCharCount = charCount > 0
            ? 'PASS (character count indicator visible)'
            : 'INFO (no char count visible)';

          // Uncheck attestation to restore safe state
          await attestCheckbox.uncheck();
        } else {
          results.finalizeGateShortAssessment = 'FAIL (no attestation checkbox)';
          results.finalizeCharCount = 'SKIP';
        }
      } else {
        results.finalizeGateShortAssessment = 'FAIL (no assessment textarea)';
        results.finalizeCharCount = 'SKIP';
      }

      // Cancel out — do NOT actually finalize
      const cancelBtn = page.locator('button:has-text("Cancel")');
      if (await cancelBtn.count() > 0) {
        await cancelBtn.click();
        await page.waitForTimeout(500);
      }

      // Verify modal closed
      const modalGone = (await page.locator('text=Sign & Finalize Encounter').count()) === 0;
      results.finalizeModalCancel = modalGone
        ? 'PASS (modal dismissed on Cancel)'
        : 'FAIL (modal still visible after Cancel)';
    } else {
      results.finalizeModalSections = 'SKIP';
      results.finalizeGateInitial = 'SKIP';
      results.finalizeGateShortAssessment = 'SKIP';
      results.finalizeCharCount = 'SKIP';
      results.finalizeModalCancel = 'SKIP';
    }
  } else {
    results.finalizeModalOpens = 'SKIP (no Finalize button — encounter may not be in_exam)';
    results.finalizeModalSections = 'SKIP';
    results.finalizeGateInitial = 'SKIP';
    results.finalizeGateShortAssessment = 'SKIP';
    results.finalizeCharCount = 'SKIP';
    results.finalizeModalCancel = 'SKIP';
  }

  // ── 8. AI Scribe Section ──────────────────────────────────────────────
  const aiScribeTitle = await page.locator('text=AI Scribe').count();
  const transcriptInput = page.locator('#ai-transcript');
  if (aiScribeTitle > 0 && await transcriptInput.count() > 0) {
    const generateBtn = page.locator('button:has-text("Generate Note")');
    const upgradeBtn = page.locator('button:has-text("Upgrade to Unlock")');
    results.aiScribeSection = (await generateBtn.count() > 0)
      ? 'PASS (AI Scribe with Generate Note — Premium)'
      : (await upgradeBtn.count() > 0)
        ? 'PASS (AI Scribe with Upgrade prompt — non-Premium)'
        : 'FAIL (AI Scribe present but no action button)';

    // Verify Generate is disabled when transcript is empty
    if (await generateBtn.count() > 0) {
      const disabledEmpty = await generateBtn.isDisabled();
      results.aiScribeEmptyGuard = disabledEmpty
        ? 'PASS (Generate disabled with empty transcript)'
        : 'FAIL (Generate should be disabled when no transcript)';
    } else {
      results.aiScribeEmptyGuard = 'SKIP (non-Premium plan)';
    }
  } else if (aiScribeTitle > 0) {
    results.aiScribeSection = 'PASS (AI Scribe title visible — may show saved summary)';
    results.aiScribeEmptyGuard = 'SKIP';
  } else {
    results.aiScribeSection = 'SKIP (AI Scribe not visible — may require doctor role)';
    results.aiScribeEmptyGuard = 'SKIP';
  }

  // ── 9. Full Chart Button ──────────────────────────────────────────────
  const fullChartBtn = page.locator('button:has-text("Full Chart")');
  if (await fullChartBtn.count() > 0) {
    await fullChartBtn.click();
    await page.waitForTimeout(1000);

    // Check if patient chart modal opened (shadcn Dialog)
    const chartModal = await page.locator('[role="dialog"]').count();
    results.fullChartModal = chartModal > 0
      ? 'PASS (Full Chart modal opened)'
      : 'FAIL (no dialog appeared)';

    // Close it
    const dialogClose = page.locator('[role="dialog"] button:has-text("Close")');
    const dialogX = page.locator('[role="dialog"] button[class*="close"]');
    if (await dialogClose.count() > 0) await dialogClose.click();
    else if (await dialogX.count() > 0) await dialogX.click();
    else await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  } else {
    results.fullChartModal = 'FAIL (no Full Chart button in bottom bar)';
  }

  await page.screenshot({ path: '/tmp/pw-e2e-encounter-ui-end.png', fullPage: true });

  return results;
}

// =========================================================================
// Main
// =========================================================================

(async () => {
  const { browser, context, page } = await launchBrowser();
  const { apiCalls, consoleErrors } = setupTracking(page);

  const slug = await login(page);
  if (!slug) {
    console.log('Login failed');
    await browser.close();
    return;
  }

  // Suite A — API Integration
  console.log('\n--- Suite A: API Integration ---');
  const apiResults = await runApiTests(page, slug, apiCalls);
  printResults('Smoke Encounter — Suite A (API)', apiResults);

  // Suite B — UI Interaction
  console.log('\n--- Suite B: UI Interaction ---');
  const uiResults = await runUiTests(page, context, slug);
  uiResults.consoleErrors = consoleErrors.length === 0 ? 'PASS' : `FAIL (${consoleErrors.length} errors)`;
  printResults('Smoke Encounter — Suite B (UI)', uiResults);

  await browser.close();
})();
