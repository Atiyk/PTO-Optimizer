import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

/**
 * /family photo import: tesseract.js runs entirely in the browser, but by default it pulls
 * its worker, its WebAssembly core and the English model from jsDelivr. Self-hosting them
 * keeps the "your photo is read on this device" promise free of any third-party request.
 *
 * The files are multi-megabyte binaries that already live in node_modules, so they are not
 * committed: in dev this plugin serves them from node_modules at /ocr/*, and in a build it
 * emits them into dist/ocr/. Only the LSTM cores are shipped (the loader uses OEM 1, LSTM
 * only), plus the matching best_int English model. src/ui/familyOcr.ts points tesseract.js
 * at these exact paths.
 */
export const OCR_ASSETS: Record<string, string> = {
  'ocr/worker.min.js': 'tesseract.js/dist/worker.min.js',
  'ocr/core/tesseract-core-lstm.wasm.js': 'tesseract.js-core/tesseract-core-lstm.wasm.js',
  'ocr/core/tesseract-core-simd-lstm.wasm.js': 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js',
  'ocr/core/tesseract-core-relaxedsimd-lstm.wasm.js': 'tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js',
  'ocr/lang/eng.traineddata.gz': '@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz',
};

function sourcePath(root: string, rel: string): string {
  return resolve(root, 'node_modules', rel);
}

export function ocrAssetsPlugin(root: string): Plugin {
  return {
    name: 'family-ocr-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0].replace(/^\//, '');
        const rel = OCR_ASSETS[path];
        if (!rel) return next();
        const file = sourcePath(root, rel);
        if (!existsSync(file)) return next();
        res.setHeader('Content-Type', path.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
        res.end(readFileSync(file));
      });
    },
    generateBundle() {
      for (const [fileName, rel] of Object.entries(OCR_ASSETS)) {
        const file = sourcePath(root, rel);
        if (!existsSync(file)) {
          this.error(`OCR asset missing: ${file}. Run npm install (tesseract.js, tesseract.js-core, @tesseract.js-data/eng).`);
        }
        this.emitFile({ type: 'asset', fileName, source: readFileSync(file) });
      }
    },
  };
}
