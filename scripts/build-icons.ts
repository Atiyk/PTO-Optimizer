/**
 * Redesign Phase 1: every icon file, rendered from the ONE mark in src/ui/logoMark.ts.
 *
 *   public/favicon.svg              the mark (modern browsers)
 *   public/favicon.ico              16, 32 and 48 px PNGs in one .ico (legacy browsers)
 *   public/apple-touch-icon.png     180 px, opaque warm background (iOS adds its own mask)
 *   public/icons/icon-192.png       PWA icon, transparent around the mark
 *   public/icons/icon-512.png
 *   public/icons/icon-maskable-512.png  the mark inside the 80% safe zone on a solid background
 *
 * Run manually after changing the mark and commit the output (like the OG images):
 *   npx tsx --tsconfig tsconfig.app.json scripts/build-icons.ts
 * PW_CHROMIUM_PATH points Playwright at a preinstalled browser if needed.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { LOGO_COLORS, logoMarkInner, logoSvgDocument } from '../src/ui/logoMark.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, '..', 'public');

/** An HTML page that draws the mark at `size` px, `inset` (0..0.5) padding on each side,
 * over `background` (or transparent). */
function iconHtml(size: number, inset: number, background: string | null, radius = 0): string {
  const markSize = Math.round(size * (1 - inset * 2));
  return `<!doctype html><html><head><style>
    html,body{margin:0;width:${size}px;height:${size}px;background:transparent}
    .bg{width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;${background ? `background:${background};` : ''}border-radius:${radius}px}
  </style></head><body><div class="bg"><svg xmlns="http://www.w3.org/2000/svg" width="${markSize}" height="${markSize}" viewBox="0 0 32 32">${logoMarkInner(LOGO_COLORS)}</svg></div></body></html>`;
}

/** Packs PNG images into one .ico (the format allows PNG payloads since Windows Vista). */
function buildIco(images: { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const dir = Buffer.alloc(16 * images.length);
  let offset = 6 + dir.length;
  images.forEach(({ size, png }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o);
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt8(0, o + 2);
    dir.writeUInt8(0, o + 3);
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(png.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += png.length;
  });
  return Buffer.concat([header, dir, ...images.map((i) => i.png)]);
}

async function main(): Promise<void> {
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const render = async (size: number, inset: number, background: string | null, radius = 0): Promise<Buffer> => {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(iconHtml(size, inset, background, radius));
    const png = await page.screenshot({ omitBackground: background === null, type: 'png' });
    await page.close();
    return png;
  };

  mkdirSync(resolve(publicDir, 'icons'), { recursive: true });
  writeFileSync(resolve(publicDir, 'favicon.svg'), logoSvgDocument(32) + '\n');
  const icoImages = await Promise.all([16, 32, 48].map(async (size) => ({ size, png: await render(size, 0, null) })));
  writeFileSync(resolve(publicDir, 'favicon.ico'), buildIco(icoImages));
  writeFileSync(resolve(publicDir, 'apple-touch-icon.png'), await render(180, 0.14, LOGO_COLORS.page));
  writeFileSync(resolve(publicDir, 'icons/icon-192.png'), await render(192, 0.06, null));
  writeFileSync(resolve(publicDir, 'icons/icon-512.png'), await render(512, 0.06, null));
  // Maskable: the platform may crop to a circle, so the mark stays inside the central 80%.
  writeFileSync(resolve(publicDir, 'icons/icon-maskable-512.png'), await render(512, 0.22, LOGO_COLORS.page));
  await browser.close();
  console.log('Icons written: favicon.svg, favicon.ico, apple-touch-icon.png, icons/icon-{192,512,maskable-512}.png');
}

main();
