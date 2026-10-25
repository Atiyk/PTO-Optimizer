import { ActionButton, type ActionResult } from './ExportBar';
import { copyText } from './requestText';
import { track } from './analytics';

interface PartnerShareButtonProps {
  buildOverlapLink: () => string;
}

/**
 * Split out from the free-export trio (Phase 2 item 3): "Share with a partner" isn't one
 * of the three core free-export actions that moved under the headline - it's a separate,
 * secondary action, so it stays near the calendar it's describing.
 */
export function PartnerShareButton({ buildOverlapLink }: PartnerShareButtonProps) {
  const onClick = async (): Promise<ActionResult> => {
    const ok = await copyText(buildOverlapLink());
    if (ok) track('URL shared');
    return ok ? { ok: true, message: 'Overlap link copied' } : { ok: false, message: "Couldn't copy — try again" };
  };

  return <ActionButton label="Share with a partner" onClick={onClick} />;
}
