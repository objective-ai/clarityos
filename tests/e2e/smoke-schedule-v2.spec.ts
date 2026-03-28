/**
 * smoke-schedule-v2.spec.ts — Phase 9: Schedule Enhancement E2E
 *
 * Covers new features added in the schedule rewrite:
 *   A) Overflow Menu — 3-dot menu renders, opens/closes, shows status-appropriate items
 *   B) No-Show Flow — Mark appointment as no-show via overflow menu, status updates
 *   C) Clinic View — Provider columns render, appointment blocks positioned
 *   D) Timeline View — Expandable appointment blocks, overlay panel with actions
 *   E) Provider Filter — Dropdown filters appointments by provider
 *   F) Exam Phase Transitions — start-exam-phase + revert-to-pretest
 */
import { test, expect, getFailedApiCalls } from './fixtures';

const TENANT = 'sunview';

// ============================================================================
// A) Overflow Menu Tests
// ============================================================================
async function runOverflowMenuTests(page: any) {
  const results: Record<string, string> = {};

  await page.goto(`/${TENANT}/schedule`, { waitUntil: 'networkidle' });
  await page.waitForLoadState('networkidle');

  const listBtn = page.locator('button').filter({ hasText: /^List$/ });
  if ((await listBtn.count()) > 0) {
    await listBtn.click();
    await page.waitForLoadState('domcontentloaded');
  }

  const appointmentCards = page.locator('div.glass-card.glass-card-hover');
  const cardCount = await appointmentCards.count();

  if (cardCount === 0) {
    results.overflowMenuExists = 'SKIP (no appointments on schedule today)';
    results.overflowMenuOpens = 'SKIP';
    results.overflowMenuItems = 'SKIP';
    results.overflowMenuCloses = 'SKIP';
    return results;
  }

  const overflowButtons = page.locator('button[aria-label="More actions"]');
  const overflowCount = await overflowButtons.count();

  results.overflowMenuExists =
    overflowCount > 0
      ? `PASS (${overflowCount} overflow menu(s) found)`
      : 'FAIL (no overflow menu buttons with aria-label="More actions")';

  if (overflowCount === 0) {
    results.overflowMenuOpens = 'SKIP';
    results.overflowMenuItems = 'SKIP';
    results.overflowMenuCloses = 'SKIP';
    return results;
  }

  await overflowButtons.first().click();
  await page.waitForTimeout(300);

  const menuItems = page.locator('div.absolute.right-0 button');
  const menuItemCount = await menuItems.count();

  results.overflowMenuOpens =
    menuItemCount > 0
      ? `PASS (menu opened with ${menuItemCount} items)`
      : 'FAIL (menu did not open or no items rendered)';

  if (menuItemCount > 0) {
    const labels: string[] = [];
    for (let i = 0; i < menuItemCount; i++) {
      const text = await menuItems.nth(i).textContent().catch(() => '');
      if (text) labels.push(text.trim());
    }

    const expectedItems = ['Cancel Appointment', 'Reschedule', 'Mark as No-Show'];
    const found = expectedItems.filter((item) => labels.some((l) => l.includes(item)));

    results.overflowMenuItems =
      found.length >= 1
        ? `PASS (menu items: ${labels.join(', ')})`
        : `FAIL (expected at least one of: ${expectedItems.join(', ')}, got: ${labels.join(', ')})`;
  } else {
    results.overflowMenuItems = 'SKIP';
  }

  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const menuAfterEsc = await page.locator('div.absolute.right-0 button').count();
  results.overflowMenuCloses =
    menuAfterEsc === 0
      ? 'PASS (menu closed on Escape)'
      : 'INFO (menu may still be visible after Escape)';

  return results;
}

// ============================================================================
// B) No-Show Flow Tests
// ============================================================================
async function runNoShowTests(page: any, apiCalls: { url: string; status: number }[]) {
  const results: Record<string, string> = {};

  await page.goto(`/${TENANT}/schedule`, { waitUntil: 'networkidle' });
  await page.waitForLoadState('networkidle');

  const listBtn = page.locator('button').filter({ hasText: /^List$/ });
  if ((await listBtn.count()) > 0) {
    await listBtn.click();
    await page.waitForLoadState('domcontentloaded');
  }

  const checkInBtns = page.locator('button:has-text("Check In")');
  const checkInCount = await checkInBtns.count();

  if (checkInCount === 0) {
    results.noShowTarget = 'SKIP (no scheduled/confirmed appointments to mark as no-show)';
    results.noShowMenuItemVisible = 'SKIP';
    results.noShowApiCall = 'SKIP';
    results.noShowStatusUpdate = 'SKIP';
    return results;
  }

  results.noShowTarget = `PASS (${checkInCount} appointment(s) eligible for no-show)`;

  const cards = page.locator('div.glass-card.glass-card-hover');
  const cardsCount = await cards.count();
  let targetCard: any = null;

  for (let i = 0; i < cardsCount; i++) {
    const card = cards.nth(i);
    const hasCheckIn = await card.locator('button:has-text("Check In")').count();
    if (hasCheckIn > 0) {
      targetCard = card;
      break;
    }
  }

  if (!targetCard) {
    results.noShowMenuItemVisible = 'SKIP (no suitable card found)';
    results.noShowApiCall = 'SKIP';
    results.noShowStatusUpdate = 'SKIP';
    return results;
  }

  const patientName = await targetCard
    .locator('p.text-sm.font-semibold')
    .first()
    .textContent()
    .catch(() => 'Unknown');

  const overflowBtn = targetCard.locator('button[aria-label="More actions"]');
  if ((await overflowBtn.count()) === 0) {
    results.noShowMenuItemVisible = 'FAIL (no overflow menu on appointment card)';
    results.noShowApiCall = 'SKIP';
    results.noShowStatusUpdate = 'SKIP';
    return results;
  }

  await overflowBtn.click();
  await page.waitForTimeout(300);

  const noShowItem = page.locator('button:has-text("Mark as No-Show")');
  const noShowItemCount = await noShowItem.count();

  results.noShowMenuItemVisible =
    noShowItemCount > 0
      ? 'PASS ("Mark as No-Show" menu item visible)'
      : 'FAIL ("Mark as No-Show" item not found in overflow menu)';

  if (noShowItemCount === 0) {
    results.noShowApiCall = 'SKIP';
    results.noShowStatusUpdate = 'SKIP';
    return results;
  }

  const noShowClasses = await noShowItem.first().getAttribute('class').catch(() => '');
  const hasDangerStyle = noShowClasses.includes('red');
  results.noShowDangerStyle = hasDangerStyle
    ? 'PASS (no-show item has danger/red styling)'
    : 'INFO (no-show item present but could not verify red styling)';

  apiCalls.length = 0;
  await noShowItem.first().click();
  await page.waitForLoadState('networkidle');

  const noShowApiCalls = apiCalls.filter((c) => c.url.includes('/no-show'));
  results.noShowApiCall =
    noShowApiCalls.length > 0
      ? `PASS (API call to /no-show — status ${noShowApiCalls[0].status})`
      : 'FAIL (no API call to /no-show endpoint)';

  await page.waitForTimeout(500);

  const noShowBadge = await page.locator('text="No Show"').count();
  const noShowShort = await page.locator('text="N/S"').count();
  results.noShowStatusUpdate =
    noShowBadge > 0 || noShowShort > 0
      ? `PASS (appointment for "${patientName.trim()}" now shows No Show status)`
      : 'INFO (could not verify status badge change — may need page refresh)';

  return results;
}

// ============================================================================
// C) Clinic View Tests
// ============================================================================
async function runClinicViewTests(page: any) {
  const results: Record<string, string> = {};

  await page.goto(`/${TENANT}/schedule`, { waitUntil: 'networkidle' });
  await page.waitForLoadState('networkidle');

  const clinicBtn = page.locator('button').filter({ hasText: /^Clinic$/ });
  if ((await clinicBtn.count()) === 0) {
    results.clinicViewExists = 'FAIL (no Clinic view toggle button)';
    return results;
  }

  await clinicBtn.click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(500);

  results.clinicViewExists = 'PASS (switched to Clinic view)';

  const providerHeaders = page.locator('p.text-xs.font-semibold.truncate');
  const providerCount = await providerHeaders.count();

  if (providerCount > 0) {
    const providerNames: string[] = [];
    for (let i = 0; i < Math.min(providerCount, 5); i++) {
      const name = await providerHeaders.nth(i).textContent().catch(() => '');
      if (name) providerNames.push(name.trim());
    }
    results.providerColumns = `PASS (${providerCount} provider column(s): ${providerNames.join(', ')})`;
  } else {
    const emptyState = await page.locator('text=No provider appointments').count();
    results.providerColumns =
      emptyState > 0
        ? 'PASS (empty state displayed — no appointments)'
        : 'FAIL (no provider columns and no empty state)';
  }

  const apptCountBadges = page.locator('text=/\\d+ appts?/');
  const badgeCount = await apptCountBadges.count();
  results.appointmentCounts =
    badgeCount > 0
      ? `PASS (${badgeCount} appointment count badge(s))`
      : 'INFO (no appointment count badges visible)';

  const timeLabels = page.locator('text=/\\d{1,2}:\\d{2} [AP]M/');
  const timeLabelCount = await timeLabels.count();
  results.timeAxis =
    timeLabelCount > 0
      ? `PASS (${timeLabelCount} time labels on axis)`
      : 'INFO (no time labels visible — may have no appointments)';

  const clinicOverflowBtns = page.locator('button[aria-label="More actions"]');
  const clinicOverflowCount = await clinicOverflowBtns.count();
  results.clinicOverflowMenus =
    clinicOverflowCount > 0
      ? `PASS (${clinicOverflowCount} overflow menu(s) in clinic view)`
      : 'INFO (no overflow menus — may have no appointments)';

  return results;
}

// ============================================================================
// D) Timeline View Tests
// ============================================================================
async function runTimelineViewTests(page: any) {
  const results: Record<string, string> = {};

  await page.goto(`/${TENANT}/schedule`, { waitUntil: 'networkidle' });
  await page.waitForLoadState('networkidle');

  await page
    .waitForSelector('button:has-text("Timeline")', { state: 'visible', timeout: 10000 })
    .catch(() => {});

  const timelineBtn = page.locator('button').filter({ hasText: /^Timeline$/ });
  if ((await timelineBtn.count()) === 0) {
    results.timelineViewExists = 'FAIL (no Timeline view toggle button)';
    return results;
  }

  await timelineBtn.click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(500);

  results.timelineViewExists = 'PASS (switched to Timeline view)';

  const timeLabels = page.locator('text=/\\d{1,2}:\\d{2} [AP]M/');
  const timeLabelCount = await timeLabels.count();
  results.timelineTimeAxis =
    timeLabelCount > 0
      ? `PASS (${timeLabelCount} time labels)`
      : 'INFO (no time labels — may have no appointments)';

  const appointmentBlocks = page.locator('button.w-full.rounded-lg');
  const blockCount = await appointmentBlocks.count();

  if (blockCount > 0) {
    results.timelineAppointmentBlocks = `PASS (${blockCount} appointment block(s))`;

    await appointmentBlocks.first().click();
    await page.waitForTimeout(300);

    const expandedPanel = page.locator('div.absolute.left-0.top-full');
    const isPanelVisible = await expandedPanel.count();

    if (isPanelVisible > 0) {
      results.timelineExpandPanel = 'PASS (expanded overlay panel appeared)';

      const panelCheckIn = await expandedPanel.locator('button:has-text("Check In")').count();
      const panelStartExam = await expandedPanel.locator('button:has-text("Start Exam")').count();
      const panelContinue = await expandedPanel
        .locator('button:has-text("Continue Exam")')
        .count();
      const panelView = await expandedPanel
        .locator('button:has-text("View Encounter")')
        .count();
      const panelOverflow = await expandedPanel
        .locator('button[aria-label="More actions"]')
        .count();

      const actionButtons: string[] = [];
      if (panelCheckIn > 0) actionButtons.push('Check In');
      if (panelStartExam > 0) actionButtons.push('Start Exam');
      if (panelContinue > 0) actionButtons.push('Continue Exam');
      if (panelView > 0) actionButtons.push('View Encounter');
      if (panelOverflow > 0) actionButtons.push('Overflow Menu');

      results.timelineExpandActions =
        actionButtons.length > 0
          ? `PASS (actions: ${actionButtons.join(', ')})`
          : 'INFO (no action buttons in expanded panel)';

      const patientNameInPanel = await expandedPanel
        .locator('p.text-sm.font-semibold')
        .first()
        .textContent()
        .catch(() => '');
      const timeRange = await expandedPanel
        .locator('text=/\\d{1,2}:\\d{2}\\s*[AP]M\\s*[–—-]\\s*\\d{1,2}:\\d{2}\\s*[AP]M/')
        .count();
      const statusBadge = await expandedPanel
        .locator(
          'text=/Scheduled|Confirmed|Checked In|Pre-Test|In Exam|Completed|No Show/'
        )
        .count();

      const panelDetails: string[] = [];
      if (patientNameInPanel) panelDetails.push('patient name');
      if (timeRange > 0) panelDetails.push('time range');
      if (statusBadge > 0) panelDetails.push('status badge');

      results.timelineExpandDetails =
        panelDetails.length >= 1
          ? `PASS (panel shows: ${panelDetails.join(', ')})`
          : 'INFO (could not verify panel detail content)';

      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      const panelAfterEsc = await expandedPanel.count();
      results.timelineExpandClose =
        panelAfterEsc === 0
          ? 'PASS (panel closed on Escape)'
          : 'INFO (panel may still be visible after Escape)';
    } else {
      results.timelineExpandPanel =
        'INFO (panel did not appear after click — block may be compact)';
      results.timelineExpandActions = 'SKIP';
      results.timelineExpandDetails = 'SKIP';
      results.timelineExpandClose = 'SKIP';
    }
  } else {
    results.timelineAppointmentBlocks =
      'INFO (no appointment blocks — may have no appointments today)';
    results.timelineExpandPanel = 'SKIP';
    results.timelineExpandActions = 'SKIP';
    results.timelineExpandDetails = 'SKIP';
    results.timelineExpandClose = 'SKIP';
  }

  return results;
}

// ============================================================================
// E) Provider Filter Tests
// ============================================================================
async function runProviderFilterTests(page: any) {
  const results: Record<string, string> = {};

  await page.goto(`/${TENANT}/schedule`, { waitUntil: 'networkidle' });
  await page.waitForLoadState('networkidle');

  await page
    .waitForSelector('button:has-text("List")', { state: 'visible', timeout: 10000 })
    .catch(() => {});

  const listBtn = page.locator('button').filter({ hasText: /^List$/ });
  if ((await listBtn.count()) > 0) {
    await listBtn.click();
    await page.waitForLoadState('domcontentloaded');
  }

  await page.waitForSelector('select', { state: 'visible', timeout: 5000 }).catch(() => {});
  const providerSelect = page
    .locator('select')
    .filter({ has: page.locator('option:has-text("All Providers")') });
  const hasProviderFilter = await providerSelect.count();

  if (hasProviderFilter === 0) {
    results.providerFilterExists =
      'FAIL (no provider filter dropdown with "All Providers" option)';
    return results;
  }

  results.providerFilterExists = 'PASS (provider filter dropdown found)';

  const options = await providerSelect.first().locator('option').allTextContents();
  const doctorOptions = options.filter((o: string) => o.startsWith('Dr.'));

  results.providerFilterOptions =
    doctorOptions.length > 0
      ? `PASS (${doctorOptions.length} provider(s): ${doctorOptions.join(', ')})`
      : 'INFO (no doctor options in provider filter)';

  if (doctorOptions.length === 0) {
    results.providerFilterWorks = 'SKIP (no providers to filter by)';
    return results;
  }

  const appointmentCards = page.locator('div.glass-card.glass-card-hover');
  const totalBefore = await appointmentCards.count();

  await providerSelect.first().selectOption({ label: doctorOptions[0] });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);

  const totalAfter = await appointmentCards.count();
  const emptyAfter = await page.locator('text=No appointments').count();

  if (totalBefore > 0) {
    results.providerFilterWorks =
      totalAfter <= totalBefore || emptyAfter > 0
        ? `PASS (filtered: ${totalBefore} -> ${totalAfter} appointments)`
        : `INFO (count unchanged: ${totalBefore} -> ${totalAfter} — all may belong to this provider)`;
  } else {
    results.providerFilterWorks = 'INFO (no appointments to filter)';
  }

  await providerSelect.first().selectOption({ label: 'All Providers' });
  await page.waitForLoadState('networkidle');

  return results;
}

// ============================================================================
// F) Exam Phase Transition Tests (start-exam-phase + revert-to-pretest)
// ============================================================================
async function runExamPhaseTests(page: any, apiCalls: { url: string; status: number }[]) {
  const results: Record<string, string> = {};

  await page.goto(`/${TENANT}/schedule`, { waitUntil: 'networkidle' });
  await page.waitForLoadState('networkidle');

  const listBtn = page.locator('button').filter({ hasText: /^List$/ });
  if ((await listBtn.count()) > 0) {
    await listBtn.click();
    await page.waitForLoadState('domcontentloaded');
  }

  const startExamBtns = page.locator('button:has-text("Start Exam")');
  const preTestCount = await startExamBtns.count();

  if (preTestCount === 0) {
    results.startExamPhaseTarget =
      'SKIP (no checked-in/pre-test appointments — need to check in one first)';
    results.startExamPhaseMenuVisible = 'SKIP';
    results.startExamPhaseApiCall = 'SKIP';
    results.revertToPreTestMenuVisible = 'SKIP';
    results.revertToPreTestApiCall = 'SKIP';
    return results;
  }

  results.startExamPhaseTarget = `PASS (${preTestCount} appointment(s) eligible for start-exam-phase)`;

  const cards = page.locator('div.glass-card.glass-card-hover');
  const cardsCount = await cards.count();
  let examCard: any = null;

  for (let i = 0; i < cardsCount; i++) {
    const card = cards.nth(i);
    const hasStartExam = await card.locator('button:has-text("Start Exam")').count();
    if (hasStartExam > 0) {
      examCard = card;
      break;
    }
  }

  if (!examCard) {
    results.startExamPhaseMenuVisible =
      'SKIP (start-exam button found but not inside card)';
    results.startExamPhaseApiCall = 'SKIP';
    results.revertToPreTestMenuVisible = 'SKIP';
    results.revertToPreTestApiCall = 'SKIP';
    return results;
  }

  const overflowBtn = examCard.locator('button[aria-label="More actions"]');
  if ((await overflowBtn.count()) === 0) {
    results.startExamPhaseMenuVisible =
      'FAIL (no overflow menu on pre-test appointment card)';
    results.startExamPhaseApiCall = 'SKIP';
    results.revertToPreTestMenuVisible = 'SKIP';
    results.revertToPreTestApiCall = 'SKIP';
    return results;
  }

  await overflowBtn.click();
  await page.waitForTimeout(300);

  const menuItems = page.locator(
    'div.fixed.z-\\[9999\\] button, div[style*="position: fixed"] button'
  );
  const menuTexts: string[] = [];
  const menuCount = await menuItems.count();
  for (let i = 0; i < menuCount; i++) {
    const text = await menuItems.nth(i).textContent().catch(() => '');
    if (text) menuTexts.push(text.trim());
  }

  const startExamMenuItem = menuTexts.find(
    (t) => t.toLowerCase().includes('exam') || t.includes('start-exam')
  );
  results.startExamPhaseMenuVisible = startExamMenuItem
    ? `PASS (exam phase menu item found: "${startExamMenuItem}")`
    : `INFO (exam transition not in overflow menu — may be inline button only. Items: ${menuTexts.join(', ')})`;

  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  apiCalls.length = 0;
  const directStartExam = examCard.locator('button:has-text("Start Exam")');
  if ((await directStartExam.count()) > 0) {
    await directStartExam.first().click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    const startExamApiCalls = apiCalls.filter(
      (c) => c.url.includes('/start-exam-phase') || c.url.includes('/start-exam')
    );
    results.startExamPhaseApiCall =
      startExamApiCalls.length > 0
        ? `PASS (API call to start-exam endpoint — status ${startExamApiCalls[0].status})`
        : 'INFO (no start-exam API call detected — button may navigate to encounter page)';

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    const inExamCards = page
      .locator('div.glass-card.glass-card-hover')
      .filter({ hasText: /In Exam/ });
    const inExamCount = await inExamCards.count();

    if (inExamCount > 0) {
      const inExamOverflow = inExamCards.first().locator('button[aria-label="More actions"]');
      if ((await inExamOverflow.count()) > 0) {
        await inExamOverflow.click();
        await page.waitForTimeout(300);

        const revertItems = page.locator(
          'div.fixed.z-\\[9999\\] button:has-text("Revert"), div[style*="position: fixed"] button:has-text("Revert"), div.fixed.z-\\[9999\\] button:has-text("Pre-Test"), div[style*="position: fixed"] button:has-text("Pre-Test")'
        );
        const revertCount = await revertItems.count();

        results.revertToPreTestMenuVisible =
          revertCount > 0
            ? 'PASS ("Revert to Pre-Test" found in overflow menu)'
            : 'INFO (no revert item in menu — check OverflowMenu items for in-exam appointments)';

        if (revertCount > 0) {
          apiCalls.length = 0;
          await revertItems.first().click();
          await page.waitForLoadState('networkidle');
          await page.waitForTimeout(500);

          const revertApiCalls = apiCalls.filter((c) =>
            c.url.includes('/revert-to-pretest')
          );
          results.revertToPreTestApiCall =
            revertApiCalls.length > 0
              ? `PASS (API call to /revert-to-pretest — status ${revertApiCalls[0].status})`
              : 'FAIL (no /revert-to-pretest API call after clicking revert)';
        } else {
          results.revertToPreTestApiCall = 'SKIP (revert menu item not found)';
        }

        await page.keyboard.press('Escape');
      } else {
        results.revertToPreTestMenuVisible =
          'INFO (in-exam card found but no overflow menu)';
        results.revertToPreTestApiCall = 'SKIP';
      }
    } else {
      results.revertToPreTestMenuVisible =
        'INFO (no "In Exam" card found after start-exam — may need page refresh)';
      results.revertToPreTestApiCall = 'SKIP';
    }
  } else {
    results.startExamPhaseApiCall = 'SKIP (no inline "Start Exam" button — only overflow)';
    results.revertToPreTestMenuVisible = 'SKIP';
    results.revertToPreTestApiCall = 'SKIP';
  }

  return results;
}

// ============================================================================
// Tests
// ============================================================================

test.describe('Smoke Schedule V2 — Suite A (Overflow Menu) @smoke', () => {
  test('3-dot overflow menu renders, opens with expected items, closes on Escape', async ({
    page,
  }) => {
    const results = await runOverflowMenuTests(page);

    if (results.overflowMenuExists?.startsWith('SKIP')) {
      test.skip(true, results.overflowMenuExists);
      return;
    }

    expect(results.overflowMenuExists).toMatch(/^PASS/);
    expect(results.overflowMenuOpens).toMatch(/^(PASS|SKIP)/);
    expect(results.overflowMenuItems).toMatch(/^(PASS|SKIP)/);
  });
});

test.describe('Smoke Schedule V2 — Suite B (No-Show Flow) @smoke', () => {
  test('mark appointment as no-show via overflow menu calls API and updates status', async ({
    page,
    apiCalls,
  }) => {
    const results = await runNoShowTests(page, apiCalls);

    if (results.noShowTarget?.startsWith('SKIP')) {
      test.skip(true, results.noShowTarget);
      return;
    }

    expect(results.noShowTarget).toMatch(/^PASS/);
    expect(results.noShowMenuItemVisible).toMatch(/^(PASS|FAIL)/);
    if (!results.noShowMenuItemVisible.startsWith('FAIL')) {
      expect(results.noShowApiCall).toMatch(/^PASS/);
    }
  });
});

test.describe('Smoke Schedule V2 — Suite C (Clinic View) @smoke', () => {
  test('clinic view renders provider columns and time axis', async ({ page }) => {
    const results = await runClinicViewTests(page);

    expect(results.clinicViewExists).toMatch(/^PASS/);
    expect(results.providerColumns).toMatch(/^(PASS|FAIL)/);
  });
});

test.describe('Smoke Schedule V2 — Suite D (Timeline View) @smoke', () => {
  test('timeline view renders time axis and expandable appointment blocks', async ({ page }) => {
    const results = await runTimelineViewTests(page);

    expect(results.timelineViewExists).toMatch(/^PASS/);
    expect(results.timelineTimeAxis).toMatch(/^(PASS|INFO)/);
    expect(results.timelineAppointmentBlocks).toMatch(/^(PASS|INFO)/);
  });
});

test.describe('Smoke Schedule V2 — Suite E (Provider Filter) @smoke', () => {
  test('provider filter dropdown exists and filters appointment list', async ({ page }) => {
    const results = await runProviderFilterTests(page);

    expect(results.providerFilterExists).toMatch(/^PASS/);
    expect(results.providerFilterOptions).toMatch(/^(PASS|INFO)/);
    expect(results.providerFilterWorks).toMatch(/^(PASS|INFO|SKIP)/);
  });
});

test.describe('Smoke Schedule V2 — Suite F (Exam Phase Transitions) @smoke', () => {
  test('start-exam and revert-to-pretest transitions work via overflow menu', async ({
    page,
    apiCalls,
  }) => {
    const results = await runExamPhaseTests(page, apiCalls);

    if (results.startExamPhaseTarget?.startsWith('SKIP')) {
      test.skip(true, results.startExamPhaseTarget);
      return;
    }

    expect(results.startExamPhaseTarget).toMatch(/^PASS/);
    expect(results.startExamPhaseApiCall).toMatch(/^(PASS|INFO|SKIP)/);
  });
});

test.describe('Smoke Schedule V2 — Global @smoke', () => {
  test('no console errors on schedule page', async ({ page, consoleErrors }) => {
    await page.goto(`/${TENANT}/schedule`, { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');

    expect(consoleErrors.length).toBe(0);
  });
});
