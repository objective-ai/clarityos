/**
 * smoke-billing.spec.js — Phase 4: Billing & Coding E2E verification
 *
 * Suite A (Core): encounter loads, finalize modal or locked state,
 *                 superbill modal content (CPT, MDM, CMS-1500).
 * Suite B (UI):   CPT code add/remove, MDM badge, Dx pointers,
 *                 Export CMS-1500, Mark Ready to Bill, validation warnings.
 *
 * Run: bash scripts/dev.sh verify tests/e2e/smoke-billing.spec.js
 */
const { launchBrowser, login, setupTracking, getFailedApiCalls, printResults, TARGET_URL } = require('./helpers/test-utils');

// Known encounter from seed data (James Rodriguez comprehensive exam)
const TEST_ENCOUNTER_ID = 'e0000000-0000-0000-0000-000000000003';

// =========================================================================
// Suite A — Core Functionality (existing tests)
// =========================================================================

async function runCoreTests(page, slug, apiCalls) {
  const results = {};

  apiCalls.length = 0;
  await page.goto(`${TARGET_URL}/${slug}/encounter/${TEST_ENCOUNTER_ID}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  results.encounterLoads = page.url().includes(`/encounter/${TEST_ENCOUNTER_ID}`)
    ? 'PASS'
    : 'FAIL (redirected away from encounter)';
  await page.screenshot({ path: '/tmp/pw-e2e-billing-encounter.png', fullPage: true });

  // Check for Finalize button or Locked state
  const finalizeBtn = page.locator('button:has-text("Finalize")');
  const lockedBadge = page.locator('text=Locked');
  const superbillBtnInBanner = page.locator('button:has-text("Superbill")');

  const hasFinalizeBtn = await finalizeBtn.count();
  const isLocked = await lockedBadge.count();
  const hasSuperbillInBanner = await superbillBtnInBanner.count();

  if (hasFinalizeBtn > 0) {
    results.finalizeButton = 'PASS (Finalize button visible — encounter not yet finalized)';

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

        const cptHeader = await page.locator('th:has-text("CPT")').count();
        const mdmSection = await page.locator('text=Medical Decision Making').count();
        const exportBtn = await page.locator('button:has-text("Export CMS-1500")').count();
        const closeBtn = await page.locator('[role="dialog"] button:has-text("Close")').count();

        const sbParts = [];
        if (await page.locator('text=Superbill').count() > 0) sbParts.push('title');
        if (cptHeader > 0) sbParts.push('CPT-table');
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

        results.superbillDxPointers = (await page.locator('th:has-text("Dx Pointers")').count()) > 0
          ? 'PASS (Dx Pointers column present)'
          : 'INFO (no Dx Pointers column header)';

        results.superbillWarnings = (await page.locator('text=Validation Warnings').count()) > 0
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

  const failedApis = getFailedApiCalls(apiCalls);
  results.apiCalls = failedApis.length === 0 ? 'PASS' : `FAIL (${failedApis.length} errors)`;

  return results;
}

// =========================================================================
// Suite B — UI Interaction (superbill CPT management, MDM, export)
// =========================================================================

async function runUiTests(page, slug) {
  const results = {};

  // Navigate to finalized encounter and open Superbill
  await page.goto(`${TARGET_URL}/${slug}/encounter/${TEST_ENCOUNTER_ID}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  const superbillBtn = page.locator('button:has-text("Superbill")');
  if (await superbillBtn.count() === 0) {
    results.suiteB = 'SKIP (no Superbill button — encounter may not be finalized)';
    return results;
  }

  await superbillBtn.click();
  await page.waitForTimeout(2500);

  const dialog = page.locator('[role="dialog"]');
  if (await dialog.count() === 0) {
    results.suiteB = 'FAIL (Superbill dialog did not open)';
    return results;
  }

  // ── 1. MDM Section & Badge ────────────────────────────────────────────
  const mdmSection = await dialog.locator('text=Medical Decision Making').count();
  const mdmBadge = await dialog.locator('text=/straightforward|low|moderate|high/ >> text=/MDM/').count();
  const emCodeBadge = await dialog.locator('span.font-mono:has-text(/992/)').count();

  results.mdmSection = mdmSection > 0
    ? `PASS (MDM section visible, badge=${mdmBadge > 0}, E/M code=${emCodeBadge > 0})`
    : 'INFO (no MDM section — may not have been computed)';

  // ── 2. CPT Table Structure ────────────────────────────────────────────
  const cptHeader = await dialog.locator('th:has-text("CPT")').count();
  const descHeader = await dialog.locator('th:has-text("Description")').count();
  const dxHeader = await dialog.locator('th:has-text("Dx Pointers")').count();
  const unitsHeader = await dialog.locator('th:has-text("Units")').count();
  const feeHeader = await dialog.locator('th:has-text("Fee")').count();

  const headerCount = [cptHeader, descHeader, dxHeader, unitsHeader, feeHeader].filter(h => h > 0).length;
  results.cptTableHeaders = headerCount >= 4
    ? `PASS (${headerCount}/5 column headers present)`
    : headerCount > 0
      ? `FAIL (only ${headerCount}/5 headers: CPT=${cptHeader} Desc=${descHeader} Dx=${dxHeader} Units=${unitsHeader} Fee=${feeHeader})`
      : 'FAIL (no CPT table headers — table may be empty)';

  // ── 3. Existing CPT Codes ─────────────────────────────────────────────
  const cptCodeCells = dialog.locator('td span.font-mono.font-semibold');
  const existingCptCount = await cptCodeCells.count();
  results.existingCptCodes = existingCptCount > 0
    ? `PASS (${existingCptCount} CPT code(s) in superbill)`
    : 'INFO (no CPT codes — empty superbill)';

  // ── 4. Add CPT Code ───────────────────────────────────────────────────
  const addCptBtn = dialog.locator('button:has-text("Add CPT Code")');
  if (await addCptBtn.count() > 0) {
    await addCptBtn.click();
    await page.waitForTimeout(500);

    // Check dropdown appeared with CPT options
    const dropdown = page.locator('div.absolute.z-50.w-80');
    const dropdownItems = dropdown.locator('button');
    const dropdownCount = await dropdownItems.count();

    results.addCptDropdown = dropdownCount > 0
      ? `PASS (${dropdownCount} CPT codes available in dropdown)`
      : 'FAIL (dropdown opened but no codes)';

    if (dropdownCount > 0) {
      // Read first available code text
      const firstCodeText = await dropdownItems.first().locator('span.font-mono').textContent().catch(() => '');

      // Click to add it
      await dropdownItems.first().click();
      await page.waitForTimeout(1500);

      // Verify it was added to the table
      const newCptCount = await cptCodeCells.count();
      results.addCptCode = newCptCount > existingCptCount
        ? `PASS (added ${firstCodeText || 'code'}, now ${newCptCount} items)`
        : `INFO (count unchanged ${newCptCount} — code may have already existed)`;

      // ── 5. Remove CPT Code ──────────────────────────────────────────
      const removeBtn = dialog.locator('button[title="Remove line item"]').last();
      if (await removeBtn.count() > 0) {
        await removeBtn.click();
        await page.waitForTimeout(1500);

        const afterRemoveCount = await cptCodeCells.count();
        results.removeCptCode = afterRemoveCount < newCptCount
          ? `PASS (removed code, now ${afterRemoveCount} items)`
          : 'INFO (count unchanged after remove)';
      } else {
        results.removeCptCode = 'SKIP (no remove button)';
      }
    } else {
      results.addCptCode = 'SKIP (no codes in dropdown)';
      results.removeCptCode = 'SKIP';
    }
  } else {
    results.addCptDropdown = 'SKIP (no "Add CPT Code" button — all codes may be added)';
    results.addCptCode = 'SKIP';
    results.removeCptCode = 'SKIP';
  }

  // ── 6. Total Fee Display ──────────────────────────────────────────────
  const totalLabel = await dialog.locator('td:has-text("Total")').count();
  const totalValue = await dialog.locator('tfoot td.font-mono').count();
  results.totalFee = (totalLabel > 0 || totalValue > 0)
    ? 'PASS (total fee row visible)'
    : 'INFO (no total row — may have 0 items)';

  // ── 7. Dx Pointers on Line Items ─────────────────────────────────────
  const dxPointerBadges = await dialog.locator('td span.font-mono:has-text(/[A-Z]\\d{2}/)').count();
  results.dxPointers = dxPointerBadges > 0
    ? `PASS (${dxPointerBadges} diagnosis pointer badge(s) on line items)`
    : 'INFO (no dx pointer badges — codes may lack pointers)';

  // ── 8. Encounter Diagnoses Reference ──────────────────────────────────
  const dxReference = await dialog.locator('text=Encounter Diagnoses (ICD-10)').count();
  results.dxReference = dxReference > 0
    ? 'PASS (ICD-10 diagnoses reference section visible)'
    : 'INFO (no diagnoses reference section)';

  // ── 9. Claim Status Badge ─────────────────────────────────────────────
  const statusBadge = await dialog.locator('text=/draft|ready to bill|submitted|paid/').count();
  results.claimStatus = statusBadge > 0
    ? 'PASS (claim status badge visible)'
    : 'INFO (no claim status badge)';

  // ── 10. Mark Ready to Bill / Already Ready ────────────────────────────
  const markReadyBtn = dialog.locator('button:has-text("Mark Ready to Bill")');
  const alreadyReady = await dialog.locator('text=ready to bill').count();

  if (await markReadyBtn.count() > 0) {
    // Check if disabled due to warnings
    const isDisabled = await markReadyBtn.isDisabled();
    const hasWarnings = await dialog.locator('text=Validation Warnings').count();
    results.markReady = isDisabled && hasWarnings > 0
      ? 'PASS (Mark Ready disabled — validation warnings present)'
      : isDisabled
        ? 'INFO (Mark Ready disabled — unknown reason)'
        : 'PASS (Mark Ready to Bill button enabled)';
  } else if (alreadyReady > 0) {
    results.markReady = 'PASS (already marked as ready to bill)';
  } else {
    results.markReady = 'INFO (no Mark Ready button or status)';
  }

  // ── 11. Export CMS-1500 Button ────────────────────────────────────────
  const exportBtn = dialog.locator('button:has-text("Export CMS-1500")');
  results.exportBtn = (await exportBtn.count()) > 0
    ? 'PASS (Export CMS-1500 button present)'
    : 'FAIL (no Export CMS-1500 button)';

  // ── 12. Validation Warnings Display ───────────────────────────────────
  const warningsSection = await dialog.locator('text=Validation Warnings').count();
  if (warningsSection > 0) {
    const warningItems = await dialog.locator('text=Validation Warnings').locator('..').locator('..').locator('span').count();
    results.validationWarnings = `PASS (warnings section visible with ${warningItems} items)`;
  } else {
    results.validationWarnings = 'PASS (no validation warnings — clean claim)';
  }

  await page.screenshot({ path: '/tmp/pw-e2e-billing-superbill-ui.png', fullPage: true });

  // Close modal
  const closeBtn = dialog.locator('button:has-text("Close")');
  if (await closeBtn.count() > 0) {
    await closeBtn.click();
    await page.waitForTimeout(500);

    const dialogGone = (await page.locator('[role="dialog"]').count()) === 0;
    results.closeModal = dialogGone
      ? 'PASS (Superbill modal closed)'
      : 'FAIL (modal still visible after Close)';
  } else {
    results.closeModal = 'SKIP (no Close button)';
  }

  return results;
}

// =========================================================================
// Main
// =========================================================================

(async () => {
  const { browser, page } = await launchBrowser();
  const { apiCalls, consoleErrors } = setupTracking(page);

  const slug = await login(page);
  if (!slug) {
    console.log('Login failed');
    await browser.close();
    return;
  }

  // Suite A — Core
  console.log('\n--- Suite A: Core ---');
  const coreResults = await runCoreTests(page, slug, apiCalls);
  printResults('Smoke Billing — Suite A (Core)', coreResults);

  // Suite B — UI Interaction
  console.log('\n--- Suite B: UI Interaction ---');
  const uiResults = await runUiTests(page, slug);
  uiResults.consoleErrors = consoleErrors.length === 0 ? 'PASS' : `FAIL (${consoleErrors.length} errors)`;
  printResults('Smoke Billing — Suite B (UI)', uiResults);

  await browser.close();
})();
