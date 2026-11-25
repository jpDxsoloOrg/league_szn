import type { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { NotFoundError } from '../../lib/repositories/errors';
import type { Player, WrestlerMove } from '../../lib/repositories/types';
import { badRequest, errorWithDetails, notFound, serverError, success } from '../../lib/response';
import { parseBody } from '../../lib/parseBody';
import { getAuthContext, requireRole } from '../../lib/auth';
import { budgetForDivision, MOVE_LEVEL_MIN } from '../../lib/policies/buildRules';
import { validateBuild, type BuildValidationError } from '../../lib/policies/wrestlerBuild';
import { toPlayerBuildView } from '../../lib/builds/playerBuild';

/**
 * Save a player's build (BLD-03).
 *
 * Body: `{ style, specialty?, stats, moveLevels?: { signatures?: number[], finishers?: number[] } }`.
 * `moveLevels` lists one level per stored move, in order; a list that is left
 * out keeps the current levels. A null or missing `specialty` clears it. The
 * whole build is checked against the budget of the player's current division
 * and every problem comes back at once in a 400 `{ message, errors }`.
 *
 * - PUT /players/me/build: the caller's own player (Wrestler role).
 * - PUT /players/{playerId}/build: any player (Admin and Moderator, enforced by the router).
 */

type MoveField = 'signatures' | 'finishers';
const MOVE_FIELDS: readonly MoveField[] = ['signatures', 'finishers'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Applies the requested levels to the stored moves. Shape errors (not an
 * object or array, wrong length) are added to `errors`; the level values
 * themselves are checked by `validateBuild`.
 */
function applyMoveLevels(
  player: Pick<Player, MoveField>,
  moveLevels: unknown,
  errors: BuildValidationError[],
): Record<MoveField, WrestlerMove[]> {
  const result: Record<MoveField, WrestlerMove[]> = {
    signatures: [...(player.signatures ?? [])],
    finishers: [...(player.finishers ?? [])],
  };
  if (moveLevels === undefined || moveLevels === null) return result;
  if (!isRecord(moveLevels)) {
    errors.push({
      code: 'INVALID_MOVE_LEVEL',
      field: 'moveLevels',
      message: 'moveLevels must be an object with signatures and finishers lists',
    });
    return result;
  }
  for (const field of MOVE_FIELDS) {
    const levels = moveLevels[field];
    if (levels === undefined) continue;
    const moves = result[field];
    if (!Array.isArray(levels) || levels.length !== moves.length) {
      errors.push({
        code: 'INVALID_MOVE_LEVEL',
        field: `moveLevels.${field}`,
        message: `moveLevels.${field} must list one level for each of the ${moves.length} stored ${field}`,
        details: { expected: moves.length },
      });
      continue;
    }
    // Non-numbers are rejected by validateBuild's level check.
    result[field] = moves.map((move, index) => ({ ...move, level: levels[index] as number }));
  }
  return result;
}

/** Level 1 is stored as no level, the same as parseMoveList does. */
function compactLevels(moves: WrestlerMove[]): WrestlerMove[] {
  return moves.map(({ level, ...move }) =>
    level !== undefined && level > MOVE_LEVEL_MIN ? { ...move, level } : move,
  );
}

async function saveBuild(event: APIGatewayProxyEvent, player: Player): Promise<APIGatewayProxyResult> {
  const { data: body, error: parseError } = parseBody(event);
  if (parseError) return parseError;

  const { roster, leagueOps } = getRepositories();
  const division = player.divisionId ? await leagueOps.divisions.findById(player.divisionId) : null;
  const budget = budgetForDivision(division);

  const shapeErrors: BuildValidationError[] = [];
  const moves = applyMoveLevels(player, body.moveLevels, shapeErrors);
  const result = validateBuild(
    { style: body.style, specialty: body.specialty, stats: body.stats },
    moves,
    budget,
  );
  if (!result.ok || shapeErrors.length > 0) {
    const errors = [...shapeErrors, ...(result.ok ? [] : result.errors)];
    const message = errors.map((buildError) => buildError.message).join('. ');
    return errorWithDetails(400, message, { errors });
  }

  const updated = await roster.players.update(player.playerId, {
    build: { ...result.build, updatedAt: new Date().toISOString() },
    signatures: compactLevels(moves.signatures),
    finishers: compactLevels(moves.finishers),
  });
  return success(toPlayerBuildView(updated, division));
}

function handleError(err: unknown): APIGatewayProxyResult {
  if (err instanceof NotFoundError) return notFound(err.message);
  console.error('Error saving player build:', err);
  return serverError('Failed to save player build');
}

/** PUT /players/me/build */
export const updateMyBuildHandler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Wrestler');
  if (denied) return denied;
  try {
    const { sub } = getAuthContext(event);
    const player = await getRepositories().roster.players.findByUserId(sub);
    if (!player) return notFound('No player profile found for this user');
    return await saveBuild(event, player);
  } catch (err) {
    return handleError(err);
  }
};

/** PUT /players/{playerId}/build (staff). */
export const updatePlayerBuildHandler: APIGatewayProxyHandler = async (event) => {
  try {
    const playerId = event.pathParameters?.playerId;
    if (!playerId) return badRequest('Player ID is required');
    const player = await getRepositories().roster.players.findById(playerId);
    if (!player) return notFound('Player not found');
    return await saveBuild(event, player);
  } catch (err) {
    return handleError(err);
  }
};
