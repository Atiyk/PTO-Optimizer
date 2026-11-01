import Link from 'next/link';
import { ActionButton } from '@/components/ActionButton';
import { TokenCreator } from '@/components/AgentSettings';
import { Badge, btnSecondary, Card } from '@/components/ui';
import { SCOPE_DESCRIPTIONS, type Scope } from '@/capabilities/scopes';
import { call, requireActor } from '@/server/page';

const when = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : 'never');

export default async function MyAgents() {
  const actor = await requireActor();
  const { tokens } = await call('managePersonalTokens', { op: 'list' }, actor);
  const slack = await call('getSlackConnection', {}, actor);
  const mine = actor.scopes.filter((s) => s !== 'admin') as Scope[];
  const live = tokens.filter((t) => !t.revokedAt);
  return (
    <div className="space-y-4">
      <Card title="My agents">
        <p className="text-sm text-muted">
          A personal token lets an AI agent (Claude Code, Copilot Studio, your own script) act for you, never beyond what you can do yourself.
          Anything that changes your leave comes back here for you to confirm first. See <Link className="text-accent underline" href="/developers">how to connect an agent</Link>.
        </p>
      </Card>
      {slack.configured && (
        <Card
          title="Slack status"
          actions={
            slack.statusUpdates ? (
              <ActionButton capability="manageSlack" input={{ op: 'stopStatus' }} doneMessage="Stopped.">Stop</ActionButton>
            ) : (
              <a className={btnSecondary} href="/api/slack/install?for=status">Allow in Slack</a>
            )
          }
        >
          <p className="text-sm text-muted">
            {slack.statusUpdates
              ? 'When you’re out, your Slack status says “Out of office” with the date you’re back, and clears itself. It never says why.'
              : 'Let Days Off set your Slack status to “Out of office” on approved days off (including half days and hours). It never says why.'}
          </p>
        </Card>
      )}
      <Card title="Create a personal token">
        <TokenCreator kind="pat" scopes={mine.map((s) => ({ scope: s, description: SCOPE_DESCRIPTIONS[s] }))} defaultScopes={['leave:read', 'leave:request'].filter((s) => mine.includes(s as Scope))} />
      </Card>
      <Card title="Your tokens">
        {live.length === 0 ? (
          <p className="text-sm text-muted">No active tokens.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {live.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{t.name} <code className="text-xs text-muted">{t.prefix}…</code></p>
                  <p className="text-muted">Last used {when(t.lastUsedAt)} · expires {t.expiresAt ? t.expiresAt.slice(0, 10) : 'never'}</p>
                  <p className="mt-1 flex flex-wrap gap-1">{t.scopes.map((s) => <Badge key={s}>{s}</Badge>)}</p>
                </div>
                <ActionButton capability="managePersonalTokens" input={{ op: 'revoke', tokenId: t.id }} confirm="Revoke now? The agent stops working at once." doneMessage="Revoked.">
                  Revoke
                </ActionButton>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
