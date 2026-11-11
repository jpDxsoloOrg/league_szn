import type { MatchCardEntry } from '../../types/event';

export type CardMoveDirection = 'up' | 'down';

/**
 * The stored array is the running order: every reader shows cards in array
 * order, and only the pre-show is pulled out into a section of its own. The
 * other designations are labels, so they do not group or sort anything.
 */
export function isPreShowCard(card: Pick<MatchCardEntry, 'designation'>): boolean {
  return card.designation === 'pre-show';
}

/**
 * Index of the card that sits next to `index` on screen, or null when it is
 * already at that end of its section. Pre-show and main card entries can be
 * interleaved in the array, so this may not be the adjacent index.
 */
export function findMoveTarget(
  cards: ReadonlyArray<Pick<MatchCardEntry, 'designation'>>,
  index: number,
  direction: CardMoveDirection,
): number | null {
  const card = cards[index];
  if (!card) return null;
  const step = direction === 'up' ? -1 : 1;
  for (let candidate = index + step; candidate >= 0 && candidate < cards.length; candidate += step) {
    const neighbour = cards[candidate];
    if (neighbour && isPreShowCard(neighbour) === isPreShowCard(card)) return candidate;
  }
  return null;
}

/** Swaps two cards and renumbers `position` to match the new array order. */
export function swapCards<Card extends Pick<MatchCardEntry, 'position'>>(
  cards: readonly Card[],
  firstIndex: number,
  secondIndex: number,
): Card[] {
  const swapped = cards.map((card, index) => {
    if (index === firstIndex) return cards[secondIndex] ?? card;
    if (index === secondIndex) return cards[firstIndex] ?? card;
    return card;
  });
  return swapped.map((card, index) => ({ ...card, position: index + 1 }));
}
