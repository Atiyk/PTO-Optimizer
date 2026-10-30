// Dev-only helper for RUN MODE's "screenshot before/after at 1440/768/375" requirement.
// Usage: node scripts/screenshot.mjs <url> <outPath> <width> <height>
import { chromium } from 'playwright';

const [, , url, outPath, width, height] = process.argv;
// PW_CHROMIUM_PATH lets sandboxes with a preinstalled browser skip `playwright install`.
const browser = await chromium.launch(
  process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
);
const page = await browser.newPage({ viewport: { width: Number(width), height: Number(height) } });
await page.goto(url, { waitUntil: 'networkidle' });
await page.screenshot({ path: outPath, fullPage: true });
await browser.close();
console.log('saved', outPath);
