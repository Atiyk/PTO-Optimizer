import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SolveInput } from '@daysoff/engine/solver/types';
import { previewPinnedDay } from '../ui/pinPreview';
import { createPinPreviewer } from './pinPreviewClient';
import type { PinPreviewRequest, PinPreviewResponse } from './pinPreview.worker';

const input: SolveInput = { rangeStart: '2027-01-01', rangeEnd: '2027-06-30', budget: 3, offDays: [], w: 0, breakCount: 1 };
const options = { minimumBreakDays: 0, style: 'custom' as const };

class FakeWorker {
  static instances: FakeWorker[] = [];
  requests: PinPreviewRequest[] = [];
  onmessage?: (event: MessageEvent<PinPreviewResponse>) => void;
  terminate = vi.fn();
  constructor() { FakeWorker.instances.push(this); }
  postMessage(request: PinPreviewRequest) { this.requests.push(request); }
  answer() {
    const request = this.requests.shift()!;
    const preview = previewPinnedDay(request.input, request.options, request.date);
    this.onmessage?.(new MessageEvent('message', { data: { id: request.id, preview } }));
  }
}
const spawn = () => new FakeWorker() as unknown as Worker;

afterEach(() => { FakeWorker.instances = []; });

describe('pin previews off the main thread', () => {
  it('computes in a worker, matches the synchronous preview, and caches per day', async () => {
    const previewer = createPinPreviewer(input, options, spawn);
    const first = previewer.preview('2027-03-03');
    expect(FakeWorker.instances).toHaveLength(1);
    FakeWorker.instances[0].answer();
    expect(await first).toEqual(previewPinnedDay(input, options, '2027-03-03'));
    expect(await previewer.preview('2027-03-03')).toEqual(await first);
    expect(FakeWorker.instances[0].requests).toHaveLength(0);
  });

  it('keeps only the newest waiting request while one is being solved', async () => {
    const previewer = createPinPreviewer(input, options, spawn);
    const busy = previewer.preview('2027-03-01');
    const skipped = previewer.preview('2027-03-02');
    const latest = previewer.preview('2027-03-03');
    const worker = FakeWorker.instances[0];
    expect(await skipped).toBeNull();
    worker.answer();
    expect((await busy)?.budgetSpent).toBeGreaterThan(0);
    expect(worker.requests.map((r) => r.date)).toEqual(['2027-03-03']);
    worker.answer();
    expect(await latest).toEqual(previewPinnedDay(input, options, '2027-03-03'));
  });

  it('terminates in-flight work when disposed and never resolves it with a stale preview', async () => {
    const previewer = createPinPreviewer(input, options, spawn);
    const pending = previewer.preview('2027-03-03');
    previewer.dispose();
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalled();
    expect(await pending).toBeNull();
  });

  it('falls back to a synchronous preview where workers are unavailable', async () => {
    const previewer = createPinPreviewer(input, options, () => null);
    expect(await previewer.preview('2027-03-03')).toEqual(previewPinnedDay(input, options, '2027-03-03'));
  });
});
