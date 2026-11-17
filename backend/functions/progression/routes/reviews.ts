import { STAFF, type RouteConfig } from '../../../lib/router';
import { applySeasonReviews, getSeasonReviews } from '../reviews';
import { snapshotSeasonReviews } from '../seasonSnapshot';

/**
 * Routes owned by DMV-03 (#193): GET /progression/reviews/{seasonId},
 * POST /progression/reviews/{seasonId}/apply
 */
export const reviewRoutes: ReadonlyArray<RouteConfig> = [
  { resource: '/progression/reviews/{seasonId}', method: 'GET', handler: getSeasonReviews, access: STAFF },
  { resource: '/progression/reviews/{seasonId}/apply', method: 'POST', handler: applySeasonReviews, access: STAFF },
];

/** Direct (async) invocation sent by updateSeason when a season completes. */
export interface SeasonSnapshotPayload {
  action: 'seasonSnapshot';
  seasonId?: string;
}

export function isSeasonSnapshotPayload(payload: unknown): payload is SeasonSnapshotPayload {
  return (payload as { action?: unknown } | null)?.action === 'seasonSnapshot';
}

/** Never throws, so Lambda does not retry the async event. */
export async function handleSeasonSnapshotInvoke(payload: SeasonSnapshotPayload): Promise<void> {
  if (typeof payload.seasonId !== 'string' || payload.seasonId.length === 0) {
    console.warn('Season snapshot invoked without a seasonId; ignoring');
    return;
  }
  try {
    const result = await snapshotSeasonReviews(payload.seasonId);
    console.log('Season movement snapshot complete:', JSON.stringify(result));
  } catch (err: unknown) {
    console.error('Season movement snapshot failed:', err);
  }
}
