import type { APIGatewayProxyResult } from 'aws-lambda';
import { badRequest } from '../../lib/response';
import { carryOverMoveLevels, parseBio, parseMoveList } from '../../lib/movesets';
import type { Player, PlayerPatch } from '../../lib/repositories';

/**
 * Shared by updateMyProfile (self-service) and updatePlayer (admin): reads
 * `bio`, `signatures` and `finishers` off the request body, validates them,
 * and copies the cleaned values onto the patch. Returns a 400 response on
 * the first invalid field, otherwise null.
 *
 * BLD-03: move levels are kept from `current` by `gameName`. The edit is never
 * blocked by the build budget; if dropping or adding moves leaves the build
 * over budget, the build read shows `overBudget`.
 */
export function applyMovesetFields(
  body: Record<string, unknown>,
  patch: PlayerPatch,
  current: Pick<Player, 'signatures' | 'finishers'>,
): APIGatewayProxyResult | null {
  if (body.bio !== undefined) {
    const bio = parseBio(body.bio);
    if ('error' in bio) return badRequest(bio.error);
    patch.bio = bio.value;
  }
  for (const field of ['signatures', 'finishers'] as const) {
    if (body[field] === undefined) continue;
    const parsed = parseMoveList(body[field], field);
    if ('error' in parsed) return badRequest(parsed.error);
    patch[field] = carryOverMoveLevels(parsed.value, current[field]);
  }
  return null;
}
