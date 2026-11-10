import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SolveInput } from '@daysoff/engine/solver/types';
import { computePlannerJob, type PlannerComputationJob, type PlannerWorkerMessage } from './plannerComputation';
import { usePlannerComputation } from './usePlannerComputation';

const input: SolveInput = {
  rangeStart: '2027-01-01', rangeEnd: '2027-06-30',
  budget: 3, offDays: [], w: 0, breakCount: 1,
};
class FakeWorker {
  static instances: FakeWorker[] = [];
  job?: PlannerComputationJob;
  onmessage?: (event: MessageEvent<PlannerWorkerMessage>) => void;
  onerror?: () => void;
  terminate = vi.fn();

  constructor() { FakeWorker.instances.push(this); }
  postMessage(job: PlannerComputationJob) { this.job = job; }
  publish(phase: 'plan' | 'scores') {
    if (!this.job) throw new Error('missing planner job');
    const { outcome, scores } = computePlannerJob(this.job);
    const data: PlannerWorkerMessage = phase === 'plan' ? { phase, outcome } : { phase, scores };
    this.onmessage?.(new MessageEvent('message', { data }));
  }
}

const useResult = (request: SolveInput) => usePlannerComputation(request, true, 2, 0, 'custom');

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('Worker', FakeWorker);
  FakeWorker.instances = [];
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('planner work scheduling', () => {
  it('debounces rapid changes and terminates a superseded long solve before it can publish', () => {
    const { result, rerender } = renderHook(useResult, { initialProps: input });
    expect(result.current.solved.result.budgetSpent).toBe(3);
    act(() => vi.runOnlyPendingTimers());
    const initial = FakeWorker.instances[0];
    expect(initial.job?.existingOutcome?.result.budgetSpent).toBe(3);

    rerender({ ...input, budget: 2 });
    expect(result.current.pending).toBe(true);
    expect(initial.terminate).toHaveBeenCalledTimes(1);
    rerender({ ...input, budget: 1 });
    act(() => vi.runOnlyPendingTimers());
    expect(FakeWorker.instances).toHaveLength(2);
    const superseded = FakeWorker.instances[1];
    expect(superseded.job?.request.input.budget).toBe(1);
    expect(superseded.job?.existingOutcome).toBeNull();

    rerender({ ...input, budget: 4 });
    act(() => superseded.publish('plan'));
    expect(result.current.pending).toBe(true);
    expect(result.current.solved.result.budgetSpent).toBe(3);
    expect(result.current.scores).toBeNull();
    act(() => vi.runOnlyPendingTimers());
    const latest = FakeWorker.instances[2];
    expect(latest.job?.request.input.budget).toBe(4);
    act(() => latest.publish('plan'));
    expect(result.current.pending).toBe(false);
    expect(result.current.solved.result.budgetSpent).toBe(4);
    expect(result.current.scores).toBeNull();
    act(() => latest.publish('scores'));
    expect(result.current.scores).not.toBeNull();
  });

  it('reuses a completed calculation for exactly matching inputs', () => {
    const { result, rerender } = renderHook(useResult, { initialProps: input });
    act(() => vi.runOnlyPendingTimers());
    act(() => FakeWorker.instances[0].publish('scores'));
    rerender({ ...input, budget: 2 });
    act(() => vi.runOnlyPendingTimers());
    act(() => FakeWorker.instances[1].publish('plan'));
    act(() => FakeWorker.instances[1].publish('scores'));
    expect(result.current.solved.result.budgetSpent).toBe(2);
    rerender({ ...input });
    act(() => vi.runOnlyPendingTimers());
    expect(FakeWorker.instances).toHaveLength(2);
    expect(result.current.pending).toBe(false);
    expect(result.current.solved.result.budgetSpent).toBe(3);
  });

  it('preserves plan results when a browser blocks the worker', () => {
    const { result, rerender } = renderHook(useResult, { initialProps: input });
    rerender({ ...input, budget: 2 });
    act(() => vi.runOnlyPendingTimers());
    act(() => FakeWorker.instances.at(-1)?.onerror?.());
    expect(result.current.pending).toBe(false);
    expect(result.current.solved.result.budgetSpent).toBe(2);
  });
});
