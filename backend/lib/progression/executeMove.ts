/**
 * Execute one division move (CUP-06 call-ups, DMV-05 promotions and
 * relegations).
 *
 * `executeProgressionMove` is the reusable core behind
 * POST /progression/players/{playerId}/execute. It returns a typed outcome
 * instead of an HTTP response so bulk callers (DMV-03 end-of-season review)
 * can run it per player and collect refusals.
 *
 * Steps:
 *   1. Validate the track, the player and the source division.
 *   2. Resolve the target (`resolveMoveTarget`): the request, then the
 *      track's target, then (promotion / relegation only) the single division
 *      one rung above / below on the tier ladder.
 *   3. Refuse when the player holds a title restricted to the old division,
 *      unless `force`.
 *   4. One transaction: move the player (guarded on the source division),
 *      delete every progression row on a track out of the old division,
 *      append `consideration_removed` for marked rows and the `executed` event.
 *   5. Best-effort follow-ups: notification, opt-in announcement, progression
 *      recompute for the new division and contender recalculation.
 */

import { randomUUID } from 'crypto';
import { getRepositories } from '../repositories';
import type {
  Championship,
  Division,
  Player,
  PlayerProgression,
  ProgressionEvent,
  ProgressionKind,
  ProgressionTrack,
} from '../repositories';
import { createNotification } from '../notifications';
import { invokeAsync } from '../asyncLambda';
import { championIdsOf } from '../disciplineGates';
import { isConcurrentWriteError } from '../repositories/errors';
import { getDivisionAbove, getDivisionBelow, getDivisionRank } from '../divisionTiers';

export interface ExecuteMoveInput {
  playerId: string;
  trackId: string;
  /** Overrides the track's target. */
  toDivisionId?: string;
  /** Publish a News announcement. Opt-in. */
  announce?: boolean;
  /** Proceed even if the player holds a title restricted to the old division. */
  force?: boolean;
  /** Recorded on the events. */
  actorUserId: string;
  /** Recorded on the announcement. */
  createdBy: string;
  /**
   * Run the contender recalculation after the move (default true). A bulk
   * caller can pass false and trigger it once at the end.
   */
  recalculateContenders?: boolean;
}

export interface ExecuteMoveResult {
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

export interface DivisionRef {
  divisionId: string;
  name: string;
}

/** A refusal: HTTP status, message and the coded details for the body. */
export interface ExecuteMoveRefusal {
  status: 400 | 404 | 409;
  message: string;
  details?: { code: string } & Record<string, unknown>;
}

export type ExecuteMoveOutcome =
  | { ok: true; result: ExecuteMoveResult }
  | { ok: false; refusal: ExecuteMoveRefusal };

export type MoveTargetResolution =
  | { ok: true; toDivisionId: string }
  | { ok: false; refusal: ExecuteMoveRefusal };

function refuse(status: ExecuteMoveRefusal['status'], message: string, details?: ExecuteMoveRefusal['details']) {
  return { ok: false as const, refusal: { status, message, ...(details ? { details } : {}) } };
}

function toRef({ divisionId, name }: Division): DivisionRef {
  return { divisionId, name };
}

/**
 * Pick and validate the target division of a move. Pure, so the admin board
 * (DMV-08) and the season review (DMV-03) can preview it.
 *
 * - Call-ups need an explicit target (request or track) that is not developmental.
 * - Promotion / relegation without a target use the division one rung above /
 *   below. Several siblings there means the caller must choose
 *   (`AMBIGUOUS_TARGET`); none means the player is already at the end of the
 *   ladder (`NO_DIVISION_ABOVE` / `NO_DIVISION_BELOW`).
 * - An explicit promotion / relegation target must rank above / below the
 *   source when both are on the ladder. Untiered divisions are outside the
 *   ladder and are not checked.
 */
export function resolveMoveTarget(params: {
  kind: ProgressionKind;
  divisions: readonly Division[];
  fromDivisionId: string;
  requestedToDivisionId?: string;
  trackToDivisionId?: string;
}): MoveTargetResolution {
  const { kind, divisions, fromDivisionId } = params;
  const explicit = params.requestedToDivisionId || params.trackToDivisionId;

  if (!explicit) {
    if (kind === 'callup') {
      return refuse(400, 'toDivisionId is required because the track has no target division');
    }
    const candidates = kind === 'promotion'
      ? getDivisionAbove(divisions, fromDivisionId)
      : getDivisionBelow(divisions, fromDivisionId);
    if (candidates.length === 0) {
      return kind === 'promotion'
        ? refuse(400, 'There is no division above the source division', { code: 'NO_DIVISION_ABOVE' })
        : refuse(400, 'There is no division below the source division', { code: 'NO_DIVISION_BELOW' });
    }
    if (candidates.length > 1) {
      return refuse(400, 'Several divisions qualify; pick one with toDivisionId', {
        code: 'AMBIGUOUS_TARGET',
        candidates: candidates.map(toRef),
      });
    }
    return { ok: true, toDivisionId: candidates[0].divisionId };
  }

  if (explicit === fromDivisionId) return refuse(400, 'Target division must differ from the source division');
  const target = divisions.find((division) => division.divisionId === explicit);
  if (!target) return refuse(404, 'Target division not found');

  if (kind === 'callup') {
    if (target.isDevelopmental) {
      return refuse(400, 'A call-up cannot target a developmental division', { code: 'TARGET_IS_DEVELOPMENTAL' });
    }
    return { ok: true, toDivisionId: explicit };
  }

  const source = divisions.find((division) => division.divisionId === fromDivisionId);
  const sourceRank = source ? getDivisionRank(source) : undefined;
  const targetRank = getDivisionRank(target);
  if (sourceRank !== undefined && targetRank !== undefined) {
    if (kind === 'promotion' && !(targetRank < sourceRank)) {
      return refuse(400, 'A promotion must target a division above the source division', {
        code: 'TARGET_NOT_ABOVE',
      });
    }
    if (kind === 'relegation' && !(targetRank > sourceRank)) {
      return refuse(400, 'A relegation must target a division below the source division', {
        code: 'TARGET_NOT_BELOW',
      });
    }
  }
  return { ok: true, toDivisionId: explicit };
}

function titlesHeldInDivision(championships: Championship[], playerId: string, divisionId: string): Championship[] {
  return championships.filter(
    (championship) =>
      championship.divisionId === divisionId && championIdsOf(championship.currentChampion).includes(playerId),
  );
}

/**
 * The player's rows that belong to the old division: the executed track's row
 * and every row on another track out of `fromDivisionId`.
 */
function rowsToReset(
  rows: readonly PlayerProgression[],
  tracks: readonly ProgressionTrack[],
  executedTrack: ProgressionTrack,
): Array<{ row: PlayerProgression; track: ProgressionTrack }> {
  const tracksById = new Map(tracks.map((track) => [track.trackId, track]));
  tracksById.set(executedTrack.trackId, executedTrack);
  const result: Array<{ row: PlayerProgression; track: ProgressionTrack }> = [];
  for (const row of rows) {
    const track = tracksById.get(row.trackId);
    if (track && track.fromDivisionId === executedTrack.fromDivisionId) result.push({ row, track });
  }
  return result;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface MoveCopy {
  notification: string;
  title: string;
  body: string;
}

/**
 * Notification and announcement text per kind. Relegation copy is neutral:
 * "X moves to NXT".
 */
export function buildMoveCopy(
  kind: ProgressionKind,
  name: string,
  toDivisionName: string,
  fromDivisionName?: string,
): MoveCopy {
  const from = fromDivisionName ? ` from <em>${escapeHtml(fromDivisionName)}</em>` : '';
  const safeName = escapeHtml(name);
  const safeTo = escapeHtml(toDivisionName);
  switch (kind) {
    case 'callup':
      return {
        notification: `You have been called up to ${toDivisionName}!`,
        title: `${name} has been called up to ${toDivisionName}!`,
        body: `<p><strong>${safeName}</strong> has been called up${from} to <strong>${safeTo}</strong>!</p>`,
      };
    case 'promotion':
      return {
        notification: `You have been promoted to ${toDivisionName}!`,
        title: `${name} promoted to ${toDivisionName}`,
        body: `<p><strong>${safeName}</strong> has been promoted${from} to <strong>${safeTo}</strong>.</p>`,
      };
    case 'relegation':
      return {
        notification: `You move to ${toDivisionName}.`,
        title: `${name} moves to ${toDivisionName}`,
        body: `<p><strong>${safeName}</strong> moves${from} to <strong>${safeTo}</strong>.</p>`,
      };
  }
}

/** Each follow-up is best-effort: the move is already committed. */
async function bestEffort(label: string, work: () => Promise<unknown>): Promise<void> {
  try {
    await work();
  } catch (err: unknown) {
    console.error(`executeProgressionMove: ${label} failed:`, err);
  }
}

/** Execute one move. Throws only on unexpected errors; refusals come back as `{ ok: false }`. */
export async function executeProgressionMove(input: ExecuteMoveInput): Promise<ExecuteMoveOutcome> {
  const { playerId, trackId } = input;
  const {
    progression,
    roster: { players },
    leagueOps: { divisions },
    competition: { championships },
    content: { announcements },
    runInTransaction,
  } = getRepositories();

  const [track, player] = await Promise.all([progression.getTrack(trackId), players.findById(playerId)]);
  if (!track) return refuse(404, 'Track not found');
  if (!player) return refuse(404, 'Player not found');
  if (!track.isActive) return refuse(400, 'Progression track is not active', { code: 'TRACK_INACTIVE' });

  const fromDivisionId = track.fromDivisionId;
  if (player.divisionId !== fromDivisionId) {
    return refuse(409, 'Player is not in the track\'s source division', {
      code: 'NOT_IN_SOURCE_DIVISION',
      playerDivisionId: player.divisionId ?? null,
      fromDivisionId,
    });
  }

  const allDivisions = await divisions.list();
  const target = resolveMoveTarget({
    kind: track.kind,
    divisions: allDivisions,
    fromDivisionId,
    requestedToDivisionId: input.toDivisionId,
    trackToDivisionId: track.toDivisionId,
  });
  if (!target.ok) return target;
  const { toDivisionId } = target;
  const fromDivision = allDivisions.find((division) => division.divisionId === fromDivisionId);
  const toDivision = allDivisions.find((division) => division.divisionId === toDivisionId);
  if (!toDivision) return refuse(404, 'Target division not found');

  if (!input.force) {
    const held = titlesHeldInDivision(await championships.list(), playerId, fromDivisionId);
    if (held.length > 0) {
      return refuse(409, 'Player holds a championship restricted to their current division', {
        code: 'HOLDS_DIVISION_TITLE',
        championships: held.map(({ championshipId, name }) => ({ championshipId, name })),
      });
    }
  }

  const [playerRows, oldDivisionTracks] = await Promise.all([
    progression.listByPlayer(playerId),
    progression.listTracks({ fromDivisionId }),
  ]);
  const resets = rowsToReset(playerRows, oldDivisionTracks, track);
  const now = new Date().toISOString();
  const baseEvent = {
    playerId,
    kind: track.kind,
    fromDivisionId,
    toDivisionId,
    actorUserId: input.actorUserId,
    createdAt: now,
  };
  const executedEvent: ProgressionEvent = {
    ...baseEvent,
    trackId,
    eventId: randomUUID(),
    type: 'executed',
    // DMV-09: the activity feed shows a relegation only when it was announced.
    ...(input.announce === true ? { announced: true } : {}),
  };

  try {
    await runInTransaction(async (tx) => {
      // Guard on the source division so two concurrent moves cannot both apply.
      tx.updatePlayer(playerId, { divisionId: toDivisionId, divisionJoinedAt: now }, { divisionId: fromDivisionId });
      // Always delete the executed track's row (a no-op when it is missing).
      if (!resets.some(({ row }) => row.trackId === trackId)) tx.deletePlayerProgression(playerId, trackId);
      for (const { row, track: rowTrack } of resets) {
        tx.deletePlayerProgression(playerId, row.trackId);
        if (row.consideration) {
          tx.appendProgressionEvent({
            ...baseEvent,
            trackId: row.trackId,
            kind: rowTrack.kind,
            eventId: randomUUID(),
            type: 'consideration_removed',
          });
        }
      }
      tx.appendProgressionEvent(executedEvent);
    });
  } catch (err: unknown) {
    if (isConcurrentWriteError(err)) {
      return refuse(409, 'The player was moved by another request; reload and try again', {
        code: 'CONCURRENT_UPDATE',
      });
    }
    throw err;
  }

  const result: ExecuteMoveResult = {
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
    announce: input.announce === true,
    createdBy: input.createdBy,
    eventId: executedEvent.eventId,
    recalculateContenders: input.recalculateContenders !== false,
    createAnnouncement: async (announcementInput) => {
      const announcement = await announcements.create(announcementInput);
      result.announcementId = announcement.announcementId;
    },
  });

  return { ok: true, result };
}

interface FollowUpParams {
  player: Player;
  kind: ProgressionKind;
  fromDivisionName?: string;
  toDivisionName: string;
  announce: boolean;
  createdBy: string;
  eventId: string;
  recalculateContenders: boolean;
  createAnnouncement: (input: { title: string; body: string; isActive: boolean; createdBy: string }) => Promise<void>;
}

async function runFollowUps(params: FollowUpParams): Promise<void> {
  const { player } = params;
  const name = player.name || player.currentWrestler || 'A wrestler';
  const copy = buildMoveCopy(params.kind, name, params.toDivisionName, params.fromDivisionName);

  if (player.userId) {
    const userId = player.userId;
    await bestEffort('notification', () =>
      createNotification({
        userId,
        type: 'progression_executed',
        message: copy.notification,
        sourceId: params.eventId,
        sourceType: 'progression',
      }),
    );
  }

  if (params.announce) {
    await bestEffort('announcement', () =>
      params.createAnnouncement({ title: copy.title, body: copy.body, isActive: true, createdBy: params.createdBy }),
    );
  }

  // Score the player against the new division's tracks.
  await bestEffort('progression recompute', () => invokeAsync('progression', { playerIds: [player.playerId] }));
  if (params.recalculateContenders) {
    // Division-restricted titles change eligibility, so rank every title again.
    await bestEffort('contender recalculation', () => invokeAsync('contenders', { source: 'progressionExecute' }));
  }
}
