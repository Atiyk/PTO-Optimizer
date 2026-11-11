import { describe, expect, it } from 'vitest';
import { lockPrerenderedControls } from '../../scripts/prerenderShell';

/**
 * Production flake (consumer journey, /pto -> /policy): values typed into prerendered
 * inputs before the client bundle mounts were silently discarded, because createRoot
 * replaces the static markup with freshly-initialised controls. The static snapshot's
 * controls must refuse input until the live app replaces them.
 */
describe('prerendered controls before the app mounts', () => {
  const markup = '<main><h1>Title</h1><label for="b">Balance</label><input id="b" type="number" value="0"/>'
    + '<select aria-label="Accrual"><option>x</option></select><textarea></textarea><button type="button">Add</button>'
    + '<a href="/faq/">FAQ</a></main>';

  it('disables every form control in the static snapshot but keeps links usable', () => {
    document.body.innerHTML = `<div id="root">${lockPrerenderedControls(markup)}</div>`;
    const root = document.getElementById('root')!;
    for (const control of root.querySelectorAll('input, select, textarea, button')) {
      expect((control as HTMLInputElement).matches(':disabled'), control.outerHTML).toBe(true);
    }
    const link = root.querySelector('a')!;
    expect(link.closest('fieldset')?.disabled).toBe(true);
    expect(link.getAttribute('href')).toBe('/faq/');
    expect(root.querySelector('h1')?.textContent).toBe('Title');
  });

  it('does not change the snapshot layout', () => {
    document.body.innerHTML = lockPrerenderedControls(markup);
    const fieldset = document.querySelector('fieldset')!;
    expect(fieldset.style.display).toBe('contents');
    expect(fieldset.hasAttribute('data-prerendered-controls')).toBe(true);
    expect(lockPrerenderedControls(markup)).toContain(`style="display:contents">${markup}</fieldset>`);
  });
});
