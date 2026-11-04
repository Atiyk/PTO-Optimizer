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
 *   - model:   @tesseract.js-data/eng 4.0.0_best_int eng.traineddata.gz (~2.9 MB, MIT; the
 *              same LSTM-only model tesseract.js downloads by default)
 * The image is read straight from the File in memory and never uploaded. The engine's own
 * IndexedDB model cache is switched off (cacheMethod 'none'); the browser's HTTP cache keeps
 * the hashed files, so the download happens once.
 */
import workerUrl from 'tesseract.js/dist/worker.min.js?url';
import coreSimdUrl from 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url';
import coreUrl from 'tesseract.js-core/tesseract-core-lstm.wasm.js?url';
import engModelUrl from '@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz?url';

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
  const [{ createWorker, OEM }, modelResponse] = await Promise.all([
    import('tesseract.js'),
    fetch(engModelUrl),
  ]);
  if (!modelResponse.ok) throw new Error(`The reading engine could not load (${modelResponse.status}).`);
  const model = new Uint8Array(await modelResponse.arrayBuffer());
  onProgress?.({ phase: 'loading', progress: 0.3 });

  const worker = await createWorker([{ code: 'eng', data: model }], OEM.LSTM_ONLY, {
    workerPath: absolute(workerUrl),
    corePath: absolute(hasWasmSimd() ? coreSimdUrl : coreUrl),
    workerBlobURL: false,
    cacheMethod: 'none',
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress?.({ phase: 'reading', progress: 0.4 + 0.6 * (m.progress || 0) });
      else onProgress?.({ phase: 'loading', progress: 0.3 + 0.1 * (m.progress || 0) });
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
