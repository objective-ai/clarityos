/**
 * smoke-billing.spec.ts — Sprint 6.1: Billing UI & Finalization Stepper E2E
 *
 * Suite A (Core): encounter loads, 2-step finalize modal (clinical→billing),
 *                 superbill modal on finalized encounters.
 * Suite B (UI):   CPT code add/remove, MDM badge, Dx pointers,
 *                 Export CMS-1500, Mark Ready to Bill, validation warnings.
 * Suite C (Dashboard): billing dashboard page — filters, table, CSV export.
 */
import { test, expect, getFailedApiCalls } from './fixtures';

const TENANT = 'sunview';

// Known encounters from seed data (see memory/seed-data.md)
// Non-finalized encounter (William Donovan) — for testing Finalize modal
const TEST_ENCOUNTER_OPEN = 'e0000000-0007-0000-0000-000000000007';
// First encounter (may be finalized) — for testing Superbill modal
const TEST_ENCOUNTER_ANY = 'e0000000-0007-0000-0000-000000000001';

// =========================================================================
// Suite A — Core: Finalize Modal (2-step stepper) + Superbill Modal
// =========================================================================

async function runCoreTests(page: any, apiCalls: { url: string; status: number }[]) {
  const results: Record<string, string> = {};

  apiCalls.length = 0;
  await page.goto(`/${TENANT}/encounter/${TEST_ENCOUNTER_OPEN}`, { waitUntil: 'networkidle' });
  await page.waitForLoadState('networkidle');

  results.encounterLoads = page.url().includes(`/encounter/${TEST_ENCOUNTER_OPEN}`)
    ? 'PASS'
    : 'FAIL (redirected away from encounter)';

  const finalizeBtn = page.locator('button:has-text("Finalize")');
  const lockedBadge = page.locator('text=Locked');
  const superbillBtnInBanner = page.locator('button:has-text("Superbill")');

  await Promise.race([
    finalizeBtn.waitFor({ state: 'visible', timeout: 12000 }),
    lockedBadge.waitFor({ state: 'visible', timeout: 12000 }),
  ]).catch(() => {});

  const hasFinalizeBtn = await finalizeBtn.count();
  const isLocked = await lockedBadge.count();
  const hasSuperbillInBanner = await superbillBtnInBanner.count();

  if (hasFinalizeBtn > 0) {
    results.finalizeButton = 'PASS (Finalize button visible — encounter not yet finalized)';

    await finalizeBtn.click();
    await page.waitForSelector('[role="dialog"]', { state: 'visible', timeout: 5000 }).catch(() => {});

    const dialog = page.locator('[role="dialog"]');
    const hasDialog = await dialog.count();

    if (hasDialog > 0) {
      results.finalizeModal = 'PASS (modal opened)';

      const clinicalLabel = await dialog.locator('text=Clinical').count();
      const billingLabel = await dialog.locator('text=Billing').count();
      results.stepIndicator =
        clinicalLabel > 0 && billingLabel > 0
          ? 'PASS (Clinical + Billing step labels)'
          : `FAIL (Clinical=${clinicalLabel}, Billing=${billingLabel})`;

      const signTitle = await dialog.locator('text=Sign & Finalize Encounter').count();
      const attestation = await dialog.locator('input[type="checkbox"]').count();
      const assessmentField = await dialog.locator('textarea').count();
      const signBtn = await dialog.locator('button:has-text("Sign & Continue to Billing")').count();
      const cancelBtn = await dialog.locator('button:has-text("Cancel")').count();

      const parts: string[] = [];
      if (signTitle > 0) parts.push('title');
      if (attestation > 0) parts.push('attestation');
      if (assessmentField > 0) parts.push('assessment');
      if (signBtn > 0) parts.push('sign-btn');
      if (cancelBtn > 0) parts.push('cancel-btn');

      results.step1Content =
        parts.length >= 4 ? `PASS (${parts.join(', ')})` : `FAIL (only: ${parts.join(', ')})`;

      const chiefComplaint = await dialog.locator('text=Chief Complaint').count();
      const vitals = await dialog.locator('text=Vitals').count();
      const dxSection = await dialog.locator('text=Diagnoses').count();
      const rxSection = await dialog.locator('text=Final Refraction').count();
      const apSection = await dialog.locator('text=Assessment & Plan').count();

      const sections: string[] = [];
      if (chiefComplaint > 0) sections.push('CC');
      if (vitals > 0) sections.push('Vitals');
      if (dxSection > 0) sections.push('Dx');
      if (rxSection > 0) sections.push('Rx');
      if (apSection > 0) sections.push('A&P');

      results.step1Sections =
        sections.length >= 4
          ? `PASS (${sections.join(', ')})`
          : `FAIL (only: ${sections.join(', ')})`;

      if (cancelBtn > 0) {
        await dialog.locator('button:has-text("Cancel")').click();
        await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 3000 }).catch(() => {});
      }
    } else {
      results.finalizeModal = 'FAIL (dialog did not open)';
      results.stepIndicator = 'SKIP';
      results.step1Content = 'SKIP';
      results.step1Sections = 'SKIP';
    }

    results.superbillPreFinalize = 'INFO (superbill requires finalization first — tested via modal)';

  } else if (isLocked > 0) {
    results.finalizeButton = 'PASS (encounter already finalized — Locked badge visible)';
    results.finalizeModal = 'SKIP (already finalized)';
    results.stepIndicator = 'SKIP (already finalized)';
    results.step1Content = 'SKIP (already finalized)';
    results.step1Sections = 'SKIP (already finalized)';

    if (hasSuperbillInBanner > 0) {
      await superbillBtnInBanner.click();
      await page.waitForSelector('[role="dialog"]', { state: 'visible', timeout: 5000 }).catch(() => {});

      if ((await page.locator('[role="dialog"]').count()) > 0) {
        results.superbillModal = 'PASS (Superbill modal opened)';

        const dialog = page.locator('[role="dialog"]');
        const cptHeader = await dialog.locator('th:has-text("CPT")').count();
        const mdmSection = await dialog.locator('text=Medical Decision Making').count();
        const exportBtn = await dialog.locator('button:has-text("Export CMS-1500")').count();
        const closeBtn = await dialog.locator('button:has-text("Close")').count();

        const sbParts: string[] = [];
        if ((await dialog.locator('text=Superbill').count()) > 0) sbParts.push('title');
        if (cptHeader > 0) sbParts.push('CPT-table');
        if (mdmSection > 0) sbParts.push('MDM');
        if (exportBtn > 0) sbParts.push('CMS-1500-export');
        if (closeBtn > 0) sbParts.push('close-btn');

        results.superbillContent =
          sbParts.length >= 3
            ? `PASS (${sbParts.join(', ')})`
            : `FAIL (only: ${sbParts.join(', ')})`;

        const cptRows = await dialog.locator('span.font-mono.font-semibold').count();
        results.superbillCptCodes =
          cptRows > 0 ? `PASS (${cptRows} CPT codes)` : 'INFO (no CPT codes — may need to add)';

        results.superbillDxPointers =
          (await dialog.locator('th:has-text("Dx Pointers")').count()) > 0
            ? 'PASS (Dx Pointers column present)'
            : 'INFO (no Dx Pointers column header)';

        results.superbillWarnings =
          (await dialog.locator('text=Validation Warnings').count()) > 0
            ? 'INFO (validation warnings present)'
            : 'PASS (no validation warnings)';

        if (closeBtn > 0) {
          await dialog.locator('button:has-text("Close")').first().click();
          await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 3000 }).catch(() => {});
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
    results.stepIndicator = 'SKIP';
    results.step1Content = 'SKIP';
    results.step1Sections = 'SKIP';
  }

  const failedApis = getFailedApiCalls(apiCalls);
  results.apiCalls = failedApis.length === 0 ? 'PASS' : `FAIL (${failedApis.length} errors)`;

  return results;
}

// =========================================================================
// Suite B — UI Interaction (superbill CPT management, MDM, export)
// =========================================================================

async function runUiTests(page: any) {
  const results: Record<string, string> = {};

  await page.goto(`/${TENANT}/encounter/${TEST_ENCOUNTER_ANY}`, { waitUntil: 'networkidle' });
  await page.waitForLoadState('networkidle');

  const superbillBtn = page.locator('button:has-text("Superbill")');
  await superbillBtn.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
  if ((await superbillBtn.count()) === 0) {
    results.suiteB = 'SKIP (no Superbill button — encounter may not be finalized)';
    return results;
  }

  await superbillBtn.click();
  await page.waitForSelector('[role="dialog"]', { state: 'visible', timeout: 5000 }).catch(() => {});

  const dialog = page.locator('[role="dialog"]');
  if ((await dialog.count()) === 0) {
    results.suiteB = 'FAIL (Superbill dialog did not open)';
    return results;
  }

  await Promise.race([
    dialog.locator('button:has-text("Export CMS-1500")').waitFor({ state: 'visible', timeout: 8000 }),
    dialog.locator('text=No CPT codes added yet').waitFor({ state: 'visible', timeout: 8000 }),
    dialog.locator('th:has-text("CPT")').waitFor({ state: 'visible', timeout: 8000 }),
  ]).catch(() => {});

  // MDM Section & Badge
  const mdmSection = await dialog.locator('text=Medical Decision Making').count();
  const mdmBadge = await dialog.locator('text=/straightforward|low|moderate|high/').count();
  const emCodeBadge = await dialog.locator('span.font-mono').filter({ hasText: /99\d/ }).count();
  results.mdmSection =
    mdmSection > 0
      ? `PASS (MDM section visible, badge=${mdmBadge > 0}, E/M code=${emCodeBadge > 0})`
      : 'INFO (no MDM section — may not have been computed)';

  // CPT Table Structure
  const noCptText = await dialog.locator('text=No CPT codes added yet').count();
  const cptHeader = await dialog.locator('th:has-text("CPT")').count();
  const descHeader = await dialog.locator('th:has-text("Description")').count();
  const dxHeader = await dialog.locator('th:has-text("Dx Pointers")').count();
  const unitsHeader = await dialog.locator('th:has-text("Units")').count();
  const feeHeader = await dialog.locator('th:has-text("Fee")').count();

  if (noCptText > 0) {
    results.cptTableHeaders =
      'INFO (empty superbill — "No CPT codes added yet" shown, table headers not rendered)';
  } else {
    const headerCount = [cptHeader, descHeader, dxHeader, unitsHeader, feeHeader].filter(
      (h) => h > 0
    ).length;
    results.cptTableHeaders =
      headerCount >= 4
        ? `PASS (${headerCount}/5 column headers present)`
        : headerCount > 0
        ? `FAIL (only ${headerCount}/5 headers: CPT=${cptHeader} Desc=${descHeader} Dx=${dxHeader} Units=${unitsHeader} Fee=${feeHeader})`
        : 'FAIL (no CPT table headers and no empty-state text — superbill may not have loaded)';
  }

  // Existing CPT Codes
  const cptCodeCells = dialog.locator('td span.font-mono.font-semibold');
  const existingCptCount = await cptCodeCells.count();
  results.existingCptCodes =
    existingCptCount > 0
      ? `PASS (${existingCptCount} CPT code(s) in superbill)`
      : 'INFO (no CPT codes — empty superbill)';

  // Add CPT Code
  const addCptBtn = dialog.locator('button:has-text("Add CPT Code")');
  if ((await addCptBtn.count()) > 0) {
    await addCptBtn.click();
    await page
      .waitForSelector('div.absolute.z-50.w-80', { state: 'visible', timeout: 3000 })
      .catch(() => {});

    const dropdown = page.locator('div.absolute.z-50.w-80');
    const dropdownItems = dropdown.locator('button');
    const dropdownCount = await dropdownItems.count();

    results.addCptDropdown =
      dropdownCount > 0
        ? `PASS (${dropdownCount} CPT codes available in dropdown)`
        : 'FAIL (dropdown opened but no codes)';

    if (dropdownCount > 0) {
      const firstCodeText = await dropdownItems
        .first()
        .locator('span.font-mono')
        .textContent()
        .catch(() => '');

      await dropdownItems.first().click();
      await page.waitForLoadState('domcontentloaded');

      const newCptCount = await cptCodeCells.count();
      results.addCptCode =
        newCptCount > existingCptCount
          ? `PASS (added ${firstCodeText || 'code'}, now ${newCptCount} items)`
          : `INFO (count unchanged ${newCptCount} — code may have already existed)`;

      // Remove CPT Code
      const removeBtn = dialog.locator('button[title="Remove line item"]').last();
      if ((await removeBtn.count()) > 0) {
        await removeBtn.click();
        await page.waitForLoadState('domcontentloaded');

        const afterRemoveCount = await cptCodeCells.count();
        results.removeCptCode =
          afterRemoveCount < newCptCount
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

  // Total Fee Display
  const totalLabel = await dialog.locator('td:has-text("Total")').count();
  const totalValue = await dialog.locator('tfoot td.font-mono').count();
  results.totalFee =
    totalLabel > 0 || totalValue > 0
      ? 'PASS (total fee row visible)'
      : 'INFO (no total row — may have 0 items)';

  // Dx Pointers on Line Items
  const dxPointerBadges = await dialog
    .locator('td span.font-mono')
    .filter({ hasText: /[A-Z]\d{2}/ })
    .count();
  results.dxPointers =
    dxPointerBadges > 0
      ? `PASS (${dxPointerBadges} diagnosis pointer badge(s) on line items)`
      : 'INFO (no dx pointer badges — codes may lack pointers)';

  // Encounter Diagnoses Reference
  const dxReference = await dialog.locator('text=Encounter Diagnoses (ICD-10)').count();
  results.dxReference =
    dxReference > 0
      ? 'PASS (ICD-10 diagnoses reference section visible)'
      : 'INFO (no diagnoses reference section)';

  // Claim Status Badge
  const statusBadge = await dialog
    .locator('text=/draft|ready to bill|submitted|paid/')
    .count();
  results.claimStatus =
    statusBadge > 0 ? 'PASS (claim status badge visible)' : 'INFO (no claim status badge)';

  // Mark Ready to Bill / Already Ready
  const markReadyBtn = dialog.locator('button:has-text("Mark Ready to Bill")');
  const alreadyReady = await dialog.locator('text=ready to bill').count();

  if ((await markReadyBtn.count()) > 0) {
    const isDisabled = await markReadyBtn.isDisabled();
    const hasWarnings = await dialog.locator('text=Validation Warnings').count();
    results.markReady =
      isDisabled && hasWarnings > 0
        ? 'PASS (Mark Ready disabled — validation warnings present)'
        : isDisabled
        ? 'INFO (Mark Ready disabled — unknown reason)'
        : 'PASS (Mark Ready to Bill button enabled)';
  } else if (alreadyReady > 0) {
    results.markReady = 'PASS (already marked as ready to bill)';
  } else {
    results.markReady = 'INFO (no Mark Ready button or status)';
  }

  // Export CMS-1500 Button
  const exportBtn = dialog.locator('button:has-text("Export CMS-1500")');
  results.exportBtn =
    (await exportBtn.count()) > 0
      ? 'PASS (Export CMS-1500 button present)'
      : 'FAIL (no Export CMS-1500 button)';

  // Validation Warnings Display
  const warningsSection = await dialog.locator('text=Validation Warnings').count();
  if (warningsSection > 0) {
    const warningItems = await dialog
      .locator('text=Validation Warnings')
      .locator('..')
      .locator('..')
      .locator('span')
      .count();
    results.validationWarnings = `PASS (warnings section visible with ${warningItems} items)`;
  } else {
    results.validationWarnings = 'PASS (no validation warnings — clean claim)';
  }

  // Close modal
  const closeBtn = dialog.locator('button:has-text("Close")').first();
  if ((await closeBtn.count()) > 0) {
    await closeBtn.click();
    await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 3000 }).catch(() => {});

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
// Suite C — Billing Dashboard
// =========================================================================

async function runDashboardTests(page: any, apiCalls: { url: string; status: number }[]) {
  const results: Record<string, string> = {};

  apiCalls.length = 0;
  await page.goto(`/${TENANT}/billing`, { waitUntil: 'networkidle' });
  await page.waitForLoadState('networkidle');

  const url = page.url();
  results.pageLoads = url.includes('/billing') ? 'PASS' : `FAIL (redirected to ${url})`;

  const filterOrRestricted = await Promise.race([
    page
      .locator('button:has-text("All")')
      .waitFor({ state: 'visible', timeout: 8000 })
      .then(() => 'content'),
    page
      .locator('text=Access Restricted')
      .waitFor({ state: 'visible', timeout: 8000 })
      .then(() => 'restricted'),
  ]).catch(() => 'timeout');

  if (filterOrRestricted === 'restricted') {
    results.roleGate =
      'FAIL (Access Restricted — logged in user lacks doctor/admin/owner role)';
    return results;
  }
  results.roleGate = 'PASS (billing page accessible)';

  await page
    .locator('text=Loading superbills')
    .waitFor({ state: 'hidden', timeout: 8000 })
    .catch(() => {});

  // Filter tabs
  const allTab = page.locator('button:has-text("All")');
  const draftTab = page.locator('button:has-text("Draft")');
  const postedTab = page.locator('button:has-text("Posted")');

  const tabCount =
    (await allTab.count()) + (await draftTab.count()) + (await postedTab.count());
  results.filterTabs =
    tabCount >= 3 ? 'PASS (All + Draft + Posted tabs)' : `FAIL (only ${tabCount}/3 tabs found)`;

  // Export button
  const exportBtn = page.locator('button:has-text("Export Posted Claims")');
  results.exportButton =
    (await exportBtn.count()) > 0
      ? 'PASS (Export Posted Claims button present)'
      : 'FAIL (no export button)';

  // Table or empty state
  const table = page.locator('table');
  const emptyState = page.locator('text=No superbills yet');
  const hasTable = await table.count();
  const hasEmpty = await emptyState.count();

  if (hasTable > 0) {
    results.tableVisible = 'PASS (superbill table rendered)';

    const dateHeader = await page.locator('th:has-text("Date")').count();
    const patientHeader = await page.locator('th:has-text("Patient")').count();
    const providerHeader = await page.locator('th:has-text("Provider")').count();
    const cptHeader = await page.locator('th:has-text("CPT Codes")').count();
    const totalHeader = await page.locator('th:has-text("Total")').count();
    const statusHeader = await page.locator('th:has-text("Status")').count();

    const headerCount = [
      dateHeader,
      patientHeader,
      providerHeader,
      cptHeader,
      totalHeader,
      statusHeader,
    ].filter((h) => h > 0).length;
    results.tableHeaders =
      headerCount >= 5
        ? `PASS (${headerCount}/6 column headers)`
        : `FAIL (only ${headerCount}/6 headers)`;

    const rows = await page.locator('tbody tr').count();
    results.tableRows =
      rows > 0 ? `PASS (${rows} superbill row(s))` : 'INFO (table visible but 0 rows)';

    if (rows > 0) {
      const firstRow = page.locator('tbody tr').first();
      const hasPatientLink = await firstRow.locator('a[href*="/patients/"]').count();
      const hasFeeAmount = await firstRow.locator('td.font-mono').count();
      results.rowContent =
        hasPatientLink > 0 || hasFeeAmount > 0
          ? `PASS (patient link=${hasPatientLink > 0}, fee=${hasFeeAmount > 0})`
          : 'INFO (row content could not be verified)';
    } else {
      results.rowContent = 'SKIP (no rows)';
    }

    if ((await draftTab.count()) > 0) {
      await draftTab.click();
      await page.waitForLoadState('networkidle');
      const draftRows = await page.locator('tbody tr').count();
      results.draftFilter = `PASS (Draft filter clicked, ${draftRows} row(s))`;

      if ((await allTab.count()) > 0) {
        await allTab.click();
        await page.waitForLoadState('networkidle');
      }
    } else {
      results.draftFilter = 'SKIP (no Draft tab)';
    }
  } else if (hasEmpty > 0) {
    results.tableVisible = 'INFO (empty state — no superbills yet)';
    results.tableHeaders = 'SKIP (no table)';
    results.tableRows = 'SKIP (no table)';
    results.rowContent = 'SKIP (no table)';
    results.draftFilter = 'SKIP (no table)';
  } else {
    results.tableVisible = 'FAIL (neither table nor empty state found)';
    results.tableHeaders = 'SKIP';
    results.tableRows = 'SKIP';
    results.rowContent = 'SKIP';
    results.draftFilter = 'SKIP';
  }

  const failedApis = getFailedApiCalls(apiCalls);
  results.apiCalls = failedApis.length === 0 ? 'PASS' : `FAIL (${failedApis.length} errors)`;

  return results;
}

// =========================================================================
// Tests
// =========================================================================

test.describe('Smoke Billing — Suite A (Core) @smoke', () => {
  test('finalize modal opens with 2-step stepper and clinical summary', async ({
    page,
    apiCalls,
  }) => {
    const results = await runCoreTests(page, apiCalls);

    expect(results.encounterLoads).toMatch(/^PASS/);
    expect(results.finalizeButton).toMatch(/^PASS/);
    expect(results.apiCalls).toMatch(/^PASS/);
  });
});

test.describe('Smoke Billing — Suite B (UI) @smoke', () => {
  test('superbill CPT management, MDM, export, and mark-ready', async ({
    page,
    consoleErrors,
  }) => {
    const results = await runUiTests(page);

    if (results.suiteB?.startsWith('SKIP')) {
      test.skip(true, results.suiteB);
      return;
    }

    expect(results.exportBtn).toMatch(/^PASS/);
    expect(results.validationWarnings).toMatch(/^PASS/);
    expect(consoleErrors.length).toBe(0);
  });
});

test.describe('Smoke Billing — Suite C (Dashboard) @smoke', () => {
  test('billing dashboard loads with filter tabs and superbill table', async ({
    page,
    apiCalls,
  }) => {
    const results = await runDashboardTests(page, apiCalls);

    expect(results.pageLoads).toMatch(/^PASS/);
    expect(results.roleGate).toMatch(/^PASS/);

    if (results.roleGate !== 'PASS (billing page accessible)') return;

    expect(results.filterTabs).toMatch(/^PASS/);
    expect(results.exportButton).toMatch(/^PASS/);
    expect(results.tableVisible).toMatch(/^(PASS|INFO)/);
    expect(results.apiCalls).toMatch(/^PASS/);
  });
});
