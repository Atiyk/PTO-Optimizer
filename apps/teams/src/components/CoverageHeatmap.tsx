import type { CapabilityOutput } from '@/capabilities/registry';

type Out = CapabilityOutput<'getCoverage'>;

/**
 * Rooms × 30-minute blocks for one day. Each cell shows staff present / required; a gap is
 * shown three ways so it reads in greyscale and to screen readers: a "−N" label, a heavy
 * border and diagonal stripes. Group-size problems (fewer children allowed, not more staff)
 * get a dotted border and "G".
 */
export function CoverageHeatmap({ rooms, grid, date }: { rooms: Out['rooms']; grid: NonNullable<Out['days'][number]['grid']>; date: string }) {
  if (grid.length === 0) return <p className="text-sm text-muted">No children or staff scheduled on {date}.</p>;
  const shown = rooms.filter((r) => grid.some((b) => b.rooms.some((x) => x.roomId === r.id)));
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-0.5 text-center text-[11px] tabular-nums">
        <caption className="sr-only">Staff present and required per room and half hour on {date}</caption>
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 bg-page pr-2 text-left font-medium text-muted">Room</th>
            {grid.map((b) => (
              <th key={b.block} scope="col" className="min-w-9 font-medium text-muted">{b.block.endsWith(':00') ? b.block.replace(':00', '') : ''}<span className="sr-only">{b.block}</span></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.id}>
              <th scope="row" className="sticky left-0 max-w-32 truncate bg-page pr-2 text-left font-medium text-ink">{r.name}</th>
              {grid.map((b) => {
                const c = b.rooms.find((x) => x.roomId === r.id);
                if (!c || (c.required === 0 && c.present === 0 && c.children === 0)) return <td key={b.block} className="h-8 rounded-sm border border-line/50" aria-label={`${b.block}: closed`} />;
                const gap = c.gap > 0;
                const cls = gap ? 'border-2 border-ink bg-page font-semibold text-ink' : c.groupProblem ? 'border-2 border-dotted border-ink bg-page text-ink' : c.present > c.required ? 'border border-line bg-muted/15 text-ink' : 'border border-line bg-muted/35 text-ink';
                return (
                  <td
                    key={b.block}
                    className={`h-8 rounded-sm ${cls}`}
                    style={gap ? { backgroundImage: 'repeating-linear-gradient(45deg, transparent 0 4px, rgba(127,127,127,.45) 4px 6px)' } : undefined}
                    title={`${r.name} ${b.block}: ${c.children} children, ${c.present} staff of ${c.required} required`}
                  >
                    {gap ? `−${c.gap}` : c.groupProblem ? 'G' : `${c.present}/${c.required}`}
                  </td>
                );
              })}
            </tr>
          ))}
          {grid.some((b) => b.siteGap > 0) && (
            <tr>
              <th scope="row" className="sticky left-0 bg-page pr-2 text-left font-medium text-ink">Whole site</th>
              {grid.map((b) => (
                <td key={b.block} className={`h-8 rounded-sm ${b.siteGap ? 'border-2 border-ink font-semibold' : ''}`}>{b.siteGap ? `−${b.siteGap}` : ''}</td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted">
        Cells show staff present / required. <span className="font-semibold text-ink">−N</span> with stripes and a heavy border: N staff short.{' '}
        <span className="font-semibold text-ink">G</span> with a dotted border: more children than the group-size limit (staffing cannot fix it). Lighter: spare staff.
      </p>
    </div>
  );
}
