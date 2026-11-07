import { travelEvidenceFor, type TravelEvidence } from './travelEvidence';
import { validCalendarDate } from '../personal/employerCalendar';

/** Neutral, source-honest travel evidence for an entire proposed getaway. */
export interface TravelWindowEvidence {
  start: string;
  end: string;
  country: string;
  kind: TravelEvidence['kind'];
  meanIndex: number | null;
  sampledDays: number;
  sourceYear: number | null;
  source: string;
  confidence: TravelEvidence['confidence'];
  caveat: string;
}
const DAY = 86400000;
export function travelWindowEvidence(start: string, end: string, country: string): TravelWindowEvidence | null {
  if (!validCalendarDate(start) || !validCalendarDate(end) || start > end) return null;
  const first = Date.parse(start + 'T00:00:00Z'), last = Date.parse(end + 'T00:00:00Z');
  if ((last - first) / DAY > 30) return null;
  const samples: TravelEvidence[] = [];
  for (let t = first; t <= last; t += DAY) {
    const observation = travelEvidenceFor(new Date(t).toISOString().slice(0, 10), country);
    if (!observation) return null;
    samples.push(observation);
  }
  const firstEvidence = samples[0];
  const usable = samples.filter(s => s.value !== null);
  const consistent = samples.every(s => s.kind === firstEvidence.kind && s.source === firstEvidence.source);
  const available = consistent && usable.length === samples.length;
  return {
    start, end, country,
    kind: available ? firstEvidence.kind : 'unavailable',
    meanIndex: available ? usable.reduce((sum, s) => sum + s.value!, 0) / usable.length : null,
    sampledDays: samples.length,
    sourceYear: available ? firstEvidence.sourceYear : null,
    source: available ? firstEvidence.source : 'No consistent travel evidence for this window',
    confidence: available ? firstEvidence.confidence : 'none',
    caveat: available ? firstEvidence.caveat : 'Travel evidence unavailable; do not rank using a fabricated estimate.',
  };
}
