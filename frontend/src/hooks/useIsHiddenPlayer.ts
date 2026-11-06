import { useAuth } from '../contexts/AuthContext';
import { isNeedsWrestler } from '../utils/needsWrestler';

/** True for a signed-in player who has no wrestler name, so is hidden from the site. */
export function useIsHiddenPlayer(): boolean {
  const { playerId, currentWrestler } = useAuth();
  return Boolean(playerId) && isNeedsWrestler(currentWrestler);
}
