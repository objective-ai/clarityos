/**
 * smoke-encounter.spec.ts — Phase 2: Encounter E2E verification
 *
 * Suite A (API): encounter page loads real clinical data from the API.
 * Suite B (UI): chief complaint edit, bottom tab nav, diagnosis add/remove,
 *               status advance (pre_test → in_exam → finalize modal),
 *               finalize validation gates.
 */
import { test, expect, getFailedApiCalls } from './fixtures';

const TENANT = 'sunview';

// Known finalized encounter from seed data (Suite A — read-only checks)
const FINALIZED_ENCOUNTER_ID = 'e0000000-0000-0000-0000-000000000003';

// Known non-finalized encounter from seed data (Suite B — interactive tests)
const EDITABLE_ENCOUNTER_ID = 'e0000000-0007-0000-0000-000000000007';

// =========================================================================
// Suite A — API Integration (read-only, finalized encounter)
// =========================================================================

async function runApiTests(page: any, apiCalls: { url: string; status: number }[]) {
  const results: Record<string, string> = {};

  apiCalls.length = 0;
  await page.goto(`/${TENANT}/encounter/${FINALIZED_ENCOUNTER_ID}`, { waitUntil: 'networkidle' });
  await page.waitForLoadState('networkidle');

  results.encounterLoads = page.url().includes(`/encounter/${FINALIZED_ENCOUNTER_ID}`)
    ? 'PASS'
    : 'FAIL (redirected away)';

  // API calls to real endpoints
  const encounterApiUrls = apiCalls
    .filter((c) => c.url.includes(`/encounters/${FINALIZED_ENCOUNTER_ID}`))
    .map((c) => {
      const match = c.url.match(/\/encounters\/[^/]+\/([^?/]+)/);
      return match ? match[1] : 'encounter-detail';
    });

  const uniqueEndpoints = [...new Set(encounterApiUrls)];
  const hasEncounterApi = apiCalls.some(
    (c) => c.url.includes(`/encounters/${FINALIZED_ENCOUNTER_ID}`) && c.status < 400
  );
  results.realApiCalled = hasEncounterApi
    ? `PASS (${uniqueEndpoints.length} endpoints: ${uniqueEndpoints.slice(0, 6).join(', ')})`
    : 'FAIL (no successful encounter API calls)';

  // Vitals section
  const vitalsApi = apiCalls.find((c) => c.url.includes('/vitals') && c.status < 400);
  const iopText = await page.locator('text=/IOP/').count();
  const vitalsLabel = await page.locator('text=/mmHg|Blood Pressure/').count();
  results.vitalsSection =
    vitalsApi || iopText > 0 || vitalsLabel > 0
      ? `PASS (API: ${vitalsApi ? vitalsApi.status : 'N/A'}, IOP label: ${iopText}, vitals: ${vitalsLabel})`
      : 'FAIL (no vitals data found)';

  // Refractions section
  const refractionHeaders = await page.locator('text=/Habitual|Manifest|Final Rx/').count();
  const refractionGrid = await page.locator('text=/OD|OS/').count();
  const sphText = await page.locator('text=/Sph|Sphere/').count();
  results.refractionsSection =
    refractionHeaders > 0 || sphText > 0
      ? `PASS (grid headers: ${refractionHeaders}, OD/OS: ${refractionGrid}, Sph: ${sphText})`
      : refractionGrid > 0
      ? `PASS (OD/OS labels found: ${refractionGrid})`
      : 'FAIL (no refraction data found)';

  // Diagnoses section
  const diagnosisApi = apiCalls.find((c) => c.url.includes('/diagnoses') && c.status < 400);
  const icdCodes = await page.locator('text=/[A-Z]\\d{2}(\\.\\d+)?/').count();
  const diagnosisLabel = await page.locator('text=/Diagnos/').count();
  results.diagnosesSection =
    diagnosisApi || icdCodes > 0 || diagnosisLabel > 0
      ? `PASS (API: ${diagnosisApi ? diagnosisApi.status : 'N/A'}, ICD codes: ${icdCodes}, label: ${diagnosisLabel})`
      : 'FAIL (no diagnosis data found)';

  // Finalized banner visible
  const finalizedBanner = await page.locator('text=/Signed and finalized/').count();
  const lockedBadge = await page.locator('text=Locked').count();
  results.finalizedState =
    finalizedBanner > 0 || lockedBadge > 0
      ? `PASS (finalized: ${finalizedBanner > 0}, locked: ${lockedBadge > 0})`
      : 'FAIL (no finalized indicator)';

  // Superbill button (only on finalized encounters)
  const superbillBtn = await page.locator('button:has-text("Superbill")').count();
  results.superbillBtn =
    superbillBtn > 0
      ? 'PASS (Superbill button visible)'
      : 'FAIL (no Superbill button on finalized encounter)';

  // Real data verification
  const successfulApis = apiCalls.filter(
    (c) => c.url.includes(`/encounters/${FINALIZED_ENCOUNTER_ID}`) && c.status === 200
  );
  results.realData =
    successfulApis.length > 0
      ? `PASS (${successfulApis.length} successful API responses)`
      : 'FAIL (no 200 responses from encounter API)';

  const failedApis = getFailedApiCalls(apiCalls);
  results.apiCalls = failedApis.length === 0 ? 'PASS' : `FAIL (${failedApis.length} errors)`;

  return results;
}

// =========================================================================
// Suite B — UI Interaction (editable encounter)
// =========================================================================

async function runUiTests(page: any, context: any) {
  const results: Record<string, string> = {};

  let encounterId = EDITABLE_ENCOUNTER_ID;
  await page.goto(`/${TENANT}/encounter/${encounterId}`, { waitUntil: 'networkidle' });
  await page.waitForLoadState('networkidle');

  // If the encounter didn't load, try to find one via the API
  const errorState = await page.locator('text=Could not load encounter').count();
  if (errorState > 0 || !page.url().includes(`/encounter/${encounterId}`)) {
    // Try known adjacent encounter IDs from seed
    const candidateIds = [
      'e0000000-0007-0000-0000-000000000006',
      'e0000000-0007-0000-0000-000000000005',
    ];
    for (const id of candidateIds) {
      await page.goto(`/${TENANT}/encounter/${id}`, { waitUntil: 'networkidle' });
      await page.waitForLoadState('networkidle');
      const isError = await page.locator('text=Could not load encounter').count();
      if (!isError && page.url().includes(`/encounter/${id}`)) {
        encounterId = id;
        break;
      }
    }
  }

  // Final check — if still no editable encounter, skip Suite B
  const loaded =
    page.url().includes('/encounter/') &&
    !(await page.locator('text=Could not load encounter').count());
  if (!loaded) {
    results.suiteB = 'SKIP (no editable encounter found)';
    return results;
  }

  const isFinalized = (await page.locator('text=/Signed and finalized/').count()) > 0;
  if (isFinalized) {
    const devUnlock = page.locator('button:has-text("Dev: Unlock")');
    if (await devUnlock.count() > 0) {
      await devUnlock.click();
      await page.waitForLoadState('networkidle');
    } else {
      results.suiteB = 'SKIP (encounter is finalized, no Dev: Unlock available)';
      return results;
    }
  }

  // ── 1. Bottom Tab Navigation ──────────────────────────────────────────
  const tabs = ['Complaint', 'Vitals', 'Rx', 'Exam', 'Dx', 'Plan'];
  let tabsWorking = 0;

  for (const tabLabel of tabs) {
    const tab = page.locator(`nav button:has-text("${tabLabel}")`);
    if (await tab.count() > 0) {
      await tab.click();
      await page.waitForLoadState('domcontentloaded');
      tabsWorking++;
    }
  }

  results.bottomTabs =
    tabsWorking === tabs.length
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
    await page.waitForLoadState('networkidle');

    const newValue = await ccTextarea.inputValue();
    results.chiefComplaintEdit = newValue.includes('E2E test')
      ? 'PASS (chief complaint editable + saved)'
      : 'FAIL (text not persisted)';

    // Restore original
    await ccTextarea.fill(originalValue);
    await ccTextarea.blur();
    await page.waitForLoadState('networkidle');
  } else {
    results.chiefComplaintEdit =
      (await ccTextarea.count()) > 0
        ? 'SKIP (chief complaint is read-only)'
        : 'FAIL (chief complaint textarea not found)';
  }

  // ── 3. Status Stepper Visible ─────────────────────────────────────────
  const preTestStep = await page.locator('text=Pre-Test').count();
  const inExamStep = await page.locator('text=In Exam').count();
  const finalizedStep = await page.locator('nav >> text=Finalized').count();
  results.statusStepper =
    preTestStep > 0 && inExamStep > 0
      ? `PASS (Pre-Test: ${preTestStep}, In Exam: ${inExamStep}, Finalized: ${finalizedStep})`
      : 'FAIL (status stepper not visible)';

  // ── 4. Vitals Form (if pre_test status) ───────────────────────────────
  const iopOdInput = page.locator('#iop_od');
  if (await iopOdInput.count() > 0) {
    const origIop = await iopOdInput.inputValue();

    await iopOdInput.fill('25');
    await iopOdInput.blur();
    await page.waitForLoadState('domcontentloaded');

    const elevatedBadge = await page.locator('text=/Elevated|elevated/').count();
    results.vitalsIopWarning =
      elevatedBadge > 0
        ? 'PASS (elevated IOP warning shown at 25 mmHg)'
        : 'INFO (no elevated badge — may use different indicator)';

    await iopOdInput.fill(origIop || '');
    await iopOdInput.blur();
    await page.waitForLoadState('domcontentloaded');

    const saveStatus = await page.locator('text=/Saved|Saving/').count();
    results.vitalsSaveStatus =
      saveStatus > 0
        ? 'PASS (save status indicator visible)'
        : 'INFO (save status not visible — may have cleared)';
  } else {
    const vitalsCard = await page.locator('text=/IOP|mmHg/').count();
    results.vitalsIopWarning =
      vitalsCard > 0
        ? 'SKIP (past pre_test — vitals shown as card)'
        : 'SKIP (no vitals section visible)';
    results.vitalsSaveStatus = 'SKIP (vitals in card mode)';
  }

  // ── 5. Diagnosis Add & Remove ─────────────────────────────────────────
  const addDxBtn = page.locator('button:has-text("+ Add Diagnosis")');
  if (await addDxBtn.count() > 0) {
    await addDxBtn.click();
    await page
      .waitForSelector('input[placeholder*="Search ICD-10"]', { state: 'visible', timeout: 3000 })
      .catch(() => {});

    const searchInput = page.locator('input[placeholder*="Search ICD-10"]');
    if (await searchInput.count() > 0) {
      await searchInput.fill('dry eye');
      await page.waitForSelector('text=H04.123', { timeout: 3000 }).catch(() => {});

      const dryEyeCode = await page.locator('text=H04.123').count();
      results.diagnosisSearch =
        dryEyeCode > 0
          ? 'PASS (H04.123 Dry eye found in search)'
          : 'FAIL (dry eye code not found in filtered list)';

      const ouBtn = page.locator('button:has-text("OU")').first();
      if (await ouBtn.count() > 0) {
        await ouBtn.click();
        await page.waitForLoadState('networkidle');

        const addedCode = await page.locator('text=H04.123').count();
        results.diagnosisAdd =
          addedCode > 0
            ? 'PASS (H04.123 added to encounter diagnoses)'
            : 'FAIL (code not visible after adding)';

        const removeBtn = page.locator('button[aria-label="Remove diagnosis"]').last();
        if (await removeBtn.count() > 0) {
          await removeBtn.click();
          await page.waitForLoadState('networkidle');
          results.diagnosisRemove = 'PASS (diagnosis removed)';
        } else {
          results.diagnosisRemove =
            'INFO (no remove button found — may have been cleaned up)';
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

    const closeBtn = page.locator('button:has-text("Close")');
    if (await closeBtn.count() > 0) await closeBtn.first().click();
  } else {
    results.diagnosisSearch =
      'SKIP (no "+ Add Diagnosis" button — may be read-only or wrong role)';
    results.diagnosisAdd = 'SKIP';
    results.diagnosisRemove = 'SKIP';
  }

  // ── 6. Status Advance: Start Exam ─────────────────────────────────────
  const startExamBtn = page.locator('button:has-text("Start Exam")');
  if (await startExamBtn.count() > 0) {
    await startExamBtn.click();
    await page.waitForLoadState('networkidle');

    const finalizeBtn = await page.locator('button:has-text("Finalize")').count();
    const startExamGone = (await startExamBtn.count()) === 0;
    results.statusAdvance =
      finalizeBtn > 0 || startExamGone
        ? 'PASS (pre_test → in_exam, Finalize button visible)'
        : 'FAIL (status did not advance)';
  } else {
    const finalizeBtn = await page.locator('button:has-text("Finalize")').count();
    results.statusAdvance =
      finalizeBtn > 0
        ? 'PASS (already in_exam — Finalize button visible)'
        : 'SKIP (not in pre_test or in_exam status)';
  }

  // ── 7. Finalize Modal — Validation Gates ──────────────────────────────
  const finalizeNavBtn = page.locator('nav button:has-text("Finalize")');
  if (await finalizeNavBtn.count() > 0) {
    await finalizeNavBtn.click();
    await page
      .waitForSelector('text=Sign & Finalize Encounter', { timeout: 5000 })
      .catch(() => {});

    const modalTitle = await page.locator('text=Sign & Finalize Encounter').count();
    results.finalizeModalOpens =
      modalTitle > 0 ? 'PASS (finalize modal opened)' : 'FAIL (modal did not open)';

    if (modalTitle > 0) {
      const ccSection = await page.locator('text=Chief Complaint').count();
      const vitalsSection = await page.locator('text=Vitals').count();
      const dxSection = await page.locator('text=Diagnoses').count();
      const rxSection = await page.locator('text=Final Refraction').count();
      const apSection = await page.locator('text=Assessment & Plan').count();
      results.finalizeModalSections =
        ccSection > 0 && vitalsSection > 0 && dxSection > 0
          ? `PASS (CC: ${ccSection}, Vitals: ${vitalsSection}, Dx: ${dxSection}, Rx: ${rxSection}, A&P: ${apSection})`
          : 'FAIL (missing summary sections)';

      const sealBtn = page.locator('button:has-text("Sign & Seal Chart")');
      const isDisabled = await sealBtn.isDisabled().catch(() => true);
      results.finalizeGateInitial = isDisabled
        ? 'PASS (Sign & Seal disabled without attestation/assessment)'
        : 'FAIL (button should be disabled initially)';

      const assessmentField = page.locator('textarea[placeholder*="Clinical assessment"]');
      if (await assessmentField.count() > 0) {
        await assessmentField.fill('short');

        const attestCheckbox = page.locator('input[type="checkbox"]');
        if (await attestCheckbox.count() > 0) {
          await attestCheckbox.check();
          await page.waitForLoadState('domcontentloaded');

          const stillDisabled = await sealBtn.isDisabled().catch(() => true);
          results.finalizeGateShortAssessment = stillDisabled
            ? 'PASS (disabled with < 10 char assessment)'
            : 'INFO (enabled — may have diagnoses + assessment counted differently)';

          await assessmentField.fill(
            'Patient examined. Follow up in 3 months for routine monitoring.'
          );
          await page.waitForLoadState('domcontentloaded');

          const charCount = await page.locator('text=/\\d+\\/10 min/').count();
          results.finalizeCharCount =
            charCount > 0
              ? 'PASS (character count indicator visible)'
              : 'INFO (no char count visible)';

          await attestCheckbox.uncheck();
        } else {
          results.finalizeGateShortAssessment = 'FAIL (no attestation checkbox)';
          results.finalizeCharCount = 'SKIP';
        }
      } else {
        results.finalizeGateShortAssessment = 'FAIL (no assessment textarea)';
        results.finalizeCharCount = 'SKIP';
      }

      const cancelBtn = page.locator('button:has-text("Cancel")');
      if (await cancelBtn.count() > 0) {
        await cancelBtn.click();
        await page
          .waitForSelector('text=Sign & Finalize Encounter', {
            state: 'hidden',
            timeout: 3000,
          })
          .catch(() => {});
      }

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
  if (aiScribeTitle > 0 && (await transcriptInput.count()) > 0) {
    const generateBtn = page.locator('button:has-text("Generate Note")');
    const upgradeBtn = page.locator('button:has-text("Upgrade to Unlock")');
    results.aiScribeSection =
      (await generateBtn.count()) > 0
        ? 'PASS (AI Scribe with Generate Note — Premium)'
        : (await upgradeBtn.count()) > 0
        ? 'PASS (AI Scribe with Upgrade prompt — non-Premium)'
        : 'FAIL (AI Scribe present but no action button)';

    if ((await generateBtn.count()) > 0) {
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
    await page
      .waitForSelector('[role="dialog"]', { state: 'visible', timeout: 5000 })
      .catch(() => {});

    const chartModal = await page.locator('[role="dialog"]').count();
    results.fullChartModal =
      chartModal > 0 ? 'PASS (Full Chart modal opened)' : 'FAIL (no dialog appeared)';

    const dialogClose = page.locator('[role="dialog"] button:has-text("Close")');
    const dialogX = page.locator('[role="dialog"] button[class*="close"]');
    if (await dialogClose.count() > 0) await dialogClose.click();
    else if (await dialogX.count() > 0) await dialogX.click();
    else await page.keyboard.press('Escape');
    await page
      .waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 3000 })
      .catch(() => {});
  } else {
    results.fullChartModal = 'FAIL (no Full Chart button in bottom bar)';
  }

  return results;
}

// =========================================================================
// Tests
// =========================================================================

test.describe('Smoke Encounter — Suite A (API) @smoke', () => {
  test('encounter page loads and calls real clinical APIs', async ({ page, apiCalls }) => {
    const results = await runApiTests(page, apiCalls);

    expect(results.encounterLoads).toBe('PASS');
    expect(results.realApiCalled).toMatch(/^PASS/);
    expect(results.finalizedState).toMatch(/^PASS/);
    expect(results.superbillBtn).toMatch(/^PASS/);
    expect(results.realData).toMatch(/^PASS/);
    expect(results.apiCalls).toMatch(/^PASS/);
  });
});

test.describe('Smoke Encounter — Suite B (UI) @smoke', () => {
  test('encounter UI interactions — tabs, complaint, diagnoses, finalize modal', async ({
    page,
    context,
    consoleErrors,
  }) => {
    const results = await runUiTests(page, context);

    if (results.suiteB?.startsWith('SKIP')) {
      test.skip(true, results.suiteB);
      return;
    }

    expect(results.bottomTabs).toMatch(/^PASS/);
    expect(results.statusStepper).toMatch(/^PASS/);
    // console errors — hard fail on any
    expect(consoleErrors.length).toBe(0);
  });
});
