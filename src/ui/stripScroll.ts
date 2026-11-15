import { scrollBehavior } from './scrollBehavior';

/**
 * Scrolls the strip sideways, and only sideways, so a card is in view. `scrollIntoView` also
 * scrolls the page vertically when the card is taller than the space below it: a tap on a
 * card's button focused it, the page jumped, and the release landed on something else, so
 * the tap never became a click (PR #152's taller cards made this happen on every phone).
 */
export function revealInStrip(list: HTMLElement, card: HTMLElement, align: 'start' | 'nearest') {
  const listBox = list.getBoundingClientRect();
  const cardBox = card.getBoundingClientRect();
  const padding = parseFloat(getComputedStyle(list).scrollPaddingLeft) || 0;
  const leftEdge = listBox.left + padding;
  let delta = 0;
  if (align === 'start' || cardBox.left < leftEdge) delta = cardBox.left - leftEdge;
  else if (cardBox.right > listBox.right) delta = Math.min(cardBox.right - listBox.right + padding, cardBox.left - leftEdge);
  if (Math.abs(delta) < 1) return;
  if (typeof list.scrollBy === 'function') list.scrollBy({ left: delta, behavior: scrollBehavior() });
  else list.scrollLeft += delta;
}
