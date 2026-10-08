import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(projectRoot, 'docs', 'screenshots');
const baseUrl = process.env.QA_BASE_URL ?? 'http://127.0.0.1:5173';
const channel = process.env.QA_BROWSER_CHANNEL;
const browser = await chromium.launch({ headless: true, ...(channel ? { channel } : {}) });
const runtimeErrors = [];

async function openStudio(options) {
  const page = await browser.newPage({
    deviceScaleFactor: 2,
    reducedMotion: 'reduce',
    ...options,
  });
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: /every journey/i }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  await waitForArtwork(page);
  return page;
}

async function waitForArtwork(page) {
  // React effects and map resize/style events publish their loading state asynchronously.
  await page.waitForTimeout(400);
  await page.waitForFunction(() => {
    const status = document.querySelector('.poster-preview')?.getAttribute('data-map-status');
    return status === 'ready' || status === 'error';
  }, undefined, { timeout: 60_000 });
  const poster = page.locator('.poster-preview');
  assert.equal(await poster.getAttribute('data-map-status'), 'ready', `Map must load real tiles: ${await poster.innerText()}`);
  await page.waitForTimeout(500);
}

async function capture(page, filename, { endAtPreview = false } = {}) {
  await waitForArtwork(page);
  await page.getByRole('button', { name: 'Fit route', exact: true }).click();
  await waitForArtwork(page);
  assert.equal(await page.getByRole('alert').count(), 0, 'Screenshot must have no error notices');
  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  assert.equal(hasOverflow, false, 'Screenshot must have no horizontal overflow');
  await page.mouse.move(0, 0);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  const preview = endAtPreview ? await page.locator('.preview-panel').boundingBox() : null;
  const framing = preview
    ? { clip: { x: 0, y: 0, width: page.viewportSize().width, height: Math.ceil(preview.y + preview.height + 12) } }
    : { fullPage: true };
  await page.screenshot({ path: path.join(outputDir, filename), ...framing, animations: 'disabled' });
  console.log(`Saved docs/screenshots/${filename}`);
}

try {
  await mkdir(outputDir, { recursive: true });
  const desktop = await openStudio({ viewport: { width: 1440, height: 1060 } });
  await capture(desktop, 'studio-print.png');

  await desktop.getByRole('button', { name: 'Design', exact: true }).click();
  await desktop.getByRole('button', { name: 'Gallery template', exact: true }).click();
  await desktop.getByRole('button', { name: 'Coastal palette', exact: true }).click();
  await capture(desktop, 'studio-design.png');

  await desktop.getByRole('button', { name: 'Minimal template', exact: true }).click();
  await desktop.getByRole('button', { name: 'Midnight palette', exact: true }).click();
  await desktop.getByRole('button', { name: 'Share', exact: true }).click();
  await desktop.getByRole('button', { name: 'Wide', exact: true }).click();
  await desktop.getByRole('button', { name: 'Details', exact: true }).click();
  await capture(desktop, 'studio-share.png');
  await desktop.close();

  const mobile = await openStudio({
    viewport: { width: 390, height: 1100 },
    isMobile: true,
    hasTouch: true,
  });
  await capture(mobile, 'studio-mobile.png', { endAtPreview: true });
  await mobile.close();
  assert.deepEqual(runtimeErrors, [], 'Screenshot sessions must have no JavaScript errors');
} finally {
  await browser.close();
}
