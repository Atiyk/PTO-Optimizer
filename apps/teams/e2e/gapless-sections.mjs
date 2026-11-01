// Gapless sections check (node e2e/gapless-sections.mjs <baseUrl> <outDir>), against `next start`:
// screenshots of /, /developers and /childcare at 1440, 768 and 375 (full page), the call-off
// step-through at each step, the hero's source popover (no overlap), axe (WCAG 2.2 AA) on every
// page and state, one h1 per page, /docs/agents redirecting, and the signed-in admin views for
// the AI switch and the inspector export. Exits 1 on any failure.
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { writeFileSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:3100';
const outDir = process.argv[3] ?? '.';
const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
const report = { axe: {}, checks: [] };
const fail = [];
const check = (name, ok, detail = '') => {
  report.checks.push({ name, ok, detail });
  if (!ok) fail.push(`${name} ${detail}`);
};
const axe = async (page, label) => {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  report.axe[label] = r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, sample: v.nodes[0]?.target.join(' '), summary: v.nodes[0]?.failureSummary }));
  check(`axe ${label}`, r.violations.length === 0, JSON.stringify(report.axe[label]));
};
const shot = (page, name) => page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });

for (const width of [1440, 768, 375]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // Landing page: every section, one h1, no h2 repeating it.
  await page.goto(base + '/');
  await page.waitForLoadState('networkidle');
  check(`one h1 on / @${width}`, (await page.locator('h1').count()) === 1);
  const h1 = (await page.locator('h1').textContent()).trim();
  const h2s = await page.locator('h2').allTextContents();
  check(`no h2 repeats the h1 @${width}`, !h2s.some((h) => h.trim().replace(/\.$/, '') === h1.replace(/\.$/, '')), h2s.join(' | '));
  for (const id of ['call-off', 'compliance', 'for-staff', 'leave-time', 'presets', 'trust']) check(`section #${id} @${width}`, (await page.locator(`section#${id}`).count()) === 1);
  check(`no sparkle or old sections @${width}`, (await page.locator('#integrations, #coverage, #product').count()) === 0);
  await axe(page, `landing@${width}`);
  await shot(page, `sections-landing-${width}`);

  // Call-off step-through: each step, axe on the gap and accepted steps.
  const steps = page.locator('#call-off');
  for (let i = 1; i <= 4; i++) {
    await steps.getByRole('button', { name: new RegExp(`^Step ${i}:`) }).click();
    check(`step ${i} is current @${width}`, (await steps.locator('[aria-current="step"]').textContent()).includes(`Step ${i}:`));
    if (i === 2) {
      check(`step 2 shows gap cells @${width}`, (await steps.locator('td.hero-gap-cell').count()) === 5);
      await steps.getByRole('button', { name: /Source:/ }).click();
      await axe(page, `call-off-step2-source@${width}`);
    }
    if (i === 4) check(`step 4 is back in ratio @${width}`, (await steps.locator('td.hero-gap-cell').count()) === 0);
    await steps.screenshot({ path: `${outDir}/sections-calloff-step${i}-${width}.png` });
  }
  await axe(page, `call-off-step4@${width}`);

  // Compliance: open a CA source chip.
  const comp = page.locator('#compliance');
  await comp.getByRole('button', { name: /Source:/ }).first().click();
  check(`compliance source opens @${width}`, await comp.getByText('Not legal advice.').first().isVisible());
  await axe(page, `compliance-source@${width}`);
  await comp.screenshot({ path: `${outDir}/sections-compliance-${width}.png` });
  await page.keyboard.press('Escape');

  // Hero: select the gap and open its source; the panel must not cover the cover options.
  await page.getByRole('button', { name: /staff short/ }).click();
  const heroChip = page.locator('figure').first().getByRole('button', { name: /Source:/ });
  await heroChip.click();
  const panel = page.locator(`#${await heroChip.getAttribute('aria-controls')}`.replace(/:/g, '\\:'));
  const pb = await panel.boundingBox();
  const lb = await page.getByRole('heading', { name: 'Who can cover, ranked' }).boundingBox();
  const ob = await page.locator('figure').first().locator('ol').boundingBox();
  check(`hero source panel does not cover the cover options @${width}`, pb && lb && ob && pb.y + pb.height <= lb.y + 1 && pb.y + pb.height <= ob.y, JSON.stringify({ pb, lb, ob }));
  await page.locator('figure').first().screenshot({ path: `${outDir}/sections-hero-source-open-${width}.png` });
  await axe(page, `hero-source-open@${width}`);

  for (const [path, name] of [['/developers', 'developers'], ['/childcare', 'childcare']]) {
    await page.goto(base + path);
    await page.waitForLoadState('networkidle');
    check(`one h1 on ${path} @${width}`, (await page.locator('h1').count()) === 1);
    await axe(page, `${name}@${width}`);
    if (name === 'childcare') {
      await page.getByRole('button', { name: /Source:/ }).nth(1).click();
      await axe(page, `childcare-source@${width}`);
    }
    await shot(page, `${name}-${width}`);
  }
  check(`no page errors @${width}`, errors.length === 0, errors.join('; '));
  await ctx.close();
}

// /docs/agents keeps working: it redirects to /developers.
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const res = await page.goto(base + '/docs/agents');
  check('/docs/agents redirects to /developers', new URL(page.url()).pathname === '/developers' && res.ok(), page.url());
  await ctx.close();
}

// Signed-in admin views: the AI features switch and the inspector export.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(base + '/try');
  await page.locator('form button').first().click();
  await page.waitForURL(/\/app/, { timeout: 60000 });
  for (const width of [1440, 768, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(base + '/app/admin/setup');
    const card = page.getByRole('heading', { name: 'AI features' }).locator('xpath=ancestor::section[1]');
    check(`AI features card @${width}`, (await page.getByText('Use AI features in this workspace').count()) === 1);
    await axe(page, `admin-setup@${width}`);
    if ((await card.count()) === 1) await card.screenshot({ path: `${outDir}/sections-ai-switch-${width}.png` });
    else await shot(page, `sections-ai-switch-${width}`);
    await page.goto(base + '/app/compliance');
    check(`inspector export card @${width}`, (await page.getByRole('button', { name: 'Ratio checks (CSV)' }).count()) === 1);
    await axe(page, `compliance-inbox@${width}`);
    await shot(page, `sections-inspector-export-${width}`);
  }
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Ratio checks (CSV)' }).click()]);
  const { readFileSync } = await import('node:fs');
  const body = readFileSync(await download.path(), 'utf8');
  check('inspector CSV downloads with ratio checks', body.includes('blocks_checked') && body.includes('Not legal advice'), body.slice(0, 200));
  report.inspectorCsvSample = body.split('\n').slice(0, 6).join('\n');
  await ctx.close();
}

writeFileSync(`${outDir}/sections-axe.json`, JSON.stringify(report, null, 2));
console.log(fail.length ? `FAILED:\n${fail.join('\n')}` : `gapless sections: ${report.checks.length} checks passed, axe clean on ${Object.keys(report.axe).length} states`);
await browser.close();
if (fail.length) process.exit(1);
