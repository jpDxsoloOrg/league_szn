import type { APIGatewayProxyResult } from 'aws-lambda';
import { badRequest } from '../../lib/response';
import { parseBio, parseMoveList } from '../../lib/movesets';
import type { PlayerPatch } from '../../lib/repositories';

/**
 * Shared by updateMyProfile (self-service) and updatePlayer (admin): reads
 * `bio`, `signatures` and `finishers` off the request body, validates them,
 * and copies the cleaned values onto the patch. Returns a 400 response on
 * the first invalid field, otherwise null.
 */
export function applyMovesetFields(
  body: Record<string, unknown>,
  patch: PlayerPatch,
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
    patch[field] = parsed.value;
  }
  return null;
}
