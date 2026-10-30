import { HandbookImport } from '@/components/HandbookImport';
import { Card } from '@/components/ui';
import { isoDate } from '@/domain/leave';
import { call } from '@/server/page';

export default async function HandbookPage() {
  const s = await call('getOrgSetup', {});
  return (
    <Card title="Set up a policy from your handbook">
      <HandbookImport leaveTypes={s.leaveTypes.map((t) => ({ key: t.key, name: t.name }))} today={isoDate(new Date())} />
    </Card>
  );
}
