import { invokeAsync } from '../asyncLambda';

/**
 * Fire-and-forget request to recompute progression for some players (CUP-03).
 * Sends ONE async invoke for all ids, deduplicated; nothing is sent when no
 * id is left. Never throws: progression is eventually consistent (the admin
 * recompute-all repairs a missed trigger), so a failed invoke must not fail
 * the request that caused it.
 */
export async function triggerProgressionRecompute(
  playerIds: ReadonlyArray<string | null | undefined>,
  source: string,
): Promise<void> {
  const ids = [...new Set(playerIds.filter((id): id is string => typeof id === 'string' && id.length > 0))];
  if (ids.length === 0) return;
  try {
    await invokeAsync('progression', { playerIds: ids, source });
  } catch (err) {
    console.warn(`Failed to invoke progression recompute (${source}):`, err);
  }
}
