// RC1 in a browser (node e2e/rc-setup.mjs <baseUrl> <shotsDir>): a director signs up and sets up a
// 15-person California centre from forms and three CSV files (people, credentials, schedules).
// Counts clicks, typed fields, dropdown picks and file picks, and measures the run. Uses the dev
// login (DEV_LOGIN=1). Prints one JSON line with the counts.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const base = process.argv[2] ?? 'http://localhost:3100';
const shots = process.argv[3] ?? 'shots';
const samples = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'samples');
mkdirSync(shots, { recursive: true });
const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const n = { clicks: 0, typed: 0, picks: 0, files: 0 };
const click = async (l) => (n.clicks++, l.click());
const type = async (l, v) => (n.typed++, l.fill(v));
const pick = async (l, v) => (n.picks++, l.selectOption(v));
const file = async (l, f) => (n.files++, l.setInputFiles(path.join(samples, f)));
const shoot = async (name) => {
  for (const w of [1440, 768, 375]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${shots}/${name}-${w}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
};

const t0 = Date.now();
await page.goto(`${base}/signin`);
await click(page.getByRole('link', { name: /Dev login/ }));
await type(page.getByLabel('Your name'), 'Morgan Ellis');
await click(page.getByRole('button', { name: 'Continue as new person' }));
await type(page.getByLabel('Company or team name'), 'Little Oaks Learning Center');
await pick(page.getByLabel('Country', { exact: true }), 'US');
await type(page.getByLabel(/State or region code/), 'US-CA');
await click(page.getByRole('button', { name: 'Create workspace' }));
await page.waitForURL(/\/app\/admin/);

// 1. People from a spreadsheet.
await click(page.getByRole('link', { name: 'Import' }));
await file(page.getByLabel('CSV file'), 'centre-people.csv');
await page.getByText('14 rows · no problems').waitFor();
await click(page.getByRole('button', { name: 'Import 14 rows' }));
await page.getByText('Imported 14 rows.').waitFor();

// 2. Rules, rooms and children expected, on the coverage setup page.
await click(page.getByRole('link', { name: 'Coverage setup' }));
const packForm = () => page.locator('form').filter({ has: page.getByRole('button', { name: 'Use this pack' }) }).first();
await pick(packForm().getByLabel('Rule pack'), 'childcare-us-ca');
await pick(packForm().getByLabel('Sick leave (labour packs)'), 'none');
await click(packForm().getByRole('button', { name: 'Use this pack' }));
await page.getByText(/California child care centers|Child Care Centers/i).first().waitFor();
await pick(packForm().getByLabel('Rule pack'), 'labor-us-ca');
await click(packForm().getByRole('button', { name: 'Use this pack' }));
await page.getByText(/California paid sick leave/).first().waitFor();
const tz = page.getByRole('button', { name: 'Set time zone' });
if (await tz.isVisible()) {
  await pick(page.getByLabel('Time zone'), 'America/Los_Angeles');
  await click(tz);
  await tz.waitFor({ state: 'detached' });
}
const roomForm = () => page.locator('form').filter({ has: page.getByRole('button', { name: 'Add room' }) }).first();
for (const [name, group] of [['Infants', 'infant'], ['Toddlers', 'toddler'], ['Preschool', 'preschool']]) {
  await type(roomForm().getByLabel('Room name'), name);
  await pick(roomForm().getByLabel('Main age group'), group);
  await click(roomForm().getByRole('button', { name: 'Add room' }));
  await page.locator('summary', { hasText: name }).first().waitFor();
}
// Mon–Fri lines (the editor's default days): drop-off, the main day, pick-up.
const demand = { Infants: [4, 8, 4], Toddlers: [6, 12, 6], Preschool: [12, 24, 12] };
const slots = [['07:00', '09:30'], ['09:30', '15:30'], ['15:30', '18:00']];
for (const [room, counts] of Object.entries(demand)) {
  const box = page.locator('details').filter({ has: page.locator('summary', { hasText: new RegExp(`^${room}`) }) }).first();
  for (const [i, [from, to]] of slots.entries()) {
    await click(box.getByRole('button', { name: 'Add line' }));
    const line = box.locator('fieldset').nth(i);
    await type(line.getByLabel('From', { exact: true }), from);
    await type(line.getByLabel('To', { exact: true }), to);
    await type(line.getByLabel('Children', { exact: true }), String(counts[i]));
  }
  await click(box.getByRole('button', { name: 'Save children expected' }));
  await box.getByRole('status').filter({ hasText: 'Saved.' }).waitFor();
}
await shoot('rc1-setup');

// 3. Credentials and weekly schedules from CSV.
await click(page.getByRole('link', { name: 'Import' }));
for (const [kind, f, rows] of [['credentials', 'centre-credentials.csv', 14], ['shifts', 'centre-schedule.csv', 65]]) {
  await pick(page.getByLabel(/What.s in the file/), kind);
  await file(page.getByLabel('CSV file'), f);
  await page.getByText(`${rows} rows · no problems`).waitFor();
  await click(page.getByRole('button', { name: `Import ${rows} rows` }));
  await page.getByText(`Imported ${rows} rows.`).waitFor();
}
const ms = Date.now() - t0;

// Done: the coverage view for next week.
await click(page.getByRole('link', { name: 'Coverage', exact: true }));
await page.waitForURL(/\/app\/coverage/);
await shoot('rc1-coverage');
const noGapDays = await page.getByText('no gaps', { exact: true }).count();
// A person's pace, to turn counts into minutes: 3 s a click or pick, 6 s a typed field, 20 s to find a file.
const humanSeconds = 3 * (n.clicks + n.picks) + 6 * n.typed + 20 * n.files;
const out = { ...n, scriptSeconds: Math.round(ms / 1000), humanMinutesEstimate: Math.round((humanSeconds / 60) * 10) / 10, weekdaysWithNoGaps: noGapDays };
writeFileSync(`${shots}/rc1-counts.json`, JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify(out));
await browser.close();
if (out.humanMinutesEstimate >= 10) process.exit(1);
