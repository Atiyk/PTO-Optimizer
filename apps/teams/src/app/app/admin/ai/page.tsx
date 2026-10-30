import { Card, Stat } from '@/components/ui';
import { call } from '@/server/page';

const MODE: Record<'live' | 'mock' | 'off', [string, string]> = {
  live: ['On', 'Anthropic API, within the budgets below'],
  mock: ['Demo', 'Built-in rules stand in for the model; no API calls'],
  off: ['Off', 'Every form works without it'],
};

export default async function AiUsagePage() {
  const u = await call('getAiUsage', {});
  const totalCost = u.byFeature.reduce((s, f) => s + f.estimatedCostUsd, 0);
  return (
    <div className="space-y-4">
      <Card title="AI usage">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="AI features" value={MODE[u.mode][0]} hint={MODE[u.mode][1]} />
          <Stat label="Tokens today" value={u.today.tokens.toLocaleString()} hint={`of ${u.today.dailyBudget.toLocaleString()} daily allowance`} />
          <Stat label="Estimated cost, last 30 days" value={`$${totalCost.toFixed(2)}`} hint={u.monthlyBudgetExhausted ? 'Monthly budget used up: AI paused' : undefined} />
        </div>
      </Card>
      <Card title="By feature (last 30 days)">
        {u.byFeature.length === 0 ? (
          <p className="text-sm text-muted">No AI calls yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-muted">
                <tr><th className="py-1 pr-3 font-medium">Feature</th><th className="pr-3 font-medium">Model</th><th className="pr-3 font-medium">Calls</th><th className="pr-3 font-medium">Cached</th><th className="pr-3 font-medium">Tokens in / out</th><th className="font-medium">Est. cost</th></tr>
              </thead>
              <tbody>
                {u.byFeature.map((f) => (
                  <tr key={`${f.feature}-${f.model}`} className="border-t border-line">
                    <td className="py-1 pr-3">{f.feature}</td>
                    <td className="pr-3">{f.model}</td>
                    <td className="pr-3">{f.calls}</td>
                    <td className="pr-3">{f.cacheHits}</td>
                    <td className="pr-3">{f.inputTokens.toLocaleString()} / {f.outputTokens.toLocaleString()}</td>
                    <td>${f.estimatedCostUsd.toFixed(4)}</td>
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
