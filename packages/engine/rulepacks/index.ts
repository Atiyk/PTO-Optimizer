import type { RulePack } from '../src/coverage/types';
import { CHILDCARE_PACKS } from './childcare';
import { LABOR_PACKS } from './labor';

export * from './childcare';
export * from './labor';

/** Every seed pack, keyed by `key`. Orgs copy one into `rule_packs` when they pick it. */
export const SEED_PACKS: readonly RulePack[] = [...CHILDCARE_PACKS, ...LABOR_PACKS];

export function seedPack(key: string): RulePack | undefined {
  return SEED_PACKS.find((p) => p.key === key);
}
