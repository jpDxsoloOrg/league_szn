import { STAFF, type RouteConfig } from '../../../lib/router';
import { notImplemented } from './notImplemented';

/**
 * Routes owned by CUP-03 (#181): POST /admin/progression/recompute
 */
export const recomputeRoutes: ReadonlyArray<RouteConfig> = [
  { resource: '/admin/progression/recompute', method: 'POST', handler: notImplemented, access: STAFF },
];

/**
 * Payload of a direct (async) invocation of the progression Lambda, sent by
 * `invokeAsync('progression', ...)` from result/rating/promo triggers.
 */
export interface ProgressionRecomputePayload {
  playerIds?: string[];
  all?: boolean;
}

/**
 * Handles a direct Lambda invocation (no API Gateway requestContext).
 * Stub: CUP-03 implements the recompute.
 */
export async function handleDirectInvoke(_payload: ProgressionRecomputePayload): Promise<void> {
  // Implemented by CUP-03.
}
