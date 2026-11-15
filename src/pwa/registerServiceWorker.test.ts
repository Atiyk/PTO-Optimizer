import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentRegistrationEnv, registerServiceWorker, shouldRegisterServiceWorker, showUpdateNotice } from './registerServiceWorker';

const PROD = { prod: true, mode: 'production', hasServiceWorker: true, secure: true };

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('service worker registration (P3 PWA)', () => {
  it('registers only in a secure production build that supports service workers', () => {
    expect(shouldRegisterServiceWorker(PROD)).toBe(true);
    expect(shouldRegisterServiceWorker({ ...PROD, prod: false, mode: 'development' })).toBe(false);
    expect(shouldRegisterServiceWorker({ ...PROD, mode: 'test' })).toBe(false);
    expect(shouldRegisterServiceWorker({ ...PROD, hasServiceWorker: false })).toBe(false);
    expect(shouldRegisterServiceWorker({ ...PROD, secure: false })).toBe(false);
  });

  it('is never registered under the test runner', () => {
    const env = currentRegistrationEnv();
    expect(env.prod).toBe(false);
    expect(env.mode).toBe('test');
    expect(shouldRegisterServiceWorker(env)).toBe(false);
    const register = vi.fn(() => Promise.resolve({}));
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { register } });
    const onLoad = vi.spyOn(window, 'addEventListener');
    expect(registerServiceWorker()).toBe(false);
    expect(register).not.toHaveBeenCalled();
    expect(onLoad.mock.calls.some(([type]) => type === 'load')).toBe(false);
    Reflect.deleteProperty(navigator, 'serviceWorker');
  });

  it('waits for the page load event before registering in production', () => {
    const register = vi.fn(() => new Promise(() => {}));
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { register, ready: new Promise(() => {}) } });
    const readyState = vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
    expect(registerServiceWorker(PROD)).toBe(true);
    expect(register).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('load'));
    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/', updateViaCache: 'none' });
    readyState.mockRestore();
    Reflect.deleteProperty(navigator, 'serviceWorker');
  });

  it('offers a new version as one quiet line, and Reload asks the waiting worker to take over', () => {
    const postMessage = vi.fn();
    showUpdateNotice({ postMessage } as unknown as ServiceWorker);
    showUpdateNotice({ postMessage } as unknown as ServiceWorker);
    const bars = document.querySelectorAll('[role="status"]');
    expect(bars).toHaveLength(1);
    expect(bars[0].textContent).toContain('A new version of Timebower is available.');
    const reload = [...bars[0].querySelectorAll('button')].find((button) => button.textContent === 'Reload')!;
    reload.click();
    expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    const close = bars[0].querySelector('button[aria-label="Not now"]') as HTMLButtonElement;
    close.click();
    expect(document.querySelector('[role="status"]')).toBeNull();
  });
});
