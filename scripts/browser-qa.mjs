import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const resultsDir = path.join(projectRoot, 'test-results');
const baseUrl = process.env.QA_BASE_URL ?? 'http://127.0.0.1:5173';
const browserChannel = process.env.QA_BROWSER_CHANNEL;
const browser = await chromium.launch({ headless: true, ...(browserChannel ? { channel: browserChannel } : {}) });
const report = { baseUrl, checks: [], warnings: [], downloads: [] };
const runtimeErrors = [];
report.runtimeErrors = runtimeErrors;
report.consoleErrors = [];

await mkdir(resultsDir, { recursive: true });

function check(name, actual, expected) {
  assert.equal(actual, expected, name);
  report.checks.push(name);
  console.log(`PASS ${name}`);
}

async function assertNoOverflow(page, name) {
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  assert.ok(dimensions.document <= dimensions.viewport + 1, `${name}: document overflow ${JSON.stringify(dimensions)}`);
  assert.ok(dimensions.body <= dimensions.viewport + 1, `${name}: body overflow ${JSON.stringify(dimensions)}`);
  report.checks.push(name);
  console.log(`PASS ${name}`);
}

async function assertCenteredDialog(page, name) {
  await page.getByRole('button', { name: 'How it works', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const bounds = await dialog.boundingBox();
  const viewport = page.viewportSize();
  assert.ok(bounds && viewport, 'Information dialog is visible');
  assert.ok(Math.abs(bounds.x + bounds.width / 2 - viewport.width / 2) < 1, `${name}: horizontal center`);
  assert.ok(Math.abs(bounds.y + bounds.height / 2 - viewport.height / 2) < 1, `${name}: vertical center`);
  assert.ok(bounds.y >= 19 && bounds.y + bounds.height <= viewport.height - 19, `${name}: content fits the viewport`);
  await page.keyboard.press('Escape');
  check(`${name} and closes with Escape`, await dialog.isVisible(), false);
}

function captureErrors(page) {
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'warning') report.warnings.push(message.text());
    if (message.type() === 'error') report.consoleErrors.push(message.text());
  });
}

async function saveDownload(page, click, fileName) {
  const pending = page.waitForEvent('download', { timeout: 120_000 });
  await click();
  console.log(`EXPORT ${fileName}: ${await page.locator('.download-status').innerText()}`);
  const exportFailure = page.locator('.error-message').waitFor({ state: 'visible', timeout: 120_000 }).then(async () => {
    throw new Error(`Export failed: ${await page.locator('.error-message').innerText()}`);
  });
  const download = await Promise.race([pending, exportFailure]);
  const downloadError = await download.failure();
  assert.equal(downloadError, null, `${fileName} download finished`);
  const target = path.join(resultsDir, fileName);
  await download.saveAs(target);
  await page.getByRole('button', { name: 'Download again', exact: true }).waitFor({ state: 'visible', timeout: 30_000 });
  return { bytes: await readFile(target), target, suggestedFilename: download.suggestedFilename() };
}

async function waitForMap(page) {
  const poster = page.locator('.poster-preview[data-map-status]');
  await poster.waitFor({ state: 'visible' });
  // Give effects triggered by a changed track/layout time to publish loading.
  await page.waitForTimeout(250);
  await page.waitForFunction(() => {
    const status = document.querySelector('.poster-preview[data-map-status]')?.getAttribute('data-map-status');
    return status === 'ready' || status === 'error';
  }, undefined, { timeout: 45_000 });
  await page.waitForTimeout(250);
  const status = await poster.getAttribute('data-map-status');
  assert.equal(status, 'ready', `Map must load real tiles before export. ${await poster.innerText()}`);
  return poster;
}

async function setColor(page, name, value) {
  await page.getByLabel(name, { exact: true }).evaluate((input, color) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, color);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

function validatePng(bytes, expectedWidth, expectedHeight, dpi) {
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'PNG file signature');
  check('PNG uses the requested pixel dimensions', `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`, `${expectedWidth}x${expectedHeight}`);
  assert.ok(bytes.length > 10_000, 'PNG contains rendered poster artwork');
  let resolution;
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString();
    if (type === 'pHYs') resolution = { x: bytes.readUInt32BE(offset + 8), y: bytes.readUInt32BE(offset + 12), unit: bytes[offset + 16] };
    offset += length + 12;
  }
  if (dpi === undefined) {
    check('Sharing PNG omits physical print resolution', resolution, undefined);
  } else {
    assert.deepEqual(resolution, { x: Math.round(dpi / 0.0254), y: Math.round(dpi / 0.0254), unit: 1 }, 'PNG physical DPI metadata');
    report.checks.push(`PNG embeds ${dpi} DPI print metadata`);
    console.log(`PASS PNG embeds ${dpi} DPI print metadata`);
  }
}

async function validatePdf(bytes, expectedWidthMm, expectedHeightMm) {
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-', 'PDF file signature');
  const pdf = await PDFDocument.load(bytes);
  check('PDF contains one print page', pdf.getPageCount(), 1);
  const dimensions = pdf.getPage(0).getSize();
  assert.ok(Math.abs(dimensions.width - expectedWidthMm / 25.4 * 72) < 0.1, `PDF width is ${dimensions.width} pt`);
  assert.ok(Math.abs(dimensions.height - expectedHeightMm / 25.4 * 72) < 0.1, `PDF height is ${dimensions.height} pt`);
  report.checks.push('PDF uses the requested physical paper dimensions');
  console.log('PASS PDF uses the requested physical paper dimensions');
}

// Scenarios below intentionally use visible labels and exported document metadata:
// they exercise the browser's import/editor/export path without depending on component internals.
try {
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 1 });
  captureErrors(desktop);
  await desktop.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await desktop.getByRole('heading', { name: /every journey/i }).waitFor({ timeout: 30_000 });
  await desktop.locator('.poster-preview').waitFor({ timeout: 30_000 });
  await assertNoOverflow(desktop, 'Desktop has no horizontal overflow');
  await desktop.screenshot({ path: path.join(resultsDir, 'desktop-initial.png'), fullPage: true });
  await assertCenteredDialog(desktop, 'Desktop information dialog is centered');
  check('All four print sizes are visible', await desktop.getByRole('group', { name: 'Paper size', exact: true }).getByRole('button').count(), 4);
  check('Extra size menu is removed', await desktop.getByRole('button', { name: 'More sizes', exact: true }).count(), 0);
  await desktop.getByRole('button', { name: 'A3', exact: true }).click();
  check('A3 can be selected directly', await desktop.getByRole('button', { name: 'A3', exact: true }).getAttribute('aria-pressed'), 'true');
  await desktop.getByRole('button', { name: '30 × 40', exact: true }).click();
  const printButtonSizes = await desktop.locator('.paper-sizes button').evaluateAll((buttons) => buttons.map((button) => ({ width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })));
  const initialTitle = await desktop.locator('.poster-preview svg text').first().textContent();

  await desktop.getByLabel('Upload GPX file', { exact: true }).setInputFiles(path.join(projectRoot, 'tests/fixtures/invalid.gpx'));
  await desktop.locator('.error-message').waitFor({ state: 'visible' });
  assert.match(await desktop.locator('.error-message').innerText(), /not valid GPX XML/i, 'Invalid XML has a useful GPX error');
  check('Invalid GPX preserves the current poster', await desktop.locator('.poster-preview svg text').first().textContent(), initialTitle);
  await desktop.getByRole('button', { name: 'Dismiss error' }).click();

  await desktop.getByLabel('Upload GPX file', { exact: true }).setInputFiles(path.join(projectRoot, 'tests/fixtures/paused-walk.gpx'));
  await desktop.getByText('paused-walk.gpx', { exact: true }).waitFor();
  await desktop.getByRole('button', { name: 'Details', exact: true }).click();
  const timing = desktop.getByRole('group', { name: 'Time basis', exact: true });
  check('Moving time is selected by default', await timing.getByRole('button', { name: 'Moving', exact: true }).getAttribute('aria-pressed'), 'true');
  check('Moving duration excludes the pause and segment gap', await desktop.getByLabel('Duration', { exact: true }).inputValue(), '3:00');
  check('Moving time is explicitly described as an estimate', await desktop.getByText(/Moving time is estimated from your GPX/).count(), 1);
  const movingPace = await desktop.getByLabel('Pace', { exact: true }).inputValue();
  await desktop.getByLabel('Date', { exact: true }).fill('A day to remember');
  await timing.getByRole('button', { name: 'Elapsed', exact: true }).click();
  check('Elapsed duration includes the pause and segment gap', await desktop.getByLabel('Duration', { exact: true }).inputValue(), '10:00');
  assert.notEqual(await desktop.getByLabel('Pace', { exact: true }).inputValue(), movingPace, 'Time selection recalculates pace');
  check('Changing time basis preserves an edited date', await desktop.getByLabel('Date', { exact: true }).inputValue(), 'A day to remember');
  await desktop.getByLabel('Third statistic', { exact: true }).selectOption('Avg. speed');
  check('Average speed uses elapsed time', await desktop.getByLabel('Average speed', { exact: true }).inputValue(), '1.2 km/h');
  await timing.getByRole('button', { name: 'Moving', exact: true }).click();
  check('Average speed uses moving time', await desktop.getByLabel('Average speed', { exact: true }).inputValue(), '4.1 km/h');
  await desktop.getByRole('button', { name: 'Route', exact: true }).click();
  await desktop.getByRole('button', { name: 'Miles', exact: true }).click();
  await desktop.getByRole('button', { name: 'Details', exact: true }).click();
  check('Unit changes preserve moving duration', await desktop.getByLabel('Duration', { exact: true }).inputValue(), '3:00');
  check('Moving average speed converts to imperial units', await desktop.getByLabel('Average speed', { exact: true }).inputValue(), '2.5 mph');
  await desktop.getByLabel('Duration', { exact: true }).fill('2:45');
  await desktop.getByLabel('Average speed', { exact: true }).fill('3.0 mph');
  await timing.getByRole('button', { name: 'Moving', exact: true }).click();
  check('Reselecting the active time basis preserves manual duration', await desktop.getByLabel('Duration', { exact: true }).inputValue(), '2:45');
  await desktop.getByRole('button', { name: 'Share', exact: true }).click();
  await desktop.getByRole('button', { name: 'Print', exact: true }).click();
  check('Print and Share preserve manual duration', await desktop.getByLabel('Duration', { exact: true }).inputValue(), '2:45');
  check('Print and Share preserve manual speed', await desktop.getByLabel('Average speed', { exact: true }).inputValue(), '3.0 mph');
  await timing.getByRole('button', { name: 'Elapsed', exact: true }).click();
  check('Changing time basis restores calculated duration', await desktop.getByLabel('Duration', { exact: true }).inputValue(), '10:00');
  await desktop.getByRole('button', { name: 'Route', exact: true }).click();
  const untimed = (await readFile(path.join(projectRoot, 'tests/fixtures/paused-walk.gpx'), 'utf8')).replace(/<time>[^<]*<\/time>/g, '');
  await desktop.getByLabel('Upload GPX file', { exact: true }).setInputFiles({ name: 'untimed-route.gpx', mimeType: 'application/gpx+xml', buffer: Buffer.from(untimed) });
  await desktop.getByText('untimed-route.gpx', { exact: true }).waitFor();
  await desktop.getByRole('button', { name: 'Details', exact: true }).click();
  check('GPX imports preserve the selected time basis', await timing.getByRole('button', { name: 'Elapsed', exact: true }).getAttribute('aria-pressed'), 'true');
  check('Untimed GPX leaves duration available for manual entry', await desktop.getByLabel('Duration', { exact: true }).inputValue(), '');
  check('Missing timestamps have a clear explanation', await desktop.getByText(/missing or invalid timestamps/).count(), 1);
  await timing.getByRole('button', { name: 'Moving', exact: true }).click();
  check('Untimed GPX does not invent moving duration', await desktop.getByLabel('Duration', { exact: true }).inputValue(), '');
  await desktop.getByLabel('Duration', { exact: true }).fill('25:00');
  await desktop.getByLabel('Average speed', { exact: true }).fill('3.0 mph');
  await desktop.locator('.poster-preview').getByText('25:00', { exact: true }).waitFor();
  await desktop.locator('.poster-preview').getByText('3.0 mph', { exact: true }).waitFor();
  report.checks.push('Untimed GPX supports manual time and speed in the artwork');
  await desktop.getByLabel('Third statistic', { exact: true }).selectOption('Pace');
  await desktop.getByRole('button', { name: 'Route', exact: true }).click();
  await desktop.getByRole('button', { name: 'Kilometers', exact: true }).click();

  await desktop.getByLabel('Upload GPX file', { exact: true }).setInputFiles(path.join(projectRoot, 'tests/fixtures/london-run.gpx'));
  await desktop.getByText('london-run.gpx', { exact: true }).waitFor();
  await desktop.getByText(/9 GPS points/).waitFor();
  await desktop.getByRole('button', { name: 'Details', exact: true }).click();
  check('Imported GPX title appears in editor', await desktop.getByLabel('Title', { exact: true }).inputValue(), 'London riverside run');
  check('Sparse moving timestamps calculate the full moving duration', await desktop.getByLabel('Duration', { exact: true }).inputValue(), '40:00');
  check('Imported timestamp supplies the activity date', await desktop.getByLabel('Date', { exact: true }).inputValue(), '16 Aug 2026');
  const distance = await desktop.getByLabel('Distance', { exact: true }).inputValue();
  assert.match(distance, /^\d+\.\d{2} km$/, 'Imported coordinates calculate metric distance');
  assert.ok(parseFloat(distance) > 4 && parseFloat(distance) < 7, `London fixture distance is plausible: ${distance}`);
  report.checks.push('GPX upload updates route and calculated statistics');
  console.log('PASS GPX upload updates route and calculated statistics');

  await desktop.getByLabel('Title', { exact: true }).fill('Forty minutes beside the Thames');
  await desktop.getByLabel('Location', { exact: true }).fill('London, United Kingdom');
  await desktop.getByLabel('Date', { exact: true }).fill('16 August 2026');
  await desktop.getByLabel('Third statistic', { exact: true }).selectOption('Avg. speed');
  assert.match(await desktop.getByLabel('Average speed', { exact: true }).inputValue(), /km\/h$/, 'Average speed derives from the selected time basis');
  await desktop.getByLabel('Average speed', { exact: true }).fill('12.0 km/h');
  const poster = desktop.locator('.poster-preview');
  await poster.getByText('Forty minutes beside the Thames', { exact: true }).waitFor();
  await poster.getByText('London, United Kingdom', { exact: false }).waitFor();
  await poster.getByText('12.0 km/h', { exact: true }).waitFor();
  await desktop.getByText('Show date', { exact: true }).click();
  check('Date switch is unchecked', await desktop.getByLabel('Show date', { exact: true }).isChecked(), false);
  check('Date visibility control updates artwork', await poster.getByText('16 August 2026', { exact: false }).count(), 0);
  await desktop.getByText('Show date', { exact: true }).click();
  await poster.getByText('16 August 2026', { exact: false }).waitFor();
  report.checks.push('Text and statistic edits update the live artwork');
  console.log('PASS Text and statistic edits update the live artwork');

  await desktop.getByRole('button', { name: 'Route', exact: true }).click();
  await desktop.getByRole('button', { name: 'Miles', exact: true }).click();
  await desktop.getByRole('button', { name: 'Details', exact: true }).click();
  check('Custom date survives switching to imperial units', await desktop.getByLabel('Date', { exact: true }).inputValue(), '16 August 2026');
  assert.match(await desktop.getByLabel('Distance', { exact: true }).inputValue(), / mi$/, 'Imperial units recalculate distance');
  assert.match(await desktop.getByLabel('Average speed', { exact: true }).inputValue(), / mph$/, 'Imperial units recalculate average speed');
  await desktop.getByRole('button', { name: 'Route', exact: true }).click();
  await desktop.getByRole('button', { name: 'Kilometers', exact: true }).click();
  await desktop.getByRole('button', { name: 'Details', exact: true }).click();
  check('Custom date survives switching back to metric units', await desktop.getByLabel('Date', { exact: true }).inputValue(), '16 August 2026');
  await desktop.getByLabel('Average speed', { exact: true }).fill('12.0 km/h');

  await desktop.getByRole('button', { name: 'Design', exact: true }).click();
  await desktop.getByRole('button', { name: 'Gallery template', exact: true }).click();
  check('Gallery template adds its print frame', await poster.locator('svg > rect').count(), 1);
  await desktop.getByRole('button', { name: 'Minimal template', exact: true }).click();
  check('Minimal template removes gallery framing', await poster.locator('svg > rect').count(), 0);
  await desktop.getByRole('button', { name: 'Gallery template', exact: true }).click();
  await desktop.getByRole('button', { name: 'Midnight palette', exact: true }).click();
  check('Palette changes paper color in artwork', await poster.evaluate((element) => getComputedStyle(element).backgroundColor), 'rgb(24, 45, 60)');
  await setColor(desktop, 'Paper color', '#f6efe3');
  await setColor(desktop, 'Text color', '#213c35');
  await setColor(desktop, 'Route line color', '#bd5c45');
  await setColor(desktop, 'Land color', '#dde8d7');
  check('Custom paper color updates artwork', await poster.evaluate((element) => getComputedStyle(element).backgroundColor), 'rgb(246, 239, 227)');
  check('Custom route color persists in controls', await desktop.getByLabel('Route line color', { exact: true }).inputValue(), '#bd5c45');

  await desktop.getByRole('button', { name: 'A4', exact: true }).click();
  await desktop.getByRole('button', { name: 'Landscape', exact: true }).click();
  await desktop.getByLabel('Print quality', { exact: true }).selectOption('150');
  await desktop.waitForTimeout(200);
  const posterBounds = await poster.boundingBox();
  assert.ok(Math.abs(posterBounds.width / posterBounds.height - 297 / 210) < 0.01, 'Landscape A4 preview preserves paper aspect ratio');
  report.checks.push('Size and orientation update preview geometry');
  console.log('PASS Size and orientation update preview geometry');
  await assertNoOverflow(desktop, 'Desktop landscape editor has no horizontal overflow');

  const mobile = await browser.newPage({ viewport: { width: 320, height: 800 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  captureErrors(mobile);
  await mobile.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await mobile.locator('.poster-preview').waitFor();
  await assertNoOverflow(mobile, '320px mobile portrait has no horizontal overflow');
  await assertCenteredDialog(mobile, '320px information dialog is centered');
  await mobile.setViewportSize({ width: 390, height: 800 });
  await mobile.getByRole('button', { name: 'Design', exact: true }).click();
  const templateBounds = await Promise.all(['The classic', 'Gallery', 'Minimal'].map((name) => mobile.getByRole('button', { name: `${name} template`, exact: true }).locator('.template-thumbnail').boundingBox()));
  assert.ok(templateBounds.every(Boolean), 'All template thumbnails are visible');
  check('Template thumbnails align when their descriptions wrap differently', Math.max(...templateBounds.map((bounds) => bounds.y)) - Math.min(...templateBounds.map((bounds) => bounds.y)) < 1, true);
  await mobile.setViewportSize({ width: 320, height: 800 });
  await mobile.getByRole('button', { name: 'Details', exact: true }).click();
  await mobile.getByRole('group', { name: 'Time basis', exact: true }).getByRole('button', { name: 'Elapsed', exact: true }).click();
  await assertNoOverflow(mobile, '320px elapsed-time controls have no horizontal overflow');
  await mobile.getByRole('group', { name: 'Time basis', exact: true }).getByRole('button', { name: 'Moving', exact: true }).click();
  await assertNoOverflow(mobile, '320px moving-time controls have no horizontal overflow');
  await mobile.getByLabel('Title', { exact: true }).fill('A long title to remember a very special achievement along the way');
  await mobile.getByLabel('Location', { exact: true }).fill('A beautiful place with a very long location name');
  await mobile.getByRole('button', { name: 'Landscape', exact: true }).click();
  await mobile.getByRole('button', { name: 'A4', exact: true }).click();
  await mobile.waitForTimeout(200);
  await assertNoOverflow(mobile, '320px mobile landscape with long copy has no horizontal overflow');
  await mobile.screenshot({ path: path.join(resultsDir, 'mobile-320.png'), fullPage: true });
  const mobilePrintSizes = await mobile.locator('.paper-sizes button').evaluateAll((buttons) => buttons.map((button) => ({ width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })));
  await mobile.getByRole('button', { name: 'Share', exact: true }).click();
  const mobileShareSizes = await mobile.locator('.share-sizes button').evaluateAll((buttons) => buttons.map((button) => ({ width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })));
  check('320px Share buttons match Print buttons', JSON.stringify(mobileShareSizes), JSON.stringify(mobilePrintSizes));
  for (const name of ['Instagram post', 'Square', 'Story', 'Wide']) {
    await mobile.getByRole('button', { name, exact: true }).click();
    await mobile.waitForTimeout(150);
    await assertNoOverflow(mobile, `320px ${name} sharing editor has no horizontal overflow`);
  }
  await mobile.screenshot({ path: path.join(resultsDir, 'mobile-320-wide.png'), fullPage: true });
  await mobile.getByRole('button', { name: 'Print', exact: true }).click();
  await mobile.getByRole('button', { name: 'A3', exact: true }).click();
  await assertNoOverflow(mobile, '320px editor with all four paper sizes has no horizontal overflow');
  await mobile.close();

  await waitForMap(desktop);
  await desktop.screenshot({ path: path.join(resultsDir, 'desktop-customized.png'), fullPage: true });
  await desktop.getByRole('button', { name: 'PNG', exact: true }).click();
  const png = await saveDownload(desktop, () => desktop.getByRole('button', { name: /^Download (print|again)$/ }).click(), 'a4-landscape-150dpi.png');
  validatePng(png.bytes, 1754, 1240, 150);
  report.downloads.push({ type: 'PNG', file: png.target, suggestedFilename: png.suggestedFilename, bytes: png.bytes.length });
  await desktop.getByRole('button', { name: 'PDF', exact: true }).click();
  const pdf = await saveDownload(desktop, () => desktop.getByRole('button', { name: /^Download (print|again)$/ }).click(), 'a4-landscape.pdf');
  await validatePdf(pdf.bytes, 297, 210);
  report.downloads.push({ type: 'PDF', file: pdf.target, suggestedFilename: pdf.suggestedFilename, bytes: pdf.bytes.length });

  await desktop.getByRole('button', { name: 'Share', exact: true }).click();
  const shareButtonSizes = await desktop.locator('.share-sizes button').evaluateAll((buttons) => buttons.map((button) => ({ width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })));
  check('Desktop Share buttons match Print buttons', JSON.stringify(shareButtonSizes), JSON.stringify(printButtonSizes));
  check('Share mode hides print quality', await desktop.getByLabel('Print quality', { exact: true }).count(), 0);
  check('Share mode hides PDF and print orientation', await desktop.getByRole('button', { name: 'PDF', exact: true }).count() + await desktop.getByRole('button', { name: 'Landscape', exact: true }).count(), 0);
  for (const [name, id, width, height] of [
    ['Instagram post', 'instagram-post', 1080, 1440],
    ['Square', 'square', 1080, 1080],
    ['Story', 'story', 1080, 1920],
    ['Wide', 'wide', 1920, 1080],
  ]) {
    await desktop.getByRole('button', { name, exact: true }).click();
    await waitForMap(desktop);
    const bounds = await poster.boundingBox();
    assert.ok(Math.abs(bounds.width / bounds.height - width / height) < 0.01, `${name} uses the fixed sharing ratio despite the landscape print setting`);
    check(`${name} omits copyright line`, await poster.getByText(/OpenStreetMap contributors/).count(), 0);
    await desktop.screenshot({ path: path.join(resultsDir, `desktop-share-${id}.png`), fullPage: true });
    const image = await saveDownload(desktop, () => desktop.getByRole('button', { name: 'Download PNG', exact: true }).click(), `share-${id}.png`);
    validatePng(image.bytes, width, height);
    assert.ok(image.suggestedFilename.endsWith(`-${id}-${width}x${height}.png`), `${name} filename identifies fixed pixel size`);
    report.downloads.push({ type: `Sharing PNG (${name})`, file: image.target, suggestedFilename: image.suggestedFilename, bytes: image.bytes.length });
  }
  await desktop.getByRole('button', { name: 'Print', exact: true }).click();
  check('Print mode restores landscape orientation', await desktop.getByRole('button', { name: 'Landscape', exact: true }).getAttribute('aria-pressed'), 'true');
  check('Print mode restores paper size', await desktop.getByRole('button', { name: 'A4', exact: true }).getAttribute('aria-pressed'), 'true');
  check('Print mode restores PDF export', await desktop.getByRole('button', { name: 'PDF', exact: true }).getAttribute('aria-pressed'), 'true');
  check('Print mode restores quality', await desktop.getByLabel('Print quality', { exact: true }).inputValue(), '150');

  await desktop.getByRole('button', { name: 'Route', exact: true }).click();
  await desktop.getByLabel('Upload GPX file', { exact: true }).setInputFiles(path.join(projectRoot, 'tests/fixtures/dateline-crossing.gpx'));
  await desktop.getByText('dateline-crossing.gpx', { exact: true }).waitFor();
  await desktop.getByRole('button', { name: 'Details', exact: true }).click();
  await desktop.getByLabel('Title', { exact: true }).fill('夕暮れの冒険 🏃');
  await desktop.getByLabel('Location', { exact: true }).fill('Across the international date line');
  await waitForMap(desktop);
  await desktop.screenshot({ path: path.join(resultsDir, 'dateline-unicode.png'), fullPage: true });
  const unicodePdf = await saveDownload(desktop, () => desktop.getByRole('button', { name: /^Download (print|again)$/ }).click(), 'dateline-unicode.pdf');
  const unicodeDoc = await PDFDocument.load(unicodePdf.bytes);
  check('Unicode title survives PDF metadata', unicodeDoc.getTitle(), '夕暮れの冒険 🏃');
  const imageResources = unicodeDoc.getPage(0).node.Resources().lookup(PDFName.of('XObject'), PDFDict);
  assert.ok(imageResources.keys().length >= 2, 'Unicode PDF includes both map and fallback caption artwork');
  report.checks.push('Date-line crossing map and Unicode caption export successfully');
  console.log('PASS Date-line crossing map and Unicode caption export successfully');
  report.downloads.push({ type: 'PDF Unicode', file: unicodePdf.target, bytes: unicodePdf.bytes.length });

  await desktop.getByRole('button', { name: 'Route', exact: true }).click();
  await desktop.getByRole('button', { name: 'Try the example route', exact: true }).click();
  await desktop.getByLabel('Print quality', { exact: true }).selectOption('300');
  await desktop.getByRole('button', { name: 'PNG', exact: true }).click();
  await waitForMap(desktop);
  await desktop.screenshot({ path: path.join(resultsDir, 'desktop-default-ready.png'), fullPage: true });
  const largePng = await saveDownload(desktop, () => desktop.getByRole('button', { name: /^Download (print|again)$/ }).click(), '30x40-300dpi.png');
  validatePng(largePng.bytes, 3543, 4724, 300);
  report.downloads.push({ type: 'PNG 300 DPI', file: largePng.target, bytes: largePng.bytes.length });

  await desktop.getByRole('button', { name: 'Route', exact: true }).click();
  await desktop.getByLabel('Upload GPX file', { exact: true }).setInputFiles(path.join(projectRoot, 'tests/fixtures/paused-walk.gpx'));
  await desktop.getByText('paused-walk.gpx', { exact: true }).waitFor();
  await desktop.getByRole('button', { name: 'Details', exact: true }).click();
  check('Moving duration reaches the live print artwork', await desktop.locator('.poster-preview').getByText('3:00', { exact: true }).count(), 1);
  await desktop.getByRole('button', { name: 'A4', exact: true }).click();
  await desktop.getByLabel('Print quality', { exact: true }).selectOption('150');
  await waitForMap(desktop);
  await desktop.screenshot({ path: path.join(resultsDir, 'desktop-moving-time.png'), fullPage: true });
  const movingPng = await saveDownload(desktop, () => desktop.getByRole('button', { name: /^Download (print|again)$/ }).click(), 'moving-time-a4-150dpi.png');
  validatePng(movingPng.bytes, 1240, 1754, 150);
  report.downloads.push({ type: 'PNG moving time', file: movingPng.target, bytes: movingPng.bytes.length });
  await desktop.getByRole('button', { name: 'PDF', exact: true }).click();
  const movingPdf = await saveDownload(desktop, () => desktop.getByRole('button', { name: /^Download (print|again)$/ }).click(), 'moving-time-a4.pdf');
  await validatePdf(movingPdf.bytes, 210, 297);
  report.downloads.push({ type: 'PDF moving time', file: movingPdf.target, bytes: movingPdf.bytes.length });

  check('No uncaught browser runtime errors', runtimeErrors.length, 0);
  await desktop.close();
} catch (error) {
  report.failure = error.stack ?? String(error);
  const page = browser.contexts()[0]?.pages()[0];
  if (page) await page.screenshot({ path: path.join(resultsDir, 'browser-qa-failure.png'), fullPage: true }).catch(() => {});
  throw error;
} finally {
  await writeFile(path.join(resultsDir, 'browser-qa-report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
