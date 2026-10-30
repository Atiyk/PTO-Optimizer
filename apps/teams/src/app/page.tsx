import { PRODUCT_NAME, PRODUCT_TAGLINE } from '@/lib/brand';

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 sm:py-24">
      <p className="text-sm font-medium tracking-wide text-muted uppercase">Early preview</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{PRODUCT_NAME}</h1>
      <p className="mt-4 max-w-xl text-lg text-muted">{PRODUCT_TAGLINE}</p>
      <ul className="mt-10 grid gap-4 sm:grid-cols-3">
        {[
          ['Exact numbers', 'Every balance and date comes from a deterministic engine, never from a guess.'],
          ['Setup from your handbook', 'Paste your leave policy; confirm each field against the sentence it came from.'],
          ['Team planning', 'Clear expiring leave across a team without leaving anyone short-staffed.'],
        ].map(([title, body]) => (
          <li key={title} className="rounded-lg border border-line bg-surface p-4">
            <h2 className="font-medium text-ink">{title}</h2>
            <p className="mt-1 text-sm text-muted">{body}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
