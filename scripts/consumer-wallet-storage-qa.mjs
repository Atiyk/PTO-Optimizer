/** Local two-tab verification for the real wallet import and request tracker. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = new URL(process.argv[2] || 'http://127.0.0.1:4173');
const storageKey = 'gapless.personal.requests.v1';
const walletKey = 'gapless.personal.leave-wallet.v1';
const date = '2027-01-20';
const request = {
  id: 'qa-request', start: date, end: date, ptoDates: [date], ptoDays: 1,
  status: 'planned', note: 'Synthetic QA note', createdAt: '2026-12-01T12:00:00Z', updatedAt: '2026-12-01T12:00:00Z',
};
const policy = {
  unit: 'days', hoursPerDay: 8, currentBalance: 5, balanceAsOf: '2027-01-01',
  accrual: { kind: 'front-loaded', amount: 0, grantDate: '2027-01-01' },
  planYear: { kind: 'calendar' }, carryover: { mode: 'all' },
  negativeBalanceAllowance: 0, payoutOnLeaving: 'not-sure', plannedDays: [],
};
const backup = {
  name: 'wallet.json', mimeType: 'application/json',
  buffer: Buffer.from(JSON.stringify({
    version: 1, banks: [{ version: 1, id: 'vacation', name: 'QA vacation', category: 'vacation', policy, requestIds: [request.id] }],
  })),
};
const browser = await chromium.launch({ headless: true, ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}) });
try {
  const context = await browser.newContext({ viewport: { width: 375, height: 900 }, timezoneId: 'America/New_York' });
  await context.route('**/*', (route) => new URL(route.request().url()).origin === base.origin ? route.continue() : route.abort());
  await context.addInitScript(({ key, fixture }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ version: 1, requests: [fixture] }));
  }, { key: storageKey, fixture: request });
  const tracker = await context.newPage();
  const importer = await context.newPage();
  await Promise.all([tracker.goto(new URL('/policy/', base).href), importer.goto(new URL('/policy/', base).href)]);
  assert.equal(await importer.evaluate(() => typeof navigator.locks?.request), 'function');
  await importer.getByText('Back up or move your saved data', { exact: true }).click();
  const input = importer.getByLabel('Review a wallet backup');
  const merge = importer.getByRole('button', { name: 'Merge wallet banks' });
  await importer.waitForFunction(() => {
    const field = document.querySelector('input[accept=".json,application/json"]');
    return field && !field.disabled;
  });
  await input.setInputFiles(backup);
  await merge.waitFor({ state: 'visible' });

  await tracker.getByLabel('Include past requests').check();
  await tracker.getByLabel(`Status for request ${date}`).selectOption('approved');
  await tracker.waitForFunction((key) => JSON.parse(localStorage.getItem(key)).requests[0].status === 'approved', storageKey);
  await merge.click();
  await importer.getByText(/wallet or tracked requests changed/i).waitFor({ state: 'visible' });
  assert.equal(await importer.evaluate((key) => localStorage.getItem(key), walletKey), null);

  await input.setInputFiles(backup);
  await merge.click();
  await importer.getByText(/Wallet banks saved in this browser/).waitFor({ state: 'visible' });
  const saved = await importer.evaluate(({ walletKey, storageKey }) => ({
    bank: JSON.parse(localStorage.getItem(walletKey)).banks[0].name,
    request: JSON.parse(localStorage.getItem(storageKey)).requests[0],
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
  }), { walletKey, storageKey });
  assert.equal(saved.bank, 'QA vacation');
  assert.equal(saved.request.status, 'approved');
  assert.equal(saved.request.note, request.note);
  assert.equal(saved.overflow, false);
  console.log('PASS: stale wallet preview rejected after a real second-tab tracker edit. Fresh review committed without overwriting the request.');
} finally {
  await browser.close();
}
