import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../../lib/repositories';
import { success, badRequest, forbidden, notFound, serverError } from '../../../lib/response';
import { getAuthContext, hasRole } from '../../../lib/auth';

/**
 * DELETE /rivalries/{rivalryId}/notes/{noteId}
 *
 * Authed. GMs may delete any note on any rivalry. Wrestler
 * participants may delete only the notes they authored. Anyone else
 * gets a 403 — the rivalry's existence is already public via the
 * detail endpoint, so we don't need to mask the resource here.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const rivalryId = event.pathParameters?.rivalryId;
    const noteId = event.pathParameters?.noteId;
    if (!rivalryId) return badRequest('rivalryId is required');
    if (!noteId) return badRequest('noteId is required');

    const auth = getAuthContext(event);
    const isGm = hasRole(auth, 'Admin', 'Moderator');

    const {
      rivalries,
      rivalryNotes,
      roster: { players },
    } = getRepositories();

    const rivalry = await rivalries.get(rivalryId);
    if (!rivalry) return notFound('Rivalry not found');

    const all = await rivalryNotes.listByRivalry(rivalryId);
    const note = all.find((n) => n.noteId === noteId);
    if (!note) return notFound('Note not found');

    if (!isGm) {
      const callerPlayer = auth.sub
        ? await players.findByUserId(auth.sub).catch(() => null)
        : null;
      const callerPlayerId = callerPlayer?.playerId;
      if (!callerPlayerId || note.authorPlayerId !== callerPlayerId) {
        return forbidden('You may only delete your own notes');
      }
    }

    await rivalryNotes.delete(rivalryId, noteId);
    return success({ deleted: true });
  } catch (err) {
    console.error('Error deleting rivalry note:', err);
    return serverError('Failed to delete rivalry note');
  }
};
