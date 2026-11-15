import { describe, expect, it } from 'vitest';
import { installPlatform, iosDeviceName, isIos } from './installOffer';

const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1';
const IPAD_DESKTOP_MODE = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';
const MAC_SAFARI = IPAD_DESKTOP_MODE;
const CHROME_DESKTOP = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const env = (userAgent: string, extra: Partial<{ maxTouchPoints: number; standalone: boolean; canPrompt: boolean }> = {}) =>
  ({ userAgent, maxTouchPoints: 0, standalone: false, canPrompt: false, ...extra });

describe('install hint platform (P3 PWA)', () => {
  it('describes Share → Add to Home Screen only in iOS Safari', () => {
    expect(installPlatform(env(IPHONE_SAFARI, { maxTouchPoints: 5 }))).toBe('ios-safari');
    expect(installPlatform(env(IPAD_DESKTOP_MODE, { maxTouchPoints: 5 }))).toBe('ios-safari');
    expect(installPlatform(env(IPHONE_CHROME, { maxTouchPoints: 5 }))).toBeNull();
    expect(installPlatform(env(MAC_SAFARI))).toBeNull();
  });

  it('offers an Install button only when Chromium has offered an install', () => {
    expect(installPlatform(env(CHROME_DESKTOP))).toBeNull();
    expect(installPlatform(env(CHROME_DESKTOP, { canPrompt: true }))).toBe('chromium');
  });

  it('says nothing inside the installed app', () => {
    expect(installPlatform(env(IPHONE_SAFARI, { maxTouchPoints: 5, standalone: true }))).toBeNull();
    expect(installPlatform(env(CHROME_DESKTOP, { canPrompt: true, standalone: true }))).toBeNull();
  });

  it('names the device', () => {
    expect(isIos(IPHONE_SAFARI, 5)).toBe(true);
    expect(iosDeviceName(IPHONE_SAFARI)).toBe('iPhone');
    expect(iosDeviceName(IPAD_DESKTOP_MODE)).toBe('iPad');
  });
});
