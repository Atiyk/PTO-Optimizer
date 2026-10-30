// Phase 6 checks (node e2e/phase6.mjs <baseUrl> <outDir>), after walkthrough.mjs on the same server:
// axe (WCAG 2.2 AA) on every main page at 1440 and 375, keyboard-only request → approve → planner,
// a 375px employee walkthrough, and page/API/planner timings.
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:3100';
const out = process.argv[3] ?? 'p6';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const signInAs = async (name) => {
  await page.goto(`${base}/dev/login`);
  await page.locator('li').filter({ hasText: name }).getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/app/);
};
const report = { axe: {}, keyboard: {}, timings: {} };

// ── axe ────────────────────────────────────────────────────────────────────────────────────────
async function axe(label, url) {
  for (const w of [1440, 375]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(base + url);
    await page.waitForLoadState('networkidle');
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    report.axe[`${label}@${w}`] = r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, sample: v.nodes[0]?.target.join(' ') }));
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}
await axe('signin', '/signin');
await axe('docs-agents', '/docs/agents');
await signInAs('Olivia Owner');
for (const [l, u] of [['admin-people', '/app/admin'], ['admin-setup', '/app/admin/setup'], ['admin-import', '/app/admin/import'], ['admin-handbook', '/app/admin/handbook'], ['admin-data', '/app/admin/data'], ['admin-ai', '/app/admin/ai'], ['admin-agents', '/app/admin/agents'], ['planner', '/app/planner?team=']]) await axe(l, u);
await signInAs('Priya Shah');
await axe('approvals', '/app/approvals');
await axe('calendar', '/app/calendar');
await signInAs('Tom Becker');
await axe('home', '/app');
await axe('my-agents', '/app/agents');

// ── keyboard only ──────────────────────────────────────────────────────────────────────────────
async function tabTo(predicate, max = 80) {
  for (let i = 1; i <= max; i++) {
    await page.keyboard.press('Tab');
    if (await page.evaluate(predicate)) return i;
  }
  throw new Error(`could not reach element by Tab: ${predicate}`);
}
const focusVisible = () => page.evaluate(() => {
  const el = document.activeElement;
  const s = getComputedStyle(el);
  return s.outlineStyle !== 'none' && s.outlineWidth !== '0px' ? 'outline' : s.boxShadow !== 'none' ? 'ring' : 'none';
});
// Employee requests leave.
await page.goto(`${base}/app`);
const steps = {};
steps.toFirstDay = await tabTo(() => document.activeElement?.labels?.[0]?.textContent === 'First day');
const ringFirst = await focusVisible();
await page.keyboard.type('01112027'); // month, day, year segments of the native date field
steps.toLastDay = await tabTo(() => document.activeElement?.labels?.[0]?.textContent === 'Last day');
await page.keyboard.type('01122027');
await page.getByText(/^Uses/).first().waitFor();
await page.getByRole('button', { name: 'Request', exact: true }).waitFor({ state: 'visible' });
await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent === 'Request' && !b.disabled));
steps.toRequest = await tabTo(() => document.activeElement?.textContent === 'Request');
await page.keyboard.press('Enter');
await page.getByText('Sent to your manager for approval.').waitFor();
report.keyboard.request = { tabs: steps, focusIndicator: ringFirst };
await page.screenshot({ path: `${out}/keyboard-request-1440.png` });
// Manager approves.
await signInAs('Priya Shah');
await page.goto(`${base}/app/approvals`);
let tabs = await tabTo(() => document.activeElement?.textContent === 'Approve');
const ringApprove = await focusVisible();
await page.screenshot({ path: `${out}/keyboard-approve-focus-1440.png` });
await page.keyboard.press('Enter');
await page.waitForLoadState('networkidle');
report.keyboard.approve = { tabs, focusIndicator: ringApprove };
// Planner: change "Plan from" with the keyboard; the plan and URL follow.
await page.goto(`${base}/app/planner`);
tabs = await tabTo(() => document.activeElement?.labels?.[0]?.textContent === 'Plan from');
await page.keyboard.type('12012026'); // month, day, year segments; the URL follows after a pause
await page.waitForFunction(() => location.search.includes('from=2026-12-01'), null, { timeout: 10_000 });
await page.getByText('Saved by this plan').waitFor();
report.keyboard.planner = { tabs, url: page.url().replace(base, '') };
await page.screenshot({ path: `${out}/keyboard-planner-1440.png` });

// ── 375px employee walkthrough ─────────────────────────────────────────────────────────────────
const phone = await (await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })).newPage();
await phone.goto(`${base}/dev/login`);
await phone.locator('li').filter({ hasText: 'Lena Fischer' }).getByRole('button', { name: 'Sign in' }).click();
await phone.waitForURL(/\/app/);
await phone.screenshot({ path: `${out}/mobile-1-home-375.png`, fullPage: true });
await phone.getByLabel('First day').fill('2027-03-01');
await phone.getByLabel('Last day').fill('2027-03-03');
await phone.getByText(/^Uses/).first().waitFor();
await phone.screenshot({ path: `${out}/mobile-2-request-375.png`, fullPage: true });
await phone.getByRole('button', { name: 'Request' }).tap();
await phone.getByText('Sent to your manager for approval.').waitFor();
await phone.screenshot({ path: `${out}/mobile-3-sent-375.png`, fullPage: true });
await phone.goto(`${base}/app/calendar`);
await phone.screenshot({ path: `${out}/mobile-4-calendar-375.png`, fullPage: true });
await phone.goto(`${base}/app/agents`);
await phone.screenshot({ path: `${out}/mobile-5-agents-375.png`, fullPage: true });
const overflow = await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
report.mobile = { horizontalOverflowOnAgentsPage: overflow };

// ── timings ────────────────────────────────────────────────────────────────────────────────────
const median = (xs) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
async function pageTiming(url) {
  const xs = [];
  for (let i = 0; i < 5; i++) {
    await page.goto(base + url);
    xs.push(await page.evaluate(() => {
      const n = performance.getEntriesByType('navigation')[0];
      return { ttfb: Math.round(n.responseStart - n.requestStart), dcl: Math.round(n.domContentLoadedEventEnd) };
    }));
  }
  return { ttfbMs: median(xs.map((x) => x.ttfb)), domContentLoadedMs: median(xs.map((x) => x.dcl)) };
}
for (const u of ['/app', '/app/approvals', '/app/calendar']) report.timings[u] = await pageTiming(u);
report.timings['/app/planner (Engineering)'] = await pageTiming(report.keyboard.planner.url);
// API: a manager token over REST and MCP.
await page.goto(`${base}/app/agents`);
await page.getByLabel('Name').fill('timing');
await page.getByLabel(/Run the team planner/).check();
await page.getByLabel(/Approve or decline requests/).check();
await page.getByRole('button', { name: 'Create personal token' }).click();
const token = await page.getByLabel('Personal token').inputValue();
async function apiTiming(name, body) {
  const xs = [];
  for (let i = 0; i < 7; i++) {
    const t = performance.now();
    const r = await fetch(`${base}/api/v1/actions/${name}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    await r.text();
    if (r.status !== 200) throw new Error(`${name} ${r.status}`);
    xs.push(performance.now() - t);
  }
  return Math.round(median(xs));
}
report.timings.api = {
  getMyBalanceMs: await apiTiming('getMyBalance', {}),
  whoIsOutMonthMs: await apiTiming('whoIsOut', { from: '2026-12-01', to: '2026-12-31' }),
  listPendingApprovalsMs: await apiTiming('listPendingApprovals', {}),
  runTeamPlanMs: await apiTiming('runTeamPlan', {}),
};
const t0 = performance.now();
const mcp = await fetch(`${base}/api/mcp`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-11-25' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }) });
await mcp.text();
report.timings.api.mcpToolsListMs = Math.round(performance.now() - t0);

writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ axeViolations: Object.fromEntries(Object.entries(report.axe).filter(([, v]) => v.length)), keyboard: report.keyboard, mobile: report.mobile, timings: report.timings }, null, 2));
await browser.close();
