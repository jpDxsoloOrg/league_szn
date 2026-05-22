import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../../lib/repositories';
import { success, badRequest, forbidden, notFound, serverError } from '../../../lib/response';
import { getAuthContext, hasRole } from '../../../lib/auth';
import type {
  RivalryNote,
  RivalryNoteType,
  RivalryNoteVisibility,
} from '../../../lib/repositories';

const VALID_TYPES: ReadonlyArray<RivalryNoteType> = ['storyline', 'plan'];

/**
 * GET /rivalries/{rivalryId}/notes
 *
 * Authed list. Only participants and GMs may read; non-participants
 * get 403. Server-side filters by role + visibility so a wrestler
 * never sees admins-only ('gm-only') notes authored by anyone else,
 * and never sees 'plan' notes unless they were explicitly published
 * to 'participants' or 'all'.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const rivalryId = event.pathParameters?.rivalryId;
    if (!rivalryId) return badRequest('rivalryId is required');

    const qp = event.queryStringParameters || {};
    const typeFilter = qp.noteType as RivalryNoteType | undefined;
    if (typeFilter && !VALID_TYPES.includes(typeFilter)) {
      return badRequest(`noteType must be one of: ${VALID_TYPES.join(', ')}`);
    }

    const auth = getAuthContext(event);
    const isGm = hasRole(auth, 'Admin', 'Moderator');

    const {
      rivalries,
      rivalryNotes,
      roster: { players },
    } = getRepositories();

    const rivalry = await rivalries.get(rivalryId);
    if (!rivalry) return notFound('Rivalry not found');

    const callerPlayer = auth.sub ? await players.findByUserId(auth.sub).catch(() => null) : null;
    const callerPlayerId = callerPlayer?.playerId;
    const isParticipant =
      !!callerPlayerId && rivalry.participants.some((p) => p.playerId === callerPlayerId);

    if (!isGm && !isParticipant) {
      return forbidden('You are not a participant in this rivalry');
    }

    const all = await rivalryNotes.listByRivalry(rivalryId);
    const filtered = all
      .filter((n) => (typeFilter ? n.noteType === typeFilter : true))
      .filter((n) => isNoteVisible(n, { isGm, callerPlayerId }));

    return success({ notes: filtered });
  } catch (err) {
    console.error('Error listing rivalry notes:', err);
    return serverError('Failed to list rivalry notes');
  }
};

interface VisibilityArgs {
  isGm: boolean;
  callerPlayerId: string | undefined;
}

function isNoteVisible(note: RivalryNote, args: VisibilityArgs): boolean {
  if (args.isGm) return true;

  // The author always sees their own notes (so a wrestler keeps
  // their own GM-only suggestions in the list).
  if (args.callerPlayerId && note.authorPlayerId === args.callerPlayerId) return true;

  const v: RivalryNoteVisibility = note.visibility;
  if (v === 'admins') return false; // gm-only — never to non-GM, non-author
  if (note.noteType === 'plan' && v !== 'participants' && v !== 'all') return false;
  return v === 'all' || v === 'participants';
}
