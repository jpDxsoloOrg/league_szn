import type { Championship } from './repositories/types';

export const CHAMPIONSHIP_NOT_FOUND_MESSAGE = 'Championship not found';
export const INACTIVE_CHAMPIONSHIP_MESSAGE = 'This championship is inactive and cannot be challenged for';

type TitleType = Championship['type'];

interface TitleCandidate {
  playerId: string;
  divisionId?: string;
}

export interface ChallengeTitleContext {
  challengeMode?: 'singles' | 'tag_team';
  matchType: string;
  /** The players on each side of the challenge. */
  sides: TitleCandidate[][];
}

/** Matches how Schedule Match decides that a format needs teams. */
export function isTagFormat(matchFormat: string): boolean {
  return matchFormat.toLowerCase().includes('tag');
}

/** Why this match format can't decide the title, or null when it can. */
export function titleFormatError(titleType: TitleType, matchFormat: string): string | null {
  const titleNeedsTeams = titleType === 'tag';
  if (isTagFormat(matchFormat) === titleNeedsTeams) return null;
  return titleNeedsTeams
    ? 'A tag team title needs a tag team match type'
    : 'A singles title cannot be decided in a tag team match';
}

/** Why the title can't be challenged for at all, or null when it can. */
export function titleAvailabilityError(championship: Championship | null): string | null {
  if (!championship) return CHAMPIONSHIP_NOT_FOUND_MESSAGE;
  return championship.isActive === false ? INACTIVE_CHAMPIONSHIP_MESSAGE : null;
}

/**
 * Why this challenge can't be for the title, or null when it can. The result
 * crowns whoever wins, so a held title needs its champion in the challenge.
 */
export function challengeTitleFitError(championship: Championship, context: ChallengeTitleContext): string | null {
  const { challengeMode, matchType, sides } = context;
  const isTagChallenge = challengeMode === 'tag_team';

  if (isTagChallenge !== (championship.type === 'tag')) {
    return isTagChallenge
      ? 'A singles title cannot be challenged for in a tag team challenge'
      : 'A tag team title can only be challenged for in a tag team challenge';
  }

  const formatError = titleFormatError(championship.type, matchType);
  if (formatError) return formatError;

  const holders = [championship.currentChampion ?? []].flat();
  const championIsInvolved = holders.length === 0
    || sides.some((side) => holders.every((holder) => side.some((player) => player.playerId === holder)));
  if (!championIsInvolved) {
    return 'The current champion must be part of a challenge for their title';
  }

  const { divisionId } = championship;
  if (divisionId && sides.flat().some((player) => player.divisionId !== divisionId)) {
    return 'Everyone in the challenge must be in the division this title is locked to';
  }

  return null;
}
