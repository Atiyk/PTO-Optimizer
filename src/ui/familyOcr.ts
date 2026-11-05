/**
 * On-device text recognition for /family's "photo or screenshot of the school calendar".
 *
 * tesseract.js is loaded with a dynamic import only when someone actually picks a photo,
 * so none of it is in the page's initial bundle. Its worker, WebAssembly core and English
 * model are served from this site's own /ocr/ path (scripts/ocrAssets.ts copies them out
 * of node_modules at build time), so reading a photo makes no third-party request. The
 * model is not cached in IndexedDB (cacheMethod 'none'): nothing from this feature is
 * stored in the browser beyond the normal HTTP cache of those static files.
 *
 * The image itself never leaves the device: it is handed to the worker as a File/Blob,
 * the worker is terminated as soon as the text is read (success or failure), and any
 * object URL the caller made for a preview is the caller's to revoke.
 */
export type OcrProgress = (message: string) => void;

export const OCR_MAX_IMAGE_BYTES = 15_000_000;

function ocrBase(): string {
  // The worker runs from a blob URL, so every path it fetches must be absolute.
  return `${window.location.origin}/ocr`;
}

function describe(status: string, progress: number): string {
  const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  if (status.includes('recognizing')) return `Reading the text… ${pct}%`;
  if (status.includes('language') || status.includes('traineddata')) return 'Loading the text reader…';
  if (status.includes('core') || status.includes('initializ')) return 'Starting the text reader…';
  return 'Preparing…';
}

export async function readImageText(image: Blob, onProgress: OcrProgress = () => {}): Promise<string> {
  if (image.size > OCR_MAX_IMAGE_BYTES) throw new Error('This image is too large to read. Try a smaller screenshot.');
  onProgress('Loading the text reader…');
  const { createWorker } = await import('tesseract.js');
  const base = ocrBase();
  const worker = await createWorker('eng', 1, {
    workerPath: `${base}/worker.min.js`,
    corePath: `${base}/core`,
    langPath: `${base}/lang`,
    cacheMethod: 'none',
    logger: (m: { status: string; progress: number }) => onProgress(describe(m.status, m.progress)),
  });
  try {
    const result = await worker.recognize(image);
    return result.data.text ?? '';
  } finally {
    await worker.terminate().catch(() => undefined);
  }
}
