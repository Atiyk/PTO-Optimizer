/**
 * Wraps a route's static snapshot so its form controls refuse input until the client
 * bundle mounts. Every entry mounts with createRoot (not hydrateRoot: initial state
 * reads the URL, local storage and today's date, so it can differ from the snapshot),
 * which REPLACES the snapshot. Anything typed into a prerendered field before then was
 * silently thrown away - seen as a production-only flake when a slow chunk let a fast
 * visitor (or test) fill /policy's balance inputs before the app existed.
 *
 * A disabled fieldset disables every descendant input/select/textarea/button natively,
 * while text and links stay readable, crawlable and clickable. `display: contents`
 * keeps it out of the layout. Without JavaScript the controls do nothing anyway (the
 * app has no form submission); the live app renders fresh, enabled controls over it.
 */
export function lockPrerenderedControls(html: string): string {
  return `<fieldset disabled data-prerendered-controls style="display:contents">${html}</fieldset>`;
}
