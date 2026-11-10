import { afterEach, describe, expect, it, vi } from 'vitest';
import { prerenderAppGuard } from '../../scripts/prerenderAppGuard';
import { EMPLOYER_STORAGE_PREFIX } from '../personal/employerCalendar';
import { REQUEST_STORAGE_KEY } from '../personal/requestLedger';

const date = new Date(2026, 10, 2, 12);

function guard({ search = '', languages = ['en-US'], storage = {}, country = 'US', preset = false, buildDate = '2026-11-02' }: {
  search?: string; languages?: string[]; storage?: Record<string, string>; country?: string; preset?: boolean; buildDate?: string;
} = {}) {
  vi.useFakeTimers();
  vi.setSystemTime(date);
  const showLoading = vi.fn();
  const execute = new Function('window', 'document', 'navigator', 'localStorage', prerenderAppGuard(country, buildDate, !preset));
  execute({ location: { search } }, { documentElement: { setAttribute: showLoading } }, { languages }, { getItem: (key: string) => storage[key] });
  return showLoading;
}

afterEach(() => vi.useRealTimers());

describe('static planner visibility before its client bundle runs', () => {
  it('keeps the default bare planner visible for an equivalent local calendar', () => {
    expect(guard()).not.toHaveBeenCalled();
    expect(guard({ storage: { [REQUEST_STORAGE_KEY]: '{"requests":[{"status":"planned"}]}' } })).not.toHaveBeenCalled();
    expect(guard({ storage: { [`${EMPLOYER_STORAGE_PREFIX}US:`]: '1.["US","",[],[]]' } })).not.toHaveBeenCalled();
    expect(guard({ languages: ['en-US'], country: 'GB', preset: true })).not.toHaveBeenCalled();
  });

  it('shows loading for a linked scenario, a different locale, an older build date or affected private settings', () => {
    expect(guard({ search: '?b=15' })).toHaveBeenCalledWith('data-plan-link', '');
    expect(guard({ languages: ['zh-Hans-CN', 'en-GB', 'en-US'] })).toHaveBeenCalledWith('data-plan-link', '');
    expect(guard({ buildDate: '2026-11-01' })).toHaveBeenCalledWith('data-plan-link', '');
    expect(guard({ storage: { [`${EMPLOYER_STORAGE_PREFIX}US:`]: '1.["US","",[],[["2026-11-20","Company day"]]]' } })).toHaveBeenCalledWith('data-plan-link', '');
    expect(guard({ storage: { [REQUEST_STORAGE_KEY]: '{"requests":[{"status": "approved"}]}' } })).toHaveBeenCalledWith('data-plan-link', '');
  });
});
