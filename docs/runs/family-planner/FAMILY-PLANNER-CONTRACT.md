# Family planner — shared contract

All agents code to these signatures. Change them only through the orchestrator.

## 1. `src/content/schoolDistricts/index.ts` (Agent R)

```ts
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
  id: string;            // stable slug, e.g. 'nyc-doe-2026-27'
  district: string;      // 'New York City Public Schools'
  shortName: string;     // 'NYC Public Schools'
  city: string;          // 'New York'
  state: string;         // 'NY' (USPS code)
  schoolYear: string;    // '2026-27'
  firstDay: string;      // first day for students (ISO)
  lastDay: string;       // last day for students (ISO)
  closures: SchoolClosure[]; // weekday closures between firstDay and lastDay, sorted
  source: {
    url: string;         // official district URL (district domain) for the calendar
    title: string;
    retrieved: string;   // ISO date the dates were checked
    documentDate?: string; // board approval / revision date if stated
  };
  notes?: string;        // e.g. "Some dates may change for weather makeup days."
}

export const SCHOOL_DISTRICT_PRESETS: readonly SchoolDistrictPreset[];
export const SCHOOL_PRESETS_AS_OF: string; // ISO date
export function findDistrictPreset(id: string): SchoolDistrictPreset | undefined;
/** Every weekday closure date (expanded, sorted, deduped), Sat/Sun excluded. */
export function presetOffDays(preset: SchoolDistrictPreset): string[];
/** date -> label for UI display. */
export function presetLabels(preset: SchoolDistrictPreset): Record<string, string>;
```

## 2. `src/personal/familyPlan.ts` (Agent C)

```ts
export const MAX_FAMILY_PTO = 60;

export interface FamilyPlanInput {
  /** Inclusive planning window, at most 1096 days. */
  start: string;
  end: string;
  /** School closure dates (from buildSchoolCalendar().offDays). Weekends need not be listed. */
  schoolOffDays: readonly string[];
  /** Public preset labels, date -> label. Optional. */
  schoolLabels?: Readonly<Record<string, string>>;
  /** Dates the parent is already off: weekends per their workweek + public/employer holidays. */
  parentFreeDays: readonly string[];
  /** PTO days the parent is willing to spend on school breaks, 0..MAX_FAMILY_PTO. */
  ptoBudget: number;
  /** Dates another adult (co-parent, grandparent) shared as available. Childcare cover only. */
  otherAdultDays?: readonly string[];
  /** Break ids (= break start date) the user switched off. */
  excludedBreaks?: readonly string[];
}

export interface SchoolBreak {
  id: string;               // = start date
  start: string;            // inclusive; a maximal run of days the child is off
  end: string;              //   (school-off days joined through Sat/Sun)
  label?: string;           // most common preset label in the run
  schoolOffWeekdays: string[];
  /** Weekdays in the break the parent works (not in parentFreeDays). */
  parentWorkdays: string[];
}

export interface FamilyBreakPlan {
  breakId: string;
  ptoDays: string[];        // chosen PTO dates (subset of parentWorkdays, contiguous choice)
  /** Longest consecutive run inside the break where child and parent are both off. */
  togetherStart: string | null;
  togetherEnd: string | null;
  togetherDays: number;
  fullyCovered: boolean;
  excluded: boolean;
}

export type GapCover = 'you-off' | 'pto' | 'other-adult' | 'uncovered';

export interface FamilyPlanResult {
  breaks: SchoolBreak[];
  plans: FamilyBreakPlan[];               // same order as breaks
  ptoUsed: number;
  ptoLeft: number;
  togetherDaysTotal: number;
  /** Every school-off weekday in the window with how it is covered. */
  gaps: { date: string; cover: GapCover }[];
  uncoveredDays: string[];
  coverage: 'partial';
}

/** Deterministic. Returns null on invalid input. Allocation: multiple-choice knapsack over
 *  breaks (per break, best contiguous k-day PTO window for each k), maximising total together
 *  days, tie-break fewer PTO days, then earlier dates. */
export function planFamilyTime(input: FamilyPlanInput): FamilyPlanResult | null;
```

## 3. `src/personal/schoolDateText.ts` (Agent C)

Deterministic extraction from pasted text or OCR output. No network, no AI.

```ts
export interface ExtractedSchoolDate {
  id: string;               // stable: `${start}_${end}`
  start: string;
  end: string;
  /** Text snippet (≤ 80 chars) the dates came from, for the confirm step only; never stored. */
  snippet: string;
  /** Closure keyword found nearby (recess, break, holiday, no school, closed, …). */
  label?: string;
  /** 'likely-closure' when a closure keyword is on the line; otherwise 'unsure'. */
  confidence: 'likely-closure' | 'unsure';
}

export function extractSchoolDates(text: string, opts: { schoolYearStart: number }): ExtractedSchoolDate[];
```

Formats: `Dec 21 – Jan 1`, `December 21, 2026 - January 1, 2027`, `12/21–1/1`, `11/26/2026`,
`Mon, Feb 15`, `Nov 26-27`, `Thursday, November 26`, en/em dashes, "to", "through", "thru".
Year inference: months Aug–Dec → `schoolYearStart`, Jan–Jul → `schoolYearStart + 1`, unless a
year is written. Reject impossible dates and ranges longer than 31 days. Cap 300 results and 50k
chars of input.

## 4. `src/ui/familyUrlState.ts` (Agent C)

Query params (only write non-defaults):

| Param | Meaning |
| --- | --- |
| `c` | country (as /sabbatical) |
| `s` | window start ISO (defaults to today) |
| `pto` | PTO budget 0..60 (default 10) |
| `d` | district preset id |
| `sd` | custom school-off dates, compact ranges (see below), max 1500 chars |
| `x` | excluded break ids, compact |
| `pp` | other adult's availability, reuse `src/planning/partner.ts` encoding |
| `ask` | `1` = "please add the school calendar" request link |

```ts
export interface FamilyURLState {
  country?: string; start?: string; ptoBudget: number; districtId?: string;
  customOffDays: string[]; excludedBreaks: string[]; ask: boolean; invalid: string[];
}
export function readFamilyStateFromURL(search: string): FamilyURLState;
export function writeFamilyStateToURL(params: URLSearchParams, state: {...}): void;
export function encodeDateRanges(dates: readonly string[]): string;  // e.g. "20261221.c,9.2"
export function decodeDateRanges(raw: string): string[] | null;
/** Share link: school dates (d and/or sd) + optional sender availability as pp. Dates only. */
export function buildFamilyShareURL(origin: string, opts: {
  districtId?: string; customOffDays: readonly string[]; country?: string;
  availability?: import('../planning/partner').PartnerAvailability; ask?: boolean;
}): string;
```

## 5. UI (Agent U)

Route `/family` mirrors `/sabbatical`: `family/index.html`, `src/family-main.tsx`, `src/ui/Family.tsx`,
entry in `scripts/routes.ts` (component `'family'`), `vite.config.ts` input, prerender, sitemap,
nav item "Family", landing link, FAQ section. Live results, no submit buttons for planning.
Import sources, all feeding `buildSchoolCalendar`:

1. District preset picker (searchable list; shows source link, school year and "as of").
2. `.ics` file upload or URL (URL fetch is best effort; CORS failure explains "download the
   file and upload it instead").
3. Photo or screenshot → on-device OCR → `extractSchoolDates` → confirm each date.
4. Paste text (e.g. from a PDF) → `extractSchoolDates` → confirm each date.
5. Manual free-form dates (`DateListEditor`).
6. Someone else sends them: an "Ask someone to add the school calendar" link (`ask=1`), and any
   received `/family` link pre-loads its school dates.

Confirming extracted dates is a review list with a checkbox per date ("likely-closure" pre-checked,
"unsure" unchecked) and a single "Add N checked dates" action. This is an import confirmation,
not a planning submit step; the plan itself still updates live.

## Agent C clarifications (additive, F1)

- `SchoolBreak.parentWorkdays` = every day in the break **not in `parentFreeDays`** (for a Mon-Fri
  workweek that is exactly the weekdays; a parent who works Saturdays can PTO those too). So the UI
  **must** include the parent's weekends in `parentFreeDays`, or weekends will cost PTO.
- Excluded breaks get `ptoDays: []` and report their zero-PTO together run, but are **not** counted
  in `togetherDaysTotal`. `fullyCovered` = every parent workday in the break is off (PTO or free).
- Extra exports: `MAX_FAMILY_WINDOW_DAYS` (familyPlan), `MAX_EXTRACT_INPUT`, `MAX_EXTRACT_RESULTS`
  (schoolDateText), `DEFAULT_FAMILY_PTO`, `MAX_FAMILY_DATES_PARAM`, `FamilyURLWriteState` (familyUrlState).
- `FamilyURLState` adds optional `availability?: PartnerAvailability` (decoded `pp`; a bad `pp` lands
  in `invalid`). `invalid` may also be `['search']` when the whole query exceeds 50k chars.
- `writeFamilyStateToURL(params, state: FamilyURLWriteState): string[]` returns param names it could
  not write because they exceed the size limit (`sd`/`x` > 1500 chars, or `pp` too large). `s` is
  omitted when `state.start === state.defaultStart` (pass today).
- `buildFamilyShareURL` throws the partner encoder's user-facing error if `availability` is too large
  (and its own if `sd` exceeds 1500 chars); empty `availability.days` is simply omitted.
- Extracted text dates: a range over 31 days falls back to offering each end date on its own (still
  needs confirmation); lines saying "resume", "first/last day", "early dismissal", "half day" stay
  `'unsure'` even when they mention a break.
