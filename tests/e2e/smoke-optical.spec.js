/**
 * smoke-optical.spec.js — Phase 6: Optical Handoff E2E verification
 *
 * Verifies: optical queue loads, cards show patient/Rx data, Rx change alert,
 * print preview modal, status transitions.
 * Run: bash scripts/dev.sh verify tests/e2e/smoke-optical.spec.js
 */
const { chromium } = require('playwright');

const TARGET_URL = 'http://localhost:3000';
const EMAIL = 'duytran@yahoo.com';
const PASSWORD = '123456';

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
      // Ignore harmless SSR hydration warnings and 404 resource errors
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
  // 1. Optical queue page
  // =========================================================================
  console.log('\n=== Optical Queue ===');
  apiCalls.length = 0;
  await page.goto(`${TARGET_URL}/${slug}/optical`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // Check page loaded (not error state)
  const pageTitle = await page.locator('h1, h2').first().textContent().catch(() => '');
  results.opticalPageLoads = pageTitle ? `PASS ("${pageTitle.trim()}")` : 'FAIL (no page title)';
  console.log('Optical page loads:', results.opticalPageLoads);

  await page.screenshot({ path: '/tmp/pw-e2e-optical-queue.png', fullPage: true });

  // =========================================================================
  // 2. Date navigation
  // =========================================================================
  console.log('\n=== Date Navigation ===');
  const dateInput = page.locator('input[type="date"]');
  const hasDateInput = await dateInput.count();
  const prevBtn = page.locator('button[title="Previous day"]');
  const nextBtn = page.locator('button[title="Next day"]');
  const todayBtn = page.locator('button:has-text("Today")');

  const hasPrev = await prevBtn.count();
  const hasNext = await nextBtn.count();
  const hasToday = await todayBtn.count();

  results.dateNavigation = (hasDateInput > 0 && hasPrev > 0 && hasNext > 0 && hasToday > 0)
    ? 'PASS (date input + prev/next/today buttons)'
    : `FAIL (date=${hasDateInput}, prev=${hasPrev}, next=${hasNext}, today=${hasToday})`;
  console.log('Date navigation:', results.dateNavigation);

  // =========================================================================
  // 3. Summary badges
  // =========================================================================
  console.log('\n=== Summary Badges ===');
  const totalBadge = await page.locator('text=/\\d+ total/').count();
  const emptyQueue = await page.locator('text=No patients in optical queue').count();
  // Total badge only shows when queue has items
  results.summaryBadges = totalBadge > 0
    ? 'PASS (total badge visible)'
    : emptyQueue > 0
      ? 'PASS (no badge expected — empty queue)'
      : 'FAIL (no total badge and no empty state)';
  console.log('Summary badges:', results.summaryBadges);

  // =========================================================================
  // 4. Queue cards or empty state
  // =========================================================================
  console.log('\n=== Queue Content ===');
  const queueCards = page.locator('div.glass-card.glass-card-hover');
  const cardCount = await queueCards.count();
  const emptyState = await page.locator('text=No patients in optical queue').count();

  if (cardCount > 0) {
    results.queueContent = `PASS (${cardCount} cards)`;

    // -----------------------------------------------------------------------
    // 4a. Card content verification (first card)
    // -----------------------------------------------------------------------
    console.log('\n=== Card Details ===');
    const firstCard = queueCards.first();

    // Patient name
    const cardTitle = await firstCard.locator('h3, [class*="CardTitle"]').first().textContent().catch(() => '');
    results.cardPatientName = cardTitle && cardTitle.trim().length > 0
      ? `PASS ("${cardTitle.trim()}")`
      : 'FAIL (no patient name)';

    // Rx table in card
    const cardTable = firstCard.locator('table');
    const hasCardTable = await cardTable.count();
    const odCell = await firstCard.locator('td:has-text("OD")').count();
    const osCell = await firstCard.locator('td:has-text("OS")').count();
    results.cardRxTable = (hasCardTable > 0 && odCell > 0 && osCell > 0)
      ? 'PASS (table with OD/OS rows)'
      : `FAIL (table=${hasCardTable}, OD=${odCell}, OS=${osCell})`;

    // Print Rx button
    const printBtn = firstCard.locator('button:has-text("Print Rx")');
    const hasPrintBtn = await printBtn.count();
    results.cardPrintBtn = hasPrintBtn > 0 ? 'PASS' : 'FAIL (no Print Rx button)';

    // Status button
    const statusBtn = firstCard.locator('button:has-text(/Start Processing|Mark Dispensed/)');
    const hasStatusBtn = await statusBtn.count();
    // Dispensed cards may not have a status button
    const statusBadge = firstCard.locator('text=/Waiting|In Progress|Dispensed/');
    const hasStatusBadge = await statusBadge.count();
    results.cardStatus = hasStatusBadge > 0
      ? `PASS (status badge visible${hasStatusBtn > 0 ? ' + action button' : ', dispensed'})`
      : 'FAIL (no status indicator)';

    // Rx Change alert (may or may not be present)
    const rxChangeAlert = await page.locator('text=Rx Changed >0.50D').count();
    results.rxChangeAlert = rxChangeAlert > 0
      ? `PASS (${rxChangeAlert} alert(s) visible)`
      : 'INFO (no Rx changes detected — may be expected)';

    console.log('Card patient name:', results.cardPatientName);
    console.log('Card Rx table:', results.cardRxTable);
    console.log('Card Print Rx button:', results.cardPrintBtn);
    console.log('Card status:', results.cardStatus);
    console.log('Rx change alert:', results.rxChangeAlert);

    await page.screenshot({ path: '/tmp/pw-e2e-optical-card.png', fullPage: true });

    // -----------------------------------------------------------------------
    // 5. Print preview modal
    // -----------------------------------------------------------------------
    console.log('\n=== Print Preview ===');
    if (hasPrintBtn > 0) {
      await printBtn.click();
      await page.waitForTimeout(2000);

      // Check for print preview
      const printArea = page.locator('#rx-print-area');
      const hasPrintArea = await printArea.count();

      if (hasPrintArea > 0) {
        results.printPreview = 'PASS (Rx print area visible)';

        // Check for prescription table in modal
        const modalTable = printArea.locator('table');
        const hasModalTable = await modalTable.count();
        results.printTable = hasModalTable > 0 ? 'PASS (prescription table in print view)' : 'FAIL (no table)';

        // Check for provider signature area
        const signatureLine = await printArea.locator('text=/Prescribing Doctor|Provider/').count();
        results.printSignature = signatureLine > 0 ? 'PASS' : 'INFO (no signature area text found)';

        await page.screenshot({ path: '/tmp/pw-e2e-optical-print.png', fullPage: true });

        // Close modal
        const closeBtn = page.locator('button:has-text("Close")');
        const hasClose = await closeBtn.count();
        if (hasClose > 0) {
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
    console.log('Print preview:', results.printPreview);
    console.log('Print table:', results.printTable);
    console.log('Print signature:', results.printSignature);

    // -----------------------------------------------------------------------
    // 6. Status transition
    // -----------------------------------------------------------------------
    console.log('\n=== Status Transition ===');
    // Re-check for status button on first card (it may have changed after modal)
    const statusBtnAfter = queueCards.first().locator('button:has-text("Start Processing")');
    const hasStatusBtnAfter = await statusBtnAfter.count();

    if (hasStatusBtnAfter > 0) {
      await statusBtnAfter.click();
      await page.waitForTimeout(2000);

      // Check if status changed to "In Progress"
      const inProgressBadge = await queueCards.first().locator('text=In Progress').count();
      const markDispensedBtn = await queueCards.first().locator('button:has-text("Mark Dispensed")').count();

      results.statusTransition = (inProgressBadge > 0 || markDispensedBtn > 0)
        ? 'PASS (waiting → in_progress)'
        : 'FAIL (status did not change)';

      await page.screenshot({ path: '/tmp/pw-e2e-optical-status.png', fullPage: true });
    } else {
      results.statusTransition = 'SKIP (no "Start Processing" button — may already be in_progress/dispensed)';
    }
    console.log('Status transition:', results.statusTransition);

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
  console.log('Queue content:', results.queueContent);

  // =========================================================================
  // API call summary
  // =========================================================================
  const failedApis = apiCalls.filter(c => c.status >= 400);
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
