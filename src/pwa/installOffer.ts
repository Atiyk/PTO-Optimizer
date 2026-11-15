import { useEffect, useState } from 'react';

/**
 * P3 PWA: install education, shown only after someone saves a plan (src/ui/SaveConfirmation).
 * Chromium fires `beforeinstallprompt`; it is held here (which also keeps Chrome's own
 * first-visit install bar away) and offered behind an "Install" button. iOS Safari has no
 * such event, so it gets the Share → Add to Home Screen steps in words instead.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
let captured = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

/** Call once per page, as early as possible: the event can fire before React renders. */
export function captureInstallPrompt(target: Window | undefined = typeof window === 'undefined' ? undefined : window): void {
  if (!target || captured) return;
  captured = true;
  target.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    notify();
  });
  target.addEventListener('appinstalled', () => {
    deferred = null;
    installed = true;
    notify();
  });
}

export type InstallPlatform = 'ios-safari' | 'chromium' | null;

export interface InstallEnvironment {
  userAgent: string;
  maxTouchPoints: number;
  /** Already opened from the Home Screen or as an installed app. */
  standalone: boolean;
  /** A held beforeinstallprompt event is available. */
  canPrompt: boolean;
}

export function isIos(userAgent: string, maxTouchPoints: number): boolean {
  // iPadOS reports a Mac user agent, but a Mac has no touch screen.
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

/** Which install hint fits this browser, if any. */
export function installPlatform(env: InstallEnvironment): InstallPlatform {
  if (env.standalone) return null;
  if (env.canPrompt) return 'chromium';
  // Only Safari's Share menu is described; other iOS browsers name the steps differently.
  if (isIos(env.userAgent, env.maxTouchPoints) && /Safari\//.test(env.userAgent)
    && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(env.userAgent)) return 'ios-safari';
  return null;
}

/** "iPhone" or "iPad", for the iOS hint. */
export function iosDeviceName(userAgent: string): 'iPhone' | 'iPad' {
  return /iPhone|iPod/.test(userAgent) ? 'iPhone' : 'iPad';
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const legacy = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return legacy || (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches);
}

export function currentInstallEnvironment(): InstallEnvironment {
  if (typeof navigator === 'undefined') return { userAgent: '', maxTouchPoints: 0, standalone: false, canPrompt: false };
  return {
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    standalone: installed || isStandalone(),
    canPrompt: deferred !== null,
  };
}

/** Shows the browser's own install dialog. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const event = deferred;
  if (!event) return 'unavailable';
  deferred = null;
  try {
    await event.prompt();
    const { outcome } = await event.userChoice;
    notify();
    return outcome;
  } catch {
    notify();
    return 'unavailable';
  }
}

/** The install environment, kept current as the browser offers or completes an install. */
export function useInstallEnvironment(): InstallEnvironment {
  const [env, setEnv] = useState(currentInstallEnvironment);
  useEffect(() => {
    const update = () => setEnv(currentInstallEnvironment());
    listeners.add(update);
    update();
    return () => { listeners.delete(update); };
  }, []);
  return env;
}
