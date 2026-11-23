/**
 * Writes the static shell for every 2027 guide (2027/index.html, 2027/<slug>/index.html),
 * committed like the glossary term pages (scripts/generate-glossary-html.ts). The head's
 * title and description come from src/content/guides/guides2027.ts; the description uses
 * the same computed plan the page shows. Run after editing that file, and commit:
 *   npx tsx --tsconfig tsconfig.app.json scripts/generate-guide-html.ts
 * vite.config.ts lists the same GUIDES, so a missing file fails `npm run build` (ENOENT).
 * guideHeads.test.ts fails when a committed file no longer matches what this writes.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GUIDES } from '../src/content/guides/guides2027.ts';
import { guideHeadHtml, guideHtmlFile } from '../src/content/guides/guideHead.ts';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

for (const guide of GUIDES) {
  const file = resolve(projectRoot, guideHtmlFile(guide));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, guideHeadHtml(guide), 'utf-8');
}
console.log(`Generated ${GUIDES.length} guide pages.`);
