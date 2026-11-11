import { useState } from 'react';

/**
 * Issue 15: a number field for a day count where empty means "not entered yet", never 0.
 * While the field is empty the last entered value stays in effect and `empty` is true so
 * the caller can ask for a number; typing 0 is a real, applied value. Leaving the field
 * empty restores the value still in effect.
 */
export function useWholeDayDraft(value: number, onChange: (n: number) => void) {
  const [draft, setDraft] = useState<{ text: string; value: number } | null>(null);
  // A draft only applies to the value it was typed against; outside changes (the slider,
  // a link, a suggestion) replace it.
  const active = draft && draft.value === value ? draft : null;
  return {
    text: active ? active.text : String(value),
    empty: active?.text.trim() === '',
    onChange(text: string) {
      if (text.trim() === '') { setDraft({ text, value }); return; }
      const n = Number(text);
      setDraft(null);
      if (Number.isFinite(n)) onChange(n);
    },
    onBlur() { setDraft(null); },
  };
}
