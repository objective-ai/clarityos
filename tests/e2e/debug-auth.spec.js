/**
 * debug-auth.spec.js — Auth diagnostic with full network capture
 *
 * Not a pass/fail test. Captures all auth-related responses and error
 * responses for debugging login/JWT/hook issues.
 * Run: cd ~/.claude/skills/playwright-skill && node run.js ../../Projects/clarityos/tests/e2e/debug-auth.spec.js
 */
const { chromium } = require('playwright');

const TARGET_URL = 'http://localhost:3000';
const EMAIL = 'duytran@yahoo.com';
const PASSWORD = '123456';

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  const responses = [];

  page.on('response', async (response) => {
    const url = response.url();
    const status = response.status();
    const isAuthEndpoint = url.includes('token') || url.includes('/auth/') || url.includes('supabase');
    const isError = status >= 400;
    const isApi = url.includes('/api/');

    if (isAuthEndpoint || isError || isApi) {
      let body = '';
      try { body = await response.text(); } catch {}
      responses.push({
        url: url.substring(0, 200),
        status,
        body: body.substring(0, 500),
        isAuth: isAuthEndpoint,
      });
    }
  });

  console.log('=== Auth Debug — Full Network Capture ===');
  console.log(`Target: ${TARGET_URL}`);
  console.log(`Email: ${EMAIL}\n`);

  await page.goto(`${TARGET_URL}/login`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#email', { timeout: 15000 });
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(8000);

  console.log('Final URL:', page.url());

  // Auth responses
  const authResponses = responses.filter(r => r.isAuth);
  if (authResponses.length > 0) {
    console.log('\n--- Auth Responses ---');
    for (const r of authResponses) {
      console.log(`[${r.status}] ${r.url}`);
      if (r.body) console.log(`  ${r.body}\n`);
    }
  }

  // Error responses (non-auth)
  const errorResponses = responses.filter(r => r.status >= 400 && !r.isAuth);
  if (errorResponses.length > 0) {
    console.log('\n--- Error Responses ---');
    for (const r of errorResponses) {
      console.log(`[${r.status}] ${r.url}`);
      if (r.body) console.log(`  ${r.body}\n`);
    }
  }

  // API responses
  const apiResponses = responses.filter(r => r.url.includes('/api/'));
  if (apiResponses.length > 0) {
    console.log('\n--- API Responses ---');
    for (const r of apiResponses) {
      console.log(`[${r.status}] ${r.url}`);
    }
  }

  if (responses.length === 0) {
    console.log('\nNo auth/error/API responses captured.');
  }

  await page.screenshot({ path: '/tmp/pw-e2e-debug-auth.png', fullPage: true });
  console.log('\nScreenshot: /tmp/pw-e2e-debug-auth.png');
  await browser.close();
})();
