import { mondayIndexedDow } from '@daysoff/engine/solver/dateUtils';
import type { CapabilityOutput } from '@/capabilities/registry';

type Day = CapabilityOutput<'runTeamPlan'>['heatmap'][number];

/** Weekday grid of people out per day under the plan, legible in greyscale (numbers + shade + stripes at the minimum). */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function Heatmap({ days }: { days: Day[] }) {
  const weekdays = days.filter((d) => mondayIndexedDow(d.date) < 5);
  const weeks: (Day | null)[][] = [];
  for (const d of weekdays) {
    const dow = mondayIndexedDow(d.date);
    if (weeks.length === 0 || dow === 0) weeks.push([null, null, null, null, null]);
    weeks[weeks.length - 1]![dow] = d;
  }
  const maxOut = Math.max(1, ...weekdays.map((d) => d.out));
  return (
    <table className="w-full table-fixed border-separate border-spacing-1 text-center text-xs">
      <thead>
        <tr className="text-muted">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((d) => <th key={d} className="font-medium">{d}</th>)}
        </tr>
      </thead>
      <tbody>
        {weeks.map((w, i) => (
          <tr key={i}>
            {w.map((d, j) => {
              if (!d) return <td key={j} />;
              const slack = d.rules.length ? Math.min(...d.rules.map((r) => r.slackLeft)) : null;
              const level = d.out / maxOut;
              const atMin = slack === 0;
              return (
                <td
                  key={j}
                  className={`rounded border border-line p-1 ${level > 0.66 ? 'bg-ink text-page' : level > 0.33 ? 'bg-muted/40 text-ink' : level > 0 ? 'bg-muted/15 text-ink' : 'bg-page text-ink'}`}
                  style={atMin ? { backgroundImage: 'repeating-linear-gradient(45deg, transparent 0 4px, rgba(127,127,127,.45) 4px 6px)' } : undefined}
                  title={`${d.date}: ${d.out} out${d.planned ? ` (${d.planned} planned)` : ''}${slack != null ? `, room for ${slack} more` : ''}`}
                >
                  <div className="font-medium">{d.date.slice(8) === '01' || (i === 0 && j === w.findIndex(Boolean)) ? `${MONTHS[Number(d.date.slice(5, 7)) - 1]} ${Number(d.date.slice(8))}` : Number(d.date.slice(8))}</div>
                  <div>{d.rules.length === 0 && d.out === 0 ? 'closed' : `${d.out} out`}</div>
                  {slack != null && <div className={atMin ? 'font-semibold' : ''}>{atMin ? 'at min' : `+${slack}`}</div>}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
