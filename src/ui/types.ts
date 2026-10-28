/** 'pinned' = a day the user explicitly forced to 'include' - visually a variant of
 * 'suggested-pto' (same fill, "a day you're taking"), distinguished by shape (border
 * weight + corner mark) rather than a different color. See dayCategory.ts.
 * 'unpaid-leave' (Phase 4C, /sabbatical only) = a day extending a sabbatical that's
 * unpaid rather than PTO - same "a day you're taking" fill as 'suggested-pto'/'pinned'
 * (this calendar deliberately has only two colour roles, see DayCell.tsx), distinguished
 * by its own glyph beside the numeral, the same way 'pinned' is. */
export type DayCategory = 'working' | 'weekend' | 'public-holiday' | 'suggested-pto' | 'pinned' | 'unpaid-leave';

export type ForcedState = 'include' | 'exclude';
