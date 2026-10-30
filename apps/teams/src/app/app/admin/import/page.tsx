import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Card } from '@/components/ui';
import { ImportWizard } from '@/components/ImportWizard';
import { call, requireActor } from '@/server/page';

const SAMPLES = [
  { file: 'timetastic-users.csv', name: 'Timetastic users (12 people)', kind: 'members' as const },
  { file: 'spreadsheet-people.csv', name: 'Spreadsheet (3 people)', kind: 'members' as const },
  { file: 'vacation-tracker-leaves.csv', name: 'Vacation Tracker leave export', kind: 'leave' as const },
];

export default async function ImportPage() {
  const actor = await requireActor();
  const samples: { name: string; kind: 'members' | 'leave' | 'credentials' | 'shifts' | 'hours'; csv: string }[] = await Promise.all(
    SAMPLES.map(async (s) => ({ name: s.name, kind: s.kind, csv: await readFile(path.join(process.cwd(), 'samples', s.file), 'utf8').catch(() => '') })),
  );
  const setup = await call('getCoverageSetup', {}, actor);
  const coverage = setup.vertical !== 'general';
  if (coverage) {
    // Samples built from this org's own people and rooms, so they preview cleanly.
    const people = (await call('listMembers', {}, actor)).members.slice(0, 3).map((m) => m.name);
    const room = setup.sites.flatMap((s) => s.rooms)[0]?.name ?? 'Room 1';
    const q = (s: string) => (/[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    samples.push(
      { name: 'Credentials sample', kind: 'credentials', csv: `Name,Certification,Issued,Expiry date\n${people.map((p, i) => `${q(p)},Pediatric CPR,2025-0${i + 1}-15,2027-0${i + 1}-15`).join('\n')}\n` },
      { name: 'Schedule sample', kind: 'shifts', csv: `Employee,Classroom,Day,Start,End\n${people.map((p) => `${q(p)},${q(room)},Monday,8:00am,4:30pm`).join('\n')}\n` },
      { name: 'Hours worked sample', kind: 'hours', csv: `Employee,Period start,Period end,Hours worked\n${people.map((p) => `${q(p)},2026-10-01,2026-10-15,80`).join('\n')}\n` },
    );
  }
  return (
    <Card title="Import from Timetastic, Vacation Tracker or a spreadsheet">
      <p className="mb-4 text-sm text-muted">
        Import people first (a “remaining” column becomes their starting balance), then booked leave
        {coverage ? ', then credentials, weekly schedules and hours worked' : ''}. Nothing is saved until you press Import, and if any row has a problem
        nothing is saved at all.{coverage ? ' Credential, schedule and hours imports can be undone right after.' : ''}
      </p>
      <ImportWizard samples={samples.filter((s) => s.csv)} coverage={coverage} />
    </Card>
  );
}
