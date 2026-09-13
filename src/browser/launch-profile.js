import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger.js';
import { get } from '../utils/config.js';
import { FlowError, ErrorCodes } from '../utils/errors.js';
import { launchChromeDirect, setPage, setContext, setConnected, setBrowser, isBrowserConnected } from './connect.js';

function getDefaultChromePath() {
  if (process.platform === 'win32') {
    const paths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) return p;
    }
    return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  }
  return '/opt/google/chrome/chrome';
}

function getDefaultUserDataDir() {
  if (process.platform === 'win32') {
    return path.join(process.env.LOCALAPPDATA || 'C:\\Users\\pc\\AppData\\Local', 'Google', 'Chrome', 'User Data');
  }
  return path.resolve(process.env.HOME || '', '.config/google-chrome');
}

const CHROME_PATH = get('chromePath', getDefaultChromePath());
const CDP_PORT = get('cdpPort', 9222);
const FLOW_URL = get('flowUrl', 'https://labs.google/fx/tools/flow');

export async function launchKiaraProfile(headless = false) {
  if (isBrowserConnected()) {
    logger.info('Browser already connected, reusing');
    return { success: true, message: 'Already connected' };
  }

  const chromeUserDataDir = get('chromeUserDataDir', getDefaultUserDataDir());
  const chromeProfile = get('chromeProfile', 'Profile 9');
  const profileSource = path.resolve(chromeUserDataDir, chromeProfile);

  if (!fs.existsSync(profileSource)) {
    throw new FlowError(ErrorCodes.CONFIG_ERROR,
      `Profile not found at ${profileSource}. Make sure Chrome ${chromeProfile} exists and is configured with your Google account.`);
  }

  logger.info('Launching Chrome via direct+CDP method (anti-detection)', { profileSource });

  try {
    // Try connecting to existing Chrome instance first
    const existing = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
    logger.info('Found existing Chrome instance, reusing');
    const ctx = existing.contexts()[0];
    const pg = ctx?.pages()[0];
    setBrowser(existing);
    setContext(ctx);
    setConnected(true);
    if (pg) { setPage(pg); return { browser: existing, context: ctx, page: pg }; }
    const newPage = await ctx.newPage();
    setPage(newPage);
    return { browser: existing, context: ctx, page: newPage };
  } catch {
    // Launch Chrome directly (not via Playwright) for anti-detection
    return await launchChromeDirect({
      chromePath: CHROME_PATH,
      cdpPort: CDP_PORT,
      headless,
      profileSource,
    });
  }
}

export async function navigateToFlow(page, toolPage) {
  const targetUrl = toolPage === true
    ? 'https://labs.google/fx/fr/tools/flow'
    : FLOW_URL;

  logger.info('Navigating to Google Flow', { url: targetUrl });
  await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  const currentUrl = page.url();
  logger.info('Flow page loaded', { url: currentUrl.substring(0, 100) });

  if (currentUrl.includes('accounts.google.com')) {
    return { authenticated: false, url: currentUrl,
      message: 'OAuth blocked — Google detects automation. Use Chrome direct+CDP launch method.' };
  }

  return { authenticated: true, url: currentUrl };
}
