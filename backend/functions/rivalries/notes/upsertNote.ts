import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../../lib/repositories';
import { success, badRequest, forbidden, notFound, serverError } from '../../../lib/response';
import { getAuthContext, hasRole } from '../../../lib/auth';
import { parseBody } from '../../../lib/parseBody';
import type {
  RivalryNote,
  RivalryNoteCreateInput,
  RivalryNotePatch,
  RivalryNoteType,
  RivalryNoteVisibility,
} from '../../../lib/repositories';

const VALID_TYPES: ReadonlyArray<RivalryNoteType> = ['storyline', 'plan'];
const VALID_VISIBILITIES: ReadonlyArray<RivalryNoteVisibility> = ['all', 'participants', 'admins'];

interface UpsertBody {
  noteId?: string;
  noteType?: RivalryNoteType;
  content?: string;
  body?: string;
  visibility?: RivalryNoteVisibility;
  linkedMatchId?: string;
  linkedEventId?: string;
  scheduledFor?: string;
}

/**
 * POST /rivalries/{rivalryId}/notes — create or update.
 *
 * Role rules (highest leak risk in the feature; enforced server-side):
 *  - GMs may write any noteType + any visibility.
 *  - Wrestlers may only write 'storyline' notes, and their visibility
 *    is forced to 'admins' regardless of what they passed.
 *  - Wrestlers attempting to write 'plan' notes → 403.
 *
 * 'plan' notes default to 'admins' visibility when authored by GMs and
 * no visibility was provided — spoilers must opt in to be visible to
 * wrestlers.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const rivalryId = event.pathParameters?.rivalryId;
    if (!rivalryId) return badRequest('rivalryId is required');

    const parsed = parseBody<UpsertBody>(event);
    if (parsed.error) return parsed.error;
    const input = parsed.data;

    const rawContent = (input.content ?? input.body ?? '').trim();
    if (!rawContent) return badRequest('content is required');

    const noteType = input.noteType;
    if (!noteType || !VALID_TYPES.includes(noteType)) {
      return badRequest(`noteType must be one of: ${VALID_TYPES.join(', ')}`);
    }
    if (input.visibility && !VALID_VISIBILITIES.includes(input.visibility)) {
      return badRequest(`visibility must be one of: ${VALID_VISIBILITIES.join(', ')}`);
    }

    const auth = getAuthContext(event);
    const isGm = hasRole(auth, 'Admin', 'Moderator');
    if (!auth.sub && !isGm) return forbidden('Authentication required');

    const {
      rivalries,
      rivalryNotes,
      competition: { matches },
      leagueOps: { events },
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

    // Wrestlers cannot author plans — those are storyline spoilers.
    if (!isGm && noteType === 'plan') {
      return forbidden('Only GMs may author plan notes');
    }

    // Wrestler-authored storyline notes are always suggestions to the
    // GM, regardless of what they passed. Plan default for GMs is
    // 'admins' so spoilers stay locked behind an explicit opt-in.
    const visibility: RivalryNoteVisibility = !isGm
      ? 'admins'
      : (input.visibility ?? (noteType === 'plan' ? 'admins' : 'participants'));

    // Light existence checks — advisory pointers, not foreign keys.
    if (input.linkedMatchId) {
      const exists = await matches.findById(input.linkedMatchId).catch(() => null);
      if (!exists) return badRequest('linkedMatchId does not exist');
    }
    if (input.linkedEventId) {
      const exists = await events.findById(input.linkedEventId).catch(() => null);
      if (!exists) return badRequest('linkedEventId does not exist');
    }

    const authorPlayerId = callerPlayerId ?? 'system';

    let saved: RivalryNote;
    if (input.noteId) {
      const patch: RivalryNotePatch = {
        body: rawContent,
        visibility,
      };
      if (input.linkedMatchId !== undefined) patch.linkedMatchId = input.linkedMatchId;
      if (input.linkedEventId !== undefined) patch.linkedEventId = input.linkedEventId;
      if (input.scheduledFor !== undefined) patch.scheduledFor = input.scheduledFor;
      saved = await rivalryNotes.update(rivalryId, input.noteId, patch);
    } else {
      const create: RivalryNoteCreateInput = {
        rivalryId,
        noteType,
        visibility,
        body: rawContent,
        authorPlayerId,
      };
      if (input.linkedMatchId) create.linkedMatchId = input.linkedMatchId;
      if (input.linkedEventId) create.linkedEventId = input.linkedEventId;
      if (input.scheduledFor) create.scheduledFor = input.scheduledFor;
      saved = await rivalryNotes.create(create);
    }

    return success({ note: saved });
  } catch (err) {
    console.error('Error upserting rivalry note:', err);
    return serverError('Failed to save rivalry note');
  }
};
