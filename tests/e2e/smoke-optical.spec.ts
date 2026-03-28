import { test, expect } from './fixtures';

const TENANT = 'sunview';

test.describe('Smoke Optical', () => {

  // =========================================================================
  // Suite A — Core Functionality
  // =========================================================================

  test('Suite A: optical page loads with title @smoke', async ({ page }) => {
    await page.goto(`/${TENANT}/optical`, { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');

    const pageTitle = await page.locator('h1, h2').first().textContent().catch(() => '');
    expect(pageTitle?.trim().length).toBeGreaterThan(0);
  });

  test('Suite A: date navigation controls present @smoke', async ({ page }) => {
    await page.goto(`/${TENANT}/optical`, { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');

    expect(await page.locator('input[type="date"]').count()).toBeGreaterThan(0);
    expect(await page.locator('button[title="Previous day"]').count()).toBeGreaterThan(0);
    expect(await page.locator('button[title="Next day"]').count()).toBeGreaterThan(0);
    expect(await page.locator('button:has-text("Today")').count()).toBeGreaterThan(0);
  });

  test('Suite A: queue shows cards or empty state with summary badge @smoke', async ({ page }) => {
    await page.goto(`/${TENANT}/optical`, { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');

    const totalBadge = await page.locator('text=/\\d+ total/').count();
    const emptyQueue = await page.locator('text=No patients in optical queue').count();
    expect(totalBadge > 0 || emptyQueue > 0).toBe(true);

    const cardCount = await page.locator('div.glass-card.glass-card-hover').count();
    expect(cardCount > 0 || emptyQueue > 0).toBe(true);
  });

  test('Suite A: queue card shows patient name, Rx table, status, and Print Rx button @smoke', async ({ page }) => {
    await page.goto(`/${TENANT}/optical`, { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');

    const queueCards = page.locator('div.glass-card.glass-card-hover');
    const cardCount = await queueCards.count();
    if (cardCount === 0) {
      test.skip();
      return;
    }

    const firstCard = queueCards.first();

    const cardTitle = await firstCard.locator('h3, [class*="CardTitle"]').first().textContent().catch(() => '');
    expect(cardTitle?.trim().length).toBeGreaterThan(0);

    const hasCardTable = await firstCard.locator('table').count();
    const odCell = await firstCard.locator('td:has-text("OD")').count();
    const osCell = await firstCard.locator('td:has-text("OS")').count();
    expect(hasCardTable).toBeGreaterThan(0);
    expect(odCell).toBeGreaterThan(0);
    expect(osCell).toBeGreaterThan(0);

    expect(await firstCard.locator('button:has-text("Print Rx")').count()).toBeGreaterThan(0);

    const hasStatusBadge = await firstCard.locator('text=/Waiting|In Progress|Dispensed/').count();
    expect(hasStatusBadge).toBeGreaterThan(0);
  });

  test('Suite A: Print Rx opens print preview with table @smoke', async ({ page }) => {
    await page.goto(`/${TENANT}/optical`, { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');

    const queueCards = page.locator('div.glass-card.glass-card-hover');
    if (await queueCards.count() === 0) {
      test.skip();
      return;
    }

    const printBtn = queueCards.first().locator('button:has-text("Print Rx")');
    if (await printBtn.count() === 0) {
      test.skip();
      return;
    }

    await printBtn.click();
    await page.waitForSelector('#rx-print-area', { state: 'visible', timeout: 5000 }).catch(() => {});

    const printArea = page.locator('#rx-print-area');
    expect(await printArea.count()).toBeGreaterThan(0);
    expect(await printArea.locator('table').count()).toBeGreaterThan(0);

    const closeBtn = page.locator('button:has-text("Close")');
    if (await closeBtn.count() > 0) {
      await closeBtn.click();
      await page.waitForLoadState('domcontentloaded');
    }
  });

  test('Suite A: status transition waiting → in_progress @smoke', async ({ page }) => {
    await page.goto(`/${TENANT}/optical`, { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');

    const queueCards = page.locator('div.glass-card.glass-card-hover');
    if (await queueCards.count() === 0) {
      test.skip();
      return;
    }

    const startBtn = queueCards.first().locator('button:has-text("Start Processing")');
    if (await startBtn.count() === 0) {
      test.skip();
      return;
    }

    await startBtn.click();
    await page.waitForLoadState('networkidle');

    const inProgressBadge = await queueCards.first().locator('text=In Progress').count();
    const markDispensedBtn = await queueCards.first().locator('button:has-text("Mark Dispensed")').count();
    expect(inProgressBadge > 0 || markDispensedBtn > 0).toBe(true);
  });

  test('Suite A: no failed API calls on optical page @smoke', async ({ page, apiCalls }) => {
    await page.goto(`/${TENANT}/optical`, { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');

    const failedApis = apiCalls.filter(c => c.status >= 400 && !c.url.includes('/exam-findings/'));
    expect(failedApis).toHaveLength(0);
  });

  // =========================================================================
  // Suite B — UI Interaction
  // =========================================================================

  test('Suite B: date navigation next/prev/today @smoke', async ({ page }) => {
    await page.goto(`/${TENANT}/optical`, { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');

    const dateInput = page.locator('input[type="date"]');
    if (await dateInput.count() === 0) {
      test.skip();
      return;
    }

    const origDate = await dateInput.inputValue();

    // Next day
    const nextBtn = page.locator('button[title="Next day"]');
    expect(await nextBtn.count()).toBeGreaterThan(0);
    await nextBtn.click();
    await page.waitForLoadState('networkidle');
    const newDate = await dateInput.inputValue();
    expect(newDate).not.toBe(origDate);

    // Previous day (back to original)
    const prevBtn = page.locator('button[title="Previous day"]');
    expect(await prevBtn.count()).toBeGreaterThan(0);
    await prevBtn.click();
    await page.waitForLoadState('networkidle');
    const backDate = await dateInput.inputValue();
    expect(backDate).toBe(origDate);

    // Today button
    const todayBtn = page.locator('button:has-text("Today")');
    expect(await todayBtn.count()).toBeGreaterThan(0);
    // Navigate away first
    if (await nextBtn.count() > 0) {
      await nextBtn.click();
      await page.waitForLoadState('networkidle');
    }
    await todayBtn.click();
    await page.waitForLoadState('networkidle');

    const today = new Date().toISOString().split('T')[0];
    const currentDate = await dateInput.inputValue();
    expect(currentDate).toBe(today);
  });

  test('Suite B: full status progression waiting → in_progress → dispensed @smoke', async ({ page }) => {
    await page.goto(`/${TENANT}/optical`, { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');

    const queueCards = page.locator('div.glass-card.glass-card-hover');
    const cardCount = await queueCards.count();
    if (cardCount === 0) {
      test.skip();
      return;
    }

    // Find a Waiting card
    let targetCard = null;
    for (let i = 0; i < cardCount; i++) {
      const card = queueCards.nth(i);
      if (await card.locator('text=Waiting').count() > 0) {
        targetCard = card;
        break;
      }
    }

    if (targetCard) {
      const startBtn = targetCard.locator('button:has-text("Start Processing")');
      expect(await startBtn.count()).toBeGreaterThan(0);
      await startBtn.click();
      await page.waitForLoadState('networkidle');

      expect(await targetCard.locator('text=In Progress').count()).toBeGreaterThan(0);

      const dispensedBtn = targetCard.locator('button:has-text("Mark Dispensed")');
      if (await dispensedBtn.count() > 0) {
        await dispensedBtn.click();
        await page.waitForLoadState('networkidle');

        expect(await targetCard.locator('text=Dispensed').count()).toBeGreaterThan(0);

        const noMoreBtns = await targetCard.locator('button:has-text(/Start Processing|Mark Dispensed/)').count();
        expect(noMoreBtns).toBe(0);
      }
    } else {
      // Find an In Progress card instead
      let inProgressCard = null;
      for (let i = 0; i < cardCount; i++) {
        const card = queueCards.nth(i);
        if (await card.locator('text=In Progress').count() > 0) {
          inProgressCard = card;
          break;
        }
      }

      if (inProgressCard) {
        const dispensedBtn = inProgressCard.locator('button:has-text("Mark Dispensed")');
        if (await dispensedBtn.count() > 0) {
          await dispensedBtn.click();
          await page.waitForLoadState('networkidle');
          expect(await inProgressCard.locator('text=Dispensed').count()).toBeGreaterThan(0);
        } else {
          test.skip();
        }
      } else {
        // All cards already dispensed — skip
        test.skip();
      }
    }
  });

  test('Suite B: print modal has OD/OS table and closes correctly @smoke', async ({ page }) => {
    await page.goto(`/${TENANT}/optical`, { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');

    const queueCards = page.locator('div.glass-card.glass-card-hover');
    if (await queueCards.count() === 0) {
      test.skip();
      return;
    }

    const anyPrintBtn = queueCards.first().locator('button:has-text("Print Rx")');
    if (await anyPrintBtn.count() === 0) {
      test.skip();
      return;
    }

    await anyPrintBtn.click();
    await page.waitForSelector('#rx-print-area', { state: 'visible', timeout: 5000 }).catch(() => {});

    const printArea = page.locator('#rx-print-area');
    expect(await printArea.count()).toBeGreaterThan(0);

    const printTable = await printArea.locator('table').count();
    const printOd = await printArea.locator('text=OD').count();
    const printOs = await printArea.locator('text=OS').count();
    expect(printTable).toBeGreaterThan(0);
    expect(printOd).toBeGreaterThan(0);
    expect(printOs).toBeGreaterThan(0);

    const closeBtn = page.locator('button:has-text("Close")');
    expect(await closeBtn.count()).toBeGreaterThan(0);
    await closeBtn.click();
    await page.waitForLoadState('domcontentloaded');

    expect(await printArea.count()).toBe(0);
  });

  test('Suite B: card shows provider name and Rx column headers @smoke', async ({ page }) => {
    await page.goto(`/${TENANT}/optical`, { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');

    const queueCards = page.locator('div.glass-card.glass-card-hover');
    if (await queueCards.count() === 0) {
      test.skip();
      return;
    }

    const firstCard = queueCards.first();

    const providerText = await firstCard.locator('text=/Dr\\.|Provider/').count();
    expect(providerText).toBeGreaterThan(0);

    const rxTableHeaders = await firstCard.locator('th:has-text(/Sph|Cyl|Axis|Add/)').count();
    expect(rxTableHeaders).toBeGreaterThan(0);
  });

  test('Suite B: no console errors on optical page @smoke', async ({ page, consoleErrors }) => {
    await page.goto(`/${TENANT}/optical`, { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');

    expect(consoleErrors).toHaveLength(0);
  });

});
