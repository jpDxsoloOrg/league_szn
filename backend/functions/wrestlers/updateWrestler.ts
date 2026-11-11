import { APIGatewayProxyHandler } from 'aws-lambda';
import { updateHandlerFactory } from '../../lib/handlers';
import { getRepositories } from '../../lib/repositories';
import { parseBody } from '../../lib/parseBody';
import {
  WRESTLER_PROMOTIONS,
  OVERALL_CAP_MIN,
  OVERALL_CAP_MAX,
  type Wrestler,
  type WrestlerPatch,
  type WrestlerPromotion,
} from '../../lib/repositories/types';
import { badRequest, serverError, success } from '../../lib/response';
import {
  buildWrestlerReleasePatch,
  buildWrestlerRenamePatch,
  findWrestlerHolders,
} from '../players/wrestlerAssignment';

function isWrestlerPromotion(value: unknown): value is WrestlerPromotion {
  return (
    typeof value === 'string' &&
    (WRESTLER_PROMOTIONS as readonly string[]).includes(value)
  );
}

const PATCH_FIELDS: Array<keyof WrestlerPatch> = ['promotion', 'name', 'overallCap', 'isInUse'];

const factoryHandler = updateHandlerFactory<WrestlerPatch, Wrestler>({
  repo: () => getRepositories().roster.wrestlers,
  entityName: 'wrestler',
  idParam: 'wrestlerId',
  patchFields: PATCH_FIELDS,
});

/** Free the wrestler and empty the slot of every player holding it, atomically. */
async function releaseWrestler(wrestlerId: string): Promise<void> {
  const holders = await findWrestlerHolders(wrestlerId);
  await getRepositories().runInTransaction(async (tx) => {
    tx.releaseWrestlerFromPlayer({ wrestlerId });
    for (const player of holders) {
      tx.updatePlayer(player.playerId, buildWrestlerReleasePatch(player, wrestlerId));
    }
  });
}

/**
 * Copy the name onto every player displaying this wrestler. It compares against
 * what each player shows now, so repeating the same rename finishes a run that
 * failed part way. The unit of work has no wrestler update, which is why the
 * rename itself is a separate write ahead of this one.
 */
async function propagateWrestlerName(wrestlerId: string, wrestlerName: string): Promise<void> {
  const holders = await findWrestlerHolders(wrestlerId);
  const patches = holders
    .map((player) => ({
      playerId: player.playerId,
      patch: buildWrestlerRenamePatch(player, wrestlerId, wrestlerName),
    }))
    .filter(({ patch }) => Object.keys(patch).length > 0);
  if (patches.length === 0) return;

  await getRepositories().runInTransaction(async (tx) => {
    for (const { playerId, patch } of patches) {
      tx.updatePlayer(playerId, patch);
    }
  });
}

export const handler: APIGatewayProxyHandler = async (event, context, callback) => {
  let requested: Record<string, unknown> = {};

  // Pre-validate patch fields with the same rules as create. Only validate fields that are present.
  if (event.body) {
    const { data: body, error: parseError } = parseBody(event);
    if (parseError) return parseError;
    const raw = body as Record<string, unknown>;
    requested = raw;

    if (raw.promotion !== undefined && !isWrestlerPromotion(raw.promotion)) {
      return badRequest(
        `promotion must be one of: ${WRESTLER_PROMOTIONS.join(', ')}`,
      );
    }
    if (raw.name !== undefined) {
      const name = raw.name;
      if (
        typeof name !== 'string' ||
        name.trim().length === 0 ||
        name.length > 128
      ) {
        return badRequest('name must be a non-empty string up to 128 chars');
      }
    }
    if (raw.overallCap !== undefined) {
      const cap = raw.overallCap;
      if (
        typeof cap !== 'number' ||
        !Number.isInteger(cap) ||
        cap < OVERALL_CAP_MIN ||
        cap > OVERALL_CAP_MAX
      ) {
        return badRequest(
          `overallCap must be an integer between ${OVERALL_CAP_MIN} and ${OVERALL_CAP_MAX}`,
        );
      }
    }
    if (raw.isInUse !== undefined && typeof raw.isInUse !== 'boolean') {
      return badRequest('isInUse must be a boolean');
    }
  }

  const wrestlerId = event.pathParameters?.wrestlerId;
  const releasing = requested.isInUse === false;
  const newName = typeof requested.name === 'string' ? requested.name : undefined;
  let factoryEvent = event;

  if (wrestlerId && releasing) {
    try {
      const { roster } = getRepositories();
      // A missing wrestler falls through so the factory answers with its 404.
      if (await roster.wrestlers.findById(wrestlerId)) {
        await releaseWrestler(wrestlerId);

        const { isInUse: _released, ...otherFields } = requested;
        if (!PATCH_FIELDS.some((field) => otherFields[field] !== undefined)) {
          return success(await roster.wrestlers.findById(wrestlerId));
        }
        factoryEvent = { ...event, body: JSON.stringify(otherFields) };
      }
    } catch (err) {
      console.error('Error releasing wrestler:', err);
      return serverError('Failed to update wrestler');
    }
  }

  const result = await factoryHandler(factoryEvent, context, callback);
  if (wrestlerId && newName !== undefined && result?.statusCode === 200) {
    try {
      await propagateWrestlerName(wrestlerId, newName);
    } catch (err) {
      console.error('Error updating player wrestler names:', err);
      return serverError('Failed to update wrestler');
    }
  }
  if (!result) {
    // factoryHandler never legitimately returns void for us; normalize to 500.
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Failed to update wrestler' }),
    };
  }
  return result;
};
