import { ActionButton, type ActionResult } from './ExportBar';
import { copyText } from './requestText';
import { track } from './analytics';

interface PartnerShareButtonProps {
  buildOverlapLink: () => string;
}

/** The fourth action in ExportBar's row (see its own comment) - a plain ActionButton like
 * its siblings, just with its own overlap-link click handler. */
export function PartnerShareButton({ buildOverlapLink }: PartnerShareButtonProps) {
  const onClick = async (): Promise<ActionResult> => {
    const ok = await copyText(buildOverlapLink());
    if (ok) track('URL shared');
    return ok ? { ok: true, message: 'Overlap link copied' } : { ok: false, message: "Couldn't copy — try again" };
  };

  return <ActionButton label="Share with a partner" onClick={onClick} />;
}
