// Dev-only helper for RUN MODE's "screenshot before/after at 1440/768/375" requirement.
// Usage: node scripts/screenshot.mjs <url> <outPath> <width> <height>
import { chromium } from 'playwright';

const [, , url, outPath, width, height] = process.argv;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(width), height: Number(height) } });
await page.goto(url, { waitUntil: 'networkidle' });
await page.screenshot({ path: outPath, fullPage: true });
await browser.close();
console.log('saved', outPath);
