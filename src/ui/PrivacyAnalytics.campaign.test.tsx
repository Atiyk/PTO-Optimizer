import { StrictMode, useEffect } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PrivacyAnalytics } from './PrivacyAnalytics';

vi.mock('@vercel/analytics/react', () => ({ Analytics: () => null }));

afterEach(() => {
  cleanup(); vi.restoreAllMocks(); delete window.plausible;
  window.history.replaceState(null, '', '/');
});

/** Like Policy, Landing and the planner: rewrites its own address in an effect that runs
 * before the sibling PrivacyAnalytics effect sends the pageview. */
function PageThatRewritesItsAddress() {
  useEffect(() => { window.history.replaceState(null, '', '/policy/?c=US&b=17'); }, []);
  return null;
}

it('keeps the arrival campaign labels even when the page rewrites its address first', () => {
  window.history.replaceState(null, '', '/policy/?utm_source=Newsletter&utm_medium=email&utm_term=private&b=17&s=2027-06-01#private');
  vi.spyOn(document, 'referrer', 'get').mockReturnValue('');
  const plausible = vi.fn();
  window.plausible = plausible;
  render(<StrictMode><PageThatRewritesItsAddress /><PrivacyAnalytics /></StrictMode>);
  expect(window.location.search).toBe('?c=US&b=17');
  expect(plausible).toHaveBeenCalledExactlyOnceWith('pageview', {
    url: `${window.location.origin}/policy/?utm_source=newsletter&utm_medium=email`,
  });
});
