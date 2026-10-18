import { useMemo, useState } from 'react';
import { COUNTRIES, SUBDIVISIONS } from '../data/countries';

interface CountrySelectProps {
  country: string;
  subdivision: string | undefined;
  onChangeCountry: (code: string) => void;
  onChangeSubdivision: (code: string | undefined) => void;
}

const FIELD_CLASS =
  'h-9 w-full appearance-none rounded-md border border-slate-300 bg-white bg-[length:1rem] bg-[right_0.5rem_center] bg-no-repeat pl-3 pr-8 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400';
const CHEVRON_BG = { backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%2364748b'%3E%3Cpath fill-rule='evenodd' d='M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z' clip-rule='evenodd'/%3E%3C/svg%3E\")" };

export function CountrySelect({ country, subdivision, onChangeCountry, onChangeSubdivision }: CountrySelectProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    if (!query) return COUNTRIES;
    const q = query.toLowerCase();
    return COUNTRIES.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q));
  }, [query]);

  const current = COUNTRIES.find((c) => c.code === country);
  const subdivisions = SUBDIVISIONS[country];

  return (
    <div className="flex items-end gap-2">
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
        Country
        <div className="relative w-48">
          <input
            value={open ? query : (current?.name ?? country)}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => {
              setQuery('');
              setOpen(true);
            }}
            onBlur={() => setTimeout(() => setOpen(false), 100)}
            role="combobox"
            aria-expanded={open}
            aria-autocomplete="list"
            className={FIELD_CLASS}
            style={CHEVRON_BG}
          />
          {open && (
            <ul className="absolute z-20 mt-1 max-h-56 w-56 overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
              {matches.map((c) => (
                <li key={c.code}>
                  <button
                    type="button"
                    className="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50"
                    onClick={() => {
                      onChangeCountry(c.code);
                      onChangeSubdivision(undefined);
                      setOpen(false);
                    }}
                  >
                    {c.name} <span className="text-slate-400">({c.code})</span>
                  </button>
                </li>
              ))}
              {matches.length === 0 && <li className="px-3 py-1.5 text-sm text-slate-400">No matches</li>}
            </ul>
          )}
        </div>
      </label>
      {subdivisions && (
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          State
          <select
            value={subdivision ?? ''}
            onChange={(e) => onChangeSubdivision(e.target.value || undefined)}
            className={`${FIELD_CLASS} w-36`}
            style={CHEVRON_BG}
          >
            <option value="">All regions</option>
            {subdivisions.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
