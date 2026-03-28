import { chromium, FullConfig } from '@playwright/test';
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import { spawn } from 'child_process';

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:3001';
const API_URL = process.env.API_URL || 'http://localhost:8080';
const EMAIL = process.env.E2E_EMAIL || 'duytran@yahoo.com';
const PASSWORD = process.env.E2E_PASSWORD || '123456';
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const AUTH_FILE = path.resolve(__dirname, '../../.playwright/.auth/user.json');

function isApiUp(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`${API_URL}/docs`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function ensureApi(): Promise<void> {
  if (await isApiUp()) {
    console.log('[global-setup] FastAPI already up.');
    return;
  }

  console.log('[global-setup] FastAPI not running — starting uvicorn...');
  const proc = spawn(
    'uvicorn',
    ['backend.main:app', '--reload', '--port', '8080'],
    {
      cwd: PROJECT_ROOT,
      env: { ...process.env, PYTHONPATH: PROJECT_ROOT },
      detached: true,
      stdio: 'ignore',
    }
  );
  proc.unref();

  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (await isApiUp()) {
      console.log(`[global-setup] FastAPI ready (${i + 1}s).`);
      return;
    }
  }
  console.warn('[global-setup] FastAPI did not start in 15s — tests may fail.');
}

export default async function globalSetup(_config: FullConfig) {
  await ensureApi();

  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  await page.goto(`${TARGET_URL}/login`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#email', { timeout: 15000 });
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle', timeout: 20000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForURL('**/sunview/**', { timeout: 15000 }).catch(() => {});

  await context.storageState({ path: AUTH_FILE });
  await browser.close();
  console.log('[global-setup] Auth state saved.');
}
