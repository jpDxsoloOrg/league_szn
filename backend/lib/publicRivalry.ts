import { isCognitoId } from './reviewerName';
import type { Rivalry } from './repositories';

/**
 * Older rows hold the staff member's Cognito id as bookerName. It is shown on
 * the rivalry page, so it reads as no booker rather than as a raw id.
 */
export function withDisplayableBooker<T extends { bookerName?: string }>(rivalry: T): T {
  if (!isCognitoId(rivalry.bookerName)) return rivalry;
  const { bookerName, ...rest } = rivalry;
  void bookerName;
  return rest as T;
}

/** The view of a rivalry for anyone who is not staff. */
export function toPublicRivalry(rivalry: Rivalry): Omit<Rivalry, 'moderationNote' | 'moderatedBy'> {
  const { moderationNote, moderatedBy, ...rest } = rivalry;
  void moderationNote;
  void moderatedBy;
  return withDisplayableBooker(rest);
}
