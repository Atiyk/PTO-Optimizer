import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { estimateCostUsd, taskConfig } from './config';
import type { AiProvider } from './provider';
import type { AiTask } from './task';
import { verifyHandbookProposal } from './handbook';
import { HANDBOOK_FIELDS, importHandbookTask, type HandbookProposal } from './tasks/importHandbook';
import { parseLeaveRequestTask, type ParsedRequest } from './tasks/parseLeaveRequest';
import { verifyRulePackProposal } from './rulePack';
import { parseCoverTextTask, type ParsedCover } from './tasks/parseCoverText';
import { rulePackFromTextTask, type DraftRule, type RulePackProposal, type RulePackTextInput } from './tasks/rulePackFromText';

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

type HandbookExpect = Record<string, unknown> & { optional?: Record<string, unknown>; mustNotBe?: Record<string, unknown> };

export function loadHandbookCases(): Array<{ file: string; text: string; expect: HandbookExpect }> {
  const expected = JSON.parse(readFileSync(join(EVAL_DIR, 'handbooks.expected.json'), 'utf8')) as Record<string, HandbookExpect | string>;
  return Object.entries(expected)
    .filter(([k]) => !k.startsWith('_'))
    .map(([file, expect]) => ({ file, text: readFileSync(join(EVAL_DIR, 'handbooks', file), 'utf8'), expect: expect as HandbookExpect }));
}

/** Scores the VERIFIED result (model + quote checks), field by field, so it measures what admins see. */
export async function evalHandbooks(provider: AiProvider): Promise<EvalReport & { fieldAccuracy: number }> {
  let fieldsTotal = 0;
  let fieldsOk = 0;
  const report = await runCases(
    provider,
    importHandbookTask,
    loadHandbookCases().map((c) => ({
      id: c.file,
      input: { text: c.text },
      check: (o: HandbookProposal) => {
        const v = verifyHandbookProposal(c.text, o);
        const problems: string[] = [];
        for (const f of HANDBOOK_FIELDS) {
          fieldsTotal++;
          const got = v.fields[f].status === 'verified' ? v.fields[f].value : null;
          const want = (c.expect[f] ?? null) as unknown;
          const optional = c.expect.optional && f in c.expect.optional ? c.expect.optional[f] : undefined;
          const ok = got === want || (optional !== undefined && (got === null || got === optional));
          if (ok) fieldsOk++;
          else problems.push(`${f}: want ${JSON.stringify(want)} got ${JSON.stringify(got)}`);
          if (c.expect.mustNotBe && f in c.expect.mustNotBe && got === c.expect.mustNotBe[f]) problems.push(`${f}: injected value accepted`);
        }
        return problems.length ? problems.join('; ') : null;
      },
    })),
  );
  return { ...report, fieldAccuracy: fieldsTotal ? fieldsOk / fieldsTotal : 0 };
}

// ---- Regulated coverage (Phase 4) ----

interface RuleExpect {
  kind: DraftRule['kind'];
  ageGroup?: string;
  credential?: string;
  [field: string]: unknown;
}
interface RegulationExpect {
  vertical: RulePackTextInput['vertical'];
  basis?: 'law' | 'org_policy';
  rules: RuleExpect[];
  optional?: RuleExpect[];
  forbidden?: RuleExpect[];
}

export function loadRegulationCases(): Array<{ file: string; text: string; expect: RegulationExpect }> {
  const expected = JSON.parse(readFileSync(join(EVAL_DIR, 'regulations.expected.json'), 'utf8')) as Record<string, RegulationExpect | string>;
  return Object.entries(expected)
    .filter(([k]) => !k.startsWith('_'))
    .map(([file, expect]) => ({ file, text: readFileSync(join(EVAL_DIR, 'regulations', file), 'utf8'), expect: expect as RegulationExpect }));
}

const ruleMatches = (r: DraftRule, e: RuleExpect) =>
  r.kind === e.kind &&
  (!e.ageGroup || (r.ageGroup ?? '').toLowerCase().includes(e.ageGroup)) &&
  (!e.credential || (r.credential ?? '').toLowerCase().includes(e.credential)) &&
  Object.entries(e).every(([k, v]) => k === 'kind' || k === 'ageGroup' || k === 'credential' || (r as unknown as Record<string, unknown>)[k] === v);

/**
 * Scores the VERIFIED rules (model + quote, number and bounds checks): recall over expected
 * rules, precision over kept rules, and any forbidden (injected) rule kept is a failure.
 */
export async function evalRegulations(provider: AiProvider) {
  let expected = 0;
  let found = 0;
  let kept = 0;
  let correct = 0;
  let injected = 0;
  const report = await runCases(
    provider,
    rulePackFromTextTask,
    loadRegulationCases().map((c) => ({
      id: c.file,
      input: { text: c.text, vertical: c.expect.vertical },
      check: (o: RulePackProposal) => {
        const v = verifyRulePackProposal(c.text, o, {
          name: c.file, key: 'org-eval', vertical: c.expect.vertical, basis: c.expect.basis ?? 'law', effectiveFrom: '2026-01-01',
          jurisdiction: { country: 'US' }, credentials: [],
        });
        const ok = v.checked.filter((x) => x.status === 'verified').map((x) => x.rule);
        const problems: string[] = [];
        for (const e of c.expect.rules) {
          expected++;
          if (ok.some((r) => ruleMatches(r, e))) found++;
          else problems.push(`missing ${JSON.stringify(e)}`);
        }
        for (const r of ok) {
          kept++;
          // A kept rule is correct when it carries some expected (or optional) fact; sick and overtime rules are split across sentences.
          if ([...c.expect.rules, ...(c.expect.optional ?? [])].some((e) => e.kind === r.kind && (r.kind === 'sick_accrual' || r.kind === 'overtime_flag' ? Object.entries(e).some(([k, val]) => k !== 'kind' && (r as unknown as Record<string, unknown>)[k] === val) : ruleMatches(r, e)))) correct++;
          else problems.push(`unexpected ${r.kind} ${JSON.stringify({ g: r.ageGroup, n: r.childrenPerStaff, h: r.hours, d: r.days, q: r.quote?.slice(0, 60) })}`);
        }
        for (const f of c.expect.forbidden ?? []) {
          if (ok.some((r) => ruleMatches(r, f))) {
            injected++;
            problems.push(`INJECTED rule kept ${JSON.stringify(f)}`);
          }
        }
        return problems.length ? problems.join('; ') : null;
      },
    })),
  );
  return { ...report, recall: expected ? found / expected : 0, precision: kept ? correct / kept : 1, injectedKept: injected };
}

interface CoverCase {
  text: string;
  manager: boolean;
  expect: Partial<ParsedCover> & { question?: boolean };
}

export function loadCoverCases() {
  return JSON.parse(readFileSync(join(EVAL_DIR, 'cover.cases.json'), 'utf8')) as { today: string; rooms: string[]; cases: CoverCase[] };
}

export async function evalCoverText(provider: AiProvider): Promise<EvalReport> {
  const doc = loadCoverCases();
  return runCases(
    provider,
    parseCoverTextTask,
    doc.cases.map((c, i) => ({
      id: `${i + 1}: ${c.text}${c.manager ? ' (manager)' : ''}`,
      input: { text: c.text, today: doc.today, rooms: doc.rooms, canRequestCover: c.manager },
      check: (o: ParsedCover) => {
        const { question, ...want } = c.expect;
        const bad = Object.entries(want).filter(([k, v]) => (o as Record<string, unknown>)[k] !== v);
        if (question && !o.clarifyingQuestion) bad.push(['clarifyingQuestion', 'expected a question']);
        if (!question && want.intent !== 'other' && o.clarifyingQuestion && !(want.intent === 'cover_request' && o.room && o.date && o.start && o.end)) bad.push(['clarifyingQuestion', 'unexpected question']);
        return bad.length ? `got ${JSON.stringify(o)}` : null;
      },
    })),
  );
}
