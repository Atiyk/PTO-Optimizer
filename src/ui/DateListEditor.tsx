import { useState } from 'react';

interface DateListEditorProps {
  dates: string[];
  onAdd: (date: string) => void;
  onRemove: (date: string) => void;
}

export function DateListEditor({ dates, onAdd, onRemove }: DateListEditorProps) {
  const [draft, setDraft] = useState('');

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="rounded-md border border-slate-200 px-2 py-1 text-sm"
        />
        <button
          type="button"
          onClick={() => {
            if (draft && !dates.includes(draft)) onAdd(draft);
            setDraft('');
          }}
          className="rounded-md bg-slate-100 px-2 py-1 text-sm font-medium text-slate-700 hover:bg-slate-200"
        >
          Add
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {dates.map((d) => (
          <span key={d} className="flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
            {d}
            <button type="button" onClick={() => onRemove(d)} className="text-slate-400 hover:text-slate-700">
              &times;
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
