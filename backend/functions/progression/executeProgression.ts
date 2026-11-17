import type { APIGatewayProxyHandler } from 'aws-lambda';
import { badRequest, errorWithDetails, serverError, success } from '../../lib/response';
import { getAuthContext } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';
import { executeProgressionMove } from '../../lib/progression/executeMove';
import type { ExecuteMoveResult } from '../../lib/progression/executeMove';

/**
 * Body of POST /progression/players/{playerId}/execute (CUP-06, DMV-05).
 *
 * `toDivisionId` defaults to the track's `toDivisionId`. Without either, a
 * call-up is refused and a promotion / relegation goes one tier up / down
 * (refused when several sibling divisions qualify). `force` overrides the
 * HOLDS_DIVISION_TITLE warning. `announce` is opt-in.
 */
export interface ExecuteProgressionBody {
  trackId: string;
  toDivisionId?: string;
  announce?: boolean;
  force?: boolean;
}

export type ExecuteProgressionResult = ExecuteMoveResult;

function optionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function optionalBoolean(value: unknown): value is boolean | undefined {
  return value === undefined || typeof value === 'boolean';
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const playerId = event.pathParameters?.playerId;
    if (!playerId) return badRequest('playerId path parameter is required');

    const parsed = parseBody<ExecuteProgressionBody>(event);
    if (parsed.error) return parsed.error;
    const { trackId, toDivisionId, announce, force } = parsed.data;

    if (typeof trackId !== 'string' || trackId.trim().length === 0) return badRequest('trackId is required');
    if (!optionalString(toDivisionId)) return badRequest('toDivisionId must be a string');
    if (!optionalBoolean(announce)) return badRequest('announce must be a boolean');
    if (!optionalBoolean(force)) return badRequest('force must be a boolean');

    const { username, sub } = getAuthContext(event);
    const outcome = await executeProgressionMove({
      playerId,
      trackId,
      toDivisionId,
      announce,
      force,
      actorUserId: sub || username,
      createdBy: username || sub,
    });

    if (!outcome.ok) {
      const { status, message, details } = outcome.refusal;
      return errorWithDetails(status, message, details ?? {});
    }
    return success(outcome.result);
  } catch (err: unknown) {
    console.error('Error executing progression:', err);
    return serverError('Failed to execute progression');
  }
};
