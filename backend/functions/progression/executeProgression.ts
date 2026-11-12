import type { APIGatewayProxyHandler } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { getRepositories } from '../../lib/repositories';
import type { Championship, Player, ProgressionEvent, ProgressionKind } from '../../lib/repositories';
import { badRequest, errorWithDetails, notFound, serverError, success } from '../../lib/response';
import { getAuthContext } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';
import { createNotification } from '../../lib/notifications';
import { invokeAsync } from '../../lib/asyncLambda';
import { championIdsOf } from '../../lib/disciplineGates';

/**
 * Body of POST /progression/players/{playerId}/execute (CUP-06).
 *
 * `toDivisionId` defaults to the track's `toDivisionId` and is required when
 * the track has none. `force` overrides the HOLDS_DIVISION_TITLE warning.
 */
export interface ExecuteProgressionBody {
  trackId: string;
  toDivisionId?: string;
  announce?: boolean;
  force?: boolean;
}

export interface ExecuteProgressionResult {
  playerId: string;
  trackId: string;
  kind: ProgressionKind;
  fromDivisionId: string;
  toDivisionId: string;
  divisionJoinedAt: string;
  event: ProgressionEvent;
  /** Set when `announce` was requested and the announcement was created. */
  announcementId?: string;
}

/** Headline verb per movement kind, e.g. "X has been called up to Raw!". */
const KIND_VERB: Record<ProgressionKind, string> = {
  callup: 'called up',
  promotion: 'promoted',
  relegation: 'relegated',
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function optionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function optionalBoolean(value: unknown): value is boolean | undefined {
  return value === undefined || typeof value === 'boolean';
}

function titlesHeldInDivision(championships: Championship[], playerId: string, divisionId: string): Championship[] {
  return championships.filter(
    (championship) =>
      championship.divisionId === divisionId && championIdsOf(championship.currentChampion).includes(playerId),
  );
}

/** Each follow-up is best-effort: the move is already committed. */
async function bestEffort(label: string, work: () => Promise<unknown>): Promise<void> {
  try {
    await work();
  } catch (err: unknown) {
    console.error(`executeProgression: ${label} failed:`, err);
  }
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const playerId = event.pathParameters?.playerId;
    if (!playerId) return badRequest('playerId path parameter is required');

    const parsed = parseBody<ExecuteProgressionBody>(event);
    if (parsed.error) return parsed.error;
    const { trackId, toDivisionId: requestedToDivisionId, announce, force } = parsed.data;

    if (typeof trackId !== 'string' || trackId.trim().length === 0) return badRequest('trackId is required');
    if (!optionalString(requestedToDivisionId)) return badRequest('toDivisionId must be a string');
    if (!optionalBoolean(announce)) return badRequest('announce must be a boolean');
    if (!optionalBoolean(force)) return badRequest('force must be a boolean');

    const {
      progression,
      roster: { players },
      leagueOps: { divisions },
      competition: { championships },
      content: { announcements },
      runInTransaction,
    } = getRepositories();

    const [track, player] = await Promise.all([progression.getTrack(trackId), players.findById(playerId)]);
    if (!track) return notFound('Track not found');
    if (!player) return notFound('Player not found');

    const fromDivisionId = track.fromDivisionId;
    if (player.divisionId !== fromDivisionId) {
      return errorWithDetails(409, 'Player is not in the track\'s source division', {
        code: 'NOT_IN_SOURCE_DIVISION',
        playerDivisionId: player.divisionId ?? null,
        fromDivisionId,
      });
    }

    const toDivisionId = requestedToDivisionId || track.toDivisionId;
    if (!toDivisionId) return badRequest('toDivisionId is required because the track has no target division');
    if (toDivisionId === fromDivisionId) return badRequest('Target division must differ from the source division');

    const [fromDivision, toDivision] = await Promise.all([
      divisions.findById(fromDivisionId),
      divisions.findById(toDivisionId),
    ]);
    if (!toDivision) return notFound('Target division not found');
    if (track.kind === 'callup' && toDivision.isDevelopmental) {
      return errorWithDetails(400, 'A call-up cannot target a developmental division', {
        code: 'TARGET_IS_DEVELOPMENTAL',
      });
    }

    if (!force) {
      const held = titlesHeldInDivision(await championships.list(), playerId, fromDivisionId);
      if (held.length > 0) {
        return errorWithDetails(409, 'Player holds a championship restricted to their current division', {
          code: 'HOLDS_DIVISION_TITLE',
          championships: held.map(({ championshipId, name }) => ({ championshipId, name })),
        });
      }
    }

    const existingRow = await progression.getPlayerProgression(playerId, trackId);
    const { username, sub } = getAuthContext(event);
    const actorUserId = sub || username;
    const now = new Date().toISOString();

    const baseEvent = {
      playerId,
      trackId,
      kind: track.kind,
      fromDivisionId,
      toDivisionId,
      actorUserId,
      createdAt: now,
    };
    const executedEvent: ProgressionEvent = { ...baseEvent, eventId: uuidv4(), type: 'executed' };

    await runInTransaction(async (tx) => {
      tx.updatePlayer(playerId, { divisionId: toDivisionId, divisionJoinedAt: now });
      tx.deletePlayerProgression(playerId, trackId);
      if (existingRow?.consideration) {
        tx.appendProgressionEvent({ ...baseEvent, eventId: uuidv4(), type: 'consideration_removed' });
      }
      tx.appendProgressionEvent(executedEvent);
    });

    const result: ExecuteProgressionResult = {
      playerId,
      trackId,
      kind: track.kind,
      fromDivisionId,
      toDivisionId,
      divisionJoinedAt: now,
      event: executedEvent,
    };

    await runFollowUps({
      player,
      kind: track.kind,
      fromDivisionName: fromDivision?.name,
      toDivisionName: toDivision.name,
      announce: announce === true,
      createdBy: username || sub,
      eventId: executedEvent.eventId,
      createAnnouncement: async (input) => {
        const announcement = await announcements.create(input);
        result.announcementId = announcement.announcementId;
      },
    });

    return success(result);
  } catch (err: unknown) {
    console.error('Error executing progression:', err);
    return serverError('Failed to execute progression');
  }
};

interface FollowUpParams {
  player: Player;
  kind: ProgressionKind;
  fromDivisionName?: string;
  toDivisionName: string;
  announce: boolean;
  createdBy: string;
  eventId: string;
  createAnnouncement: (input: {
    title: string;
    body: string;
    isActive: boolean;
    createdBy: string;
  }) => Promise<void>;
}

async function runFollowUps(params: FollowUpParams): Promise<void> {
  const { player, kind, toDivisionName, fromDivisionName } = params;
  const verb = KIND_VERB[kind];
  const name = player.name || player.currentWrestler || 'A wrestler';

  if (player.userId) {
    const userId = player.userId;
    await bestEffort('notification', () =>
      createNotification({
        userId,
        type: 'progression_executed',
        message: `You have been ${verb} to ${toDivisionName}!`,
        sourceId: params.eventId,
        sourceType: 'progression',
      }),
    );
  }

  if (params.announce) {
    await bestEffort('announcement', () => {
      const from = fromDivisionName ? ` from <em>${escapeHtml(fromDivisionName)}</em>` : '';
      return params.createAnnouncement({
        title: `${name} has been ${verb} to ${toDivisionName}!`,
        body: `<p><strong>${escapeHtml(name)}</strong> has been ${verb}${from} to <strong>${escapeHtml(toDivisionName)}</strong>!</p>`,
        isActive: true,
        createdBy: params.createdBy,
      });
    });
  }

  // Score the player against the new division's tracks.
  await bestEffort('progression recompute', () => invokeAsync('progression', { playerIds: [player.playerId] }));
  // Division-restricted titles change eligibility, so rank every title again.
  await bestEffort('contender recalculation', () => invokeAsync('contenders', { source: 'progressionExecute' }));
}
