import { useEffect } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { trackPageviewOnce } from './analytics';
import { analyticsBeforeSend } from './analyticsPrivacy';

/** A single privacy boundary for every consumer route and both analytics providers. */
export function PrivacyAnalytics() {
  useEffect(() => { trackPageviewOnce(); }, []);
  return <Analytics beforeSend={analyticsBeforeSend} debug={false} />;
}
