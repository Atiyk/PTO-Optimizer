import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PlanRecoveryNotice } from './PlanRecoveryNotice';

function render(hasForcedDays: boolean) {
  return renderToStaticMarkup(
    <PlanRecoveryNotice
      issue="Pinned PTO dates exceed your available budget."
      hasForcedDays={hasForcedDays}
      onClearForcedDays={() => undefined}
      onReviewSettings={() => undefined}
    />,
  );
}

describe('PlanRecoveryNotice', () => {
  it('names the issue and shows how to adjust the plan', () => {
    const html = render(true);
    expect(html).toContain('role="alert"');
    expect(html).toContain('Pinned PTO dates exceed your available budget.');
    expect(html).toContain('Change dates on the calendar or review your planning settings.');
    expect(html).toContain('min-h-11');
  });

  it('offers an explicit reset only when manually selected dates exist', () => {
    expect(render(true)).toContain('Clear pinned and excluded dates');
    expect(render(false)).not.toContain('Clear pinned and excluded dates');
  });

  it('always provides a way to review advanced planning settings', () => {
    const html = render(false);
    expect(html).toContain('Review advanced settings');
    expect(html).toContain('type="button"');
  });
});
