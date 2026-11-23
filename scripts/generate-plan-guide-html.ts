/**
 * Writes the static shell for every worked-plan guide (guides/<slug>/index.html),
 * committed like the glossary term pages (scripts/generate-glossary-html.ts). The head's
 * title and description come from src/content/planGuides/planGuides2027.ts; the description uses
 * the same computed plan the page shows. Run after editing that file, and commit:
 *   npx tsx --tsconfig tsconfig.app.json scripts/generate-plan-guide-html.ts
 * vite.config.ts lists the same pages (planGuideLinks.ts), so a missing file fails
 * `npm run build` (ENOENT). planGuideHeads.test.ts fails when a committed file no longer matches what this writes.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLAN_GUIDES } from '../src/content/planGuides/planGuides2027.ts';
import { planGuideHeadHtml, planGuideHtmlFile } from '../src/content/planGuides/planGuideHead.ts';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

for (const guide of PLAN_GUIDES) {
  const file = resolve(projectRoot, planGuideHtmlFile(guide));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, planGuideHeadHtml(guide), 'utf-8');
}
console.log(`Generated ${PLAN_GUIDES.length} guide pages.`);
