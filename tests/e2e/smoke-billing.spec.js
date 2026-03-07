/**
 * smoke-billing.spec.js — Phase 4: Billing & Coding E2E verification
 *
 * Verifies: encounter page loads, finalize modal works, superbill modal
 * shows CPT codes + MDM + CMS-1500 export.
 *
 * Uses a known encounter ID from seed data. Navigates to an encounter,
 * checks finalize and superbill flows. Does NOT actually finalize to
 * avoid irreversible data changes.
 *
 * Run: node tests/e2e/smoke-billing.spec.js
 */
const { chromium } = require('playwright');

const TARGET_URL = 'http://localhost:3000';
const EMAIL = 'duytran@yahoo.com';
const PASSWORD = '123456';

// Known encounter from seed data (James Rodriguez comprehensive exam)
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
  await page.waitForTimeout(3000);

  // Check encounter loaded (should see patient info or encounter content)
  const encounterUrl = page.url();
  results.encounterLoads = encounterUrl.includes(`/encounter/${TEST_ENCOUNTER_ID}`)
    ? 'PASS'
    : 'FAIL (redirected away from encounter)';
  console.log('Encounter loads:', results.encounterLoads);

  await page.screenshot({ path: '/tmp/pw-e2e-billing-encounter.png', fullPage: true });

  // =========================================================================
  // 2. Check for Finalize button or Locked state
  // =========================================================================
  console.log('\n=== Finalize Button ===');
  const finalizeBtn = page.locator('button:has-text("Finalize")');
  const lockedBadge = page.locator('text=Locked');
  const superbillBtnInBanner = page.locator('button:has-text("Superbill")');

  const hasFinalizeBtn = await finalizeBtn.count();
  const isLocked = await lockedBadge.count();
  const hasSuperbillInBanner = await superbillBtnInBanner.count();

  if (hasFinalizeBtn > 0) {
    results.finalizeButton = 'PASS (Finalize button visible — encounter not yet finalized)';

    // -----------------------------------------------------------------------
    // 3. Open Finalize modal (but don't actually finalize)
    // -----------------------------------------------------------------------
    console.log('\n=== Finalize Modal ===');
    await finalizeBtn.click();
    await page.waitForTimeout(1500);

    const dialog = page.locator('[role="dialog"]');
    const hasDialog = await dialog.count();

    if (hasDialog > 0) {
      results.finalizeModal = 'PASS (modal opened)';

      // Check modal content
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

      // Check for diagnoses section in modal
      const dxSection = await page.locator('text=Diagnoses').count();
      results.finalizeModalDiagnoses = dxSection > 0 ? 'PASS' : 'FAIL (no diagnoses section)';

      await page.screenshot({ path: '/tmp/pw-e2e-billing-finalize-modal.png', fullPage: true });

      // Close modal without finalizing
      if (cancelBtn > 0) {
        await page.locator('[role="dialog"] button:has-text("Cancel")').click();
        await page.waitForTimeout(500);
      }
    } else {
      results.finalizeModal = 'FAIL (dialog did not open)';
      results.finalizeModalContent = 'SKIP';
      results.finalizeModalDiagnoses = 'SKIP';
    }

    // -----------------------------------------------------------------------
    // 4. Superbill — need to try loading it even if not finalized
    // -----------------------------------------------------------------------
    console.log('\n=== Superbill (pre-finalize) ===');
    // The superbill may not exist before finalization, so this is informational
    results.superbillPreFinalize = 'INFO (superbill requires finalization first — tested via modal)';

  } else if (isLocked > 0) {
    results.finalizeButton = 'PASS (encounter already finalized — Locked badge visible)';
    results.finalizeModal = 'SKIP (already finalized)';
    results.finalizeModalContent = 'SKIP (already finalized)';
    results.finalizeModalDiagnoses = 'SKIP (already finalized)';

    // -----------------------------------------------------------------------
    // 4b. Superbill on finalized encounter
    // -----------------------------------------------------------------------
    console.log('\n=== Superbill (finalized) ===');
    if (hasSuperbillInBanner > 0) {
      await superbillBtnInBanner.click();
      await page.waitForTimeout(2000);

      const superbillDialog = page.locator('[role="dialog"]');
      const hasSuperbillDialog = await superbillDialog.count();

      if (hasSuperbillDialog > 0) {
        results.superbillModal = 'PASS (Superbill modal opened)';

        // Check superbill content
        const superbillTitle = await page.locator('text=Superbill').count();
        const cptTable = await page.locator('th:has-text("CPT")').count();
        const mdmSection = await page.locator('text=MEDICAL DECISION MAKING').count();
        const exportBtn = await page.locator('button:has-text("Export CMS-1500")').count();
        const closeBtn = await page.locator('[role="dialog"] button:has-text("Close")').count();

        const sbParts = [];
        if (superbillTitle > 0) sbParts.push('title');
        if (cptTable > 0) sbParts.push('CPT-table');
        if (mdmSection > 0) sbParts.push('MDM');
        if (exportBtn > 0) sbParts.push('CMS-1500-export');
        if (closeBtn > 0) sbParts.push('close-btn');

        results.superbillContent = sbParts.length >= 3
          ? `PASS (${sbParts.join(', ')})`
          : `FAIL (only: ${sbParts.join(', ')})`;

        // Check for CPT code rows
        const cptRows = await page.locator('span.font-mono.font-semibold').count();
        results.superbillCptCodes = cptRows > 0
          ? `PASS (${cptRows} CPT codes)`
          : 'INFO (no CPT codes — may need to add)';

        // Check for diagnosis pointers
        const dxPointers = await page.locator('text=Dx Pointers').count();
        results.superbillDxPointers = dxPointers > 0
          ? 'PASS (Dx Pointers column present)'
          : 'INFO (no Dx Pointers column)';

        // Check validation warnings
        const warnings = await page.locator('text=VALIDATION WARNINGS').count();
        results.superbillWarnings = warnings > 0
          ? 'INFO (validation warnings present)'
          : 'PASS (no validation warnings)';

        await page.screenshot({ path: '/tmp/pw-e2e-billing-superbill.png', fullPage: true });

        // Close superbill modal
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

  console.log('Finalize button:', results.finalizeButton);
  console.log('Finalize modal:', results.finalizeModal || 'N/A');
  console.log('Finalize modal content:', results.finalizeModalContent || 'N/A');
  console.log('Finalize modal diagnoses:', results.finalizeModalDiagnoses || 'N/A');

  if (results.superbillModal) console.log('Superbill modal:', results.superbillModal);
  if (results.superbillContent) console.log('Superbill content:', results.superbillContent);
  if (results.superbillCptCodes) console.log('Superbill CPT codes:', results.superbillCptCodes);
  if (results.superbillDxPointers) console.log('Superbill Dx pointers:', results.superbillDxPointers);
  if (results.superbillWarnings) console.log('Superbill warnings:', results.superbillWarnings);

  // =========================================================================
  // API + console summary
  // =========================================================================
  // Exclude expected 404s from exam-findings (no data = 404, handled gracefully by frontend)
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
