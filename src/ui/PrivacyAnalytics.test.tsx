import { StrictMode } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { BeforeSend } from '@vercel/analytics';
import { PrivacyAnalytics } from './PrivacyAnalytics';
import { track } from './analytics';

const captured = vi.hoisted(() => ({ beforeSend: undefined as BeforeSend | undefined }));
vi.mock('@vercel/analytics/react', () => ({
  Analytics: (props: { beforeSend: BeforeSend }) => { captured.beforeSend = props.beforeSend; return null; },
}));

afterEach(() => {
  cleanup(); vi.restoreAllMocks(); delete window.plausible;
  window.history.replaceState(null, '', '/');
});

it('registers Vercel privacy and sends one manual pageview across StrictMode and input edits', () => {
  window.history.replaceState(null, '', '/pto?b=17&s=2027-06-01#private');
  vi.spyOn(document, 'referrer', 'get').mockReturnValue('');
  const plausible = vi.fn();
  window.plausible = plausible;
  const view = render(<StrictMode><PrivacyAnalytics /></StrictMode>);
  expect(plausible).toHaveBeenCalledExactlyOnceWith('pageview', { url: window.location.origin + '/pto' });

  window.history.replaceState(null, '', '/pto?b=29&s=2027-07-01#different-private-state');
  view.rerender(<StrictMode><PrivacyAnalytics /></StrictMode>);
  expect(plausible).toHaveBeenCalledTimes(1);
  track('meaningful_plan_interaction');
  expect(plausible).toHaveBeenNthCalledWith(2, 'meaningful_plan_interaction', { url: window.location.origin + '/pto' });
  expect(captured.beforeSend?.({ type: 'pageview', url: window.location.href })).toEqual({ type: 'pageview', url: window.location.origin + '/pto' });

  vi.spyOn(document, 'referrer', 'get').mockReturnValue('https://gapless.example/policy?balance=29');
  expect(captured.beforeSend?.({ type: 'event', url: window.location.href })).toBeNull();
  track('balance_forecast_used');
  expect(plausible).toHaveBeenCalledTimes(2);
});
