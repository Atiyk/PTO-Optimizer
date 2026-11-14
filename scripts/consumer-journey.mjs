/**
 * Final consumer journey, enabled only once phases 1–8 are integrated.
 * node scripts/consumer-journey.mjs http://127.0.0.1:4177 /absolute/evidence/path
 * Fresh mobile contexts, synthetic US 2027 inputs, no accounts or external messages.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { chromium } from 'playwright';

const [base = 'http://127.0.0.1:4177', output = 'qa-evidence/journey'] = process.argv.slice(2);
const origin = new URL(base).origin;
if (!['http:', 'https:'].includes(new URL(base).protocol)) throw new Error('Use an HTTP(S) consumer fixture URL.');
const out = resolve(output);
await mkdir(out, { recursive: true });
const report = { status: 'running', viewport: { width: 375, height: 812 },
  fixture: 'US 2027 dates, fresh browser storage, fixed January 1, 2027 clock.',
  routing: 'Vite slashless consumer documents are served from their directory index, matching Vercel clean URLs.',
  clipboard: 'Text clipboard enabled in synthetic contexts; PNG clipboard denial intentionally exercises download fallback.',
  results: [], runtimeErrors: [], unexpectedAccountRequests: [] };
const contexts = [];
let browser;
let main;
let mainContext;
let trackedCost;
let trackedStart;
const privateNote = 'qa-private-note-2027';
const ptoPath = '/pto/?c=US&s=2027-01-15&e=2027-01-24&b=2&rv=0&pv=2&ps=long-breaks&mb=3';
const holidayPath = '/pto/?c=US&s=2027-12-20&e=2027-12-31&b=4&rv=0&pv=2&ps=custom&mb=3';
class EvidenceUnavailable extends Error { status = 'unavailable'; }

async function eventually(check, message, timeout = 10000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try { return await check(); } catch (error) { last = error; await pause(100); }
  }
  throw new Error(`${message}: ${last instanceof Error ? last.message : String(last)}`);
}

async function screenshot(page, filename) {
  await page.screenshot({ path: resolve(out, filename), fullPage: false });
}

async function check(name, action) {
  try {
    await action();
    report.results.push({ name, status: 'passed' });
    console.log(JSON.stringify({ kind: 'journey', name, status: 'passed' }));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const status = error instanceof EvidenceUnavailable ? 'unavailable' : 'failed';
    report.results.push({ name, status, reason });
    console.error(JSON.stringify({ kind: 'journey', name, status, reason }));
    if (main && !main.isClosed()) await screenshot(main, `failure-${report.results.length}.png`).catch(() => {});
  }
}

async function mobileContext() {
  const context = await browser.newContext({ viewport: report.viewport, locale: 'en-US', timezoneId: 'America/New_York',
    reducedMotion: 'reduce', colorScheme: 'light', acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
  contexts.push(context);
  await context.addInitScript(() => {
    // Inspect strings actually sent to the PNG canvas, rather than trusting only an
    // accessibility summary when checking balance privacy. No production code changes.
    const textByCanvas = new WeakMap();
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
      const texts = textByCanvas.get(this.canvas) ?? [];
      texts.push(String(text)); textByCanvas.set(this.canvas, texts);
      return fillText.call(this, text, ...args);
    };
    window.__gaplessQaCanvasText = (canvas) => textByCanvas.get(canvas) ?? [];
    try {
      Object.defineProperty(navigator.clipboard, 'write', { configurable: true,
        value: async () => { throw new DOMException('Synthetic PNG clipboard denial', 'NotAllowedError'); } });
    } catch {
      // The renderer also supports browsers without ClipboardItem. Keeping its property
      // present but unavailable makes the existing guarded write fall back normally.
      Object.defineProperty(window, 'ClipboardItem', { configurable: true, value: undefined });
    }
  });
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === origin && /^\/(?:api|auth|apps\/teams)(?:\/|$)/.test(url.pathname)) {
      report.unexpectedAccountRequests.push({ path: url.pathname, method: request.method() });
    }
    if (url.origin === origin && url.pathname === '/_vercel/insights/script.js') {
      await route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }); return;
    }
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) { await route.abort(); return; }
    if (request.resourceType() === 'document' && ['/pto', '/policy', '/sabbatical'].includes(url.pathname)) {
      url.pathname += '/';
      await route.fulfill({ response: await route.fetch({ url: url.href }) }); return;
    }
    await route.continue();
  });
  context.on('page', (page) => page.on('pageerror', (error) => report.runtimeErrors.push(error.message)));
  return context;
}

async function waitForPlanner(page) {
  await page.locator('main[data-plan-ready="true"]').waitFor({ state: 'visible' });
}

async function open(context, path) {
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date('2027-01-01T17:00:00Z'));
  const planner = /^\/pto\/?$/.test(new URL(path, origin).pathname);
  await page.goto(new URL(path, origin).href, { waitUntil: planner ? 'domcontentloaded' : 'networkidle' });
  await page.locator('#root').waitFor({ state: 'visible' });
  if (planner) await waitForPlanner(page);
  return page;
}

async function noOverflow(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, '375px page must not overflow horizontally.');
}

async function moreOptions(page) {
  const button = page.getByRole('button', { name: /More options|Hide options/ });
  if (await button.getAttribute('aria-expanded') !== 'true') await button.click();
}

function holidaySection(page) {
  return page.locator('section').filter({ has: page.getByRole('heading', { name: "My employer's holidays", exact: true }) });
}

async function clipboardText(page) { return page.evaluate(() => navigator.clipboard.readText()); }
const numberIn = (text) => Number(text.replaceAll(',', '').replaceAll('−', '-').match(/-?\d+(?:\.\d+)?/)?.[0]);
const forecastRegion = (page) => page.getByRole('region', { name: 'PTO balance forecast', exact: true });
async function forecastBalance(page) { return numberIn(await forecastRegion(page).locator('[aria-live="polite"]').innerText()); }
async function forecastScheduled(page) {
  const region = forecastRegion(page);
  return Math.abs(numberIn(await region.getByText('Scheduled PTO', { exact: true }).locator('..').locator('dd').innerText()));
}

function datesBetween(start, end) {
  const dates = [];
  for (let time = Date.parse(`${start}T00:00:00Z`); time <= Date.parse(`${end}T00:00:00Z`); time += 86400000) dates.push(new Date(time).toISOString().slice(0, 10));
  return dates;
}

function disclosedDays(url) {
  assert.equal(new URL(url).pathname, '/pto', 'Partner shares must use the canonical consumer planner route.');
  const params = new URL(url).searchParams;
  assert.deepEqual([...params.keys()].sort(), ['e', 'pp', 's'], 'Partner links must contain only disclosed availability and its date bounds.');
  const payload = params.get('pp');
  assert.ok(payload && payload.length <= 12000);
  const parts = payload.split(':');
  assert.equal(parts.length, 4);
  const [version, status, compact, free] = parts;
  assert.equal(version, '1'); assert.equal(status, 'p', 'Availability is proposed unless explicitly confirmed.');
  const expand = (raw) => raw.split(',').filter(Boolean).flatMap((part) => {
    assert.match(part, /^\d{8}(?:~\d{8})?$/);
    const [first, last = first] = part.split('~');
    const iso = (value) => `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
    const days = datesBetween(iso(first), iso(last));
    assert.ok(days.length > 0 && days.length <= 1100); return days;
  });
  const days = [...new Set(expand(compact))];
  assert.ok(days.length > 0 && days.length <= 1100);
  if (free !== '-') assert.ok(expand(free).every((day) => days.includes(day)));
  assert.equal(params.get('s'), days[0]); assert.equal(params.get('e'), days[days.length - 1]);
  return days;
}

async function assertPng(download, filename) {
  const path = resolve(out, filename);
  await download.saveAs(path);
  const bytes = await readFile(path);
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(bytes.readUInt32BE(16), 1080); assert.equal(bytes.readUInt32BE(20), 1350);
}

async function verifyAnalyticsTransport() {
  const virtualOrigin = 'https://gapless-privacy.example';
  const sources = [
    { provider: 'plausible', url: 'https://plausible.io/js/script.manual.js' },
    { provider: 'vercel', url: 'https://pto-optimizer-seven.vercel.app/_vercel/insights/script.js' },
  ];
  const scripts = await Promise.all(sources.map(async source => {
    try {
      const response = await fetch(source.url, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.text();
      if (body.length < 500 || /^\s*</.test(body)) throw new Error('Expected the actual JavaScript SDK.');
      await writeFile(resolve(out, `sdk-${source.provider}.js`), body);
      return { ...source, body, bytes: Buffer.byteLength(body), sha256: createHash('sha256').update(body).digest('hex') };
    } catch (error) { throw new EvidenceUnavailable(`Actual ${source.provider} SDK unavailable: ${error.message}`); }
  }));
  const captures = [];
  const loads = [];
  report.analytics = { sources: scripts.map(({ body: _body, ...source }) => source), captures, loads,
    fixture: 'Route-backed HTTPS origin; actual unmodified hosted SDKs; mobile user agent and webdriver=false opt into SDK transport; all analytics POSTs fulfilled locally.' };
  const sensitive = ['139.25', 'qa-sdk-private-note-2027', 'qa-sdk-private-fragment', '2027-01-15', '2027-01-24', '2027-01-01'];
  for (const unsafe of [false, true]) {
    const context = await browser.newContext({ viewport: report.viewport, locale: 'en-US', timezoneId: 'America/New_York',
      userAgent: `Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browser.version()} Mobile Safari/537.36` });
    contexts.push(context);
    await context.addInitScript(() => {
      // The official SDKs deliberately skip automation. Only this isolated fixture
      // opts into their real transport so zero captured POSTs cannot be a bot skip.
      Object.defineProperty(Navigator.prototype, 'webdriver', { configurable: true, get: () => false });
      window.__plausible = true;
    });
    await context.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      const source = scripts.find(script => script.provider === 'vercel'
        ? url.origin === virtualOrigin && url.pathname === '/_vercel/insights/script.js'
        : url.href === script.url);
      if (source && request.method() === 'GET') {
        loads.push({ visit: unsafe ? 'unsafe-referrer' : 'safe', provider: source.provider, headers: await request.allHeaders() });
        await route.fulfill({ status: 200, contentType: 'application/javascript', body: source.body }); return;
      }
      if (request.method() === 'POST') {
        const provider = url.hostname === 'plausible.io' && url.pathname === '/api/event' ? 'plausible'
          : url.origin === virtualOrigin && url.pathname.startsWith('/_vercel/insights/') ? 'vercel' : 'unexpected';
        captures.push({ visit: unsafe ? 'unsafe-referrer' : 'safe', provider, path: url.origin + url.pathname,
          body: request.postData() ?? '', headers: await request.allHeaders() });
        await route.fulfill({ status: 204, body: '' }); return;
      }
      if (url.origin === virtualOrigin) {
        const local = new URL(url.pathname + url.search, origin);
        if (request.resourceType() === 'document' && ['/pto', '/policy', '/sabbatical'].includes(local.pathname)) local.pathname += '/';
        const response = await context.request.get(local.href);
        await route.fulfill({ response }); return;
      }
      // This includes any SDK endpoint or dependency not explicitly recognized.
      // No analytics request can leave the synthetic browser fixture.
      await route.abort();
    });
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date('2027-01-01T17:00:00Z'));
    const referer = unsafe ? `${virtualOrigin}/legacy?cb=139.25&note=qa-sdk-private-note-2027` : `${virtualOrigin}/`;
    await page.goto(`${virtualOrigin}/policy/?b=7&s=2027-01-15&e=2027-01-24&cb=139.25&bao=2027-01-01&note=qa-sdk-private-note-2027#qa-sdk-private-fragment`, { referer, waitUntil: 'networkidle' });
    await page.getByRole('heading', { level: 1, name: 'How much PTO will I have, and what am I about to lose?', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => navigator.webdriver), false);
    assert.equal(await page.evaluate(() => document.referrer), referer, 'The incoming referrer must be real browser state, including the unsafe canary.');
    try {
      await eventually(async () => assert.equal(await page.evaluate(() => !!window.plausible?.l && window.vai === true), true), 'Both actual SDKs must initialize');
    } catch (error) { throw new EvidenceUnavailable(`Analytics transport unavailable: ${error.message}`); }
    await page.getByLabel('Current PTO balance (days)', { exact: true }).fill('139.25');
    await page.getByLabel('Forecast my balance on', { exact: true }).fill('2027-02-01');
    if (unsafe) {
      await pause(1000);
      assert.equal(captures.filter(entry => entry.visit === 'unsafe-referrer').length, 0, 'Unsafe incoming planning referrers must suppress both providers.');
    } else {
      try {
        await eventually(async () => {
          for (const provider of ['plausible', 'vercel']) assert.ok(captures.some(entry => entry.visit === 'safe' && entry.provider === provider
            && (provider === 'plausible' ? JSON.parse(entry.body).n === 'pageview' : entry.path.endsWith('/view'))));
        }, 'Both actual SDKs must emit a captured safe pageview');
      } catch (error) { throw new EvidenceUnavailable(`Analytics transport unavailable: ${error.message}`); }
      await pause(250);
    }
    await page.close();
  }
  for (const entry of captures) {
    assert.notEqual(entry.provider, 'unexpected', 'Unexpected POST transport must be reviewed.');
    const body = JSON.parse(entry.body);
    assert.equal(entry.provider === 'plausible' ? body.u : body.o, `${virtualOrigin}/policy/`);
    const wire = JSON.stringify({ body, headers: entry.headers });
    for (const value of sensitive) assert.ok(!wire.includes(value), `Planning canary leaked into ${entry.provider} wire data: ${value}`);
    assert.doesNotMatch(wire, /[?&](?:b|s|e|cb|bao|note)=/i);
    assert.ok(!entry.headers.referer, 'Early no-referrer policy must remove HTTP Referer from analytics POSTs.');
  }
  for (const entry of loads) assert.ok(!entry.headers.referer, 'Hosted SDK requests must also have no HTTP Referer.');
  assert.equal(loads.length, 4, 'Both real SDKs must be served in both independent visits.');
  console.log(JSON.stringify({ kind: 'analytics-transport', status: 'passed', safePosts: captures.length,
    unsafePosts: 0, sources: report.analytics.sources }));
}

try {
  browser = await chromium.launch({ headless: true, ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}) });
  await check('Impossible pinned dates keep the calendar visible and recover without losing other inputs', async () => {
    const context = await mobileContext();
    const page = await open(context, '/pto/?c=US&s=2027-01-15&e=2027-01-24&b=0&rv=0&pv=2&ps=custom&mb=3&p=2027-01-19');
    const calendarDay = page.locator('button[data-date="2027-01-19"]');
    const warning = page.getByRole('alert', { name: 'Planning needs attention' });
    await eventually(async () => {
      assert.equal(await warning.count(), 1, 'The impossible pinned day must produce an actionable warning.');
      assert.equal(await calendarDay.count(), 1, 'The calendar must stay mounted despite a solver issue.');
      assert.equal(await calendarDay.isEnabled(), true, 'The selected date must remain editable.');
    }, 'Solver recovery UI must remain interactive');
    await page.setViewportSize({ width: 320, height: 812 });
    await noOverflow(page);
    await screenshot(page, '06-pinned-recovery-before-320.png');
    await warning.getByRole('button', { name: 'Review advanced settings' }).click();
    assert.equal(await page.getByRole('button', { name: /Hide options/ }).getAttribute('aria-expanded'), 'true');
    await warning.getByRole('button', { name: 'Clear pinned and excluded dates' }).click();
    await eventually(async () => {
      assert.equal(new URL(page.url()).searchParams.has('p'), false, 'Reset must remove the pinned date from the shareable plan URL.');
      assert.equal(await warning.count(), 0, 'A resolved constraint should remove the warning.');
      assert.equal(await calendarDay.count(), 1, 'The calendar must remain visible after recovery.');
    }, 'Clearing only forced dates must recover the plan');
    await eventually(async () => assert.equal(
      await page.evaluate(() => document.activeElement?.id),
      'complete-plan-heading',
      'Keyboard focus should return to the complete plan heading after the recovery notice disappears.',
    ), 'Focus recovery after clearing forced dates');
    assert.equal(new URL(page.url()).searchParams.get('b'), '0', 'Reset must preserve the PTO budget.');
    assert.equal(new URL(page.url()).searchParams.get('s'), '2027-01-15', 'Reset must preserve the planning dates.');
    await waitForPlanner(page);
    assert.equal(await page.getByRole('button', { name: 'Save this plan', exact: true }).isEnabled(), true, 'A valid zero-budget plan can still be saved.');
    assert.equal(await page.getByRole('button', { name: 'Copy link', exact: true }).isEnabled(), true, 'A valid zero-budget scenario remains shareable.');
    await noOverflow(page);
    await screenshot(page, '06-pinned-recovery-after-320.png');
    await page.close();
  });
  await check('A saved break and a saved scenario both resume from local storage', async () => {
    const context = await mobileContext();
    const page = await open(context, ptoPath.replace('b=2', 'b=3'));
    const card = page.locator('[data-break-start][data-break-end][data-break-pto]').first();
    const start = await card.getAttribute('data-break-start');
    assert.ok(start);
    await card.getByRole('button', { name: 'Save break', exact: true }).click();
    await card.getByText('Saved', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Save this plan', exact: true }).click();
    const savedPlans = page.getByRole('list', { name: 'Saved plans', exact: true });
    await savedPlans.getByRole('button', { name: 'Restore', exact: true }).waitFor();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForPlanner(page);
    await card.getByText('Saved', { exact: true }).waitFor();
    await page.getByLabel('PTO days available', { exact: true }).fill('2');
    await eventually(() => assert.equal(new URL(page.url()).searchParams.get('b'), '2'), 'The active scenario should change');
    await savedPlans.getByRole('button', { name: 'Restore', exact: true }).click();
    await eventually(() => assert.equal(new URL(page.url()).searchParams.get('b'), '3'), 'Restore should reinstate the saved scenario');
    const myPto = await open(context, '/policy/#requests');
    const tracked = myPto.getByRole('region', { name: 'My PTO requests', exact: true });
    const status = tracked.getByRole('combobox', { name: `Status for request ${start}`, exact: true });
    assert.equal(await status.inputValue(), 'considering');
    assert.equal(await tracked.getByRole('article').count(), 1);
    await noOverflow(myPto);
    await screenshot(myPto, '00-considering-saved-375.png');
    await myPto.close();
    await page.close();
  });
  await check('Live plan → track → requested → approved → forecast → refresh, without duplicate deductions', async () => {
    mainContext = await mobileContext(); main = await open(mainContext, ptoPath);
    const initialHeadline = await main.locator('h1').innerText();
    await main.getByLabel('PTO days available', { exact: true }).fill('3');
    await eventually(async () => {
      assert.equal(new URL(main.url()).searchParams.get('b'), '3');
      assert.notEqual(await main.locator('h1').innerText(), initialHeadline);
    }, 'PTO input should update the live plan without submission');
    assert.equal(await main.getByRole('button', { name: /^(?:Generate|Submit)/i }).count(), 0);
    const trackButton = main.getByRole('region', { name: 'Requesting each break', exact: true }).getByRole('button', { name: 'Track this PTO request', exact: true }).first();
    await trackButton.click();
    // The planner confirms on the card and counts the request; the tracker itself lives in
    // My PTO (one place to edit requests), reached from the planner's request line.
    const cards = main.getByRole('region', { name: 'Requesting each break', exact: true });
    const requestLine = main.getByRole('region', { name: 'My PTO requests', exact: true });
    await cards.getByTestId('committed-entry').waitFor({ state: 'visible' });
    assert.equal(await cards.getByTestId('committed-entry').count(), 1);
    assert.match(await cards.getByTestId('committed-entry').innerText(), /Tracked/);
    assert.equal(await requestLine.getByTestId('request-count').innerText(), 'My PTO has 1 request from this browser.');
    // The card recognizes the saved request on return and never offers a duplicate.
    assert.equal(await trackButton.count(), 0, 'A tracked break must confirm in place instead of offering Track again.');
    await main.reload({ waitUntil: 'domcontentloaded' });
    await waitForPlanner(main);
    await eventually(async () => {
      assert.equal(await cards.getByTestId('committed-entry').count(), 1);
      assert.equal(await requestLine.getByTestId('request-count').innerText(), 'My PTO has 1 request from this browser.');
      assert.equal(await trackButton.count(), 0);
    }, 'A reload should restore the same request and keep its card marked as tracked.');
    assert.equal(await main.getByRole('link', { name: 'Forecast my balance and check expiration', exact: true }).getAttribute('href'), '/policy#balance');
    await requestLine.getByRole('link', { name: 'Manage requests in My PTO', exact: true }).click();
    await main.getByRole('heading', { level: 1, name: 'How much PTO will I have, and what am I about to lose?', exact: true }).waitFor();
    const tracker = main.getByRole('region', { name: 'My PTO requests', exact: true });
    await tracker.getByRole('article').waitFor({ state: 'visible' });
    assert.equal(await tracker.getByRole('article').count(), 1);
    const row = tracker.getByRole('article');
    trackedStart = await row.locator('input[type="date"]').nth(0).inputValue();
    const end = await row.locator('input[type="date"]').nth(1).inputValue();
    trackedCost = datesBetween(trackedStart, end).filter((date) => {
      const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
      return dow !== 0 && dow !== 6 && date !== '2027-01-18';
    }).length;
    assert.ok(trackedCost > 0 && trackedCost <= 3);
    assert.match(await row.innerText(), new RegExp(`${trackedCost} PTO days?`));
    await row.getByRole('combobox', { name: `Status for request ${trackedStart}`, exact: true }).selectOption('requested');
    await row.locator('summary').filter({ hasText: 'Personal note' }).click();
    await row.getByLabel(`Personal note for request ${trackedStart}`, { exact: true }).fill(privateNote);
    assert.ok(!main.url().includes(privateNote));
    await noOverflow(main); await screenshot(main, '01-requested-375.png');
    const quick = main.getByRole('region', { name: 'Quick balance forecast', exact: true });
    await quick.getByLabel('Current PTO balance (days)', { exact: true }).fill('20');
    await quick.getByLabel('Balance as-of date', { exact: true }).fill('2027-01-01');
    await quick.getByLabel('How PTO accrues', { exact: true }).selectOption('front-loaded');
    await quick.getByLabel('Days earned each grant', { exact: true }).fill('0');
    await quick.getByLabel('Annual grant date', { exact: true }).fill('2027-01-01');
    await quick.getByLabel('Expiry and carryover', { exact: true }).selectOption('all');
    await main.getByLabel('Forecast my balance on', { exact: true }).fill('2027-01-31');
    await eventually(async () => {
      assert.equal(await forecastBalance(main), 20);
      assert.equal(await forecastScheduled(main), 0);
      assert.equal(numberIn(await forecastRegion(main).locator('strong').innerText()), 20 - trackedCost);
    }, 'Requested leave should be tentative, without reducing the confirmed forecast');
    const status = main.getByRole('region', { name: 'My PTO requests', exact: true }).getByRole('combobox', { name: `Status for request ${trackedStart}`, exact: true });
    await status.selectOption('approved');
    await eventually(async () => {
      assert.equal(await forecastBalance(main), 20 - trackedCost);
      assert.equal(await forecastScheduled(main), trackedCost);
    }, 'Approval should deduct each PTO working date once');
    await status.selectOption('canceled');
    await eventually(async () => { assert.equal(await forecastBalance(main), 20); assert.equal(await forecastScheduled(main), 0); }, 'Canceling should release future consumption');
    await status.selectOption('approved');
    await eventually(async () => assert.equal(await forecastBalance(main), 20 - trackedCost), 'Correcting status must not add another deduction');
    await main.reload({ waitUntil: 'networkidle' });
    await eventually(async () => {
      assert.equal(await main.getByRole('combobox', { name: `Status for request ${trackedStart}`, exact: true }).inputValue(), 'approved');
      assert.equal(await forecastBalance(main), 20 - trackedCost);
      assert.equal(await forecastScheduled(main), trackedCost);
    }, 'Status and forecast must survive refresh');
    await noOverflow(main); await forecastRegion(main).screenshot({ path: resolve(out, '02-approved-forecast-375.png') });
  });

  await check('Employer calendar saves, resets, and public share reproduces the sender plan without overwriting recipient preferences', async () => {
    const recipientContext = await mobileContext();
    const recipient = await open(recipientContext, holidayPath);
    await eventually(async () => assert.match(await recipient.locator('#day-2027-12-24').getAttribute('aria-label'), /public holiday/), 'Public holidays should load');
    await moreOptions(recipient);
    const holidays = holidaySection(recipient);
    await holidays.getByRole('checkbox', { name: /2027-12-24.*Christmas Day/ }).uncheck();
    await holidays.getByRole('button', { name: 'Save employer calendar', exact: true }).click();
    await eventually(async () => assert.match(await holidays.getByRole('status').innerText(), /saved in this browser/), 'Calendar save should report success');
    const saved = await recipient.evaluate(() => localStorage.getItem('gapless.employer.v1:US:'));
    assert.ok(saved?.includes('Christmas Day'));
    await recipient.goto(new URL(holidayPath, origin).href, { waitUntil: 'domcontentloaded' });
    await waitForPlanner(recipient);
    await eventually(async () => assert.doesNotMatch(await recipient.locator('#day-2027-12-24').getAttribute('aria-label'), /public holiday/), 'Saved exclusions should survive a fresh URL');
    const sender = await open(await mobileContext(), holidayPath);
    await sender.getByRole('button', { name: 'Copy link', exact: true }).click();
    const sharedDefault = await clipboardText(sender);
    assert.equal(new URL(sharedDefault).searchParams.has('eh'), false, 'Copied public plans must not expose employer calendar overrides.');
    await recipient.goto(sharedDefault, { waitUntil: 'domcontentloaded' });
    await waitForPlanner(recipient);
    // Issue 9: the shared plan is the sender's (public holidays); the recipient's saved
    // calendar is offered, applied only on request, and never overwritten.
    await eventually(async () => assert.match(await recipient.locator('#day-2027-12-24').getAttribute('aria-label'), /public holiday/), 'Public plans must reproduce the sender plan, not apply the recipient saved calendar.');
    assert.match(await recipient.getByTestId('shared-plan-notice').innerText(), /saved company calendar isn.t applied/);
    await recipient.getByRole('button', { name: 'Use my saved calendar', exact: true }).click();
    await eventually(async () => assert.doesNotMatch(await recipient.locator('#day-2027-12-24').getAttribute('aria-label'), /public holiday/), 'Use my saved calendar must apply the recipient saved holiday exclusions.');
    assert.equal(await recipient.evaluate(() => localStorage.getItem('gapless.employer.v1:US:')), saved);
    await recipient.goto(new URL(holidayPath, origin).href, { waitUntil: 'domcontentloaded' });
    await waitForPlanner(recipient);
    await eventually(async () => assert.doesNotMatch(await recipient.locator('#day-2027-12-24').getAttribute('aria-label'), /public holiday/), 'Opening a share must not persist someone else’s preferences');
    await moreOptions(recipient);
    // December 31 is the observed New Year's Day holiday from 2028; choose a
    // distinct workday so this assertion exercises the new company holiday.
    await holidaySection(recipient).getByLabel('Company holiday date', { exact: true }).fill('2027-12-30');
    await holidaySection(recipient).getByLabel('Company holiday name', { exact: true }).fill('QA company closure 2027');
    await holidaySection(recipient).getByRole('button', { name: 'Add', exact: true }).click();
    await holidaySection(recipient).getByRole('checkbox', { name: /2027-12-30.*QA company closure 2027/ }).waitFor();
    await holidaySection(recipient).getByRole('button', { name: 'Save employer calendar', exact: true }).click();
    await recipient.goto(new URL(holidayPath, origin).href, { waitUntil: 'domcontentloaded' });
    await waitForPlanner(recipient);
    await eventually(async () => assert.match(await recipient.locator('#day-2027-12-30').getAttribute('aria-label'), /QA company closure 2027/), 'Company holidays must persist');
    await moreOptions(recipient);
    await holidaySection(recipient).getByRole('button', { name: 'Restore public holidays', exact: true }).click();
    await recipient.goto(new URL(holidayPath, origin).href, { waitUntil: 'domcontentloaded' });
    await waitForPlanner(recipient);
    await eventually(async () => {
      assert.match(await recipient.locator('#day-2027-12-24').getAttribute('aria-label'), /public holiday/);
      assert.doesNotMatch(await recipient.locator('#day-2027-12-30').getAttribute('aria-label'), /QA company closure 2027/);
    }, 'Reset must remove saved exceptions');
    await noOverflow(recipient); await screenshot(recipient, '03-employer-calendar-reset-375.png');
  });

  await check('Browser addresses, public copies and date-only calendar subscriptions omit private titles', async () => {
    const secret = 'PRIVATE_EMPLOYER_POLICY_TITLE';
    const page = await open(await mobileContext(), holidayPath);
    await moreOptions(page);
    const holidays = holidaySection(page);
    await holidays.getByLabel('Company holiday date', { exact: true }).fill('2027-12-30');
    await holidays.getByLabel('Company holiday name', { exact: true }).fill(secret);
    await holidays.getByRole('button', { name: 'Add', exact: true }).click();
    await holidays.getByRole('checkbox', { name: /PRIVATE_EMPLOYER_POLICY_TITLE/ }).waitFor();
    await eventually(async () => {
      assert.equal(new URL(page.url()).searchParams.has('eh'), false);
      assert.ok(!page.url().includes(secret));
    }, 'The employer calendar must never appear in the browser address');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForPlanner(page);
    await moreOptions(page);
    await holidaySection(page).getByRole('checkbox', { name: /PRIVATE_EMPLOYER_POLICY_TITLE/ }).waitFor();
    assert.equal(new URL(page.url()).searchParams.has('eh'), false, 'A same-tab refresh should keep the private draft outside the address.');
    const subscriptions = page.getByRole('heading', { name: 'Keep this plan in your calendar', exact: true }).locator('..');
    assert.equal(await subscriptions.getByRole('link', { name: /Google Calendar/ }).count(), 0, 'No pre-consent Google URL may contain private names.');
    assert.equal(await subscriptions.getByRole('link', { name: /Outlook/ }).count(), 0, 'No pre-consent Outlook URL may contain private names.');
    assert.equal(await subscriptions.getByRole('link', { name: /Apple Calendar/ }).count(), 0, 'No pre-consent webcal URL may contain private names.');
    assert.equal(await subscriptions.getByLabel(/Or paste this link into any calendar app/).count(), 0, 'No private feed URL may be selectable before consent.');
    await page.getByRole('button', { name: 'Copy link', exact: true }).click();
    const shared = await clipboardText(page);
    const sharedParams = new URL(shared).searchParams;
    assert.equal(sharedParams.get('sv'), '1');
    for (const key of ['eh', 'ho', 'bo', 'od']) assert.equal(sharedParams.has(key), false, `Default clipboard link must exclude ${key}.`);
    assert.ok(!shared.includes(secret), 'Private employer name must never appear in the public clipboard.');
    assert.ok(!shared.includes('#'), 'Private browser fragments must not be copied.');
    const recipient = await open(await mobileContext(), shared);
    await moreOptions(recipient);
    assert.equal(await holidaySection(recipient).getByRole('checkbox', { name: /PRIVATE_EMPLOYER_POLICY_TITLE/ }).count(), 0,
      'Shared public URL must not restore the sender private title on the recipient.');
    await page.locator('summary').filter({ hasText: 'Share observed holiday dates' }).click();
    await page.getByRole('button', { name: 'Copy link with holiday dates' }).click();
    const optedIn = await clipboardText(page);
    const optedInParams = new URL(optedIn).searchParams;
    assert.ok(optedInParams.get('ho')?.split(',').includes('2027-12-30'));
    assert.ok(!optedIn.includes(secret) && !optedInParams.has('eh'), 'Opt-in links share dates only.');
    await recipient.goto(optedIn, { waitUntil: 'domcontentloaded' });
    await waitForPlanner(recipient);
    await eventually(async () => assert.match(await recipient.locator('#day-2027-12-30').getAttribute('aria-label'), /Shared observed holiday/i),
      'The recipient should reproduce the selected observed date without its original label');
    await subscriptions.getByRole('button', { name: /Include observed holiday dates/ }).click();
    const google = new URL(await subscriptions.getByRole('link', { name: /Google Calendar/ }).getAttribute('href'));
    const cid = google.searchParams.get('cid');
    const googleQuery = new URL(cid.replace(/^webcal:/, 'https:')).searchParams;
    assert.equal(googleQuery.get('ho'), optedInParams.get('ho'));
    assert.ok(!googleQuery.has('eh') && !cid.includes(secret), 'Google receives selected dates and never employer labels.');
    const outlook = new URL(await subscriptions.getByRole('link', { name: /Outlook/ }).getAttribute('href'));
    const outlookURL = outlook.searchParams.get('url');
    const outlookQuery = new URL(outlookURL).searchParams;
    assert.equal(outlookQuery.get('ho'), optedInParams.get('ho'));
    assert.ok(!outlookQuery.has('eh') && !outlookURL.includes(secret), 'Outlook receives selected dates and never employer labels.');
    await page.getByLabel('PTO days available', { exact: true }).fill('3');
    await eventually(async () => assert.equal(await subscriptions.getByRole('link', { name: /Google Calendar/ }).count(), 0),
      'Editing the plan must revoke consent for the old feed URL.');
    for (const width of [375, 320, 768, 1440]) {
      await page.setViewportSize({ width, height: 812 });
      await noOverflow(page);
      await screenshot(page, `privacy-public-share-${width}.png`);
    }
    await page.close();
    await recipient.close();
  });

  await check('Expiration risk uses the real deadline, exports reminders, and persists dismissal controls', async () => {
    const context = await mobileContext();
    const page = await open(context, '/policy/?c=US');
    const quick = page.getByRole('region', { name: 'Quick balance forecast', exact: true });
    await quick.getByLabel('Current PTO balance (days)', { exact: true }).fill('8');
    await quick.getByLabel('Balance as-of date', { exact: true }).fill('2027-01-01');
    await quick.getByLabel('How PTO accrues', { exact: true }).selectOption('front-loaded');
    await quick.getByLabel('Days earned each grant', { exact: true }).fill('0');
    await quick.getByLabel('Annual grant date', { exact: true }).fill('2027-01-01');
    await quick.getByLabel('Expiry and carryover', { exact: true }).selectOption('none');
    await quick.getByLabel('Reset date (new plan year begins)', { exact: true }).fill('2027-04-01');
    const guard = page.getByRole('region', { name: 'PTO expiration guard', exact: true });
    await eventually(async () => {
      assert.equal(await guard.getByText('You could lose 8 days on Apr 1, 2027.', { exact: true }).count(), 1);
      assert.equal(await guard.getByText('Last day to use this PTO: Mar 31, 2027.', { exact: true }).count(), 1);
    }, 'The entered reset must produce an exact use-by warning');
    const handoff = guard.getByRole('link', { name: 'Open this plan in the planner →', exact: true });
    const href = new URL(await handoff.getAttribute('href'), origin);
    assert.equal(href.pathname, '/pto');
    assert.equal(href.searchParams.get('b'), '8');
    assert.equal(href.searchParams.get('s'), '2027-01-01');
    assert.equal(href.searchParams.get('e'), '2027-03-31');
    assert.equal(href.searchParams.get('rv'), '0');
    await guard.locator('summary').filter({ hasText: 'Calendar reminders' }).click();
    for (const lead of [60, 30, 7]) assert.equal(await guard.getByRole('checkbox', { name: `${lead} days before`, exact: true }).isChecked(), true);
    const download = page.waitForEvent('download');
    await guard.getByRole('button', { name: 'Download calendar reminders', exact: true }).click();
    const reminderPath = resolve(out, 'expiration-reminders.ics');
    await (await download).saveAs(reminderPath);
    const calendar = (await readFile(reminderPath, 'utf8')).replace(/\r?\n[ \t]/g, '');
    assert.equal((calendar.match(/BEGIN:VEVENT/g) ?? []).length, 3);
    assert.equal((calendar.match(/BEGIN:VALARM/g) ?? []).length, 3);
    for (const lead of [60, 30, 7]) {
      const date = new Date(Date.parse('2027-04-01T00:00:00Z') - lead * 86400000).toISOString().slice(0, 10).replaceAll('-', '');
      assert.ok(calendar.includes(`DTSTART;VALUE=DATE:${date}`), `${lead}-day reminder must use the reset date.`);
    }
    assert.match(calendar, /Use PTO by 2027-03-31/);
    assert.ok(!calendar.includes(privateNote));
    await noOverflow(page); await guard.screenshot({ path: resolve(out, 'expiration-risk-reminders-375.png') });
    await handoff.click();
    await eventually(async () => {
      assert.equal(await page.getByLabel('PTO days available', { exact: true }).inputValue(), '8');
      assert.equal(new URL(page.url()).searchParams.get('e'), '2027-03-31');
    }, 'The real optimizer handoff must preserve the safe budget and use-by boundary');
    await page.goBack({ waitUntil: 'networkidle' });
    await guard.getByRole('button', { name: 'Dismiss You could lose 8 days on Apr 1, 2027.', exact: true }).click();
    await page.reload({ waitUntil: 'networkidle' });
    await eventually(async () => assert.equal(await guard.getByText('All current alerts are dismissed.', { exact: true }).count(), 1), 'Dismissal must survive refresh');
    await guard.getByRole('button', { name: 'Show dismissed alerts', exact: true }).click();
    await guard.getByText('You could lose 8 days on Apr 1, 2027.', { exact: true }).waitFor();
    await guard.getByRole('checkbox', { name: 'Show in-app alerts', exact: true }).uncheck();
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await guard.getByRole('checkbox', { name: 'Show in-app alerts', exact: true }).isChecked(), false);
    await guard.getByText('In-app expiration alerts are off in this browser.', { exact: true }).waitFor();
    await guard.getByRole('checkbox', { name: 'Show in-app alerts', exact: true }).check();
    await guard.getByText('You could lose 8 days on Apr 1, 2027.', { exact: true }).waitFor();
    await noOverflow(page);
  });

  await check('Partner sharing contains only selected availability and honors independent recipient PTO', async () => {
    assert.ok(mainContext && main && trackedCost, 'Complete the tracking journey before checking its private-note privacy.');
    await main.goto(new URL(ptoPath.replace('b=2', 'b=3'), origin).href, { waitUntil: 'domcontentloaded' });
    await waitForPlanner(main);
    const selectedCard = main.locator('[data-break-start][data-break-end][data-break-pto]').first();
    const selectedStart = await selectedCard.getAttribute('data-break-start');
    const selectedEnd = await selectedCard.getAttribute('data-break-end');
    assert.ok(selectedStart && selectedEnd);
    await selectedCard.getByRole('button', { name: 'Plan this break with a partner', exact: true }).click();
    const partner = main.getByRole('region', { name: 'Partner vacation planner', exact: true });
    assert.equal(await partner.getByRole('checkbox', { name: 'I have confirmed the availability I am sharing.', exact: true }).isChecked(), false);
    assert.equal(await partner.getByRole('checkbox', { name: 'Show which of these dates I already have off.', exact: true }).isChecked(), false);
    assert.equal(await partner.locator('fieldset input:checked').count(), 1, 'The selected card should be the only included break.');
    await partner.getByRole('button', { name: 'Copy partner link', exact: true }).click();
    const link = await clipboardText(main);
    assert.ok(!link.includes(privateNote));
    const shared = disclosedDays(link);
    assert.deepEqual(shared, datesBetween(selectedStart, selectedEnd));
    const recipient = await open(await mobileContext(), link);
    const joint = recipient.getByRole('region', { name: 'Partner vacation planner', exact: true });
    await joint.getByRole('heading', { name: 'Possible dates together', exact: true }).waitFor();
    await recipient.getByLabel('PTO days available', { exact: true }).fill('1');
    await moreOptions(recipient);
    await recipient.getByLabel('Days to keep in reserve', { exact: true }).fill('0');
    await eventually(async () => assert.ok(await joint.getByRole('article').count() > 0), 'At least one joint opportunity must fit one recipient PTO day');
    const card = joint.getByRole('article').first();
    const ownCost = numberIn(await card.getByText('You', { exact: true }).locator('..').innerText());
    assert.ok(ownCost <= 1, 'Joint opportunity must respect recipient PTO budget.');
    await card.getByRole('button', { name: 'Review return proposal', exact: true }).click();
    await joint.getByRole('button', { name: 'Copy return proposal', exact: true }).click();
    const jointDays = disclosedDays(await clipboardText(recipient));
    assert.ok(jointDays.every((date) => shared.includes(date)), 'A joint opportunity cannot invent undisclosed availability.');
    assert.equal(await recipient.getByText(privateNote, { exact: true }).count(), 0);
    await noOverflow(recipient); await joint.screenshot({ path: resolve(out, '04-partner-opportunity-375.png') });
  });

  await check('Portrait preview is 1080×1350, hides balance by default, and copies through the real download fallback', async () => {
    assert.ok(main && !main.isClosed(), 'The consumer planner must remain available.');
    await main.getByRole('button', { name: 'Preview portrait share card', exact: true }).click();
    const portrait = main.getByRole('region', { name: 'Portrait share card', exact: true });
    const privacy = portrait.getByRole('checkbox', { name: 'Include my PTO balance.', exact: true });
    assert.equal(await privacy.isChecked(), false);
    const drawnText = async () => portrait.locator('canvas').evaluate((canvas) => window.__gaplessQaCanvasText(canvas));
    await eventually(async () => {
      assert.equal(await portrait.getByRole('button', { name: 'Download portrait PNG', exact: true }).isEnabled(), true);
      assert.deepEqual(await portrait.locator('canvas').evaluate((canvas) => ({ width: canvas.width, height: canvas.height })), { width: 1080, height: 1350 });
      assert.ok(!(await drawnText()).some((text) => /PTO remaining|qa-private-note/.test(text)));
    }, 'The default PNG preview must hide private balance and notes');
    await privacy.check();
    await eventually(async () => assert.ok((await drawnText()).some((text) => /PTO remaining/.test(text))), 'Balance should appear only after opt-in');
    await privacy.uncheck();
    await eventually(async () => assert.ok(!(await drawnText()).some((text) => /PTO remaining/.test(text))), 'Disabling balance must replace the visible canvas before export');
    const png = main.waitForEvent('download');
    await portrait.getByRole('button', { name: 'Download portrait PNG', exact: true }).click();
    await assertPng(await png, 'portrait-private-default.png');
    const fallback = main.waitForEvent('download');
    await portrait.getByRole('button', { name: 'Copy portrait image', exact: true }).click();
    await assertPng(await fallback, 'portrait-copy-download-fallback.png');
    await eventually(async () => assert.match(await portrait.getByRole('status').innerText(), /downloaded instead.*clipboard is unavailable/i), 'Clipboard denial must report the actual download fallback');
    await noOverflow(main); await portrait.screenshot({ path: resolve(out, '05-portrait-preview-375.png') });
  });
  await check('Actual hosted analytics SDKs send only public paths and suppress unsafe incoming referrers', verifyAnalyticsTransport);
  if (report.runtimeErrors.length || report.unexpectedAccountRequests.length) report.results.push({ name: 'No runtime errors, account requests, or B2B traffic', status: 'failed' });
  report.status = report.results.every((result) => result.status === 'passed') ? 'passed'
    : report.results.some(result => result.status === 'unavailable') ? 'unavailable' : 'failed';
} catch (error) {
  report.status = 'unavailable'; report.reason = error instanceof Error ? error.message : String(error);
} finally {
  for (const context of contexts) await context.close();
  if (browser) await browser.close();
  await writeFile(resolve(out, 'journey-report.json'), `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify({ kind: 'consumer-journey', ...report }));
if (report.status !== 'passed') process.exitCode = report.status === 'unavailable' ? 2 : 1;
