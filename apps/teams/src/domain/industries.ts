import type { VERTICALS } from '@/db/schema';

/*
 * Industry presets. The product is one general system (leave, coverage, time); an industry
 * only changes words and which rule packs are suggested. `general` keeps MVP behaviour.
 */

export type Vertical = (typeof VERTICALS)[number];

export interface Industry {
  key: Vertical;
  label: string;
  /** What a "room" is called in this industry. */
  roomNoun: string;
  blurb: string;
  /** Regulated-coverage packs worth offering first (labour packs are offered to everyone). */
  suggestedPacks: readonly string[];
}

export const INDUSTRIES: readonly Industry[] = [
  { key: 'general', label: 'Office or knowledge work', roomNoun: 'team', blurb: 'Leave, approvals and day-level coverage. No shifts needed.', suggestedPacks: [] },
  { key: 'childcare', label: 'Childcare', roomNoun: 'room', blurb: 'Staff-to-child ratios by age group, lead-teacher rules and cited state packs.', suggestedPacks: ['childcare-us-ca', 'childcare-us-tx', 'childcare-us-ny'] },
  { key: 'clinic', label: 'Clinics and outpatient practices', roomNoun: 'chair', blurb: 'Bookings per service, licensed roles on the floor.', suggestedPacks: ['clinic-template'] },
  { key: 'healthcare', label: 'Healthcare and care homes', roomNoun: 'unit', blurb: 'Units, licensed roles, rest between shifts and credential expiry.', suggestedPacks: ['clinic-template'] },
  { key: 'retail', label: 'Retail', roomNoun: 'department', blurb: 'Shifts by department, breaks and overtime by state.', suggestedPacks: [] },
  { key: 'hospitality', label: 'Restaurants and hospitality', roomNoun: 'station', blurb: 'Front and back of house, split shifts, breaks and overtime by state.', suggestedPacks: [] },
  { key: 'security', label: 'Security and facilities', roomNoun: 'post', blurb: 'Posts that must always be staffed, guard licences that expire.', suggestedPacks: [] },
  { key: 'manufacturing', label: 'Manufacturing and warehouses', roomNoun: 'line', blurb: 'Lines and shifts, certified operators, overtime control.', suggestedPacks: [] },
];

export function industry(key: string): Industry {
  return INDUSTRIES.find((i) => i.key === key) ?? INDUSTRIES[0]!;
}
