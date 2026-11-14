/**
 * Targeted alternate-engine tests against the production build fixture (issue 18).
 *
 * Default engines: Firefox and WebKit (CI installs both on the free GitHub runner; Chromium
 * is covered by every other consumer script). QA_ENGINES=chromium,firefox,webkit picks
 * engines; PW_CHROMIUM_PATH points Chromium at a preinstalled executable. Per engine:
 *   1. live budget, native date input (fill and real keyboard typing), clipboard payload
 *      with the versioned share format (sv/er/hf), mobile reflow;
 *   2. the recipient opening that copied link in a clean profile (no recalculation notice),
 *      and a tampered holiday fingerprint (recalculation notice);
 *   3. planner route, one-off and recurring (RRULE + EXDATE) .ics import, added as private
 *      busy days that never reach the address bar;
 *   4. policy storage: explicit zero survives reload; a corrupt saved record is quarantined
 *      before a versioned save; a newer-schema record is never overwritten;
 *   5. touch: real tap events on a calendar day in a hasTouch context, following whichever
 *      path the engine's (hover) media query selects;
 *   6. time zone: the landing "from" date is the viewer's local date, not UTC;
 *   7. accessibility: axe-core (WCAG 2 A/AA rules) on the landing page and planner.
 * Emulated engines on Linux only: this is not physical-device or real Safari/iOS testing.
 */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { chromium, firefox, webkit } from 'playwright';

const base = new URL(process.argv[2] || 'http://127.0.0.1:4173');
const output = resolve(process.argv[3] || 'qa-evidence/cross-browser');
await mkdir(output, { recursive: true });
const report = [];
const engines = { chromium, firefox, webkit };
const selected = (process.env.QA_ENGINES || 'firefox,webkit').split(',').map((name) => name.trim()).filter(Boolean);
for (const name of selected) assert.ok(Object.hasOwn(engines, name), `Unknown engine in QA_ENGINES: ${name}`);
// axe-core is installed with the workspace (via @axe-core/playwright); fail loudly if missing.
const axeSource = await readFile(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

/** Same-origin only; the analytics script is stubbed so no request leaves the fixture. */
async function isolate(context) {
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin === base.origin && url.pathname === '/_vercel/insights/script.js') {
      return route.fulfill({ contentType: 'application/javascript', body: '' });
    }
    return url.origin === base.origin ? route.continue() : route.abort();
  });
}

/** The prerendered snapshot (scripts/prerenderShell.ts) holds disabled copies of the controls
 * until React mounts. Reading a value before then reads the snapshot, not the app. */
const mounted = (page) => page.locator('[data-prerendered-controls]').waitFor({ state: 'detached' });
/** Before navigating away: let the page's own requests (e.g. holiday lookups) settle. WebKit
 * reports a cross-origin fetch cancelled by navigation as a page error, which is the test's
 * doing, not the app's. */
const settled = async (page) => { await mounted(page); await page.waitForLoadState('networkidle'); };

const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

for (const name of selected) {
  const engine = engines[name];
  const result = { engine: name, status: 'failed', checks: [], notes: [], errors: [] };
  report.push(result);
  let browser;
  try {
    browser = await engine.launch({
      headless: true,
      ...(name === 'chromium' && process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}),
    });
    const context = await browser.newContext({
      viewport: { width: 375, height: 850 },
      timezoneId: 'America/New_York',
      locale: 'en-US',
      reducedMotion: 'reduce',
    });
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin === base.origin && url.pathname === '/_vercel/insights/script.js') {
        return route.fulfill({ contentType: 'application/javascript', body: '' });
      }
      // Vercel serves clean URLs (/pto is /pto/index.html); vite preview falls back to the
      // homepage for slashless paths, so fetch the directory index like the deployed site.
      if (url.origin === base.origin && route.request().resourceType() === 'document' && url.pathname === '/pto') {
        url.pathname = '/pto/';
        return route.fulfill({ response: await route.fetch({ url: url.href }) });
      }
      return url.origin === base.origin ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      // Check the app's clipboard payload independently of the engine's OS permission UI.
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (value) => { window.__timebowerClipboard = value; } },
      });
    });
    page.on('pageerror', (error) => result.errors.push(error.message));
    await page.clock.setFixedTime(new Date('2026-11-10T17:00:00Z'));
    await page.goto(new URL('/?home=1&c=US&b=15&s=2026-11-10&e=2027-11-09', base).href);
    await page.getByRole('link', { name: /Timebower.*home/ }).waitFor();
    const budget = page.getByRole('spinbutton', { name: 'PTO days available' });
    await budget.fill('12');
    await budget.press('Tab');
    assert.equal(await budget.inputValue(), '12');
    const through = page.getByLabel('Through', { exact: true });
    await through.fill('2027-10-20');
    await through.press('Tab');
    assert.equal(await through.inputValue(), '2027-10-20');
    const fullPlan = page.getByRole('link', { name: /See the full plan/ }).first();
    await fullPlan.waitFor();
    await page.waitForFunction(() => {
      const href = document.querySelector('a[href*="b=12"][href*="e=2027-10-20"]');
      return Boolean(href);
    });
    const link = new URL(await fullPlan.getAttribute('href'), base);
    assert.equal(link.searchParams.get('b'), '12');
    assert.equal(link.searchParams.get('e'), '2027-10-20');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    // The homepage hands off to the planner; its public "Copy link" control is the one share
    // path, so copy from the plan this exact link opens, in the same engine and context.
    const planner = await context.newPage();
    await planner.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (value) => { window.__timebowerClipboard = value; } },
      });
    });
    planner.on('pageerror', (error) => result.errors.push(error.message));
    await planner.clock.setFixedTime(new Date('2026-11-10T17:00:00Z'));
    await planner.goto(link.href);
    await planner.locator('main[data-plan-ready="true"]').waitFor();
    assert.ok(await planner.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await planner.getByRole('button', { name: 'Copy link', exact: true }).click();
    await planner.getByRole('button', { name: /^(?:Link copied|Copied \(calendar omitted\))$/ }).waitFor();
    const copied = new URL(await planner.evaluate(() => window.__timebowerClipboard));
    await planner.close();
    assert.equal(copied.searchParams.get('b'), '12');
    assert.equal(copied.searchParams.get('e'), '2027-10-20');
    assert.equal(copied.searchParams.has('eh'), false);
    result.checks.push('live budget, native date input, clipboard payload, and mobile reflow');

    // Versioned public share format (src/ui/shareFormat.ts): version, planner revision and,
    // when no holiday dates are shared, the public holiday fingerprint. Nothing private.
    assert.equal(copied.searchParams.get('sv'), '1');
    assert.match(copied.searchParams.get('er') ?? '', /^[1-9]\d{0,2}$/);
    // When present, the public holiday fingerprint is valid.
    if (copied.searchParams.has('hf')) assert.match(copied.searchParams.get('hf'), /^[0-9a-f]{8}$/);
    for (const key of ['bo', 'r', 'pp', 'od', 'cb', 'fc']) assert.equal(copied.searchParams.has(key), false, `share link must not carry ${key}`);

    // Real keyboard entry into the native date control, not just a programmatic fill. Move
    // focus off the field first (the homepage copy button used to do this), so focusing it
    // starts at the month segment rather than the day segment the earlier Tab left it on.
    await fullPlan.focus();
    await through.focus();
    await page.keyboard.type('09152027', { delay: 30 });
    await page.keyboard.press('Tab');
    const typed = await through.inputValue();
    result.dateTyping = typed === '2027-09-15' ? 'accepted' : 'not-accepted';
    if (typed === '2027-09-15') {
      await page.waitForFunction(() => Boolean(document.querySelector('a[href*="e=2027-09-15"]')));
      result.checks.push('typed month/day/year into the native date field; the plan link followed');
    } else {
      // Chromium's segmented editor is verified locally and must accept typing. The Linux
      // builds of Firefox and WebKit segment keystrokes their own way (WebKit's GTK build keeps
      // every digit in the focused month segment, so "09152027" clamps the month to 12). That
      // is the browser's editor, not the app. What the app owns, and what is asserted here, is
      // that the field still holds a valid date and the plan link follows exactly that date.
      assert.notEqual(name, 'chromium', `typed date not accepted: ${typed}`);
      assert.match(typed, /^\d{4}-\d{2}-\d{2}$/, `the native date field must hold a valid date after typing (got ${typed})`);
      await page.waitForFunction((value) => Boolean(document.querySelector(`a[href*="e=${value}"]`)), typed);
      result.notes.push(`${name} segments typed digits differently (typed 09152027, field became ${typed}); the plan link followed the field's value.`);
      result.checks.push(`native date field typing in ${name}: the plan link follows the browser's value`);
    }
    await through.fill('2027-10-20');
    await through.press('Tab');
    await page.waitForFunction(() => Boolean(document.querySelector('a[href*="e=2027-10-20"]')));


    // The static fixture serves the real planner at the directory index.
    link.pathname = '/pto/';
    await page.goto(link.href, { waitUntil: 'domcontentloaded' });
    await page.locator('main[data-plan-ready="true"]').waitFor({ state: 'visible' });
    await page.getByRole('heading', { name: 'Your time off' }).waitFor();
    await page.getByRole('heading', { name: 'Your complete plan' }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    // The planner's own share link carries the full snapshot (sv, er and hf).
    await page.locator('#shortcut-copy-link').click();
    await page.locator('#shortcut-copy-link').filter({ hasText: /^Link copied$|^Copied/ }).waitFor();
    const plannerCopy = new URL(await page.evaluate(() => window.__timebowerClipboard));
    assert.equal(plannerCopy.searchParams.get('sv'), '1');
    assert.match(plannerCopy.searchParams.get('er') ?? '', /^[1-9]\d{0,2}$/);
    assert.match(plannerCopy.searchParams.get('hf') ?? '', /^[0-9a-f]{8}$/);
    assert.equal(plannerCopy.searchParams.get('b'), '12');
    assert.equal(plannerCopy.searchParams.get('e'), '2027-10-20');

    // The recipient: a clean profile with no storage, opening the copied link.
    const recipient = await browser.newContext({ viewport: { width: 375, height: 850 }, timezoneId: 'Europe/London', locale: 'en-GB', reducedMotion: 'reduce' });
    try {
      await isolate(recipient);
      const view = await recipient.newPage();
      view.on('pageerror', (error) => result.errors.push(`recipient: ${error.message}`));
      await view.clock.setFixedTime(new Date('2026-11-10T17:00:00Z'));
      const shared = new URL(plannerCopy.href);
      shared.pathname = '/pto/';
      await view.goto(shared.href, { waitUntil: 'domcontentloaded' });
      await view.locator('main[data-plan-ready="true"]').waitFor({ state: 'visible' });
      await view.getByTestId('shared-plan-notice').waitFor({ state: 'visible' });
      assert.equal(await view.getByTestId('shared-plan-recalculated').count(), 0, 'same build and holiday data: no recalculation notice');
      const opened = new URL(view.url());
      assert.equal(opened.searchParams.get('b'), '12');
      assert.equal(opened.searchParams.get('e'), '2027-10-20');
      shared.searchParams.set('hf', '00000000');
      await view.goto(shared.href, { waitUntil: 'domcontentloaded' });
      await view.locator('main[data-plan-ready="true"]').waitFor({ state: 'visible' });
      await view.getByTestId('shared-plan-recalculated').filter({ hasText: 'older holiday data' }).waitFor({ state: 'visible' });
      assert.ok(await noOverflow(view));
    } finally {
      await recipient.close();
    }
    result.checks.push('planner share link sv/er/hf round-trip in a clean profile, and a changed fingerprint is disclosed');

    await page.getByRole('button', { name: 'More options', exact: true }).click();
    const file = Buffer.from([
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:qa-synthetic',
      'DTSTART;VALUE=DATE:20270310', 'DTEND;VALUE=DATE:20270311',
      'SUMMARY:Synthetic busy day', 'END:VEVENT', 'END:VCALENDAR', '',
    ].join('\r\n'));
    await page.getByLabel('Import calendar file (.ics)').setInputFiles({
      name: 'synthetic.ics', mimeType: 'text/calendar', buffer: file,
    });
    await page.getByText(/Found 1 busy day/).waitFor();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    result.checks.push('recipient planner route, mobile reflow and local calendar-file preview');

    // A recurring all-day event: weekly for four Wednesdays, minus one excluded date.
    const recurring = Buffer.from([
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//QA//Synthetic//EN', 'BEGIN:VEVENT', 'UID:qa-recurring',
      'DTSTAMP:20261101T000000Z', 'DTSTART;VALUE=DATE:20270310', 'DTEND;VALUE=DATE:20270311',
      'RRULE:FREQ=WEEKLY;COUNT=4', 'EXDATE;VALUE=DATE:20270317',
      'SUMMARY:Synthetic recurring busy day', 'END:VEVENT', 'END:VCALENDAR', '',
    ].join('\r\n'));
    await page.getByLabel('Import calendar file (.ics)').setInputFiles({
      name: 'recurring.ics', mimeType: 'text/calendar', buffer: recurring,
    });
    const importer = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Import my calendar (.ics)' }) });
    await importer.getByText(/Found 3 busy days/).waitFor();
    await importer.getByText('Review individual dates', { exact: true }).click();
    await importer.getByText('2027-03-10, 2027-03-24, 2027-03-31', { exact: true }).waitFor();
    await importer.getByRole('button', { name: 'Add', exact: true }).click();
    await page.locator('main[data-plan-ready="true"]').waitFor({ state: 'visible' });
    for (const day of ['2027-03-10', '2027-03-24', '2027-03-31']) {
      await page.locator(`#day-${day}`).and(page.getByRole('button', { name: /blackout/ })).waitFor();
    }
    assert.equal(await page.locator('#day-2027-03-17').and(page.getByRole('button', { name: /blackout/ })).count(), 0, 'EXDATE must be excluded');
    const afterImport = new URL(page.url()).searchParams;
    assert.equal(afterImport.has('bo'), false, 'imported busy days are private and never reach the address bar');
    result.checks.push('recurring .ics (RRULE + EXDATE) expanded, added as private busy days on the calendar');

    await page.goto(new URL('/policy/', base).href);
    const currentBalance = page.getByRole('spinbutton', { name: 'Current PTO balance (days)' });
    await currentBalance.fill('0');
    await currentBalance.press('Tab');
    assert.equal(await currentBalance.inputValue(), '0');
    assert.equal(new URL(page.url()).searchParams.has('cb'), false);
    await page.reload();
    await mounted(page);
    assert.equal(await currentBalance.inputValue(), '0');
    result.checks.push('explicit zero survives reload without a private balance in the address');

    await checkPolicyStorage(browser, result);
    await checkTouch(browser, name, result);
    await checkLocalDate(browser, result);
    await checkAccessibility(browser, result);
    assert.deepEqual(result.errors, []);
    result.status = 'passed';
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  } finally {
    await browser?.close();
  }
}

/** Versioned local records (src/personal/storageRecord.ts) through the real policy page. */
async function checkPolicyStorage(browser, result) {
  const key = 'gapless.personal.policy.v1';
  const corrupt = '{"version":1,"search":';
  const context = await browser.newContext({ viewport: { width: 375, height: 850 }, timezoneId: 'America/New_York', locale: 'en-US', reducedMotion: 'reduce' });
  try {
    await isolate(context);
    const page = await context.newPage();
    page.on('pageerror', (error) => result.errors.push(`storage: ${error.message}`));
    await page.goto(new URL('/policy/', base).href);
    await page.evaluate(({ key, corrupt }) => localStorage.setItem(key, corrupt), { key, corrupt });
    await settled(page);
    await page.reload();
    await page.getByText(/Your saved policy in this browser could not be read/).waitFor({ state: 'visible' });
    const balance = page.getByRole('spinbutton', { name: 'Current PTO balance (days)' });
    await balance.fill('7');
    await balance.press('Tab');
    await page.getByRole('button', { name: 'Save policy in this browser' }).click();
    await page.getByText('Policy saved in this browser.', { exact: true }).waitFor({ state: 'visible' });
    const saved = await page.evaluate((key) => ({ record: localStorage.getItem(key), quarantine: localStorage.getItem(`${key}.quarantine`) }), key);
    const record = JSON.parse(saved.record);
    assert.equal(record.version, 1);
    assert.match(record.revision, /^[a-zA-Z0-9-]{1,56}$/);
    assert.ok(!Number.isNaN(Date.parse(record.updatedAt)), 'updatedAt is a timestamp');
    assert.equal(new URLSearchParams(record.search).get('cb'), '7');
    const quarantined = JSON.parse(saved.quarantine);
    assert.equal(quarantined.length, 1);
    assert.equal(quarantined[0].raw, corrupt, 'the unreadable record is kept, byte for byte');
    assert.equal(new URL(page.url()).searchParams.has('cb'), false);
    // A fresh page restores the saved policy, with no unreadable notice.
    await settled(page);
    await page.goto(new URL('/policy/', base).href);
    await mounted(page);
    assert.equal(await balance.inputValue(), '7');
    assert.equal(await page.getByText(/could not be read/).count(), 0);

    const newer = JSON.stringify({ version: 2, search: 'cb=3', revision: 'future-rev', updatedAt: '2030-01-01T00:00:00Z' });
    await page.evaluate(({ key, newer }) => localStorage.setItem(key, newer), { key, newer });
    await settled(page);
    await page.reload();
    await page.getByText(/saved by a newer version of Gapless/).first().waitFor({ state: 'visible' });
    await page.getByRole('button', { name: 'Save policy in this browser' }).click();
    await page.getByText(/A newer version of Gapless saved your policy. Nothing was overwritten/).waitFor({ state: 'visible' });
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), key), newer, 'a newer-schema record is never downgraded');
    await settled(page);
  } finally {
    await context.close();
  }
  result.checks.push('policy storage: corrupt record quarantined before a versioned save, restore on reload, newer schema never overwritten');
}

/** Real touch events (hasTouch) on a calendar day. The app picks its tap behaviour from
 * matchMedia('(hover: hover)') (src/ui/useHasHover.ts); follow the path the engine reports. */
async function checkTouch(browser, name, result) {
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 }, hasTouch: true,
    // Firefox gets touch without mobile-viewport emulation, the most conservative setup.
    ...(name === 'firefox' ? {} : { isMobile: true }),
    locale: 'en-US', timezoneId: 'America/New_York', reducedMotion: 'reduce',
  });
  try {
    await isolate(context);
    const page = await context.newPage();
    page.on('pageerror', (error) => result.errors.push(`touch: ${error.message}`));
    await page.addInitScript(() => {
      window.__touchStarts = 0;
      addEventListener('touchstart', () => { window.__touchStarts += 1; }, { capture: true, passive: true });
    });
    await page.clock.setFixedTime(new Date('2027-01-01T17:00:00Z'));
    await page.goto(new URL('/pto/?c=US&s=2027-01-01&e=2027-12-31&b=15&rv=0&pv=2', base).href, { waitUntil: 'domcontentloaded' });
    await page.locator('main[data-plan-ready="true"]').waitFor({ state: 'visible' });
    const hover = await page.evaluate(() => matchMedia('(hover: hover)').matches);
    const day = page.locator('#day-2027-01-20');
    await day.waitFor({ state: 'visible' });
    await day.tap();
    if (!hover) {
      const panel = page.getByRole('dialog', { name: 'Actions for January 20' });
      await panel.waitFor({ state: 'visible' });
      assert.equal(await day.getAttribute('aria-expanded'), 'true', 'a tap discloses the actions without changing the day');
      const bounds = await panel.boundingBox();
      assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 376, 'touch action panel fits the viewport');
      await panel.getByRole('button', { name: 'Take this day off' }).tap();
      await panel.waitFor({ state: 'detached' });
    } else {
      result.notes.push(`${name} reports (hover: hover) with touch emulation, so a tap acts as a click (the desktop path).`);
    }
    await day.and(page.getByRole('button', { name: /January 20, pinned by you/ })).waitFor();
    assert.ok(await page.evaluate(() => window.__touchStarts) >= 1, 'the tap dispatched real touch events');
    assert.ok(await noOverflow(page), 'calendar must not overflow horizontally');
    result.checks.push(`touch tap on a calendar day pins it (${hover ? 'hover-capable path' : 'touch disclosure path'})`);
  } finally {
    await context.close();
  }
}

/** "Today" is the viewer's local date: UTC is still November 10 when Kiritimati (UTC+14) is on the 11th. */
async function checkLocalDate(browser, result) {
  const context = await browser.newContext({ viewport: { width: 375, height: 850 }, timezoneId: 'Pacific/Kiritimati', locale: 'en-US', reducedMotion: 'reduce' });
  try {
    await isolate(context);
    const page = await context.newPage();
    page.on('pageerror', (error) => result.errors.push(`time zone: ${error.message}`));
    await page.clock.setFixedTime(new Date('2026-11-10T12:00:00Z'));
    await page.goto(new URL('/?home=1&c=US&b=15', base).href);
    const from = page.getByLabel('From', { exact: true });
    await from.waitFor();
    await page.waitForFunction(() => document.querySelector('input[aria-label="From"]')?.value === '2026-11-11');
  } finally {
    await context.close();
  }
  result.checks.push('landing start date is the local date in a UTC+14 time zone');
}

/** WCAG 2 A/AA axe rules, per engine. Contrast is measured in Chromium by the Lighthouse step. */
async function checkAccessibility(browser, result) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'America/New_York', locale: 'en-US', reducedMotion: 'reduce' });
  const found = [];
  try {
    await isolate(context);
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date('2026-11-10T17:00:00Z'));
    for (const path of ['/?home=1&c=US&b=15&s=2026-11-10&e=2027-11-09', '/pto/?c=US&s=2026-11-10&e=2027-11-09&b=15', '/policy/']) {
      await page.goto(new URL(path, base).href, { waitUntil: 'domcontentloaded' });
      if (path.startsWith('/pto/')) await page.locator('main[data-plan-ready="true"]').waitFor({ state: 'visible' });
      else await page.locator('main').first().waitFor({ state: 'visible' });
      await page.addScriptTag({ content: axeSource });
      const violations = await page.evaluate(async () => (await window.axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
        rules: { 'color-contrast': { enabled: false } },
        resultTypes: ['violations'],
      })).violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) })));
      for (const violation of violations) found.push({ path, ...violation });
    }
  } finally {
    await context.close();
  }
  result.axe = found;
  assert.deepEqual(found, [], `axe WCAG A/AA violations: ${JSON.stringify(found)}`);
  result.checks.push('axe-core WCAG 2.1 A/AA (contrast excluded) on landing, planner and policy pages');
}

await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
for (const result of report) console.log(JSON.stringify(result));
if (report.some(({ status }) => status !== 'passed')) process.exitCode = 1;
