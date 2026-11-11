import type { SolveInput } from '@daysoff/engine/solver/types';
import { previewPinnedDay, type PinPreview } from '../ui/pinPreview';
import type { ConsumerSolveOptions } from './optimizer';
import type { PinPreviewRequest, PinPreviewResponse } from './pinPreview.worker';

export interface PinPreviewer {
  /** Resolves with the real outcome of pinning `date`, or null when superseded/unavailable. */
  preview(date: string): Promise<PinPreview | null>;
  /** Stops in-flight work; pending previews resolve null. Later calls start a new worker. */
  dispose(): void;
}

export const spawnPinPreviewWorker = (): Worker | null => {
  if (typeof Worker === 'undefined') return null;
  try {
    return new Worker(new URL('./pinPreview.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
};

interface Pending { id: number; date: string; resolve: (preview: PinPreview | null) => void }

/**
 * Hover previews re-solve the whole plan with one more pinned day: measured at 225-643 ms
 * per hover on desktop (1.2-1.7 s at 4x CPU) for 1-2 year ranges with large budgets, all
 * on the main thread. This moves that solve to one long-lived worker per plan input.
 * At most one request runs and one waits (the newest); a skipped request resolves null.
 */
export function createPinPreviewer(
  input: SolveInput, options: ConsumerSolveOptions, spawn: () => Worker | null = spawnPinPreviewWorker,
): PinPreviewer {
  const cache = new Map<string, PinPreview | null>();
  let worker: Worker | null | undefined;
  let running: Pending | undefined;
  let waiting: Pending | undefined;
  let nextId = 0;

  const syncPreview = (date: string) => {
    try { return previewPinnedDay(input, options, date); } catch { return null; }
  };
  const send = (job: Pending) => {
    running = job;
    worker!.postMessage({ id: job.id, input, options, date: job.date } satisfies PinPreviewRequest);
  };
  const fail = () => {
    // A blocked or crashed worker: answer from the main thread instead, as before.
    worker?.terminate();
    worker = null;
    for (const job of [running, waiting]) if (job) { const p = syncPreview(job.date); cache.set(job.date, p); job.resolve(p); }
    running = waiting = undefined;
  };
  const ensureWorker = () => {
    if (worker !== undefined) return worker;
    worker = spawn();
    if (worker) {
      worker.onmessage = (event: MessageEvent<PinPreviewResponse>) => {
        const job = running;
        if (!job || event.data.id !== job.id) return;
        cache.set(job.date, event.data.preview);
        running = undefined;
        job.resolve(event.data.preview);
        const next = waiting;
        waiting = undefined;
        if (next) send(next);
      };
      worker.onerror = fail;
      worker.onmessageerror = fail;
    }
    return worker;
  };

  return {
    preview(date) {
      if (cache.has(date)) return Promise.resolve(cache.get(date)!);
      if (running?.date === date) return new Promise((resolve) => { const prev = running!.resolve; running!.resolve = (p) => { prev(p); resolve(p); }; });
      if (!ensureWorker()) {
        const preview = syncPreview(date);
        cache.set(date, preview);
        return Promise.resolve(preview);
      }
      return new Promise((resolve) => {
        const job = { id: ++nextId, date, resolve };
        if (!running) { send(job); return; }
        waiting?.resolve(null);
        waiting = job;
      });
    },
    dispose() {
      worker?.terminate();
      worker = undefined;
      running?.resolve(null);
      waiting?.resolve(null);
      running = waiting = undefined;
    },
  };
}
