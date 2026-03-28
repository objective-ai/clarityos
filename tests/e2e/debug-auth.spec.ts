/**
 * debug-auth.spec.ts — Auth diagnostic with full network capture
 *
 * NOT a pass/fail test. Run manually to debug login/JWT/hook issues.
 * Captures all auth-related responses and errors during login flow.
 *
 * Usage: npx playwright test tests/e2e/debug-auth.spec.ts --headed
 */
import { test } from './fixtures';

const EMAIL = process.env.E2E_EMAIL || 'duytran@yahoo.com';
const PASSWORD = process.env.E2E_PASSWORD || '123456';

test.skip('auth debug — run manually @debug', async ({ page }) => {
  const responses: { url: string; status: number; body: string; isAuth: boolean }[] = [];

  page.on('response', async (response) => {
    const url = response.url();
    const status = response.status();
    const isAuthEndpoint = url.includes('token') || url.includes('/auth/') || url.includes('supabase');
    const isError = status >= 400;
    const isApi = url.includes('/api/');

    if (isAuthEndpoint || isError || isApi) {
      let body = '';
      try { body = await response.text(); } catch { /* ignore */ }
      responses.push({
        url: url.substring(0, 200),
        status,
        body: body.substring(0, 500),
        isAuth: isAuthEndpoint,
      });
    }
  });

  console.log('=== Auth Debug — Full Network Capture ===');
  console.log(`Email: ${EMAIL}\n`);

  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.waitForSelector('#email', { timeout: 15000 });
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForLoadState('networkidle');

  console.log('Final URL:', page.url());

  const authResponses = responses.filter(r => r.isAuth);
  if (authResponses.length > 0) {
    console.log('\n--- Auth Responses ---');
    for (const r of authResponses) {
      console.log(`[${r.status}] ${r.url}`);
      if (r.body) console.log(`  ${r.body}\n`);
    }
  }

  const errorResponses = responses.filter(r => r.status >= 400 && !r.isAuth);
  if (errorResponses.length > 0) {
    console.log('\n--- Error Responses ---');
    for (const r of errorResponses) {
      console.log(`[${r.status}] ${r.url}`);
      if (r.body) console.log(`  ${r.body}\n`);
    }
  }

  const apiResponses = responses.filter(r => r.url.includes('/api/'));
  if (apiResponses.length > 0) {
    console.log('\n--- API Responses ---');
    for (const r of apiResponses) console.log(`[${r.status}] ${r.url}`);
  }

  if (responses.length === 0) console.log('\nNo auth/error/API responses captured.');

  await page.screenshot({ path: 'test-results/debug-auth.png', fullPage: true });
  console.log('\nScreenshot saved to test-results/debug-auth.png');
});
