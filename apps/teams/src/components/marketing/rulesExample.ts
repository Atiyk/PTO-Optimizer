import { rulesOf, type RulePack } from '@daysoff/engine/coverage/index';
import { CHILDCARE_US_CA, CHILDCARE_US_NY, CHILDCARE_US_TX } from '@daysoff/engine/rulepacks';
import type { SourceChipSource } from '@/components/SourceChip';
import { shortSource } from './heroExample';

/*
 * Real rules for the marketing pages, read from the engine's childcare rule packs (CA, TX, NY):
 * the label, the citation and the date it was read. Nothing here writes a ratio by hand.
 * Server only, like heroExample.ts.
 */

export interface MarketingRule {
  id: string;
  label: string;
  source: SourceChipSource | null;
  needsVerification: boolean;
}

export interface MarketingPack {
  state: string;
  name: string;
  /** Age-group ratio rules, youngest first. */
  ratios: MarketingRule[];
  /** How mixed-age rooms are staffed. */
  mixed: MarketingRule | null;
  notes: string[];
}

const STATE_NAMES: Record<string, string> = { CA: 'California', TX: 'Texas', NY: 'New York' };

function view(r: RulePack['rules'][number]): MarketingRule {
  const c = r.citation;
  return {
    id: r.id,
    label: r.label,
    needsVerification: r.needsVerification === true,
    source: c ? { label: shortSource(c), regulation: c.regulation, section: c.section, url: c.url, retrievedOn: c.retrievedOn, publisher: c.publisher, quote: c.quote ?? null } : null,
  };
}

function pack(p: RulePack): MarketingPack {
  return {
    state: STATE_NAMES[p.jurisdiction.state ?? ''] ?? p.jurisdiction.state ?? '',
    name: p.name,
    ratios: rulesOf(p, 'ratio').map(view),
    mixed: rulesOf(p, 'mixed_age').map(view)[0] ?? null,
    notes: [...(p.notes ?? [])],
  };
}

/** The three cited childcare packs, in the order the site names them. */
export function childcarePacks(): MarketingPack[] {
  return [CHILDCARE_US_CA, CHILDCARE_US_TX, CHILDCARE_US_NY].map(pack);
}
