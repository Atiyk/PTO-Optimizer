import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { estimateCostUsd, taskConfig } from './config';
import type { AiProvider } from './provider';
import type { AiTask } from './task';
import { parseLeaveRequestTask, type ParsedRequest } from './tasks/parseLeaveRequest';

/**
 * R7: evals run the same task definitions through any provider. CI uses the mock provider
 * (deterministic heuristics); `npm run eval:live -w apps/teams` runs the real model once.
 */
const EVAL_DIR = join(process.cwd(), 'evals');

interface ParseExpect {
  question?: boolean;
  leaveType?: string;
  start?: string;
  end?: string;
  part?: string;
  hours?: number;
}
interface ParseCase {
  text: string;
  expect: ParseExpect;
  alts?: ParseExpect[];
  tag?: string;
}

export interface EvalReport {
  task: string;
  provider: string;
  model: string;
  total: number;
  passed: number;
  accuracy: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  failures: Array<{ id: string; detail: string }>;
}

function matches(out: ParsedRequest, e: ParseExpect): boolean {
  if (e.question) return out.clarifyingQuestion != null && (out.start == null || out.end == null || out.part === 'full');
  return (
    out.leaveType === e.leaveType &&
    out.start === e.start &&
    out.end === e.end &&
    out.part === e.part &&
    (e.hours == null || out.hours === e.hours)
  );
}

async function runCases<I, O>(
  provider: AiProvider,
  task: AiTask<I, O>,
  cases: Array<{ id: string; input: I; check: (o: O) => string | null }>,
): Promise<EvalReport> {
  const cfg = taskConfig(task.name);
  const report: EvalReport = {
    task: task.name, provider: provider.name, model: cfg.model, total: cases.length, passed: 0, accuracy: 0,
    inputTokens: 0, outputTokens: 0, costUsd: 0, failures: [],
  };
  for (const c of cases) {
    try {
      const res = await provider.complete(task, c.input, { model: cfg.model, maxTokens: cfg.maxTokens, effort: cfg.effort });
      report.model = res.model;
      report.inputTokens += res.usage.inputTokens;
      report.outputTokens += res.usage.outputTokens;
      const parsed = task.output.safeParse(res.output);
      const problem = parsed.success ? c.check(parsed.data) : `invalid output: ${parsed.error.message}`;
      if (problem) report.failures.push({ id: c.id, detail: problem });
      else report.passed++;
    } catch (err) {
      report.failures.push({ id: c.id, detail: `error: ${(err as Error).message}` });
    }
  }
  report.accuracy = report.total ? report.passed / report.total : 0;
  report.costUsd = estimateCostUsd(cfg.model, report.inputTokens, report.outputTokens);
  return report;
}

export function loadParsingCases() {
  return JSON.parse(readFileSync(join(EVAL_DIR, 'parsing.cases.json'), 'utf8')) as {
    today: string;
    leaveTypes: Array<{ key: string; name: string }>;
    cases: ParseCase[];
  };
}

export async function evalParsing(provider: AiProvider): Promise<EvalReport> {
  const doc = loadParsingCases();
  return runCases(
    provider,
    parseLeaveRequestTask,
    doc.cases.map((c, i) => ({
      id: `${i + 1}: ${c.text}`,
      input: { text: c.text, today: doc.today, leaveTypes: doc.leaveTypes },
      check: (o: ParsedRequest) =>
        [c.expect, ...(c.alts ?? [])].some((e) => matches(o, e))
          ? null
          : `got ${JSON.stringify({ t: o.leaveType, s: o.start, e: o.end, p: o.part, h: o.hours, q: o.clarifyingQuestion })}`,
    })),
  );
}
