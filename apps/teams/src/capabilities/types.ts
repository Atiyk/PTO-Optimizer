import type { z } from 'zod';
import type { Db } from '@/db/client';
import type { Role, Scope } from './scopes';

/** R3: who is calling. Recorded on every audit row. */
export type ActorType = 'human' | 'agent-on-behalf-of-user' | 'service-agent';

export interface Actor {
  type: ActorType;
  orgId: string;
  /** The member acting (human) or the member an agent acts for. Null for service agents. */
  memberId: string | null;
  role: Role | null;
  /** OAuth client / API key id for agents; null for humans in the web app. */
  clientId: string | null;
  /** Set when an agent acts on a member's behalf. */
  onBehalfOfMemberId: string | null;
  scopes: readonly Scope[];
}

export interface CapabilityContext {
  db: Db;
  actor: Actor;
  /** Injectable clock so every capability is deterministic under test. */
  now: Date;
}

export type EffectClass = 'read' | 'draft' | 'commit';
export type RateLimitClass = 'read' | 'write' | 'ai' | 'planner';
export type Surface = 'ui' | 'rest' | 'mcp' | 'slack' | 'assistant';

export interface CapabilityDef<I extends z.ZodType = z.ZodType, O extends z.ZodType = z.ZodType> {
  /** Intent-level name, also the MCP tool name. */
  name: string;
  /** Written for models: what it does, when to use it, what it will NOT do. */
  description: string;
  input: I;
  output: O;
  scope: Scope;
  /** Optional additional role gate (scopes are necessary, not always sufficient). */
  roles?: readonly Role[];
  effect: EffectClass;
  /** Commit actions must be idempotent and take an idempotency key. */
  idempotent: boolean;
  annotations: { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean };
  rateLimit: RateLimitClass;
  /** Which surfaces expose it. MCP exposure counts toward the ≤25 external tool budget. */
  surfaces: readonly Surface[];
  /** Plain-language audit line. Null = reads are not audited on success. */
  audit: ((input: z.infer<I>, output: z.infer<O>) => string) | null;
  handler: (ctx: CapabilityContext, input: z.infer<I>) => Promise<z.infer<O>>;
}

/** Identity helper that keeps the generic types attached to the definition. */
export function defineCapability<I extends z.ZodType, O extends z.ZodType>(
  def: CapabilityDef<I, O>,
): CapabilityDef<I, O> {
  return def;
}
