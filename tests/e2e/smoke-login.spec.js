/**
 * smoke-login.spec.js — Login + slug URL verification
 *
 * Verifies: login flow, JWT token success, slug-based redirect (no UUIDs).
 * Run: cd ~/.claude/skills/playwright-skill && node run.js ../../Projects/clarityos/tests/e2e/smoke-login.spec.js
 */
const { chromium } = require('playwright');

const TARGET_URL = 'http://localhost:3000';
const EMAIL = 'duytran@yahoo.com';
const PASSWORD = '123456';

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  const apiCalls = [];
  const errors = [];

  page.on('response', async (response) => {
    const url = response.url();
    const status = response.status();
    if (url.includes('/api/')) {
      apiCalls.push({ url, status });
    }
    if (status >= 400) {
      let body = '';
      try { body = await response.text(); } catch {}
      errors.push({ url: url.substring(0, 150), status, body: body.substring(0, 500) });
    }
  });

  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push({ type: 'console', text: msg.text() });
    }
  });

  // Step 1: Login
  console.log('=== Step 1: Login ===');
  await page.goto(`${TARGET_URL}/login`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#email', { timeout: 15000 });
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle', timeout: 20000 }).catch(() => {
      console.log('Navigation timeout — checking URL...');
    }),
    page.click('button[type="submit"]'),
  ]);

  await page.waitForTimeout(3000);

  const finalUrl = page.url();
  console.log('Final URL:', finalUrl);

  // Step 2: Assertions
  const hasUuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.test(finalUrl);
  const slugMatch = finalUrl.match(/localhost:3000\/([^/]+)/);
  const slug = slugMatch ? slugMatch[1] : null;
  const isOnLogin = finalUrl.includes('/login');

  console.log('\n=== RESULTS ===');
  console.log('No UUID in URL:', hasUuid ? 'FAIL' : 'PASS');
  console.log('Redirected away from /login:', isOnLogin ? 'FAIL' : 'PASS');
  console.log('Tenant slug:', slug);

  if (errors.length > 0) {
    console.log('\nErrors:');
    for (const e of errors) {
      if (e.type === 'console') {
        console.log(`  [console] ${e.text}`);
      } else {
        console.log(`  [${e.status}] ${e.url}`);
        if (e.body) console.log(`    ${e.body}`);
      }
    }
  }

  if (apiCalls.length > 0) {
    console.log('\nAPI calls:');
    for (const c of apiCalls) {
      console.log(`  [${c.status}] ${c.url.substring(0, 120)}`);
    }
  }

  const allPass = !hasUuid && !isOnLogin && slug && slug !== 'login';
  console.log('\n' + (allPass ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'));

  await page.screenshot({ path: '/tmp/pw-e2e-smoke-login.png', fullPage: true });
  await browser.close();
})();
