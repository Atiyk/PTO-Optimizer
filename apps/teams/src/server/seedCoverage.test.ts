import { describe, expect, it } from 'vitest';
import { freshDb } from '@/test/db';
import { invokeCapability } from '@/capabilities/registry';
import { ROLE_SCOPES } from '@/capabilities/scopes';
import { seedChildcareCentre } from './seedCoverage';

describe('childcare demo seed', () => {
  it('builds the CA centre and shows the cited toddler gap next Monday', async () => {
    const db = await freshDb();
    const today = '2026-11-04';
    const s = await seedChildcareCentre(db, today);
    expect(s.staffIds).toHaveLength(18);
    const actor = { type: 'human' as const, orgId: s.org.id, memberId: s.managerId, role: 'manager' as const, clientId: null, onBehalfOfMemberId: null, scopes: ROLE_SCOPES.manager };
    const now = new Date(`${today}T16:00:00Z`);
    const firm = await invokeCapability('getCoverage', { db, actor, now }, { locationId: s.locationId, date: s.nextMonday, days: 5 });
    const gaps = firm.days.flatMap((d) => d.gaps);
    expect(gaps).toEqual([expect.objectContaining({ date: s.nextMonday, roomName: 'Toddlers', start: '15:30', end: '16:30', required: 2, present: 1, short: 1 })]);
    expect(gaps[0]!.citation?.section).toMatch(/1596\.955/);
    const likely = await invokeCapability('getCoverage', { db, actor, now }, { locationId: s.locationId, date: s.nextMonday, days: 5, includePending: true });
    expect(likely.days.flatMap((d) => d.gaps).map((g) => g.date)).toEqual([s.nextMonday, '2026-11-11']);
    const creds = await invokeCapability('getCredentials', { db, actor, now }, { alertsOnly: true });
    expect(creds.records.map((r) => r.band).sort()).toEqual(['14', '30', '7', 'expired']);
  });
});
