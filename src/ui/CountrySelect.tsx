import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { COUNTRIES, subdivisionLabel } from '@daysoff/engine/data/countries';

interface CountrySelectProps {
  country: string;
  onChangeCountry: (code: string) => void;
  /** Width of the field; the planner's control rail passes w-full. */
  widthClass?: string;
}

export const FIELD_CLASS =
  'h-11 w-full appearance-none rounded-[6px] border border-line-strong bg-surface bg-[length:1rem] bg-[right_0.75rem_center] bg-no-repeat pl-3 pr-9 text-[15px] font-normal text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]';
export const CHEVRON_BG = { backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%23141414'%3E%3Cpath fill-rule='evenodd' d='M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z' clip-rule='evenodd'/%3E%3C/svg%3E\")" };

/** Country only - the subdivision ("State") picker is a separate component
 * (`SubdivisionSelect` below), since the two now live in different places: country is
 * always visible, the subdivision picker lives behind the "Adjust" disclosure. Changing
 * the country itself still always resets any selected subdivision - that reset is handled
 * by `onChangeCountry` (see useAppState's `changeCountry`), not duplicated here. */
export function CountrySelect({ country, onChangeCountry, widthClass = 'w-56 max-w-full' }: CountrySelectProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const fieldId = `country-${useId()}`;
  const listId = `${fieldId}-list`;
  const labelId = `${fieldId}-label`;

  const matches = useMemo(() => {
    if (!query) return COUNTRIES;
    const q = query.toLowerCase();
    return COUNTRIES.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q));
  }, [query]);

  const current = COUNTRIES.find((c) => c.code === country);
  const active = open ? matches[activeIndex] : undefined;
  const activeId = active ? `${listId}-${active.code}` : undefined;

  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView?.({ block: 'nearest' });
  }, [activeId]);

  const selectCountry = (code: string) => {
    onChangeCountry(code);
    setOpen(false);
    setQuery('');
    inputRef.current?.focus();
  };

  const openCurrent = () => {
    setQuery('');
    setActiveIndex(Math.max(0, COUNTRIES.findIndex((entry) => entry.code === country)));
    setOpen(true);
  };

  return (
    <div className="flex min-w-0 flex-col gap-1.5 text-sm font-semibold text-ink">
      <label id={labelId} htmlFor={fieldId}>Country</label>
      <div className={`relative ${widthClass}`}>
        <input
          id={fieldId}
          ref={inputRef}
          value={open ? query : (current?.name ?? country)}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onFocus={openCurrent}
          onClick={() => { if (!open) openCurrent(); }}
          onBlur={() => {
            setOpen(false);
            setQuery('');
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              if (!open) {
                openCurrent();
              } else if (matches.length > 0) {
                const direction = event.key === 'ArrowDown' ? 1 : -1;
                setActiveIndex((index) => (index + direction + matches.length) % matches.length);
              }
            } else if (event.key === 'Enter' && open) {
              event.preventDefault();
              if (active) selectCountry(active.code);
            } else if (event.key === 'Escape') {
              event.preventDefault();
              setOpen(false);
              setQuery('');
            }
          }}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={open ? listId : undefined}
          aria-activedescendant={activeId}
          aria-haspopup="listbox"
          autoComplete="off"
          className={FIELD_CLASS}
          style={CHEVRON_BG}
        />
        {open && (
          <ul id={listId} role="listbox" aria-labelledby={labelId} tabIndex={-1} className="absolute z-20 mt-1 max-h-64 w-full min-w-56 max-w-[calc(100vw-2rem)] overflow-auto rounded-[10px] border border-line-strong bg-surface py-1 font-normal shadow-lg">
            {matches.map((c, index) => (
              <li
                id={`${listId}-${c.code}`}
                key={c.code}
                role="option"
                aria-selected={c.code === country}
                className={`block min-h-11 cursor-pointer px-3 py-2.5 text-left text-sm text-ink ${index === activeIndex ? 'bg-surface-alt outline outline-1 -outline-offset-1 outline-[var(--text-primary)]' : 'hover:bg-surface-alt'}`}
                onMouseDown={(event) => event.preventDefault()}
                onMouseMove={() => setActiveIndex(index)}
                onClick={() => selectCountry(c.code)}
              >
                {c.name} <span className="text-muted">({c.code})</span>
              </li>
            ))}
            {matches.length === 0 && <li role="presentation" className="px-3 py-2.5 text-sm text-muted">No matches</li>}
          </ul>
        )}
        <span role="status" className="sr-only">{open && matches.length === 0 ? 'No countries match your search.' : ''}</span>
      </div>
    </div>
  );
}

interface SubdivisionSelectProps {
  /** Subdivision codes discovered for the current country/range (from the `counties` field
   * on its actual fetched holidays - see useAppState's `discoveredSubdivisions`), not a
   * static per-country list - this is what makes the field work for any of the 204
   * countries that have county-specific holidays, not just a hardcoded few. */
  subdivisions: string[];
  subdivision: string | undefined;
  onChangeSubdivision: (code: string | undefined) => void;
}

/** Only renders a field when the selected country/range actually turned up subdivisions -
 * returns null otherwise, so a caller can render it unconditionally. */
export function SubdivisionSelect({ subdivisions, subdivision, onChangeSubdivision }: SubdivisionSelectProps) {
  if (subdivisions.length === 0) return null;

  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-sm font-semibold text-ink">
      State
      <select
        value={subdivision ?? ''}
        onChange={(e) => onChangeSubdivision(e.target.value || undefined)}
        className="select-ink w-full max-w-xs text-[15px] font-normal"
      >
        <option value="">All regions</option>
        {subdivisions.map((code) => (
          <option key={code} value={code}>
            {subdivisionLabel(code)}
          </option>
        ))}
      </select>
    </label>
  );
}
