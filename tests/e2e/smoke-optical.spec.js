/**
 * smoke-optical.spec.js — Phase 6: Optical Handoff E2E verification
 *
 * Suite A (Core): optical queue loads, cards show patient/Rx data,
 *                 Rx change alert, print preview, status badges.
 * Suite B (UI):   date navigation (prev/next/today), full status progression
 *                 (waiting → in_progress → dispensed), print modal lifecycle,
 *                 card content deep-check.
 *
 * Run: bash scripts/dev.sh verify tests/e2e/smoke-optical.spec.js
 */
const { ensureApi, launchBrowser, loginOrRestore, setupTracking, getFailedApiCalls, printResults, TARGET_URL } = require('./helpers/test-utils');

// =========================================================================
// Suite A — Core Functionality (existing tests)
// =========================================================================

async function runCoreTests(page, slug, apiCalls) {
  const results = {};

  apiCalls.length = 0;
  await page.goto(`${TARGET_URL}/${slug}/optical`, { waitUntil: 'networkidle' });
  await page.waitForLoadState('networkidle');

  const pageTitle = await page.locator('h1, h2').first().textContent().catch(() => '');
  results.opticalPageLoads = pageTitle ? `PASS ("${pageTitle.trim()}")` : 'FAIL (no page title)';
  await page.screenshot({ path: '/tmp/pw-e2e-optical-queue.png', fullPage: true });

  // Date navigation
  const dateInput = page.locator('input[type="date"]');
  const hasPrev = await page.locator('button[title="Previous day"]').count();
  const hasNext = await page.locator('button[title="Next day"]').count();
  const hasToday = await page.locator('button:has-text("Today")').count();
  const hasDateInput = await dateInput.count();

  results.dateNavigation = (hasDateInput > 0 && hasPrev > 0 && hasNext > 0 && hasToday > 0)
    ? 'PASS (date input + prev/next/today buttons)'
    : `FAIL (date=${hasDateInput}, prev=${hasPrev}, next=${hasNext}, today=${hasToday})`;

  // Summary badges
  const totalBadge = await page.locator('text=/\\d+ total/').count();
  const emptyQueue = await page.locator('text=No patients in optical queue').count();
  results.summaryBadges = totalBadge > 0
    ? 'PASS (total badge visible)'
    : emptyQueue > 0
      ? 'PASS (no badge expected — empty queue)'
      : 'FAIL (no total badge and no empty state)';

  // Queue cards or empty state
  const queueCards = page.locator('div.glass-card.glass-card-hover');
  const cardCount = await queueCards.count();
  const emptyState = await page.locator('text=No patients in optical queue').count();

  if (cardCount > 0) {
    results.queueContent = `PASS (${cardCount} cards)`;

    const firstCard = queueCards.first();

    const cardTitle = await firstCard.locator('h3, [class*="CardTitle"]').first().textContent().catch(() => '');
    results.cardPatientName = cardTitle && cardTitle.trim().length > 0
      ? `PASS ("${cardTitle.trim()}")`
      : 'FAIL (no patient name)';

    const hasCardTable = await firstCard.locator('table').count();
    const odCell = await firstCard.locator('td:has-text("OD")').count();
    const osCell = await firstCard.locator('td:has-text("OS")').count();
    results.cardRxTable = (hasCardTable > 0 && odCell > 0 && osCell > 0)
      ? 'PASS (table with OD/OS rows)'
      : `FAIL (table=${hasCardTable}, OD=${odCell}, OS=${osCell})`;

    const printBtn = firstCard.locator('button:has-text("Print Rx")');
    const hasPrintBtn = await printBtn.count();
    results.cardPrintBtn = hasPrintBtn > 0 ? 'PASS' : 'FAIL (no Print Rx button)';

    const hasStatusBadge = await firstCard.locator('text=/Waiting|In Progress|Dispensed/').count();
    const hasStatusBtn = await firstCard.locator('button:has-text(/Start Processing|Mark Dispensed/)').count();
    results.cardStatus = hasStatusBadge > 0
      ? `PASS (status badge visible${hasStatusBtn > 0 ? ' + action button' : ', dispensed'})`
      : 'FAIL (no status indicator)';

    const rxChangeAlert = await page.locator('text=Rx Changed >0.50D').count();
    results.rxChangeAlert = rxChangeAlert > 0
      ? `PASS (${rxChangeAlert} alert(s) visible)`
      : 'INFO (no Rx changes detected — may be expected)';

    await page.screenshot({ path: '/tmp/pw-e2e-optical-card.png', fullPage: true });

    // Print preview modal
    if (hasPrintBtn > 0) {
      await printBtn.click();
      await page.waitForSelector('#rx-print-area', { state: 'visible', timeout: 5000 }).catch(() => {});

      const printArea = page.locator('#rx-print-area');
      if (await printArea.count() > 0) {
        results.printPreview = 'PASS (Rx print area visible)';
        results.printTable = (await printArea.locator('table').count()) > 0 ? 'PASS (prescription table in print view)' : 'FAIL (no table)';
        results.printSignature = (await printArea.locator('text=/Prescribing Doctor|Provider/').count()) > 0 ? 'PASS' : 'INFO (no signature area text found)';
        await page.screenshot({ path: '/tmp/pw-e2e-optical-print.png', fullPage: true });

        const closeBtn = page.locator('button:has-text("Close")');
        if (await closeBtn.count() > 0) {
          await closeBtn.click();
          await page.waitForLoadState('domcontentloaded');
        }
      } else {
        results.printPreview = 'FAIL (print area not found after click)';
        results.printTable = 'SKIP';
        results.printSignature = 'SKIP';
      }
    } else {
      results.printPreview = 'SKIP (no Print Rx button)';
      results.printTable = 'SKIP';
      results.printSignature = 'SKIP';
    }

    // Status transition
    const statusBtnAfter = queueCards.first().locator('button:has-text("Start Processing")');
    if (await statusBtnAfter.count() > 0) {
      await statusBtnAfter.click();
      await page.waitForLoadState('networkidle');

      const inProgressBadge = await queueCards.first().locator('text=In Progress').count();
      const markDispensedBtn = await queueCards.first().locator('button:has-text("Mark Dispensed")').count();
      results.statusTransition = (inProgressBadge > 0 || markDispensedBtn > 0)
        ? 'PASS (waiting → in_progress)'
        : 'FAIL (status did not change)';
      await page.screenshot({ path: '/tmp/pw-e2e-optical-status.png', fullPage: true });
    } else {
      results.statusTransition = 'SKIP (no "Start Processing" button — may already be in_progress/dispensed)';
    }

  } else if (emptyState > 0) {
    results.queueContent = 'PASS (empty state displayed — no finalized encounters today)';
    results.cardPatientName = 'SKIP (empty queue)';
    results.cardRxTable = 'SKIP (empty queue)';
    results.cardPrintBtn = 'SKIP (empty queue)';
    results.cardStatus = 'SKIP (empty queue)';
    results.rxChangeAlert = 'SKIP (empty queue)';
    results.printPreview = 'SKIP (empty queue)';
    results.printTable = 'SKIP (empty queue)';
    results.printSignature = 'SKIP (empty queue)';
    results.statusTransition = 'SKIP (empty queue)';
  } else {
    results.queueContent = 'FAIL (no cards and no empty state)';
  }

  const failedApis = getFailedApiCalls(apiCalls, { exclude: [] });
  results.apiCalls = failedApis.length === 0 ? 'PASS' : `FAIL (${failedApis.length} errors)`;

  return results;
}

// =========================================================================
// Suite B — UI Interaction (date nav, full status flow, print lifecycle)
// =========================================================================

async function runUiTests(page, slug) {
  const results = {};

  await page.goto(`${TARGET_URL}/${slug}/optical`, { waitUntil: 'networkidle' });
  await page.waitForLoadState('networkidle');

  // ── 1. Date Navigation — Next Day ─────────────────────────────────────
  const dateInput = page.locator('input[type="date"]');
  if (await dateInput.count() > 0) {
    const origDate = await dateInput.inputValue();

    // Click Next
    const nextBtn = page.locator('button[title="Next day"]');
    if (await nextBtn.count() > 0) {
      await nextBtn.click();
      await page.waitForLoadState('networkidle');

      const newDate = await dateInput.inputValue();
      results.dateNavNext = newDate !== origDate
        ? `PASS (date changed: ${origDate} → ${newDate})`
        : 'FAIL (date did not change on Next)';

      // Click Previous to go back
      const prevBtn = page.locator('button[title="Previous day"]');
      if (await prevBtn.count() > 0) {
        await prevBtn.click();
        await page.waitForLoadState('networkidle');

        const backDate = await dateInput.inputValue();
        results.dateNavPrev = backDate === origDate
          ? 'PASS (Previous returned to original date)'
          : `INFO (date: ${backDate}, expected: ${origDate})`;
      } else {
        results.dateNavPrev = 'FAIL (no Previous button)';
      }
    } else {
      results.dateNavNext = 'FAIL (no Next button)';
      results.dateNavPrev = 'SKIP';
    }

    // Click Today
    const todayBtn = page.locator('button:has-text("Today")');
    if (await todayBtn.count() > 0) {
      // Navigate away first
      const nextBtn2 = page.locator('button[title="Next day"]');
      if (await nextBtn2.count() > 0) {
        await nextBtn2.click();
        await page.waitForLoadState('networkidle');
      }

      await todayBtn.click();
      await page.waitForLoadState('networkidle');

      const today = new Date().toISOString().split('T')[0];
      const currentDate = await dateInput.inputValue();
      results.dateNavToday = currentDate === today
        ? 'PASS (Today button returns to current date)'
        : `INFO (date: ${currentDate}, today: ${today})`;
    } else {
      results.dateNavToday = 'FAIL (no Today button)';
    }
  } else {
    results.dateNavNext = 'FAIL (no date input)';
    results.dateNavPrev = 'SKIP';
    results.dateNavToday = 'SKIP';
  }

  // ── 2. Full Status Progression (waiting → in_progress → dispensed) ────
  const queueCards = page.locator('div.glass-card.glass-card-hover');
  const cardCount = await queueCards.count();

  if (cardCount > 0) {
    // Find a card that's in "Waiting" status
    let targetCard = null;
    for (let i = 0; i < cardCount; i++) {
      const card = queueCards.nth(i);
      const waitingBadge = await card.locator('text=Waiting').count();
      if (waitingBadge > 0) {
        targetCard = card;
        break;
      }
    }

    if (targetCard) {
      // Step 1: Waiting → In Progress
      const startBtn = targetCard.locator('button:has-text("Start Processing")');
      if (await startBtn.count() > 0) {
        await startBtn.click();
        await page.waitForLoadState('networkidle');

        const inProgress = await targetCard.locator('text=In Progress').count();
        results.statusWaitingToInProgress = inProgress > 0
          ? 'PASS (Waiting → In Progress)'
          : 'FAIL (status did not change to In Progress)';

        // Step 2: In Progress → Dispensed
        const dispensedBtn = targetCard.locator('button:has-text("Mark Dispensed")');
        if (await dispensedBtn.count() > 0) {
          await dispensedBtn.click();
          await page.waitForLoadState('networkidle');

          const dispensed = await targetCard.locator('text=Dispensed').count();
          results.statusInProgressToDispensed = dispensed > 0
            ? 'PASS (In Progress → Dispensed)'
            : 'FAIL (status did not change to Dispensed)';

          // Verify no more action buttons
          const noMoreBtns = (await targetCard.locator('button:has-text(/Start Processing|Mark Dispensed/)').count()) === 0;
          results.statusFinalNoButtons = noMoreBtns
            ? 'PASS (no action buttons on dispensed card)'
            : 'INFO (action buttons still visible on dispensed card)';
        } else {
          results.statusInProgressToDispensed = 'FAIL (no "Mark Dispensed" button after transition)';
          results.statusFinalNoButtons = 'SKIP';
        }
      } else {
        results.statusWaitingToInProgress = 'FAIL (no "Start Processing" on waiting card)';
        results.statusInProgressToDispensed = 'SKIP';
        results.statusFinalNoButtons = 'SKIP';
      }
    } else {
      // Try finding an In Progress card instead
      let inProgressCard = null;
      for (let i = 0; i < cardCount; i++) {
        const card = queueCards.nth(i);
        const ipBadge = await card.locator('text=In Progress').count();
        if (ipBadge > 0) {
          inProgressCard = card;
          break;
        }
      }

      if (inProgressCard) {
        results.statusWaitingToInProgress = 'SKIP (no Waiting cards — found In Progress)';

        const dispensedBtn = inProgressCard.locator('button:has-text("Mark Dispensed")');
        if (await dispensedBtn.count() > 0) {
          await dispensedBtn.click();
          await page.waitForLoadState('networkidle');

          const dispensed = await inProgressCard.locator('text=Dispensed').count();
          results.statusInProgressToDispensed = dispensed > 0
            ? 'PASS (In Progress → Dispensed)'
            : 'FAIL (status did not change)';
          results.statusFinalNoButtons = 'SKIP';
        } else {
          results.statusInProgressToDispensed = 'FAIL (no Mark Dispensed button)';
          results.statusFinalNoButtons = 'SKIP';
        }
      } else {
        results.statusWaitingToInProgress = 'SKIP (all cards already dispensed or no cards)';
        results.statusInProgressToDispensed = 'SKIP';
        results.statusFinalNoButtons = 'SKIP';
      }
    }

    // ── 3. Print Modal Lifecycle ──────────────────────────────────────────
    const anyPrintBtn = queueCards.first().locator('button:has-text("Print Rx")');
    if (await anyPrintBtn.count() > 0) {
      await anyPrintBtn.click();
      await page.waitForSelector('#rx-print-area', { state: 'visible', timeout: 5000 }).catch(() => {});

      const printArea = page.locator('#rx-print-area');
      if (await printArea.count() > 0) {
        // Check print area has OD/OS table
        const printTable = await printArea.locator('table').count();
        const printOd = await printArea.locator('text=OD').count();
        const printOs = await printArea.locator('text=OS').count();

        results.printModalContent = (printTable > 0 && printOd > 0 && printOs > 0)
          ? 'PASS (print preview has table + OD/OS)'
          : `FAIL (table=${printTable}, OD=${printOd}, OS=${printOs})`;

        // Close print modal
        const closeBtn = page.locator('button:has-text("Close")');
        if (await closeBtn.count() > 0) {
          await closeBtn.click();
          await page.waitForLoadState('domcontentloaded');

          const printGone = (await printArea.count()) === 0;
          results.printModalClose = printGone
            ? 'PASS (print modal closed)'
            : 'FAIL (print area still visible after Close)';
        } else {
          results.printModalClose = 'FAIL (no Close button)';
        }
      } else {
        results.printModalContent = 'FAIL (no #rx-print-area)';
        results.printModalClose = 'SKIP';
      }
    } else {
      results.printModalContent = 'SKIP (no Print Rx button)';
      results.printModalClose = 'SKIP';
    }

    // ── 4. Card Deep Content Check ────────────────────────────────────────
    const firstCard = queueCards.first();

    // Provider name
    const providerText = await firstCard.locator('text=/Dr\\.|Provider/').count();
    results.cardProviderName = providerText > 0
      ? 'PASS (provider name visible on card)'
      : 'INFO (no provider text visible)';

    // Rx values in table (Sph/Cyl/Axis columns)
    const rxTableHeaders = await firstCard.locator('th:has-text(/Sph|Cyl|Axis|Add/)').count();
    results.cardRxColumns = rxTableHeaders > 0
      ? `PASS (${rxTableHeaders} Rx column headers)`
      : 'INFO (no Rx column headers in card table)';

  } else {
    results.statusWaitingToInProgress = 'SKIP (empty queue)';
    results.statusInProgressToDispensed = 'SKIP (empty queue)';
    results.statusFinalNoButtons = 'SKIP (empty queue)';
    results.printModalContent = 'SKIP (empty queue)';
    results.printModalClose = 'SKIP (empty queue)';
    results.cardProviderName = 'SKIP (empty queue)';
    results.cardRxColumns = 'SKIP (empty queue)';
  }

  await page.screenshot({ path: '/tmp/pw-e2e-optical-ui-end.png', fullPage: true });

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

  // Suite A — Core
  console.log('\n--- Suite A: Core ---');
  const coreResults = await runCoreTests(page, slug, apiCalls);
  printResults('Smoke Optical — Suite A (Core)', coreResults);

  // Suite B — UI Interaction
  console.log('\n--- Suite B: UI Interaction ---');
  const uiResults = await runUiTests(page, slug);
  uiResults.consoleErrors = consoleErrors.length === 0 ? 'PASS' : `FAIL (${consoleErrors.length} errors)`;
  printResults('Smoke Optical — Suite B (UI)', uiResults);

  await browser.close();
})();
