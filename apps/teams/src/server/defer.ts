import { after } from 'next/server';

/*
 * Work that must happen after the HTTP response (Slack wants an answer within 3 seconds).
 * On Vercel, next/server `after()` keeps the function alive via waitUntil. Tests install a
 * runner to collect and await the tasks.
 */

type Task = () => Promise<void>;
let runner: ((t: Task) => void) | null = null;

export function setDeferredRunner(r: ((t: Task) => void) | null): void {
  runner = r;
}

export function defer(task: Task): void {
  const safe: Task = () => task().catch((e) => console.error('deferred task failed', e instanceof Error ? e.name : 'unknown'));
  if (runner) return runner(safe);
  try {
    after(safe);
  } catch {
    // Outside a request (unit tests, scripts): skip. Slack pushes are best-effort.
  }
}
