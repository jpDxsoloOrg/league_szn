import { STAFF, type RouteConfig } from '../../../lib/router';
import { recomputeProgression } from '../../../lib/progression/recompute';
import { handler as recomputeProgressionHandler } from '../recomputeProgression';

/**
 * Routes owned by CUP-03 (#181): POST /admin/progression/recompute
 */
export const recomputeRoutes: ReadonlyArray<RouteConfig> = [
  { resource: '/admin/progression/recompute', method: 'POST', handler: recomputeProgressionHandler, access: STAFF },
];

/**
 * Payload of a direct (async) invocation of the progression Lambda, sent by
 * `invokeAsync('progression', ...)` from result/rating/promo triggers.
 */
export interface ProgressionRecomputePayload {
  playerIds?: string[];
  all?: boolean;
  /** Which trigger sent it, for logs only. */
  source?: string;
}

/**
 * Handles a direct Lambda invocation (no API Gateway requestContext).
 * Never throws: a throw would make Lambda retry the async event twice,
 * spending the shared concurrency on work the next trigger or the admin
 * recompute-all redoes anyway.
 */
export async function handleDirectInvoke(payload: ProgressionRecomputePayload): Promise<void> {
  const all = payload?.all === true;
  const playerIds = Array.isArray(payload?.playerIds)
    ? payload.playerIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];
  if (!all && playerIds.length === 0) {
    console.warn('Progression recompute invoked without players; ignoring');
    return;
  }

  try {
    const result = await recomputeProgression(all ? { all } : { playerIds });
    console.log('Progression recompute complete:', JSON.stringify({
      source: payload.source,
      playersProcessed: result.playersProcessed,
      rowsUpdated: result.changes.length,
      rowsDropped: result.dropped.length,
      failures: result.failures,
    }));
  } catch (err) {
    console.error('Progression recompute failed:', err);
  }
}
