import type { Episode } from './repositories/types';

export type PublicEpisode = Omit<Episode, 'createdBy'>;

/** createdBy is a staff member's Cognito id, which no public page reads. */
export function toPublicEpisode(episode: Episode): PublicEpisode {
  const { createdBy, ...rest } = episode;
  void createdBy;
  return rest;
}
