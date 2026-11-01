import { and, asc, eq, gte, lt } from 'drizzle-orm';
import { z } from 'zod';
import { addDays } from '@daysoff/engine/solver/dateUtils';
import { rulesOf, type Rule } from '@daysoff/engine/coverage/types';
import { auditLog } from '@/db/schema';
import { coverageDays, gapWindows, getLocation, packsOn, siteContext } from '@/domain/coverage';
import { CapabilityError } from '../errors';
import { defineCapability } from '../types';
import { NOT_LEGAL_ADVICE } from './coverage';
import { toCsv } from './admin';

/*
 * The inspector export: for one site and a date range, every room's ratio checks per day (how
 * many half-hour blocks were checked, in ratio and short), the rules that applied with their
 * citations, every gap window, and the audit entries for those days. All numbers come from the
 * engine (the same coverageForDay the heatmap uses); nothing here computes a ratio.
 *
 * Owners and admins only, because it carries the audit log. Never children: rooms carry counts
 * per block in the engine and only block tallies here.
 */

const isoDay = z.iso.date().describe('YYYY-MM-DD (site-local date)');
const MAX_DAYS = 31;

const citation = z.object({ regulation: z.string(), section: z.string(), url: z.string(), retrievedOn: z.string(), publisher: z.string() }).nullable();
const ruleOut = z.object({ ruleId: z.string(), label: z.string(), basis: z.enum(['law', 'org_policy']), needsVerification: z.boolean(), citation });

function ruleView(r: Rule): z.infer<typeof ruleOut> {
  const c = r.citation;
  return {
    ruleId: r.id,
    label: r.label,
    basis: r.basis,
    needsVerification: r.needsVerification === true,
    citation: c ? { regulation: c.regulation, section: c.section, url: c.url, retrievedOn: c.retrievedOn, publisher: c.publisher } : null,
  };
}

const sourceText = (r: z.infer<typeof ruleOut>) =>
  r.basis === 'org_policy' ? 'Your policy' : r.needsVerification ? `Needs verification${r.citation ? ` (${r.citation.regulation} ${r.citation.section})` : ''}` : `${r.citation!.regulation} ${r.citation!.section}`;

const rowOut = z.object({
  date: z.string(),
  roomId: z.string(),
  roomName: z.string(),
  blocksChecked: z.number(),
  blocksInRatio: z.number(),
  blocksShort: z.number(),
  maxShort: z.number(),
  rules: z.array(ruleOut),
});
const gapRow = z.object({
  date: z.string(),
  roomName: z.string().nullable(),
  start: z.string(),
  end: z.string(),
  kind: z.string(),
  label: z.string(),
  required: z.number(),
  present: z.number(),
  short: z.number(),
  rule: ruleOut.nullable(),
});

export const getInspectorReport = defineCapability({
  name: 'getInspectorReport',
  description:
    'Owner/admin only. An inspector-ready record for one site and up to 31 days: per room and day, how many ' +
    'half-hour blocks were checked against the staffing rules, how many were in ratio and how many short, the ' +
    'rules that applied with their citations (or "needs verification" / "your policy"), every gap window, and ' +
    'the audit log entries for those days. As data and as CSV files. Computed by the engine; not legal advice.',
  input: z.object({ locationId: z.uuid(), from: isoDay, to: isoDay }),
  output: z.object({
    site: z.object({ id: z.string(), name: z.string(), timezone: z.string() }),
    from: z.string(),
    to: z.string(),
    generatedAt: z.string(),
    regulated: z.boolean(),
    rows: z.array(rowOut),
    gaps: z.array(gapRow),
    audit: z.array(z.object({ at: z.string(), actorType: z.string(), capability: z.string(), outcome: z.string(), summary: z.string() })),
    files: z.record(z.string(), z.string()),
    notice: z.string(),
  }),
  scope: 'admin',
  roles: ['owner', 'admin'],
  effect: 'read',
  idempotent: true,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  rateLimit: 'read',
  surfaces: ['ui', 'rest'],
  audit: (i) => `Inspector export ${i.from} to ${i.to}`,
  async handler({ db, actor, now }, input) {
    if (input.to < input.from) throw new CapabilityError('invalid_input', '"to" must be on or after "from".');
    if (addDays(input.from, MAX_DAYS - 1) < input.to) throw new CapabilityError('invalid_input', `At most ${MAX_DAYS} days per export.`);
    const location = await getLocation(db, actor.orgId, input.locationId);
    const ctx = await siteContext(db, actor.orgId, location.id, input.from, input.to);
    const days = coverageDays(ctx, input.from, input.to);
    const roomName = new Map(ctx.rooms.map((r) => [r.id, r.name]));

    const rows: z.infer<typeof rowOut>[] = [];
    const gaps: z.infer<typeof gapRow>[] = [];
    days.forEach((day, i) => {
      const date = addDays(input.from, i);
      const pack = packsOn(ctx.packs, date);
      if (!day || !pack) return;
      const byId = new Map(pack.rules.map((r) => [r.id, r]));
      const ratioFor = new Map(rulesOf(pack, 'ratio').map((r) => [r.ageGroup, r]));
      for (const room of ctx.rooms) {
        const blocks = day.rooms.filter((rb) => rb.roomId === room.id && (rb.children > 0 || rb.required > 0));
        const applied = new Map<string, Rule>();
        for (const rb of blocks) {
          const groups = rb.governing ? [rb.governing] : Object.keys(rb.counts).filter((g) => (rb.counts[g] ?? 0) > 0);
          for (const g of groups) {
            const r = ratioFor.get(g);
            if (r) applied.set(r.id, r);
          }
          for (const s of rb.shortfalls) {
            const r = byId.get(s.ruleId);
            if (r) applied.set(r.id, r);
          }
        }
        const short = blocks.filter((rb) => rb.gap > 0);
        rows.push({
          date,
          roomId: room.id,
          roomName: room.name,
          blocksChecked: blocks.length,
          blocksInRatio: blocks.length - short.length,
          blocksShort: short.length,
          maxShort: short.reduce((m, rb) => Math.max(m, rb.gap), 0),
          rules: [...applied.values()].map(ruleView),
        });
      }
      for (const g of gapWindows(day)) {
        const r = byId.get(g.ruleId);
        gaps.push({ date: g.date, roomName: g.roomId ? (roomName.get(g.roomId) ?? null) : null, start: g.start, end: g.end, kind: g.kind, label: g.label, required: g.required, present: g.present, short: g.short, rule: r ? ruleView(r) : null });
      }
    });

    // Audit entries for the period (UTC days, one day either side so no local-time entry is missed).
    const auditRows = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.orgId, actor.orgId), gte(auditLog.at, new Date(`${addDays(input.from, -1)}T00:00:00Z`)), lt(auditLog.at, new Date(`${addDays(input.to, 2)}T00:00:00Z`))))
      .orderBy(asc(auditLog.at));
    const audit = auditRows.map((a) => ({ at: a.at.toISOString(), actorType: a.actorType, capability: a.capability, outcome: a.outcome, summary: a.summary }));

    const files = {
      'ratio-checks.csv': toCsv(
        rows.map((r) => ({
          date: r.date,
          room: r.roomName,
          blocks_checked: r.blocksChecked,
          blocks_in_ratio: r.blocksInRatio,
          blocks_short: r.blocksShort,
          most_staff_short: r.maxShort,
          rules: r.rules.map((x) => x.label).join(' | '),
          sources: r.rules.map(sourceText).join(' | '),
          source_urls: r.rules.map((x) => x.citation?.url ?? '').filter(Boolean).join(' | '),
          read_on: r.rules.map((x) => x.citation?.retrievedOn ?? '').filter(Boolean).join(' | '),
        })),
      ),
      'gaps.csv': toCsv(
        gaps.map((g) => ({ date: g.date, room: g.roomName ?? 'Whole site', start: g.start, end: g.end, rule: g.label, required: g.required, counted: g.present, short: g.short, source: g.rule ? sourceText(g.rule) : '', source_url: g.rule?.citation?.url ?? '' })),
      ),
      'audit.csv': toCsv(audit.map((a) => ({ at: a.at, actor_type: a.actorType, action: a.capability, outcome: a.outcome, summary: a.summary }))),
    };
    return {
      site: { id: location.id, name: location.name, timezone: location.timezone },
      from: input.from,
      to: input.to,
      generatedAt: now.toISOString(),
      regulated: ctx.packs.length > 0,
      rows,
      gaps,
      audit,
      files,
      notice: NOT_LEGAL_ADVICE,
    };
  },
});
