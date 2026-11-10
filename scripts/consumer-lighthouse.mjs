/**
 * Mobile Lighthouse and WCAG-oriented axe checks for the consumer static fixture.
 * CI installs the exact tools under RUNNER_TEMP, leaving project dependencies alone.
 * Missing/error measurements are recorded as unavailable and never count as passes.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: {
  'current-url': { type: 'string' }, 'baseline-url': { type: 'string' },
  'out-dir': { type: 'string', default: 'qa-evidence/lighthouse' },
  'tools-dir': { type: 'string' }, 'app-dir': { type: 'string', default: '.' },
  runs: { type: 'string', default: '3' }, help: { type: 'boolean', default: false },
} });
if (values.help) {
  console.log('node scripts/consumer-lighthouse.mjs --current-url URL [--baseline-url URL] --tools-dir PATH [--app-dir PATH] [--out-dir PATH] [--runs 1..3]');
  process.exit(0);
}
if (!values['current-url'] || !values['tools-dir']) throw new Error('--current-url and --tools-dir are required.');
const runs = Number(values.runs);
if (!Number.isInteger(runs) || runs < 1 || runs > 3) throw new Error('--runs must be an integer from 1 to 3.');
const validateUrl = (value) => {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use an HTTP(S) fixture URL without credentials.');
  return url.origin;
};
const variants = [
  ...(values['baseline-url'] ? [{ name: 'before', origin: validateUrl(values['baseline-url']) }] : []),
  { name: 'after', origin: validateUrl(values['current-url']) },
];
const routes = [
  { name: 'home', path: '/', title: /Timebower/ },
  { name: 'pto', path: '/pto/?c=US&s=2027-01-01&e=2027-12-31&b=15', title: /Plan your PTO/ },
  { name: 'policy', path: '/policy/', title: /Your Time-Off Policy/ },
  { name: 'sabbatical', path: '/sabbatical/', title: /Sabbatical Planning/ },
];
const outputDirectory = resolve(values['out-dir']);
const pinnedVersions = { lighthouse: '13.6.0', '@axe-core/playwright': '4.14.0', 'chrome-launcher': '1.2.2' };
const summary = {
  status: 'running', tools: pinnedVersions, runs,
  candidateCommit: process.env.GITHUB_SHA ?? null,
  baselineCommit: process.env.GAPLESS_BASELINE_SHA || null,
  fixture: 'Committed static output; Vercel Insights and third-party analytics excluded consistently.',
  method: 'Sequential alternating before/after runs; mobile simulated throttling, 375×812, performance median; accessibility/SEO lowest observed score.',
  thresholds: { maximumPerformanceRegression: 3, minimumAccessibility: 95, minimumSeo: 100 },
  measurements: [], axe: [], comparisons: [],
};
await mkdir(outputDirectory, { recursive: true });
for (const variant of variants) await mkdir(resolve(outputDirectory, variant.name), { recursive: true });
const json = async (path, value) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
const median = (numbers) => {
  const sorted = [...numbers].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const percentage = (value) => typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 100) : null;
const unavailable = (error) => error instanceof Error ? error.message : String(error);
let chrome;
let browser;

try {
  const toolsRoot = resolve(values['tools-dir']);
  const toolsRequire = createRequire(resolve(toolsRoot, 'package.json'));
  const appRequire = createRequire(resolve(values['app-dir'], 'package.json'));
  for (const [name, expected] of Object.entries(pinnedVersions)) {
    const metadata = JSON.parse(await readFile(resolve(toolsRoot, 'node_modules', name, 'package.json'), 'utf8'));
    if (metadata.version !== expected) throw new Error(`Expected ${name}@${expected}, found ${metadata.version}.`);
  }
  const { default: lighthouse } = await import(pathToFileURL(toolsRequire.resolve('lighthouse')).href);
  const chromeLauncher = await import(pathToFileURL(toolsRequire.resolve('chrome-launcher')).href);
  // createRequire resolves Playwright's CommonJS entry; its dynamic-import namespace
  // exposes the API under default rather than guaranteed named chromium exports.
  const { chromium } = appRequire('playwright');
  const axeModule = await import(pathToFileURL(toolsRequire.resolve('@axe-core/playwright')).href);
  const AxeBuilder = axeModule.AxeBuilder ?? axeModule.default?.default ?? axeModule.default;
  chrome = await chromeLauncher.launch({ chromePath: chromium.executablePath(), chromeFlags: ['--headless', '--no-sandbox', '--disable-dev-shm-usage'] });

  for (const route of routes) {
    for (let run = 1; run <= runs; run += 1) {
      for (const variant of variants) {
        const record = { route: route.name, variant: variant.name, run, status: 'running' };
        try {
          const result = await lighthouse(new URL(route.path, variant.origin).href, {
            port: chrome.port, logLevel: 'error', output: 'json',
            onlyCategories: ['performance', 'accessibility', 'seo'],
            formFactor: 'mobile', throttlingMethod: 'simulate',
            screenEmulation: { mobile: true, width: 375, height: 812, deviceScaleFactor: 1, disabled: false },
            blockedUrlPatterns: ['*/_vercel/insights/*', 'https://plausible.io/*'],
            maxWaitForFcp: 15000, maxWaitForLoad: 30000,
          });
          if (!result?.lhr) throw new Error('Lighthouse returned no report.');
          const lhr = result.lhr;
          await json(resolve(outputDirectory, variant.name, `${route.name}-${run}.json`), lhr);
          if (lhr.runtimeError) throw new Error(`${lhr.runtimeError.code}: ${lhr.runtimeError.message}`);
          const scores = Object.fromEntries(['performance', 'accessibility', 'seo'].map((name) => [name, percentage(lhr.categories[name]?.score)]));
          if (Object.values(scores).some((score) => score === null)) throw new Error('One or more category scores are unavailable.');
          Object.assign(record, scores, {
            status: 'measured',
            failingAudits: Object.entries(lhr.audits).filter(([, audit]) => audit.score !== null && audit.score < 1
              && lhr.categories.accessibility.auditRefs.concat(lhr.categories.seo.auditRefs).some((ref) => ref.id === audit.id))
              .map(([id, audit]) => ({ id, title: audit.title, displayValue: audit.displayValue,
                elements: (audit.details?.items ?? []).flatMap((item) => item.node ? [{ selector: item.node.selector, explanation: item.node.explanation }] : []).slice(0, 8) })),
          });
        } catch (error) { Object.assign(record, { status: 'unavailable', reason: unavailable(error) }); }
        summary.measurements.push(record);
        console.log(JSON.stringify({ kind: 'lighthouse', ...record }));
      }
    }
  }
  await chrome.kill();
  chrome = undefined;

  // A separate fresh browser prevents axe scans from competing with performance runs.
  browser = await chromium.launch({ headless: true });
  for (const route of routes) {
    for (const variant of variants) {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: 'en-US', timezoneId: 'America/New_York', reducedMotion: 'reduce' });
      const page = await context.newPage();
      await page.clock.setFixedTime(new Date('2026-11-02T17:00:00Z'));
      await page.route('**/*', (requestRoute) => {
        const url = new URL(requestRoute.request().url());
        if (url.origin === variant.origin && url.pathname === '/_vercel/insights/script.js') return requestRoute.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
        return ['http:', 'https:'].includes(url.protocol) && url.origin !== variant.origin ? requestRoute.abort() : requestRoute.continue();
      });
      try {
        await page.goto(new URL(route.path, variant.origin).href, { waitUntil: variant.name === 'before' ? 'networkidle' : 'domcontentloaded', timeout: 30000 });
        if (route.name === 'pto' && variant.name === 'after') await page.locator('main[data-plan-ready="true"]').waitFor({ state: 'visible' });
        await page.locator('#root').waitFor({ state: 'visible' });
        await page.evaluate(() => document.fonts.ready);
        const title = await page.title();
        const validTitle = route.title.test(title) || (variant.name === 'before' && route.name === 'home' && /Gapless PTO Optimizer/.test(title));
        if (!validTitle) throw new Error('The static server rendered the wrong route.');
        const scan = async (state) => {
          const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
          await json(resolve(outputDirectory, variant.name, `${route.name}-axe-${state}.json`), result);
          const violations = result.violations.map((violation) => ({ id: violation.id, impact: violation.impact,
            help: violation.help, helpUrl: violation.helpUrl,
            nodes: violation.nodes.map((node) => ({ target: node.target, failureSummary: node.failureSummary })).slice(0, 12) }));
          const record = { route: route.name, variant: variant.name, state, status: 'measured', violations,
            blockingViolations: violations.filter((violation) => ['critical', 'serious'].includes(violation.impact)).length,
            incompleteChecks: result.incomplete.length };
          summary.axe.push(record);
          console.log(JSON.stringify({ kind: 'axe', ...record }));
        };
        await scan('initial');
        if (route.name === 'pto') {
          const options = page.getByRole('button', { name: /More options/ });
          if (await options.isVisible()) { await options.click(); await scan('options'); }
        }
      } catch (error) {
        const record = { route: route.name, variant: variant.name, status: 'unavailable', reason: unavailable(error) };
        summary.axe.push(record);
        console.log(JSON.stringify({ kind: 'axe', ...record }));
      } finally { await context.close(); }
    }
  }

  for (const route of routes) {
    const records = summary.measurements.filter((record) => record.route === route.name);
    const summarize = (variant) => {
      const samples = records.filter((record) => record.variant === variant);
      if (samples.length !== runs || samples.some((record) => record.status !== 'measured')) return null;
      return { performance: median(samples.map((record) => record.performance)),
        accessibility: Math.min(...samples.map((record) => record.accessibility)),
        seo: Math.min(...samples.map((record) => record.seo)) };
    };
    const before = values['baseline-url'] ? summarize('before') : null;
    const after = summarize('after');
    const failures = [];
    if (!after) failures.push('Candidate Lighthouse measurements unavailable.');
    if (values['baseline-url'] && !before) failures.push('Baseline measurements unavailable; performance regression cannot be assessed.');
    if (after?.accessibility < 95) failures.push('Candidate accessibility is below 95.');
    if (after?.seo < 100) failures.push('Candidate SEO is below 100.');
    // Lighthouse's category score can round to 100 while an individual WCAG
    // 2.5.3 visible-label/accessibility-name audit still fails.
    if (records.some((record) => record.variant === 'after'
      && record.failingAudits?.some((audit) => audit.id === 'label-content-name-mismatch'))) {
      failures.push('Candidate failed WCAG 2.5.3 label-content-name-mismatch; accessible names must include visible labels.');
    }
    const performanceDelta = before && after ? after.performance - before.performance : null;
    if (performanceDelta !== null && performanceDelta < -3) failures.push('Mobile performance regressed by more than 3 points.');
    const axe = summary.axe.filter((record) => record.route === route.name && record.variant === 'after');
    if (!axe.length || axe.some((record) => record.status !== 'measured')) failures.push('Candidate axe measurement unavailable.');
    if (axe.some((record) => record.blockingViolations > 0)) failures.push('Candidate axe found serious or critical WCAG violations.');
    const comparison = { route: route.name, before, after, performanceDelta,
      regressionAssessment: values['baseline-url']
        ? before && after ? 'compared mobile performance medians' : 'unavailable: missing measurements'
        : 'not assessed: no baseline supplied',
      status: failures.length ? 'failed' : 'passed', failures };
    summary.comparisons.push(comparison);
    console.log(JSON.stringify({ kind: 'quality-gate', ...comparison }));
  }
  summary.status = summary.comparisons.every((record) => record.status === 'passed') ? 'passed' : 'failed';
} catch (error) {
  summary.status = 'unavailable';
  summary.reason = unavailable(error);
  console.error(JSON.stringify({ kind: 'quality-unavailable', reason: summary.reason }));
} finally {
  if (browser) await browser.close();
  if (chrome) await chrome.kill();
  await json(resolve(outputDirectory, 'summary.json'), summary);
}

console.log(`Consumer Lighthouse/axe: ${summary.status}. Report: ${resolve(outputDirectory, 'summary.json')}`);
if (summary.status !== 'passed') process.exitCode = summary.status === 'unavailable' ? 2 : 1;
