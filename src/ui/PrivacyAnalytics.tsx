import { useEffect, useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { rememberArrivalUrl, trackPageviewOnce } from './analytics';
import { analyticsBeforeSend } from './analyticsPrivacy';

/** A single privacy boundary for every consumer route and both analytics providers. */
export function PrivacyAnalytics() {
  // Render runs before every effect in this root, so this sees the address as it arrived
  // (with any campaign labels) before a page's own effects rewrite it.
  useState(rememberArrivalUrl);
  useEffect(() => { trackPageviewOnce(); }, []);
  return <Analytics beforeSend={analyticsBeforeSend} debug={false} />;
}
