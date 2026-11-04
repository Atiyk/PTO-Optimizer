/**
 * On-device OCR for "Read it from a screenshot" (F5). This module is only ever loaded with a
 * dynamic import() when the user picks or pastes an image, so it costs nothing on a normal
 * page load.
 *
 * Engine: tesseract.js 7 (Apache-2.0), which runs Tesseract compiled to WebAssembly inside a
 * Web Worker. By default it fetches its worker, its wasm core and the English model from
 * cdn.jsdelivr.net; here all three are self-hosted, emitted by Vite from node_modules as
 * same-origin hashed assets, so nothing (not the image, not even a request for the engine)
 * goes to a third party:
 *   - worker:  tesseract.js/dist/worker.min.js                     (~110 KB)
 *   - core:    tesseract.js-core tesseract-core-simd-lstm.wasm.js   (~3.9 MB, wasm embedded;
 *              the non-SIMD build is the fallback for old browsers)
 *   - model:   public/ocr/eng.traineddata.gz (2.95 MB), byte-identical to
 *              @tesseract.js-data/eng@1.0.0 4.0.0_best_int/eng.traineddata.gz, the LSTM-only
 *              English model tesseract.js downloads by default (tessdata_best, Apache-2.0;
 *              package MIT). It lives in public/ at a fixed path because the worker fetches
 *              `${langPath}/eng.traineddata.gz` by name: tesseract.js 7.0.0's other route,
 *              passing { code, data } directly, is broken (initialize() joins l.data, not
 *              l.code, into the language name), so it can't be a hashed Vite asset.
 * The image is read straight from the File in memory and never uploaded. The engine's own
 * IndexedDB model cache is switched off (cacheMethod 'none'); the browser's HTTP cache keeps
 * the files, so the download normally happens once.
 */
import workerUrl from 'tesseract.js/dist/worker.min.js?url';
import coreSimdUrl from 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url';
import coreUrl from 'tesseract.js-core/tesseract-core-lstm.wasm.js?url';

export interface OcrProgress {
  /** Plain-language phase for the status line. */
  phase: 'loading' | 'reading';
  /** 0..1 across the whole job. */
  progress: number;
}

/** SIMD feature check (the same bytes wasm-feature-detect validates). */
function hasWasmSimd(): boolean {
  try {
    return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
  } catch {
    return false;
  }
}

const absolute = (url: string) => new URL(url, window.location.href).href;

/** Recognise the text in an image entirely in this browser. */
export async function recognizeImageText(image: Blob, onProgress?: (p: OcrProgress) => void): Promise<string> {
  onProgress?.({ phase: 'loading', progress: 0.02 });
  const { createWorker, OEM } = await import('tesseract.js');
  onProgress?.({ phase: 'loading', progress: 0.1 });

  const worker = await createWorker('eng', OEM.LSTM_ONLY, {
    workerPath: absolute(workerUrl),
    langPath: absolute(`${import.meta.env.BASE_URL}ocr`),
    corePath: absolute(hasWasmSimd() ? coreSimdUrl : coreUrl),
    workerBlobURL: false,
    cacheMethod: 'none',
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress?.({ phase: 'reading', progress: 0.4 + 0.6 * (m.progress || 0) });
      else onProgress?.({ phase: 'loading', progress: 0.1 + 0.3 * (m.progress || 0) });
    },
  });
  try {
    // Keep line breaks between table rows: the extractor reads row by row.
    await worker.setParameters({ preserve_interword_spaces: '1' });
    const { data } = await worker.recognize(image);
    onProgress?.({ phase: 'reading', progress: 1 });
    return data.text ?? '';
  } finally {
    await worker.terminate();
  }
}
