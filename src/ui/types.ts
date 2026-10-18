/** 'pinned' = a day the user explicitly forced to 'include' - visually a variant of
 * 'suggested-pto' (same fill, "a day you're taking"), distinguished by shape (border
 * weight + corner mark) rather than a different color. See dayCategory.ts. */
export type DayCategory = 'working' | 'weekend' | 'public-holiday' | 'suggested-pto' | 'pinned';

export type ForcedState = 'include' | 'exclude';
