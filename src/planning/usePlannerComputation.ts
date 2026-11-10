import { useEffect, useMemo, useRef, useState } from 'react';
import { isoToSerial } from '@daysoff/engine/solver/dateUtils';
import type { SolveInput } from '@daysoff/engine/solver/types';
import {
  computePlannerJob, computePlannerOutcome, EMPTY_PLANNER_OUTCOME,
  type PlannerComputationJob, type PlannerComputationResult, type PlannerWorkerMessage,
} from './plannerComputation';
import type { PlanningStyle } from './optimizer';

const ASYNC_RANGE_DAYS = 120;
const INPUT_SETTLE_MS = 90;
const MAX_CACHED_PLANS = 4;

export function usePlannerComputation(
  input: SolveInput, valid: boolean, planningVersion: 2 | undefined,
  minimumBreakDays: number, style: PlanningStyle,
) {
  const cache = useRef(new Map<string, PlannerComputationResult>());
  const [initialJob] = useState<PlannerComputationJob | null>(() => {
    if (!valid) return null;
    const request = { input, planningVersion, minimumBreakDays, style };
    return { request, existingOutcome: computePlannerOutcome(request) };
  });
  const [completed, setCompleted] = useState<{
    job: PlannerComputationJob;
    result: PlannerComputationResult;
  } | null>(() => initialJob?.existingOutcome
    ? { job: initialJob, result: { outcome: initialJob.existingOutcome, scores: null } }
    : null);
  const prerender = typeof window !== 'undefined' && (window as Window & { __PTO_SSR__?: boolean }).__PTO_SSR__;
  const workerAvailable = typeof Worker !== 'undefined' && !prerender;
  const job = useMemo((): PlannerComputationJob | null => {
    if (!valid) return null;
    const initial = initialJob?.request;
    if (initial && initial.input === input && initial.planningVersion === planningVersion
      && initial.minimumBreakDays === minimumBreakDays && initial.style === style) return initialJob;
    const request = { input, planningVersion, minimumBreakDays, style };
    const rangeDays = isoToSerial(input.rangeEnd) - isoToSerial(input.rangeStart) + 1;
    const solveOffThread = workerAvailable && rangeDays > ASYNC_RANGE_DAYS;
    return { request, existingOutcome: solveOffThread ? null : computePlannerOutcome(request) };
  }, [initialJob, input, valid, planningVersion, minimumBreakDays, style, workerAvailable]);

  // Vite's prerender consumes the plan synchronously. Match production's planner
  // arithmetic while keeping browser score sweeps outside the first render.
  const prerenderResult = useMemo(() => prerender && job ? computePlannerJob(job) : null, [prerender, job]);

  useEffect(() => {
    if (!job || prerender) return;
    let worker: Worker | undefined;
    let cancelled = false;
    let outcome = job.existingOutcome;
    const cacheKey = JSON.stringify(job.request);
    const cacheEntries = cache.current;
    const publish = (result: PlannerComputationResult) => {
      if (cancelled) return;
      setCompleted({ job, result });
    };
    const finish = (result: PlannerComputationResult) => {
      worker?.terminate();
      worker = undefined;
      if (!cancelled && !result.outcome.issue) {
        cacheEntries.delete(cacheKey);
        cacheEntries.set(cacheKey, result);
        if (cacheEntries.size > MAX_CACHED_PLANS) cacheEntries.delete(cacheEntries.keys().next().value!);
      }
      publish(result);
    };
    const fallback = () => {
      if (!cancelled) finish(computePlannerJob({ request: job.request, existingOutcome: outcome }));
    };
    const cached = cacheEntries.get(cacheKey);
    const timer = setTimeout(() => {
      if (cached) { finish(cached); return; }
      if (!workerAvailable) { fallback(); return; }
      try {
        worker = new Worker(new URL('./plannerComputation.worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = (event: MessageEvent<PlannerWorkerMessage>) => {
          if (cancelled) return;
          const message = event.data;
          if (message.phase === 'plan') {
            outcome = message.outcome;
            publish({ outcome, scores: null });
          } else if (outcome) {
            finish({ outcome, scores: message.scores });
          }
        };
        worker.onerror = fallback;
        worker.onmessageerror = fallback;
        worker.postMessage(job);
      } catch {
        fallback();
      }
    }, cached || job.existingOutcome ? 0 : INPUT_SETTLE_MS);
    // Terminate superseded work, even if the worker is already inside a solve.
    // The closure check also prevents a queued callback from committing later.
    return () => {
      cancelled = true;
      clearTimeout(timer);
      worker?.terminate();
    };
  }, [job, prerender, workerAvailable]);

  const result = prerenderResult ?? (completed?.job === job ? completed.result : null);
  return {
    solved: result?.outcome ?? job?.existingOutcome ?? completed?.result.outcome ?? EMPTY_PLANNER_OUTCOME,
    scores: result?.scores ?? (!valid ? completed?.result.scores ?? null : null),
    pending: Boolean(job && !job.existingOutcome && !result),
  };
}
