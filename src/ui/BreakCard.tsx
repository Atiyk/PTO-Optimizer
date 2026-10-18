import type { Break } from '../solver/types';

export function BreakCard({ brk, highlighted = false }: { brk: Break; highlighted?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between rounded-lg border p-4 transition-colors duration-700 ${
        highlighted ? 'border-teal-300 bg-teal-50/60' : 'border-slate-200 bg-white'
      }`}
    >
      <div>
        <div className="font-medium text-slate-800">
          {brk.start} &rarr; {brk.end}
        </div>
        <div className="text-sm text-slate-500">
          {brk.totalDaysOff} days off for {brk.ptoCost} PTO day{brk.ptoCost === 1 ? '' : 's'}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="rounded-full bg-teal-50 px-3 py-1 text-sm font-semibold text-teal-700">
          {brk.multiplier.toFixed(2)}x
        </span>
        {brk.tags.map((tag) => (
          <span
            key={tag}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              tag === 'Peak travel'
                ? 'bg-amber-50 text-amber-700'
                : tag === 'Overlaps'
                  ? 'bg-sky-50 text-sky-700'
                  : tag === 'Estimated'
                    ? 'bg-slate-100 text-slate-600'
                    : 'bg-emerald-50 text-emerald-700'
            }`}
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}
