import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

/**
 * P3 PWA: builds src/pwa/sw.ts to dist/sw.js (production builds only: `apply: 'build'`, so
 * the dev server and vitest never see a worker) and fills in the two build-time values:
 *   - the build version, a hash of every emitted /assets/* name, which names the caches;
 *   - the precache list: this build's /assets/* files, without the on-demand OCR files.
 * The worker is a single self-contained classic script: the build fails if it would import
 * a shared chunk, because a classic service worker cannot load ES modules.
 */
const OCR_ASSET = /^assets\/(tesseract[^/]*|worker\.min[^/]*)$/;
const SW_FILE = 'sw.js';

export function serviceWorkerPlugin(root: string): Plugin {
  return {
    name: 'timebower-service-worker',
    apply: 'build',
    enforce: 'post',
    buildStart() {
      this.emitFile({ type: 'chunk', id: resolve(root, 'src/pwa/sw.ts'), fileName: SW_FILE });
    },
    generateBundle(_options, bundle) {
      const chunk = bundle[SW_FILE];
      if (!chunk || chunk.type !== 'chunk') this.error('sw.js was not emitted');
      if (chunk.imports.length > 0 || chunk.dynamicImports.length > 0 || /^\s*(import|export)\b/m.test(chunk.code)) {
        this.error(`sw.js must be self-contained, but it imports ${[...chunk.imports, ...chunk.dynamicImports].join(', ')}`);
      }
      const precache = Object.keys(bundle)
        .filter((name) => name.startsWith('assets/') && !OCR_ASSET.test(name) && !name.endsWith('.map'))
        .sort()
        .map((name) => `/${name}`);
      const version = createHash('sha256').update(precache.join('\n')).digest('hex').slice(0, 12);
      let code = chunk.code;
      // The version is a bare token: the minifier may have folded it into a longer string.
      if (!code.includes('__TIMEBOWER_SW_VERSION__')) this.error('sw.js: version placeholder not found');
      code = code.replaceAll('__TIMEBOWER_SW_VERSION__', version);
      // The precache list holds quotes, so it replaces the whole string literal.
      const listLiteral = /(["'`])__TIMEBOWER_SW_PRECACHE__\1/;
      if (!listLiteral.test(code)) this.error('sw.js: precache placeholder not found');
      code = code.replace(listLiteral, () => JSON.stringify(JSON.stringify(precache)));
      chunk.code = code;
    },
  };
}
