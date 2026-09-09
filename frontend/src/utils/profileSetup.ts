import type { Player, WrestlerMove } from '../types';
import { isNeedsWrestler } from './needsWrestler';

export interface ProfileSetupGaps {
  /** Still on the "Needs Wrestler" placeholder. */
  needsWrestler: boolean;
  needsSignature: boolean;
  needsFinisher: boolean;
}

function hasNamedMove(moves: WrestlerMove[] | undefined): boolean {
  return (moves ?? []).some((m) => (m.gameName ?? '').trim().length > 0);
}

/** What a commentator would be missing if this player walked out right now. */
export function getProfileSetupGaps(
  player: Pick<Player, 'currentWrestler' | 'signatures' | 'finishers'>,
): ProfileSetupGaps {
  return {
    needsWrestler: isNeedsWrestler(player.currentWrestler),
    needsSignature: !hasNamedMove(player.signatures),
    needsFinisher: !hasNamedMove(player.finishers),
  };
}

export function hasSetupGaps(gaps: ProfileSetupGaps): boolean {
  return gaps.needsWrestler || gaps.needsSignature || gaps.needsFinisher;
}

/** sessionStorage key set by "Remind me later"; clears when the tab closes. */
export const PROFILE_SETUP_SNOOZE_KEY = 'profileSetup.snoozed';

/** Routes where the modal would cover the very form it points at. */
export const PROFILE_SETUP_EXCLUDED_PATHS = ['/profile', '/login', '/signup', '/welcome', '/forgot-password'];

export function isProfileSetupExcludedPath(pathname: string): boolean {
  return PROFILE_SETUP_EXCLUDED_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
