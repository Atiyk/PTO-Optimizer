import { WorkRulesControls } from '@/components/WorkRulesControls';
import { Card } from '@/components/ui';
import { call, requireActor } from '@/server/page';

/**
 * Work rules: industry preset, the time clock switch, the overtime policy for cover, and each
 * site's overtime and break rules with their sources. Changes apply as they are picked.
 */
export default async function WorkRulesPage() {
  const actor = await requireActor();
  const r = await call('getWorkRules', {}, actor);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Work rules</h1>
        <p className="text-sm text-muted">One system for every kind of team. Pick your industry for the right words and packs, then set how time and overtime work.</p>
      </div>
      <WorkRulesControls rules={r} />
      <Card title="Overtime and break rules by site">
        <div className="space-y-5">
          {r.sites.map((s) => (
            <section key={s.locationId} aria-labelledby={`site-${s.locationId}`}>
              <h3 id={`site-${s.locationId}`} className="text-sm font-semibold text-ink">
                {s.name} <span className="font-normal text-muted">· {s.region}</span>
              </h3>
              <p className="text-sm text-muted">Using: {s.source}</p>
              {s.rules.length === 0 ? (
                <p className="mt-1 text-sm text-muted">No overtime or break rules yet. Pick a labour pack above.</p>
              ) : (
                <ul className="mt-2 space-y-1.5 text-sm">
                  {s.rules.map((x) => (
                    <li key={x.id} className="text-ink">
                      {x.label}
                      <span className="block text-xs text-muted">
                        {x.needsVerification ? 'Needs verification' : x.url ? <a className="underline" href={x.url} target="_blank" rel="noreferrer">{x.source}</a> : x.source}
                        {x.retrievedOn ? ` · read ${x.retrievedOn}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {s.notes.length > 0 && (
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer text-muted">What this pack does not cover ({s.notes.length})</summary>
                  <ul className="mt-1 list-disc pl-5 text-muted">
                    {s.notes.map((n, i) => <li key={i}>{n}</li>)}
                  </ul>
                </details>
              )}
            </section>
          ))}
        </div>
      </Card>
      <p className="text-xs text-muted">{r.notice}</p>
    </div>
  );
}
