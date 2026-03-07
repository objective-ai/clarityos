/**
 * smoke-pages.spec.js — Page access + entitlements verification
 *
 * Verifies: schedule and patients pages load without "Locked" messages,
 * all API calls return 200, no console errors.
 * Run: cd ~/.claude/skills/playwright-skill && node run.js ../../Projects/clarityos/tests/e2e/smoke-pages.spec.js
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
      consoleErrors.push(msg.text());
    }
  });

  // Login
  console.log('=== Login ===');
  await page.goto(`${TARGET_URL}/login`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#email', { timeout: 15000 });
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle', timeout: 20000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForTimeout(3000);

  const urlAfterLogin = page.url();
  const slugMatch = urlAfterLogin.match(/localhost:3000\/([^/]+)/);
  const slug = slugMatch ? slugMatch[1] : null;

  if (!slug || slug === 'login') {
    console.log('Login failed — still on:', urlAfterLogin);
    await browser.close();
    return;
  }

  console.log('Logged in, slug:', slug);
  const results = {};

  // Schedule page
  console.log('\n=== Schedule ===');
  apiCalls.length = 0;
  await page.goto(`${TARGET_URL}/${slug}/schedule`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  const scheduleLocked = await page.locator('text=Scheduling Locked').count();
  results.schedule = scheduleLocked === 0 ? 'PASS' : 'FAIL (Locked)';
  console.log('Schedule accessible:', results.schedule);
  await page.screenshot({ path: '/tmp/pw-e2e-schedule.png', fullPage: true });

  // Patients page
  console.log('\n=== Patients ===');
  apiCalls.length = 0;
  await page.goto(`${TARGET_URL}/${slug}/patients`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  const patientsLocked = await page.locator('text=Patient Records Locked').count();
  results.patients = patientsLocked === 0 ? 'PASS' : 'FAIL (Locked)';
  console.log('Patients accessible:', results.patients);
  await page.screenshot({ path: '/tmp/pw-e2e-patients.png', fullPage: true });

  // API call summary
  const failedApis = apiCalls.filter(c => c.status >= 400);
  results.apiCalls = failedApis.length === 0 ? 'PASS' : `FAIL (${failedApis.length} errors)`;
  results.consoleErrors = consoleErrors.length === 0 ? 'PASS' : `FAIL (${consoleErrors.length} errors)`;

  console.log('\n=== RESULTS ===');
  for (const [key, val] of Object.entries(results)) {
    console.log(`  ${key}: ${val}`);
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

  const allPass = Object.values(results).every(v => v === 'PASS');
  console.log('\n' + (allPass ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'));

  await browser.close();
})();
