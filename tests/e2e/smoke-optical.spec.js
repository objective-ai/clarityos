/**
 * smoke-optical.spec.js — Phase 6: Optical Handoff E2E verification
 *
 * Verifies: optical queue loads, cards show patient/Rx data, Rx change alert,
 * print preview modal, status transitions.
 * Run: bash scripts/dev.sh verify tests/e2e/smoke-optical.spec.js
 */
const { launchBrowser, login, setupTracking, getFailedApiCalls, printResults, TARGET_URL } = require('./helpers/test-utils');

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

  // 1. Optical queue page
  apiCalls.length = 0;
  await page.goto(`${TARGET_URL}/${slug}/optical`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  const pageTitle = await page.locator('h1, h2').first().textContent().catch(() => '');
  results.opticalPageLoads = pageTitle ? `PASS ("${pageTitle.trim()}")` : 'FAIL (no page title)';
  await page.screenshot({ path: '/tmp/pw-e2e-optical-queue.png', fullPage: true });

  // 2. Date navigation
  const dateInput = page.locator('input[type="date"]');
  const hasPrev = await page.locator('button[title="Previous day"]').count();
  const hasNext = await page.locator('button[title="Next day"]').count();
  const hasToday = await page.locator('button:has-text("Today")').count();
  const hasDateInput = await dateInput.count();

  results.dateNavigation = (hasDateInput > 0 && hasPrev > 0 && hasNext > 0 && hasToday > 0)
    ? 'PASS (date input + prev/next/today buttons)'
    : `FAIL (date=${hasDateInput}, prev=${hasPrev}, next=${hasNext}, today=${hasToday})`;

  // 3. Summary badges
  const totalBadge = await page.locator('text=/\\d+ total/').count();
  const emptyQueue = await page.locator('text=No patients in optical queue').count();
  results.summaryBadges = totalBadge > 0
    ? 'PASS (total badge visible)'
    : emptyQueue > 0
      ? 'PASS (no badge expected — empty queue)'
      : 'FAIL (no total badge and no empty state)';

  // 4. Queue cards or empty state
  const queueCards = page.locator('div.glass-card.glass-card-hover');
  const cardCount = await queueCards.count();
  const emptyState = await page.locator('text=No patients in optical queue').count();

  if (cardCount > 0) {
    results.queueContent = `PASS (${cardCount} cards)`;

    // Card content verification
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

    // 5. Print preview modal
    if (hasPrintBtn > 0) {
      await printBtn.click();
      await page.waitForTimeout(2000);

      const printArea = page.locator('#rx-print-area');
      if (await printArea.count() > 0) {
        results.printPreview = 'PASS (Rx print area visible)';
        results.printTable = (await printArea.locator('table').count()) > 0 ? 'PASS (prescription table in print view)' : 'FAIL (no table)';
        results.printSignature = (await printArea.locator('text=/Prescribing Doctor|Provider/').count()) > 0 ? 'PASS' : 'INFO (no signature area text found)';
        await page.screenshot({ path: '/tmp/pw-e2e-optical-print.png', fullPage: true });

        const closeBtn = page.locator('button:has-text("Close")');
        if (await closeBtn.count() > 0) {
          await closeBtn.click();
          await page.waitForTimeout(500);
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

    // 6. Status transition
    const statusBtnAfter = queueCards.first().locator('button:has-text("Start Processing")');
    if (await statusBtnAfter.count() > 0) {
      await statusBtnAfter.click();
      await page.waitForTimeout(2000);

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

  // Summary
  const failedApis = getFailedApiCalls(apiCalls, { exclude: [] });
  results.apiCalls = failedApis.length === 0 ? 'PASS' : `FAIL (${failedApis.length} errors)`;
  results.consoleErrors = consoleErrors.length === 0 ? 'PASS' : `FAIL (${consoleErrors.length} errors)`;

  printResults('Smoke Optical (Phase 6)', results);
  await browser.close();
})();
