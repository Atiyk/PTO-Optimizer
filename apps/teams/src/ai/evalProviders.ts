import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { AiProviderError, type AiProvider } from './provider';

/**
 * Eval-only provider: runs a task through the Claude Code CLI (`claude -p`) with the task's own
 * system prompt, no tools and the task's JSON schema. Used for the one live eval run when no
 * ANTHROPIC_API_KEY is available. Never imported by the app. Token counts are the model's own
 * input (including what the CLI wrote to its prompt cache) and output tokens, which approximates
 * a direct API call with the same prompt.
 */
export const claudeCliProvider: AiProvider = {
  name: 'claude-cli',
  complete(task, input, { model }) {
    const schema = JSON.stringify(zodOutputFormat(task.output).schema);
    const args = ['-p', '--model', model, '--system-prompt', task.system, '--json-schema', schema, '--output-format', 'json', '--tools=', '--no-session-persistence', '--exclude-dynamic-system-prompt-sections', '--max-budget-usd', '0.25'];
    return new Promise((resolve, reject) => {
      const child = execFile('claude', args, { cwd: tmpdir(), timeout: 180_000, maxBuffer: 10_000_000 }, (err, stdout) => {
        if (err && !stdout) return reject(new AiProviderError(`claude CLI failed: ${err.message}`, false));
        try {
          const r = JSON.parse(stdout) as {
            is_error: boolean;
            result: string;
            structured_output?: unknown;
            modelUsage: Record<string, { inputTokens: number; outputTokens: number; cacheReadInputTokens: number; cacheCreationInputTokens?: number }>;
          };
          if (r.is_error) return reject(new AiProviderError(`claude CLI error: ${r.result}`, false));
          // The CLI may make small side calls on another model; report the one we asked for.
          const entries = Object.entries(r.modelUsage);
          const [usedModel, u] = entries.find(([m]) => m === model) ??
            entries.sort((a, b) => b[1].outputTokens - a[1].outputTokens)[0] ?? [model, { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0 }];
          resolve({
            output: r.structured_output ?? JSON.parse(r.result),
            model: usedModel,
            usage: { inputTokens: u.inputTokens + (u.cacheCreationInputTokens ?? 0), outputTokens: u.outputTokens, cacheReadTokens: u.cacheReadInputTokens },
          });
        } catch (e) {
          reject(new AiProviderError(`unreadable claude CLI output: ${(e as Error).message}`, false));
        }
      });
      child.stdin?.end(task.render(input));
    });
  },
};
