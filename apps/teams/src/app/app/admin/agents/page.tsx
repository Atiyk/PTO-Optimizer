import Link from 'next/link';
import { ActionButton } from '@/components/ActionButton';
import { SendTestEvent, TokenCreator, WebhookCreator } from '@/components/AgentSettings';
import { CapabilityForm } from '@/components/CapabilityForm';
import { Badge, btnPrimary, Card } from '@/components/ui';
import { SCOPE_DESCRIPTIONS, SCOPES } from '@/capabilities/scopes';
import { AUTONOMY_LABELS, type AutonomyLevel } from '@/domain/autonomy';
import { call, requireActor } from '@/server/page';

const when = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : 'never');

const ACTION_NAMES: Record<string, string> = {
  submitLeaveRequest: 'Request leave',
  cancelLeaveRequest: 'Cancel a request',
  decideLeaveRequest: 'Approve or decline',
  respondToProposal: 'Accept a leave suggestion',
  sendPlanProposals: 'Send leave suggestions',
};

const EVENTS = [
  { event: 'leave.requested', description: 'someone asks for leave' },
  { event: 'leave.decided', description: 'a request is approved or declined' },
  { event: 'balance.expiring', description: 'leave will be lost in 30 or 7 days' },
  { event: 'plan.proposed', description: 'a manager sends leave suggestions' },
];

const KIND: Record<string, string> = { pat: 'Personal', api_key: 'API key', access: 'OAuth token' };

export default async function AgentsAndApi() {
  const actor = await requireActor();
  const a = await call('manageAgentAccess', { op: 'list' }, actor);
  const w = await call('manageWebhooks', { op: 'list' }, actor);
  const slack = await call('getSlackConnection', {}, actor);
  const serviceScopes = SCOPES.filter((s) => s !== 'admin' && s !== 'leave:approve').map((s) => ({ scope: s, description: SCOPE_DESCRIPTIONS[s] }));
  const live = a.tokens.filter((t) => !t.revokedAt);
  const endpointUrl = new Map(w.endpoints.map((e) => [e.id, e.url]));

  return (
    <div className="space-y-4">
      <Card
        title="Agent access"
        actions={
          a.agentAccessEnabled ? (
            <ActionButton capability="manageAgentAccess" input={{ op: 'setAgentAccess', enabled: false }} confirm="Stop every agent now? People are unaffected." doneMessage="All agent access is off.">
              Turn off all agent access
            </ActionButton>
          ) : (
            <ActionButton capability="manageAgentAccess" input={{ op: 'setAgentAccess', enabled: true }} className={btnPrimary} doneMessage="Agents can connect again.">
              Turn agent access back on
            </ActionButton>
          )
        }
      >
        <p className="text-sm text-muted">
          {a.agentAccessEnabled
            ? 'Agents can connect with the tokens and clients below.'
            : 'Agent access is off. Every token and client is refused until you turn it back on.'}{' '}
          Setup steps for Claude, ChatGPT, Copilot Studio and Agentforce are in the <Link className="text-accent underline" href="/docs/agents">agent guide</Link>.
        </p>
      </Card>

      <Card
        title="Slack app"
        actions={
          slack.installed ? (
            <ActionButton capability="manageSlack" input={{ op: 'uninstall' }} confirm="Disconnect Slack? The bot stops at once." doneMessage="Disconnected.">Disconnect</ActionButton>
          ) : slack.configured ? (
            <a className={btnPrimary} href="/api/slack/install?for=workspace">Add to Slack</a>
          ) : null
        }
      >
        <p className="text-sm text-muted">
          {slack.installed
            ? `Installed in ${slack.installed.teamName ?? slack.installed.teamId}. People request leave with /daysoff or by DM, managers approve from Slack, and /daysoff who shows who's out.`
            : slack.configured
              ? 'Add the bot so people can request leave and managers can approve without leaving Slack.'
              : 'Slack isn’t set up on this deployment yet: the app needs SLACK_CLIENT_ID, SLACK_CLIENT_SECRET and SLACK_SIGNING_SECRET (see apps/teams/slack/README.md).'}
        </p>
      </Card>

      <Card title="What agents may do on their own">
        <p className="mb-3 text-sm text-muted">
          Draft is the safe default: the agent prepares the change and the person confirms it. &ldquo;Act within policy&rdquo; applies only to agents acting for a
          person with their personal token; service agents always draft.
        </p>
        <ul className="space-y-4">
          {a.autonomy.map((x) => (
            <li key={x.capability} className="grid gap-2 border-t border-line pt-3 sm:grid-cols-2">
              <div>
                <p className="font-medium text-ink">{ACTION_NAMES[x.capability] ?? x.capability}</p>
                <p className="text-sm text-muted">Now: {AUTONOMY_LABELS[x.level as AutonomyLevel]}</p>
                <p className="text-sm text-muted">{x.evalLabel}</p>
              </div>
              <CapabilityForm
                capability="manageOrgSetup"
                fixed={{ op: 'setAutonomy', capability: x.capability, actorClass: 'agent' }}
                fields={[
                  {
                    name: 'level', label: 'Level', type: 'select', defaultValue: String(x.level),
                    options: ([0, 1, 2, 3] as const).map((l) => ({ value: String(l), label: AUTONOMY_LABELS[l] + (l === 3 && x.evalScore == null ? ' (no eval yet)' : '') })),
                  },
                ]}
                submitLabel="Save"
              />
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Create an API key">
          <p className="mb-3 text-sm text-muted">For one service agent that works for the whole workspace. It can read and draft; a named person confirms.</p>
          <TokenCreator kind="api_key" scopes={serviceScopes} defaultScopes={['leave:read']} />
        </Card>
        <Card title="Create an OAuth client">
          <p className="mb-3 text-sm text-muted">Client credentials for platforms that fetch their own tokens, such as Salesforce Agentforce. Tokens last one hour.</p>
          <TokenCreator kind="oauth_client" scopes={serviceScopes} defaultScopes={['leave:read']} />
        </Card>
      </div>

      <Card title="Active tokens">
        {live.length === 0 ? (
          <p className="text-sm text-muted">No active tokens.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-muted">
                <tr><th className="py-1 pr-3 font-medium">Name</th><th className="pr-3 font-medium">Kind</th><th className="pr-3 font-medium">Acts for</th><th className="pr-3 font-medium">Scopes</th><th className="pr-3 font-medium">Last used</th><th className="font-medium"><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody>
                {live.map((t) => (
                  <tr key={t.id} className="border-t border-line align-top">
                    <td className="py-2 pr-3 text-ink">{t.name} <code className="text-xs text-muted">{t.prefix}…</code></td>
                    <td className="py-2 pr-3">{KIND[t.kind]}</td>
                    <td className="py-2 pr-3">{t.memberName?.untrusted_text ?? 'Service agent'}</td>
                    <td className="py-2 pr-3"><span className="flex flex-wrap gap-1">{t.scopes.map((s) => <Badge key={s}>{s}</Badge>)}</span></td>
                    <td className="py-2 pr-3 whitespace-nowrap">{when(t.lastUsedAt)}</td>
                    <td className="py-2">
                      <ActionButton capability="manageAgentAccess" input={{ op: 'revokeToken', tokenId: t.id }} confirm="Revoke?" doneMessage="Revoked.">Revoke</ActionButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="OAuth clients">
        {a.clients.filter((c) => !c.revokedAt).length === 0 ? (
          <p className="text-sm text-muted">No OAuth clients.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {a.clients.filter((c) => !c.revokedAt).map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{c.name}</p>
                  <p className="break-all text-muted"><code className="text-xs">{c.clientId}</code> · last token {when(c.lastUsedAt)}</p>
                  <p className="mt-1 flex flex-wrap gap-1">{c.scopes.map((s) => <Badge key={s}>{s}</Badge>)}</p>
                </div>
                <ActionButton capability="manageAgentAccess" input={{ op: 'revokeOAuthClient', clientRowId: c.id }} confirm="Revoke the client and its tokens?" doneMessage="Revoked.">
                  Revoke
                </ActionButton>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Webhooks">
        <p className="mb-3 text-sm text-muted">
          Signed per the Standard Webhooks spec. Payloads never include notes, and health-related leave shows only as &ldquo;out&rdquo;.
        </p>
        <WebhookCreator events={EVENTS} />
        {w.endpoints.length > 0 && (
          <ul className="mt-4 divide-y divide-line border-t border-line text-sm">
            {w.endpoints.map((e) => (
              <li key={e.id} className="space-y-2 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="break-all font-medium text-ink">{e.url}</span>
                  <Badge tone={!e.active ? 'neutral' : e.health === 'failing' ? 'bad' : e.health === 'healthy' ? 'accent' : 'neutral'}>
                    {!e.active ? 'Paused' : e.health === 'failing' ? 'Failing' : e.health === 'healthy' ? 'Healthy' : 'No deliveries yet'}
                  </Badge>
                </div>
                <p className="text-muted">{e.events.join(', ')} · last delivered {when(e.lastDeliveredAt)}</p>
                <div className="flex flex-wrap items-center gap-2">
                  {e.active && <SendTestEvent endpointId={e.id} events={e.events} />}
                  <ActionButton capability="manageWebhooks" input={{ op: 'setActive', endpointId: e.id, active: !e.active }}>{e.active ? 'Pause' : 'Resume'}</ActionButton>
                  <ActionButton capability="manageWebhooks" input={{ op: 'delete', endpointId: e.id }} confirm="Delete this webhook and its log?">Delete</ActionButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Delivery log">
        {w.deliveries.length === 0 ? (
          <p className="text-sm text-muted">Nothing sent yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-muted">
                <tr><th className="py-1 pr-3 font-medium">When</th><th className="pr-3 font-medium">Event</th><th className="pr-3 font-medium">To</th><th className="pr-3 font-medium">Result</th><th className="font-medium"><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody>
                {w.deliveries.map((d) => (
                  <tr key={d.id} className="border-t border-line align-top">
                    <td className="py-2 pr-3 whitespace-nowrap">{when(d.createdAt)}</td>
                    <td className="py-2 pr-3">{d.event}{d.test ? ' (test)' : ''}</td>
                    <td className="max-w-48 truncate py-2 pr-3" title={endpointUrl.get(d.endpointId)}>{endpointUrl.get(d.endpointId)}</td>
                    <td className="py-2 pr-3">
                      {d.status === 'delivered'
                        ? `Delivered (HTTP ${d.lastStatusCode})`
                        : d.status === 'failed'
                          ? `Failed after ${d.attempts} ${d.attempts === 1 ? "try" : "tries"}: ${d.lastError}`
                          : d.attempts
                            ? `Retrying (${d.attempts} ${d.attempts === 1 ? "try" : "tries"} so far): ${d.lastError}`
                            : 'Queued'}
                    </td>
                    <td className="py-2">
                      {d.status !== 'delivered' && <ActionButton capability="manageWebhooks" input={{ op: 'retry', deliveryId: d.id }} doneMessage="Sent again.">Retry now</ActionButton>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
