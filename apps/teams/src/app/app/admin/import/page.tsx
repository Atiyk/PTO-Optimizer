import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Card } from '@/components/ui';
import { ImportWizard } from '@/components/ImportWizard';

const SAMPLES = [
  { file: 'timetastic-users.csv', name: 'Timetastic users (12 people)', kind: 'members' as const },
  { file: 'spreadsheet-people.csv', name: 'Spreadsheet (3 people)', kind: 'members' as const },
  { file: 'vacation-tracker-leaves.csv', name: 'Vacation Tracker leave export', kind: 'leave' as const },
];

export default async function ImportPage() {
  const samples = await Promise.all(
    SAMPLES.map(async (s) => ({ name: s.name, kind: s.kind, csv: await readFile(path.join(process.cwd(), 'samples', s.file), 'utf8').catch(() => '') })),
  );
  return (
    <Card title="Import from Timetastic, Vacation Tracker or a spreadsheet">
      <p className="mb-4 text-sm text-muted">
        Import people first (a “remaining” column becomes their starting balance), then booked leave. Nothing is saved until you press Import,
        and if any row has a problem nothing is saved at all.
      </p>
      <ImportWizard samples={samples.filter((s) => s.csv)} />
    </Card>
  );
}
