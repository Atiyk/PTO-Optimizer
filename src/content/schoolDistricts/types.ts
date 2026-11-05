export type ClosureKind = 'break' | 'holiday' | 'staff-day' | 'weather-makeup-reserve' | 'other';

export interface SchoolClosure {
  /** Inclusive ISO dates. Days students do NOT attend. Early-release days are NOT closures. */
  start: string;
  end: string;
  /** Public label from the district calendar, e.g. "Winter recess". */
  label: string;
  kind: ClosureKind;
}

export interface SchoolDistrictPreset {
  id: string;
  district: string;
  shortName: string;
  city: string;
  state: string;
  schoolYear: string;
  firstDay: string;
  lastDay: string;
  closures: SchoolClosure[];
  source: {
    url: string;
    title: string;
    retrieved: string;
    documentDate?: string;
  };
  notes?: string;
}
