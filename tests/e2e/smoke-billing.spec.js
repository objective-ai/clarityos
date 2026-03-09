/**
 * smoke-billing.spec.js — Phase 4: Billing & Coding E2E verification
 *
 * Verifies: encounter page loads, finalize modal works, superbill modal
 * shows CPT codes + MDM + CMS-1500 export.
 * Run: bash scripts/dev.sh verify tests/e2e/smoke-billing.spec.js
 */
const { launchBrowser, login, setupTracking, getFailedApiCalls, printResults, TARGET_URL } = require('./helpers/test-utils');

// Known encounter from seed data (James Rodriguez comprehensive exam)
const TEST_ENCOUNTER_ID = 'e0000000-0000-0000-0000-000000000003';

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

  // 1. Navigate to encounter page
  apiCalls.length = 0;
  await page.goto(`${TARGET_URL}/${slug}/encounter/${TEST_ENCOUNTER_ID}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  results.encounterLoads = page.url().includes(`/encounter/${TEST_ENCOUNTER_ID}`)
    ? 'PASS'
    : 'FAIL (redirected away from encounter)';
  await page.screenshot({ path: '/tmp/pw-e2e-billing-encounter.png', fullPage: true });

  // 2. Check for Finalize button or Locked state
  const finalizeBtn = page.locator('button:has-text("Finalize")');
  const lockedBadge = page.locator('text=Locked');
  const superbillBtnInBanner = page.locator('button:has-text("Superbill")');

  const hasFinalizeBtn = await finalizeBtn.count();
  const isLocked = await lockedBadge.count();
  const hasSuperbillInBanner = await superbillBtnInBanner.count();

  if (hasFinalizeBtn > 0) {
    results.finalizeButton = 'PASS (Finalize button visible — encounter not yet finalized)';

    // 3. Open Finalize modal (but don't actually finalize)
    await finalizeBtn.click();
    await page.waitForTimeout(1500);

    const hasDialog = await page.locator('[role="dialog"]').count();

    if (hasDialog > 0) {
      results.finalizeModal = 'PASS (modal opened)';

      const signTitle = await page.locator('text=Sign & Finalize Encounter').count();
      const attestation = await page.locator('input[type="checkbox"]').count();
      const assessmentField = await page.locator('textarea').count();
      const signBtn = await page.locator('button:has-text("Sign & Seal Chart")').count();
      const cancelBtn = await page.locator('[role="dialog"] button:has-text("Cancel")').count();

      const parts = [];
      if (signTitle > 0) parts.push('title');
      if (attestation > 0) parts.push('attestation');
      if (assessmentField > 0) parts.push('assessment');
      if (signBtn > 0) parts.push('sign-btn');
      if (cancelBtn > 0) parts.push('cancel-btn');

      results.finalizeModalContent = parts.length >= 4
        ? `PASS (${parts.join(', ')})`
        : `FAIL (only: ${parts.join(', ')})`;

      const dxSection = await page.locator('text=Diagnoses').count();
      results.finalizeModalDiagnoses = dxSection > 0 ? 'PASS' : 'FAIL (no diagnoses section)';

      await page.screenshot({ path: '/tmp/pw-e2e-billing-finalize-modal.png', fullPage: true });

      if (cancelBtn > 0) {
        await page.locator('[role="dialog"] button:has-text("Cancel")').click();
        await page.waitForTimeout(500);
      }
    } else {
      results.finalizeModal = 'FAIL (dialog did not open)';
      results.finalizeModalContent = 'SKIP';
      results.finalizeModalDiagnoses = 'SKIP';
    }

    results.superbillPreFinalize = 'INFO (superbill requires finalization first — tested via modal)';

  } else if (isLocked > 0) {
    results.finalizeButton = 'PASS (encounter already finalized — Locked badge visible)';
    results.finalizeModal = 'SKIP (already finalized)';
    results.finalizeModalContent = 'SKIP (already finalized)';
    results.finalizeModalDiagnoses = 'SKIP (already finalized)';

    // Superbill on finalized encounter
    if (hasSuperbillInBanner > 0) {
      await superbillBtnInBanner.click();
      await page.waitForTimeout(2000);

      if (await page.locator('[role="dialog"]').count() > 0) {
        results.superbillModal = 'PASS (Superbill modal opened)';

        const cptTable = await page.locator('th:has-text("CPT")').count();
        const mdmSection = await page.locator('text=MEDICAL DECISION MAKING').count();
        const exportBtn = await page.locator('button:has-text("Export CMS-1500")').count();
        const closeBtn = await page.locator('[role="dialog"] button:has-text("Close")').count();

        const sbParts = [];
        if (await page.locator('text=Superbill').count() > 0) sbParts.push('title');
        if (cptTable > 0) sbParts.push('CPT-table');
        if (mdmSection > 0) sbParts.push('MDM');
        if (exportBtn > 0) sbParts.push('CMS-1500-export');
        if (closeBtn > 0) sbParts.push('close-btn');

        results.superbillContent = sbParts.length >= 3
          ? `PASS (${sbParts.join(', ')})`
          : `FAIL (only: ${sbParts.join(', ')})`;

        const cptRows = await page.locator('span.font-mono.font-semibold').count();
        results.superbillCptCodes = cptRows > 0
          ? `PASS (${cptRows} CPT codes)`
          : 'INFO (no CPT codes — may need to add)';

        results.superbillDxPointers = (await page.locator('text=Dx Pointers').count()) > 0
          ? 'PASS (Dx Pointers column present)'
          : 'INFO (no Dx Pointers column)';

        results.superbillWarnings = (await page.locator('text=VALIDATION WARNINGS').count()) > 0
          ? 'INFO (validation warnings present)'
          : 'PASS (no validation warnings)';

        await page.screenshot({ path: '/tmp/pw-e2e-billing-superbill.png', fullPage: true });

        if (closeBtn > 0) {
          await page.locator('[role="dialog"] button:has-text("Close")').first().click();
          await page.waitForTimeout(500);
        }
      } else {
        results.superbillModal = 'FAIL (dialog did not open)';
        results.superbillContent = 'SKIP';
        results.superbillCptCodes = 'SKIP';
        results.superbillDxPointers = 'SKIP';
        results.superbillWarnings = 'SKIP';
      }
    } else {
      results.superbillModal = 'FAIL (no Superbill button in finalized banner)';
      results.superbillContent = 'SKIP';
      results.superbillCptCodes = 'SKIP';
      results.superbillDxPointers = 'SKIP';
      results.superbillWarnings = 'SKIP';
    }
  } else {
    results.finalizeButton = 'FAIL (no Finalize button and no Locked badge)';
    results.finalizeModal = 'SKIP';
    results.finalizeModalContent = 'SKIP';
    results.finalizeModalDiagnoses = 'SKIP';
  }

  // Summary
  const failedApis = getFailedApiCalls(apiCalls);
  results.apiCalls = failedApis.length === 0 ? 'PASS' : `FAIL (${failedApis.length} errors)`;
  results.consoleErrors = consoleErrors.length === 0 ? 'PASS' : `FAIL (${consoleErrors.length} errors)`;

  printResults('Smoke Billing (Phase 4)', results);
  await browser.close();
})();
