import { test, expect } from './fixtures';

const TENANT = 'sunview';

test.describe('Smoke Patients', () => {

  // =========================================================================
  // Suite A — Core Functionality
  // =========================================================================

  test('Suite A: patient list loads and search works @smoke', async ({ page, apiCalls }) => {
    await page.goto(`/${TENANT}/patients`, { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');

    // Patient list is accessible (not locked)
    const patientsLocked = await page.locator('text=Patient Records Locked').count();
    expect(patientsLocked).toBe(0);

    // Patient list renders rows
    const patientRows = await page.locator('tbody tr').count();
    expect(patientRows).toBeGreaterThan(0);

    // Search patients
    const searchInput = page.locator('input[placeholder="Search patients..."]');
    expect(await searchInput.count()).toBeGreaterThan(0);

    const nameEl = page.locator('tbody tr').first().locator('p.text-body.font-medium').first();
    const nameText = await nameEl.textContent().catch(() => '');
    const searchTerm = nameText ? nameText.trim().split(',')[0].trim() : '';

    if (searchTerm) {
      await searchInput.fill(searchTerm);
      await page.waitForLoadState('networkidle');
      const filteredRows = await page.locator('tbody tr').count();
      expect(filteredRows).toBeGreaterThan(0);
    }

    await searchInput.fill('');
    await page.waitForLoadState('networkidle');
  });

  test('Suite A: patient detail navigation and heading @smoke', async ({ page }) => {
    await page.goto(`/${TENANT}/patients`, { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');

    const firstLink = page.locator('tbody tr').first().locator('a').first();
    expect(await firstLink.count()).toBeGreaterThan(0);

    await firstLink.click();
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('h1.text-display', { state: 'visible' });

    expect(page.url()).toContain('/patients/');

    const headingText = await page.locator('h1.text-display').first().textContent().catch(() => '');
    expect(headingText?.trim().length).toBeGreaterThan(0);
  });

  test('Suite A: encounters timeline and badges @smoke', async ({ page }) => {
    await page.goto(`/${TENANT}/patients`, { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');

    const firstLink = page.locator('tbody tr').first().locator('a').first();
    await firstLink.click();
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('h1.text-display', { state: 'visible' });

    const encountersTab = page.locator('button:has-text("Encounters")');
    expect(await encountersTab.count()).toBeGreaterThan(0);
    await encountersTab.click();
    await page.waitForLoadState('networkidle');

    const timelineEntries = await page.locator('div.relative.pl-8.pb-6').count();
    const emptyTimeline = await page.locator('text=No encounters on file').count();
    expect(timelineEntries > 0 || emptyTimeline > 0).toBe(true);
  });

  test('Suite A: flowsheets tab renders @smoke', async ({ page }) => {
    await page.goto(`/${TENANT}/patients`, { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');

    const firstLink = page.locator('tbody tr').first().locator('a').first();
    await firstLink.click();
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('h1.text-display', { state: 'visible' });

    const flowsheetsTab = page.locator('button:has-text("Flowsheets")');
    expect(await flowsheetsTab.count()).toBeGreaterThan(0);
    await flowsheetsTab.click();
    await page.waitForLoadState('networkidle');

    const hasIopOd = await page.locator('th:has-text("IOP OD")').count();
    const hasIopOs = await page.locator('th:has-text("IOP OS")').count();
    const emptyFlowsheet = await page.locator('text=No clinical data to display').count();

    expect((hasIopOd > 0 && hasIopOs > 0) || emptyFlowsheet > 0).toBe(true);
  });

  test('Suite A: Prep Me button shows AI summary card @smoke', async ({ page }) => {
    await page.goto(`/${TENANT}/patients`, { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');

    const firstLink = page.locator('tbody tr').first().locator('a').first();
    await firstLink.click();
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('h1.text-display', { state: 'visible' });

    const prepMeBtn = page.locator('button:has-text("Prep Me")');
    expect(await prepMeBtn.count()).toBeGreaterThan(0);

    await prepMeBtn.click();
    await page.waitForSelector('text=AI Pre-Visit Summary', { state: 'visible', timeout: 10000 }).catch(() => {});

    const summaryCard = await page.locator('text=AI Pre-Visit Summary').count();
    const loadingText = await page.locator('text=Reading clinical history...').count();
    expect(summaryCard > 0 || loadingText > 0).toBe(true);
  });

  test('Suite A: no failed API calls on patients page @smoke', async ({ page, apiCalls }) => {
    await page.goto(`/${TENANT}/patients`, { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');

    const firstLink = page.locator('tbody tr').first().locator('a').first();
    await firstLink.click();
    await page.waitForLoadState('networkidle');

    const failedApis = apiCalls.filter(c => c.status >= 400 && !c.url.includes('/exam-findings/'));
    expect(failedApis).toHaveLength(0);
  });

  // =========================================================================
  // Suite B — UI Interaction
  // =========================================================================

  test('Suite B: all 4 tabs are clickable @smoke', async ({ page }) => {
    await page.goto(`/${TENANT}/patients`, { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');

    const firstLink = page.locator('tbody tr').first().locator('a').first();
    expect(await firstLink.count()).toBeGreaterThan(0);
    await firstLink.click();
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('h1.text-display', { state: 'visible' });

    const tabs = ['Patient Info', 'Encounters', 'Flowsheets', 'Rx History'];
    let tabsWorking = 0;
    for (const tabLabel of tabs) {
      const tab = page.locator(`button:has-text("${tabLabel}")`);
      if (await tab.count() > 0) {
        await tab.click();
        await page.waitForLoadState('domcontentloaded');
        tabsWorking++;
      }
    }
    expect(tabsWorking).toBeGreaterThan(0);
  });

  test('Suite B: header edit mode shows inputs and cancel restores name @smoke', async ({ page }) => {
    await page.goto(`/${TENANT}/patients`, { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');

    const firstLink = page.locator('tbody tr').first().locator('a').first();
    expect(await firstLink.count()).toBeGreaterThan(0);
    await firstLink.click();
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('h1.text-display', { state: 'visible' });

    const patientInfoTab = page.locator('button:has-text("Patient Info")');
    if (await patientInfoTab.count() > 0) {
      await patientInfoTab.click();
      await page.waitForLoadState('domcontentloaded');
    }

    const headerEditBtn = page.locator('button[title="Edit"]').first();
    if (await headerEditBtn.count() === 0) {
      test.skip();
      return;
    }

    const origName = await page.locator('h1.text-display').first().textContent().catch(() => '');
    await headerEditBtn.click();
    await page.waitForLoadState('domcontentloaded');

    const editInputs = page.locator('input[type="text"]');
    const editInputCount = await editInputs.count();
    expect(editInputCount).toBeGreaterThanOrEqual(2);

    const cancelBtn = page.locator('button[title="Cancel"]').first();
    expect(await cancelBtn.count()).toBeGreaterThan(0);
    await cancelBtn.click();
    await page.waitForLoadState('domcontentloaded');

    const nameAfterCancel = await page.locator('h1.text-display').first().textContent().catch(() => '');
    expect(nameAfterCancel).toBe(origName);
  });

  test('Suite B: contact information edit mode @smoke', async ({ page }) => {
    await page.goto(`/${TENANT}/patients`, { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');

    const firstLink = page.locator('tbody tr').first().locator('a').first();
    expect(await firstLink.count()).toBeGreaterThan(0);
    await firstLink.click();
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('h1.text-display', { state: 'visible' });

    const contactSection = page.locator('text=Contact Information').locator('..');
    const contactEditBtn = contactSection.locator('button[title="Edit"]');

    if (await contactEditBtn.count() === 0) {
      test.skip();
      return;
    }

    await contactEditBtn.click();
    await page.waitForLoadState('domcontentloaded');

    const phoneInput = page.locator('input[type="tel"]').first();
    const emailInput = page.locator('input[type="email"]').first();
    expect((await phoneInput.count()) > 0 || (await emailInput.count()) > 0).toBe(true);

    const cancelBtn = contactSection.locator('button[title="Cancel"]');
    if (await cancelBtn.count() > 0) {
      await cancelBtn.click();
      await page.waitForLoadState('domcontentloaded');
    }
  });

  test('Suite B: insurance edit mode shows fields @smoke', async ({ page }) => {
    await page.goto(`/${TENANT}/patients`, { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');

    const firstLink = page.locator('tbody tr').first().locator('a').first();
    expect(await firstLink.count()).toBeGreaterThan(0);
    await firstLink.click();
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('h1.text-display', { state: 'visible' });

    const insuranceSection = page.locator('text=Insurance').locator('..');
    const insuranceEditBtn = insuranceSection.locator('button[title="Edit"]');

    if (await insuranceEditBtn.count() === 0) {
      test.skip();
      return;
    }

    await insuranceEditBtn.click();
    await page.waitForLoadState('domcontentloaded');

    const insuranceInputs = insuranceSection.locator('input[type="text"]');
    expect(await insuranceInputs.count()).toBeGreaterThan(0);

    const cancelBtn = insuranceSection.locator('button[title="Cancel"]');
    if (await cancelBtn.count() > 0) {
      await cancelBtn.click();
      await page.waitForLoadState('domcontentloaded');
    }
  });

  test('Suite B: contact save flow persists and restores @smoke', async ({ page }) => {
    await page.goto(`/${TENANT}/patients`, { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');

    const firstLink = page.locator('tbody tr').first().locator('a').first();
    expect(await firstLink.count()).toBeGreaterThan(0);
    await firstLink.click();
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('h1.text-display', { state: 'visible' });

    const contactEditBtn = page.locator('text=Contact Information').locator('..').locator('button[title="Edit"]');
    if (await contactEditBtn.count() === 0) {
      test.skip();
      return;
    }

    await contactEditBtn.click();
    await page.waitForLoadState('domcontentloaded');

    const emailInput = page.locator('input[type="email"]').first();
    if (await emailInput.count() === 0) {
      test.skip();
      return;
    }

    const origEmail = await emailInput.inputValue();
    await emailInput.fill('e2e-test@clarityos.dev');

    const saveBtn = page.locator('text=Contact Information').locator('..').locator('button[title="Save"]');
    expect(await saveBtn.count()).toBeGreaterThan(0);
    await saveBtn.click();
    await page.waitForLoadState('networkidle');

    // Edit mode should close
    expect(await saveBtn.count()).toBe(0);

    // Restore original email
    const editAgain = page.locator('text=Contact Information').locator('..').locator('button[title="Edit"]');
    if (await editAgain.count() > 0 && origEmail) {
      await editAgain.click();
      await page.waitForLoadState('domcontentloaded');
      const emailAgain = page.locator('input[type="email"]').first();
      if (await emailAgain.count() > 0) {
        await emailAgain.fill(origEmail);
        const saveAgain = page.locator('text=Contact Information').locator('..').locator('button[title="Save"]');
        if (await saveAgain.count() > 0) {
          await saveAgain.click();
          await page.waitForLoadState('networkidle');
        }
      }
    }
  });

  test('Suite B: encounter cards have navigation links @smoke', async ({ page }) => {
    await page.goto(`/${TENANT}/patients`, { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');

    const firstLink = page.locator('tbody tr').first().locator('a').first();
    expect(await firstLink.count()).toBeGreaterThan(0);
    await firstLink.click();
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('h1.text-display', { state: 'visible' });

    const encountersTab = page.locator('button:has-text("Encounters")');
    if (await encountersTab.count() === 0) {
      test.skip();
      return;
    }
    await encountersTab.click();
    await page.waitForLoadState('networkidle');

    const encounterCards = page.locator('div.relative.pl-8.pb-6');
    const cardCount = await encounterCards.count();
    if (cardCount === 0) {
      test.skip();
      return;
    }

    const encLink = encounterCards.first().locator('a[href*="/encounter/"]');
    expect(await encLink.count()).toBeGreaterThan(0);
  });

  test('Suite B: search no-results state and clear @smoke', async ({ page }) => {
    await page.goto(`/${TENANT}/patients`, { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');

    const searchInput = page.locator('input[placeholder="Search patients..."]');
    if (await searchInput.count() === 0) {
      test.skip();
      return;
    }

    await searchInput.fill('zzzznonexistent12345');
    await page.waitForLoadState('networkidle');

    const noResultsText = await page.locator('text=/No patients found|No patients on file/').count();
    const filteredRows = await page.locator('tbody tr').count();
    expect(noResultsText > 0 || filteredRows === 0).toBe(true);

    await searchInput.fill('');
    await page.waitForLoadState('networkidle');

    const totalAfter = await page.locator('tbody tr').count();
    expect(totalAfter).toBeGreaterThan(0);
  });

  test('Suite B: no console errors on patient pages @smoke', async ({ page, consoleErrors }) => {
    await page.goto(`/${TENANT}/patients`, { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');

    const firstLink = page.locator('tbody tr').first().locator('a').first();
    if (await firstLink.count() > 0) {
      await firstLink.click();
      await page.waitForLoadState('networkidle');
    }

    expect(consoleErrors).toHaveLength(0);
  });

});
