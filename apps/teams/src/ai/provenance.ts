/*
 * 3C number provenance: every number an AI writes must appear in the engine facts it was
 * given. ISO dates must match fact dates exactly; spelled-out numbers never pass.
 */
const round2 = (v: number) => String(Math.round(v * 100) / 100);
const NUMBER_WORDS = /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|half|quarter)\b/g;

export function untracedIn(text: string, facts: unknown): string[] {
  const json = JSON.stringify(facts);
  const factDates = new Set(json.match(/\d{4}-\d{2}-\d{2}/g) ?? []);
  const factNumbers = new Set(
    (json.replace(/\d{4}-\d{2}-\d{2}/g, ' ').match(/-?\d+(?:\.\d+)?/g) ?? []).flatMap((s) => {
      const v = Number(s);
      return [String(v), String(Math.abs(v)), round2(v), round2(Math.abs(v))];
    }),
  );
  const bad: string[] = [];
  for (const d of text.match(/\d{4}-\d{2}-\d{2}/g) ?? []) if (!factDates.has(d)) bad.push(d);
  for (const s of text.replace(/\d{4}-\d{2}-\d{2}/g, ' ').match(/\d+(?:\.\d+)?/g) ?? []) {
    if (!factNumbers.has(String(Number(s)))) bad.push(s);
  }
  for (const w of text.toLowerCase().match(NUMBER_WORDS) ?? []) bad.push(w);
  return bad;
}
