import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button } from './Button';
import { buildPortraitText, copyPortraitImage, downloadPortraitImage, renderPortraitCanvas, type PortraitPlanData } from './portraitExport';
import { track } from './analytics';
import { DEFAULT_SITE_HOST } from './siteUrl';

export type PortraitShareProps = Omit<PortraitPlanData, 'siteUrl'> & { siteUrl?: string };

/** The exact PNG canvas is the preview; opt-in balances can be inspected before export. */
export function PortraitShare(props: PortraitShareProps) {
  const [open, setOpen] = useState(false);
  const [includeBalance, setIncludeBalance] = useState(false);
  const [message, setMessage] = useState('');
  const [working, setWorking] = useState(false);
  const [readyKey, setReadyKey] = useState('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const siteUrl = props.siteUrl ?? (typeof window === 'undefined' ? DEFAULT_SITE_HOST : window.location.host);
  const { breaks, rangeStart, rangeEnd, holidayAssumption, holidayNamesOf, remainingBalance } = props;
  const model = useMemo(() => ({ breaks, rangeStart, rangeEnd, holidayAssumption, holidayNamesOf, remainingBalance, siteUrl }), [breaks, rangeStart, rangeEnd, holidayAssumption, holidayNamesOf, remainingBalance, siteUrl]);
  const accessible = buildPortraitText(model, includeBalance);
  const imageKey = JSON.stringify(accessible);
  const ready = open && readyKey === imageKey;

  useEffect(() => {
    if (!open) return;
    let active = true;
    const render = () => {
      if (!active) return;
      try {
        const canvas = renderPortraitCanvas(model, includeBalance);
        canvas.style.width = '100%';
        canvas.style.height = 'auto';
        canvas.setAttribute('aria-hidden', 'true');
        hostRef.current?.replaceChildren(canvas);
        canvasRef.current = canvas;
        setReadyKey(imageKey);
        setMessage('');
      } catch { setMessage('Image preview is unavailable in this browser. Your calendar and link exports are still available.'); }
    };
    void Promise.resolve(document.fonts?.ready).then(render, render);
    return () => { active = false; };
  }, [open, includeBalance, model, imageKey]);

  return (
    <div className="min-w-0">
      <Button variant="secondary" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
        {open ? 'Close portrait preview' : 'Preview portrait share card'}
      </Button>
      {open && <section id={id} aria-label="Portrait share card" className="mt-4 rounded-[10px] border border-line bg-surface p-4 sm:p-5">
        <h3 className="text-xl font-bold leading-6 text-ink type-condensed">Your time off, ready to share</h3>
        <p className="mt-1 text-sm text-muted">1080 × 1350 PNG. Preview the exact image before you share.</p>
        <label className="my-4 flex min-h-11 items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={includeBalance} disabled={!Number.isFinite(props.remainingBalance)} onChange={event => setIncludeBalance(event.target.checked)} />
          Include my PTO balance.
        </label>
        <p className="sr-only">{[accessible.title, accessible.range, accessible.summary, ...accessible.breaks.flatMap(brk => [brk.dates, brk.metrics, brk.holidays]), accessible.overflow, accessible.assumption, accessible.balance].filter(Boolean).join('. ')}</p>
        <div ref={hostRef} className="mx-auto max-w-[432px] overflow-hidden rounded-[6px] border border-line" />
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" disabled={!ready || working} onClick={async () => {
            if (!canvasRef.current) return;
            setWorking(true);
            try {
              const result = await copyPortraitImage(canvasRef.current);
              setMessage(result.method === 'clipboard' ? 'Portrait image copied.' : result.method === 'download' ? 'PNG downloaded instead; image clipboard is unavailable.' : 'Could not create the PNG. Please try again.');
              if (result.method !== 'failed') track('portrait_image_exported');
            } catch { setMessage('Could not create the PNG. Please try again.'); }
            finally { setWorking(false); }
          }}>Copy portrait image</Button>
          <Button variant="secondary" disabled={!ready || working} onClick={async () => {
            if (!canvasRef.current) return;
            setWorking(true);
            try {
              const ok = await downloadPortraitImage(canvasRef.current);
              setMessage(ok ? 'Portrait PNG downloaded.' : 'Could not download the PNG. Please try again.');
              if (ok) track('portrait_image_exported');
            } finally { setWorking(false); }
          }}>Download portrait PNG</Button>
        </div>
        <p role="status" className="mt-2 text-sm text-muted">{message}</p>
      </section>}
    </div>
  );
}
