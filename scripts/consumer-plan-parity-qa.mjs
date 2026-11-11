import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const [base = 'http://127.0.0.1:4177', output = 'qa-evidence/plan-parity'] = process.argv.slice(2);
const origin = new URL(base).origin;
const directory = resolve(output);
const scenario = '/?home=1&c=US&b=15&s=2026-11-10&e=2027-11-09';
const plannerReady = 'main[data-plan-ready="true"]';
const breakData = '[data-break-start][data-break-end][data-break-pto]';
const browser = await chromium.launch({ headless: true, ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}) });
await mkdir(directory, { recursive: true });
const report = [];

function breaks(selector) {
  return [...document.querySelectorAll(selector)].map(({ dataset }) => [dataset.breakStart, dataset.breakEnd, Number(dataset.breakPto)]);
}

async function context() {
  const session = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: 'en-US', timezoneId: 'America/New_York', reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] });
  await session.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/_vercel/insights/script.js') return route.fulfill({ contentType: 'text/javascript', body: '' });
    if (request.resourceType() === 'document' && url.pathname === '/pto') {
      url.pathname = '/pto/';
      return route.fulfill({ response: await route.fetch({ url: url.href }) });
    }
    if (request.resourceType() === 'script') await delay(900);
    if (/\/holidays\/US-\d{4}\.json$/.test(url.pathname)) await delay(1200);
    return route.continue();
  });
  await session.addInitScript(({ breakData }) => {
    if (!/^\/pto\/?$/.test(location.pathname)) return;
    const snapshots = [];
    window.__qaPlanSnapshots = snapshots;
    const capture = () => {
      const h1 = document.querySelector('main h1');
      if (!h1 || !h1.getClientRects().length || getComputedStyle(h1).visibility !== 'visible') return;
      const text = (h1.textContent ?? '').replace(/\s+/g, ' ').trim();
      const summary = /^(\d+) days? off\s+from (\d+) PTO days?$/i.exec(text);
      if (!summary) return;
      const cards = [...document.querySelectorAll(breakData)].filter(el => el.getClientRects().length && getComputedStyle(el).visibility === 'visible');
      const snapshot = { total: Number(summary[1]), cost: Number(summary[2]), breaks: cards.map(({ dataset }) => [dataset.breakStart, dataset.breakEnd, Number(dataset.breakPto)]) };
      if (JSON.stringify(snapshot) !== JSON.stringify(snapshots.at(-1))) snapshots.push(snapshot);
    };
    const observer = new MutationObserver(capture);
    observer.observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
    // CSS and visibility can settle without React mutating the DOM.
    document.addEventListener('DOMContentLoaded', capture, { once: true });
    let frames = 0;
    const earlyFrame = () => { capture(); if (++frames < 180) requestAnimationFrame(earlyFrame); };
    requestAnimationFrame(earlyFrame);
  }, { breakData });
  return session;
}

async function assertPlanner(page, expected, step) {
  await page.locator(plannerReady).waitFor({ state: 'visible' });
  const states = await page.evaluate(() => window.__qaPlanSnapshots ?? []);
  assert.ok(states.length, `${step} did not show a visible plan`);
  for (const result of states) {
    assert.equal(result.total, expected.total, `${step}: a visible day count changed`);
    assert.equal(result.cost, expected.cost, `${step}: a visible PTO cost changed`);
    if (result.breaks.length) assert.deepEqual(result.breaks, expected.breaks, `${step}: a visible break changed`);
  }
  assert.deepEqual(await page.evaluate(breaks, breakData), expected.breaks, `${step}: settled break list differs`);
  report.push({ step, snapshots: states });
}

try {
  const session = await context();
  const page = await session.newPage();
  await page.clock.setFixedTime(new Date('2026-11-10T17:00:00Z'));
  await page.goto(origin + scenario, { waitUntil: 'domcontentloaded' });
  await page.locator('#landing-result').filter({ hasText: '31 days off' }).waitFor();
  const landingBreaks = `ol[aria-label="Breaks in this plan"] > li${breakData}`;
  await page.locator(landingBreaks).first().waitFor({ state: 'visible' });
  const landing = await page.evaluate(breaks, landingBreaks);
  assert.equal(landing.length, 3);
  const expected = { total: 31, cost: 15, breaks: landing };
  assert.equal(landing.reduce((total, entry) => total + entry[2], 0), expected.cost);
  await page.screenshot({ path: resolve(directory, '01-home-375.png') });
  await page.getByRole('link', { name: /See the full plan/ }).first().click();
  await assertPlanner(page, expected, 'slow homepage handoff');
  await page.screenshot({ path: resolve(directory, '02-planner-375.png') });
  const href = page.url();
  await page.getByRole('button', { name: 'Copy link', exact: true }).click();
  await page.getByRole('button', { name: /^(?:Link copied|Copied \(calendar omitted\))$/ }).waitFor();
  const publicHref = await page.evaluate(() => navigator.clipboard.readText());
  assert.equal(new URL(publicHref).searchParams.get('sv'), '1');
  assert.equal(new URL(publicHref).searchParams.has('lp'), false);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await assertPlanner(page, expected, 'reload');
  await page.goBack({ waitUntil: 'domcontentloaded' });
  await page.locator('#landing-result').filter({ hasText: '31 days off' }).waitFor();
  assert.deepEqual(await page.evaluate(breaks, landingBreaks), landing, 'Back must restore the same preview');
  const recipient = await context();
  const shared = await recipient.newPage();
  await shared.clock.setFixedTime(new Date('2026-11-10T17:00:00Z'));
  await shared.goto(publicHref, { waitUntil: 'domcontentloaded' });
  await assertPlanner(shared, expected, 'fresh browser public share');
  await recipient.addInitScript(() => {
    const date = '2026-12-28';
    localStorage.setItem('gapless.personal.requests.v1', JSON.stringify({ version: 1, requests: [{
      id: 'qa-approval', start: date, end: date, ptoDates: [date], ptoDays: 1,
      status: 'approved', note: '', createdAt: '2026-11-09T13:00:00Z', updatedAt: '2026-11-09T13:00:00Z',
    }] }));
  });
  await shared.goto(href, { waitUntil: 'domcontentloaded' });
  await assertPlanner(shared, expected, 'handoff with a private approved request in this browser');
} finally {
  await writeFile(resolve(directory, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
