/**
 * tests/e2e/helpers/test-utils.js
 *
 * Shared utilities for all E2E tests. Eliminates copy-paste across spec files.
 *
 * Usage:
 *   const { launchBrowser, login, extractJwt, setupTracking, printResults } = require('./helpers/test-utils');
 */

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:3000';
const API_URL = process.env.API_URL || 'http://localhost:8000';
const EMAIL = process.env.E2E_EMAIL || 'duytran@yahoo.com';
const PASSWORD = process.env.E2E_PASSWORD || '123456';

// Console error patterns to ignore (SSR hydration, expected resource loads)
const IGNORED_CONSOLE_PATTERNS = [
  'data-theme',
  'Extra attributes from the server',
  'Failed to load resource',
];

/**
 * Launch Chromium with consistent viewport settings.
 * Returns { browser, context, page }.
 */
async function launchBrowser(opts = {}) {
  const { chromium } = require('playwright');
  const headless = opts.headless ?? false;
  const browser = await chromium.launch({ headless, slowMo: opts.slowMo ?? 50 });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();
  return { browser, context, page };
}

/**
 * Log in via the UI. Returns the tenant slug or null on failure.
 */
async function login(page, opts = {}) {
  const email = opts.email || EMAIL;
  const password = opts.password || PASSWORD;
  const url = opts.url || TARGET_URL;

  await page.goto(`${url}/login`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#email', { timeout: 15000 });
  await page.fill('#email', email);
  await page.fill('#password', password);

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle', timeout: 20000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForURL('**/sunview/**', { timeout: 15000 }).catch(() => {});

  const finalUrl = page.url();
  const match = finalUrl.match(/localhost:3000\/([^/]+)/);
  const slug = match ? match[1] : null;

  if (!slug || slug === 'login') return null;
  return slug;
}

/**
 * Extract Supabase JWT from browser cookies (chunked auth token pattern).
 * Requires a context (not just page) since cookies are on context.
 */
async function extractJwt(context) {
  const cookies = await context.cookies();
  const chunks = cookies
    .filter(c => c.name.includes('-auth-token'))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (chunks.length === 0) return null;

  const raw = chunks.map(c => c.value).join('');
  const b64 = raw.startsWith('base64-') ? raw.slice(7) : raw;
  try {
    const decoded = Buffer.from(b64, 'base64').toString('utf-8');
    const data = JSON.parse(decoded);
    return data?.access_token || null;
  } catch {
    return null;
  }
}

/**
 * Attach response + console error tracking to a page.
 * Returns { apiCalls, consoleErrors } arrays that fill in real-time.
 */
function setupTracking(page) {
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
      if (IGNORED_CONSOLE_PATTERNS.some(p => text.includes(p))) return;
      consoleErrors.push(text);
    }
  });

  return { apiCalls, consoleErrors };
}

/**
 * Check API calls for failures.
 * Excludes expected 404s (e.g. /exam-findings/ with no data).
 */
function getFailedApiCalls(apiCalls, opts = {}) {
  const exclude = opts.exclude || ['/exam-findings/'];
  return apiCalls.filter(c =>
    c.status >= 400 && !exclude.some(pattern => c.url.includes(pattern))
  );
}

/**
 * Print results in the standard PASS/FAIL/SKIP/INFO format.
 * Returns true if all non-SKIP/INFO checks passed.
 */
function printResults(testName, results) {
  console.log(`\n========================================`);
  console.log(`  ${testName}`);
  console.log(`========================================`);

  let allPass = true;
  for (const [key, val] of Object.entries(results)) {
    const str = String(val);
    const icon = str.startsWith('PASS') ? 'OK'
      : (str.startsWith('SKIP') || str.startsWith('INFO')) ? '--'
      : 'XX';
    console.log(`  [${icon}] ${key}: ${str}`);
    if (str.startsWith('FAIL')) allPass = false;
  }
  console.log(`========================================`);
  console.log(allPass ? '  ALL CHECKS PASSED' : '  SOME CHECKS FAILED');
  console.log(`========================================`);
  return allPass;
}

/**
 * Simple assertion — throws on failure.
 */
function assert(condition, msg) {
  if (!condition) throw new Error(`FAIL: ${msg}`);
}

module.exports = {
  TARGET_URL,
  API_URL,
  EMAIL,
  PASSWORD,
  launchBrowser,
  login,
  extractJwt,
  setupTracking,
  getFailedApiCalls,
  printResults,
  assert,
};
