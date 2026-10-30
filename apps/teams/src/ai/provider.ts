import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { aiMode } from './config';
import type { AiTask } from './task';

export interface AiUsageCounts {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

export interface AiCompletion {
  /** Unvalidated; the runner validates against the task schema. */
  output: unknown;
  model: string;
  usage: AiUsageCounts;
}

/** R7: model-agnostic seam. Anthropic today; another vendor is one more implementation. */
export interface AiProvider {
  name: string;
  complete<I, O>(task: AiTask<I, O>, input: I, opts: { model: string; maxTokens: number; effort: 'low' | 'medium' | 'high' }): Promise<AiCompletion>;
}

export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}

let client: Anthropic | null = null;

export const anthropicProvider: AiProvider = {
  name: 'anthropic',
  async complete(task, input, { model, maxTokens, effort }) {
    client ??= new Anthropic({ maxRetries: 2, timeout: 60_000 });
    let res: Anthropic.Message;
    try {
      res = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system: task.system,
        messages: [{ role: 'user', content: task.render(input) }],
        output_config: { format: zodOutputFormat(task.output), effort },
      });
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError) {
        throw new AiProviderError(err.message, true);
      }
      if (err instanceof Anthropic.APIError) throw new AiProviderError(err.message, false);
      throw err;
    }
    if (res.stop_reason === 'refusal') throw new AiProviderError('The model declined this request.', false);
    if (res.stop_reason === 'max_tokens') throw new AiProviderError('The reply was cut off (max tokens).', false);
    const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    let output: unknown;
    try {
      output = JSON.parse(text);
    } catch {
      throw new AiProviderError('The model returned malformed JSON.', false);
    }
    return {
      output,
      model: res.model,
      usage: {
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
        cacheReadTokens: res.usage.cache_read_input_tokens ?? 0,
      },
    };
  },
};

/** Deterministic stand-in: runs the task's heuristic and reports estimated token counts. */
export const mockProvider: AiProvider = {
  name: 'mock',
  async complete(task, input) {
    const output = task.heuristic(input);
    return {
      output,
      model: 'mock',
      usage: {
        inputTokens: Math.ceil((task.system.length + task.render(input).length) / 4),
        outputTokens: Math.ceil(JSON.stringify(output).length / 4),
        cacheReadTokens: 0,
      },
    };
  },
};

let override: AiProvider | null | undefined;

/** Tests inject a provider (mock, or a scripted "malicious" one). Pass undefined to reset. */
export function setAiProvider(p: AiProvider | null | undefined): void {
  override = p;
}

export function currentProvider(): AiProvider | null {
  if (override !== undefined) return override;
  const mode = aiMode();
  return mode === 'live' ? anthropicProvider : mode === 'mock' ? mockProvider : null;
}
