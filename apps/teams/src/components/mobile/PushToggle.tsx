'use client';

import { useEffect, useState } from 'react';

const toKey = (b64: string) => {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

/** Turns cover-offer notifications on or off for this device (Web Push; needs VAPID keys on the server). */
export function PushToggle({ vapidKey }: { vapidKey: string | null }) {
  const [state, setState] = useState<'loading' | 'unsupported' | 'off' | 'on' | 'blocked'>('loading');
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!vapidKey || !('serviceWorker' in navigator) || !('PushManager' in window)) return setState('unsupported');
    if (Notification.permission === 'denied') return setState('blocked');
    navigator.serviceWorker.ready.then((r) => r.pushManager.getSubscription()).then((s) => setState(s ? 'on' : 'off'), () => setState('off'));
  }, [vapidKey]);

  const toggle = async () => {
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      if (state === 'on') {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await fetch('/api/push/subscribe', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) });
          await sub.unsubscribe();
        }
        return setState('off');
      }
      if ((await Notification.requestPermission()) !== 'granted') return setState('blocked');
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(vapidKey!) });
      const res = await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub.toJSON()) });
      if (!res.ok) throw new Error('Could not save this device.');
      setState('on');
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  if (state === 'unsupported')
    return (
      <p className="text-sm text-muted">
        Notifications aren’t available here. On iPhone, add this app to your Home Screen first (Share → Add to Home Screen). Offers always show in the Offers tab.
      </p>
    );
  if (state === 'blocked') return <p className="text-sm text-muted">Notifications are blocked for this site in your browser settings. Offers still show in the Offers tab.</p>;
  return (
    <div className="space-y-2">
      <button onClick={toggle} disabled={state === 'loading'} aria-pressed={state === 'on'} className="min-h-12 w-full rounded-md border-2 border-ink text-base font-semibold text-ink">
        {state === 'on' ? 'Notifications on for this device: turn off' : 'Notify me about cover offers'}
      </button>
      {msg && (
        <p role="status" className="text-sm text-ink">
          {msg}
        </p>
      )}
    </div>
  );
}
