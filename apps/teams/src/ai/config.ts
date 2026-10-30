/**
 * Per-task model choice and limits (AI cost rules). The cheapest model that passes the task's
 * eval is the default; override per task with AI_MODEL_<TASK> (e.g. AI_MODEL_IMPORT_HANDBOOK).
 * Model IDs verified against Anthropic's model list on 2026-10-30.
 */
export const AI_TASKS = ['parseLeaveRequest', 'importHandbook', 'explainBalance', 'summarizePlan', 'rulePackFromText', 'explainCoverage', 'parseCoverText'] as const;
export type AiTaskName = (typeof AI_TASKS)[number];

interface TaskConfig {
  model: string;
  maxTokens: number;
  /** Max characters of input we will send; longer input is refused, never silently cut. */
  maxInputChars: number;
  effort: 'low' | 'medium' | 'high';
}

const DEFAULTS: Record<AiTaskName, TaskConfig> = {
  // Short extraction with a fixed schema: Haiku is enough (see evals/README.md).
  parseLeaveRequest: { model: 'claude-haiku-5-5', maxTokens: 400, maxInputChars: 1_000, effort: 'low' },
  // Long, ambiguous legal-ish text with citations: Sonnet. Cached by content hash.
  importHandbook: { model: 'claude-sonnet-5-5', maxTokens: 4_000, maxInputChars: 120_000, effort: 'medium' },
  // Rewording engine facts into a sentence or two: Haiku.
  explainBalance: { model: 'claude-haiku-5-5', maxTokens: 300, maxInputChars: 8_000, effort: 'low' },
  summarizePlan: { model: 'claude-haiku-5-5', maxTokens: 300, maxInputChars: 4_000, effort: 'low' },
  // Regulation text with tables and conditions, quoted rule by rule: Sonnet. Cached by content hash.
  rulePackFromText: { model: 'claude-sonnet-5-5', maxTokens: 6_000, maxInputChars: 60_000, effort: 'medium' },
  // Rewording engine facts (a gap, a ranking) into a few sentences: Haiku.
  explainCoverage: { model: 'claude-haiku-5-5', maxTokens: 350, maxInputChars: 8_000, effort: 'low' },
  // "can't make it tomorrow" / "need someone in toddlers 3:30-4:30 Monday": short extraction, Haiku.
  parseCoverText: { model: 'claude-haiku-5-5', maxTokens: 300, maxInputChars: 1_500, effort: 'low' },
};

const ENV_KEY: Record<AiTaskName, string> = {
  parseLeaveRequest: 'AI_MODEL_PARSE_LEAVE_REQUEST',
  importHandbook: 'AI_MODEL_IMPORT_HANDBOOK',
  explainBalance: 'AI_MODEL_EXPLAIN_BALANCE',
  summarizePlan: 'AI_MODEL_SUMMARIZE_PLAN',
  rulePackFromText: 'AI_MODEL_RULE_PACK_FROM_TEXT',
  explainCoverage: 'AI_MODEL_EXPLAIN_COVERAGE',
  parseCoverText: 'AI_MODEL_PARSE_COVER_TEXT',
};

export function taskConfig(task: AiTaskName): TaskConfig {
  const d = DEFAULTS[task];
  return { ...d, model: process.env[ENV_KEY[task]] || d.model };
}

function intEnv(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

/** Tokens (input + output) one organization may spend per UTC day. */
export const orgDailyTokenBudget = () => intEnv('AI_ORG_DAILY_TOKEN_BUDGET', 200_000);
/** Tokens across all organizations per calendar month (UTC). 0 disables AI entirely. */
export const monthlyTokenBudget = () => intEnv('AI_MONTHLY_TOKEN_BUDGET', 5_000_000);

/**
 * 'off'  → AI features report unavailable; every form keeps working.
 * 'mock' → deterministic heuristics stand in for the model (tests, CI, demos, evals in CI).
 * 'live' → Anthropic API. Needs ANTHROPIC_API_KEY.
 */
export type AiMode = 'off' | 'mock' | 'live';
export function aiMode(): AiMode {
  if (process.env.AI_MOCK === '1') return 'mock';
  if (process.env.AI_DISABLED === '1') return 'off';
  return process.env.ANTHROPIC_API_KEY ? 'live' : 'off';
}

/** Price per million tokens in USD, for the admin usage page estimate only. */
export const PRICES: Record<string, { input: number; output: number }> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-opus-5-5': { input: 4, output: 20 },
};

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICES[model];
  if (!p) return 0;
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}
