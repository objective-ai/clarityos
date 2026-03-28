import { test, expect } from './fixtures';

const TENANT = 'sunview';

test.describe('Smoke Patient Rx', () => {

  // =========================================================================
  // Suite A — Core: Rx History Tab + Chart Number + Problem List
  // =========================================================================

  test('Suite A: chart number badge visible in patient header @smoke', async ({ page }) => {
    await page.goto(`/${TENANT}/patients`, { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');

    const firstLink = page.locator('tbody tr').first().locator('a').first();
    expect(await firstLink.count()).toBeGreaterThan(0);
    await firstLink.click();
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('h1.text-display', { state: 'visible' });

    const headerBadges = page.locator('h1.text-display').locator('..').locator('..').locator('span:has-text("#")');
    expect(await headerBadges.count()).toBeGreaterThan(0);
  });

  test('Suite A: problem list and add-problem button on Patient Info tab @smoke', async ({ page }) => {
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

    expect(await page.locator('text=Problem List').count()).toBeGreaterThan(0);
    expect(await page.locator('button:has-text("+ Add Problem")').count()).toBeGreaterThan(0);
  });

  test('Suite A: Rx History tab renders with modality filters @smoke', async ({ page }) => {
    await page.goto(`/${TENANT}/patients`, { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');

    const firstLink = page.locator('tbody tr').first().locator('a').first();
    expect(await firstLink.count()).toBeGreaterThan(0);
    await firstLink.click();
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('h1.text-display', { state: 'visible' });

    const rxTab = page.locator('button:has-text("Rx History")');
    expect(await rxTab.count()).toBeGreaterThan(0);
    await rxTab.click();
    await page.waitForLoadState('networkidle');

    // Modality filters
    expect(await page.locator('button:has-text("All")').count()).toBeGreaterThan(0);
    expect(await page.locator('button:has-text("Glasses")').count()).toBeGreaterThan(0);
    expect(await page.locator('button:has-text("Contact Lens")').count()).toBeGreaterThan(0);

    // Table or empty state
    const hasTable = await page.locator('th:has-text("OD Sph")').count();
    const emptyState = await page.locator('text=No finalized prescriptions on file').count();
    expect(hasTable > 0 || emptyState > 0).toBe(true);

    if (hasTable > 0) {
      const headers = ['Date', 'Provider', 'Type', 'OD Sph', 'OD Cyl', 'OD Axis', 'OD Add', 'OS Sph'];
      let headersFound = 0;
      for (const h of headers) {
        if (await page.locator(`th:has-text("${h}")`).count() > 0) headersFound++;
      }
      expect(headersFound).toBeGreaterThanOrEqual(6);
    }
  });

  test('Suite A: encounter links clickable on Encounters tab @smoke', async ({ page }) => {
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

    const timelineEntries = await page.locator('div.relative.pl-8.pb-6').count();
    if (timelineEntries === 0) {
      test.skip();
      return;
    }

    const encounterLinks = page.locator('a[href*="/encounter/"]');
    expect(await encounterLinks.count()).toBeGreaterThan(0);
  });

  test('Suite A: no failed API calls on patient Rx pages @smoke', async ({ page, apiCalls }) => {
    await page.goto(`/${TENANT}/patients`, { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');

    const firstLink = page.locator('tbody tr').first().locator('a').first();
    await firstLink.click();
    await page.waitForLoadState('networkidle');

    const rxTab = page.locator('button:has-text("Rx History")');
    if (await rxTab.count() > 0) {
      await rxTab.click();
      await page.waitForLoadState('networkidle');
    }

    const failedApis = apiCalls.filter(c => c.status >= 400 && !c.url.includes('/exam-findings/'));
    expect(failedApis).toHaveLength(0);
  });

  // =========================================================================
  // Suite B — UI Interaction: Modality Filter, Tab Cycling, Problem List
  // =========================================================================

  test('Suite B: all 4 tabs cycle correctly @smoke', async ({ page }) => {
    await page.goto(`/${TENANT}/patients`, { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');

    const firstLink = page.locator('tbody tr').first().locator('a').first();
    expect(await firstLink.count()).toBeGreaterThan(0);
    await firstLink.click();
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('h1.text-display', { state: 'visible' });

    const allTabs = ['Patient Info', 'Encounters', 'Flowsheets', 'Rx History'];
    let tabsCycled = 0;
    for (const tabLabel of allTabs) {
      const tab = page.locator(`button:has-text("${tabLabel}")`);
      if (await tab.count() > 0) {
        await tab.click();
        await page.waitForLoadState('domcontentloaded');
        tabsCycled++;
      }
    }
    expect(tabsCycled).toBe(4);
  });

  test('Suite B: Glasses and Contact Lens modality filters work @smoke', async ({ page }) => {
    await page.goto(`/${TENANT}/patients`, { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');

    const firstLink = page.locator('tbody tr').first().locator('a').first();
    expect(await firstLink.count()).toBeGreaterThan(0);
    await firstLink.click();
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('h1.text-display', { state: 'visible' });

    const rxTab = page.locator('button:has-text("Rx History")');
    if (await rxTab.count() === 0) {
      test.skip();
      return;
    }
    await rxTab.click();
    await page.waitForLoadState('networkidle');

    // Glasses filter
    const glassesBtn = page.locator('button:has-text("Glasses")');
    if (await glassesBtn.count() > 0) {
      await glassesBtn.click();
      await page.waitForLoadState('networkidle');
      const glassesClasses = await glassesBtn.getAttribute('class') ?? '';
      expect(glassesClasses).toContain('accent');
    }

    // Contact Lens filter
    const clBtn = page.locator('button:has-text("Contact Lens")');
    if (await clBtn.count() > 0) {
      await clBtn.click();
      await page.waitForLoadState('networkidle');
      const hasTable = await page.locator('table').count();
      const emptyState = await page.locator('text=No finalized prescriptions on file').count();
      expect(hasTable > 0 || emptyState > 0).toBe(true);
    }

    // Reset to All
    const allBtn = page.locator('button:has-text("All")');
    if (await allBtn.count() > 0) {
      await allBtn.click();
      await page.waitForLoadState('networkidle');
      const allClasses = await allBtn.getAttribute('class') ?? '';
      expect(allClasses).toContain('accent');
    }
  });

  test('Suite B: Add Problem opens ICD-10 search panel @smoke', async ({ page }) => {
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

    const addBtn = page.locator('button:has-text("+ Add Problem")');
    if (await addBtn.count() === 0) {
      test.skip();
      return;
    }

    await addBtn.click();
    await page.waitForSelector('input[placeholder="Search ICD-10 codes..."]', { state: 'visible', timeout: 5000 }).catch(() => {});

    expect(await page.locator('input[placeholder="Search ICD-10 codes..."]').count()).toBeGreaterThan(0);

    const closeBtn = page.locator('button:has-text("Close")');
    if (await closeBtn.count() > 0) {
      await closeBtn.click();
      await page.waitForLoadState('domcontentloaded');
    }
  });

  test('Suite B: encounter link navigates to encounter page @smoke', async ({ page }) => {
    await page.goto(`/${TENANT}/patients`, { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');

    const firstLink = page.locator('tbody tr').first().locator('a').first();
    expect(await firstLink.count()).toBeGreaterThan(0);
    await firstLink.click();
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('h1.text-display', { state: 'visible' });

    const encTab = page.locator('button:has-text("Encounters")');
    if (await encTab.count() === 0) {
      test.skip();
      return;
    }
    await encTab.click();
    await page.waitForLoadState('domcontentloaded');

    const firstEncLink = page.locator('a[href*="/encounter/"]').first();
    if (await firstEncLink.count() === 0) {
      test.skip();
      return;
    }

    await firstEncLink.click();
    await page.waitForLoadState('networkidle');
    await page.waitForURL('**/encounter/**', { timeout: 10000 }).catch(() => {});

    expect(page.url()).toContain('/encounter/');

    await page.goBack();
    await page.waitForLoadState('networkidle');
  });

  test('Suite B: no console errors on patient Rx pages @smoke', async ({ page, consoleErrors }) => {
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
