import type { CapabilityOutput } from '@/capabilities/registry';
import { ScrollToGap } from './ScrollToGap';

type Out = CapabilityOutput<'getCoverage'>;

/**
 * Rooms × 30-minute blocks for one day. Cells in ratio are a calm fill with the counts for
 * screen readers and on hover; a gap is shown three ways so it reads in greyscale too: a "−N"
 * label, a heavy border and diagonal stripes. Group-size problems (fewer children allowed, not more staff)
 * get a dotted border and "G".
 */
export function CoverageHeatmap({ rooms, grid, date }: { rooms: Out['rooms']; grid: NonNullable<Out['days'][number]['grid']>; date: string }) {
  if (grid.length === 0) return <p className="text-sm text-muted">No children or staff scheduled on {date}.</p>;
  const shown = rooms.filter((r) => grid.some((b) => b.rooms.some((x) => x.roomId === r.id)));
  return (
    // Focusable so keyboard users can scroll it sideways on a phone (axe scrollable-region-focusable).
    <div>
      <div id={`heatmap-${date}`} className="relative overflow-x-auto" tabIndex={0} role="region" aria-label={`Coverage by room and half hour, ${date}`}>
        <table className="border-separate border-spacing-0.5 text-center text-[11px] tabular-nums">
          <caption className="sr-only">Staff present and required per room and half hour on {date}</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 bg-page pr-2 text-left font-medium text-muted">
                Room
              </th>
              {grid.map((b) => (
                <th key={b.block} scope="col" className="min-w-7 text-left font-medium text-muted sm:min-w-9">
                  {b.block.endsWith(':00') ? b.block.replace(':00', '') : ''}
                  <span className="sr-only">{b.block}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <th scope="row" className="sticky left-0 max-w-32 truncate bg-page pr-2 text-left font-medium text-ink">
                  {r.name}
                </th>
                {grid.map((b) => {
                  const c = b.rooms.find((x) => x.roomId === r.id);
                  if (!c || (c.required === 0 && c.present === 0 && c.children === 0))
                    return <td key={b.block} className="h-8 rounded-sm border border-line/50" aria-label={`${b.block}: closed`} />;
                  const gap = c.gap > 0;
                  const spare = c.present > c.required;
                  const cls = gap
                    ? 'border-2 border-gap-line bg-gap-fill font-semibold text-gap-text'
                    : c.groupProblem
                      ? 'border-2 border-dotted border-gap-line bg-page font-semibold text-gap-text'
                      : spare
                        ? 'border border-ok-line/50 bg-ok-bg'
                        : 'border border-ok-line bg-ok-fill';
                  const words = `${c.present} of ${c.required} staff, ${c.children} children`;
                  return (
                    <td
                      key={b.block}
                      data-gap={gap ? '' : undefined}
                      className={`h-8 rounded-sm ${cls}`}
                      style={
                        gap
                          ? {
                              backgroundImage: 'repeating-linear-gradient(45deg, transparent 0 4px, rgba(185,28,28,.28) 4px 6px)',
                            }
                          : undefined
                      }
                      title={`${r.name} ${b.block}: ${c.children} children, ${c.present} staff of ${c.required} required`}
                    >
                      {gap ? `−${c.gap}` : c.groupProblem ? 'G' : ''}
                      <span className="sr-only">{gap ? ` short: ${words}` : c.groupProblem ? ` group too large: ${words}` : words}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
            {grid.some((b) => b.siteGap > 0) && (
              <tr>
                <th scope="row" className="sticky left-0 bg-page pr-2 text-left font-medium text-ink">
                  Whole site
                </th>
                {grid.map((b) => (
                  <td key={b.block} className={`h-8 rounded-sm ${b.siteGap ? 'border-2 border-ink font-semibold' : ''}`}>
                    {b.siteGap ? `−${b.siteGap}` : ''}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <ScrollToGap regionId={`heatmap-${date}`} />
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Key">
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-4 w-5 rounded-sm border border-ok-line bg-ok-fill" />
          In ratio
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-4 w-5 rounded-sm border border-ok-line/50 bg-ok-bg" />
          Spare staff
        </li>
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-flex h-4 w-5 items-center justify-center rounded-sm border-2 border-gap-line bg-gap-fill text-[10px] font-semibold text-gap-text"
            style={{
              backgroundImage: 'repeating-linear-gradient(45deg, transparent 0 4px, rgba(185,28,28,.28) 4px 6px)',
            }}
          >
            −1
          </span>
          Staff short
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="inline-flex h-4 w-5 items-center justify-center rounded-sm border-2 border-dotted border-gap-line text-[10px] font-semibold text-gap-text">
            G
          </span>
          Group too large
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-4 w-5 rounded-sm border border-line/50" />
          Closed
        </li>
      </ul>
      <p className="mt-1 text-xs text-muted">Hover a cell to see its children and staff counts.</p>
    </div>
  );
}
