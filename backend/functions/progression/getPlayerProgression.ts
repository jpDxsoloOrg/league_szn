import type { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import type {
  PlayerProgression,
  ProgressionConsideration,
  ProgressionGoal,
  ProgressionKind,
  ProgressionTrack,
} from '../../lib/repositories/types';
import { getVerifiedCaller, isStaff } from '../../lib/optionalCaller';
import { isPlayerVisible } from '../../lib/needsWrestler';
import { badRequest, notFound, serverError, success } from '../../lib/response';

/** One goal with its definition and the player's current value. */
export interface ProgressionGoalDetail {
  goalId: string;
  metric: ProgressionGoal['metric'];
  threshold: number;
  weight: number;
  direction: NonNullable<ProgressionGoal['direction']>;
  params?: ProgressionGoal['params'];
  labelKey?: string;
  /** null while the metric is not yet computable. */
  current: number | null;
  met: boolean;
}

/**
 * One row of GET /progression/players/{playerId}. `goals` is present for the
 * player themselves and for Moderator+; `considerationDetail` (who marked
 * the player and the GM note) only for Moderator+.
 */
export interface PlayerProgressionSummary {
  trackId: string;
  kind: ProgressionKind;
  trackName: string;
  progressPct: number;
  consideration: boolean;
  computedAt: string;
  goals?: ProgressionGoalDetail[];
  considerationDetail?: ProgressionConsideration;
}

/** Join a stored row's goal statuses with the track's goal definitions. */
export function toGoalDetails(track: ProgressionTrack, row: PlayerProgression): ProgressionGoalDetail[] {
  const statusById = new Map(row.goals.map((status) => [status.goalId, status]));
  return track.goals.map((goal) => {
    const status = statusById.get(goal.goalId);
    const detail: ProgressionGoalDetail = {
      goalId: goal.goalId,
      metric: goal.metric,
      threshold: goal.threshold,
      weight: goal.weight,
      direction: goal.direction ?? 'atLeast',
      current: status?.current ?? null,
      met: status?.met ?? false,
    };
    if (goal.params) detail.params = goal.params;
    if (goal.labelKey) detail.labelKey = goal.labelKey;
    return detail;
  });
}

/**
 * GET /progression/players/{playerId} (public). The player's progress on
 * every active track. Anonymous callers and other wrestlers get the summary;
 * the owner also gets goal detail; Moderator+ also gets the GM note.
 */
export const getPlayerProgression: APIGatewayProxyHandler = async (event) => {
  try {
    const playerId = event.pathParameters?.playerId;
    if (!playerId) return badRequest('playerId is required');

    const { roster: { players }, progression } = getRepositories();
    const player = await players.findById(playerId);
    if (!player) return notFound('Player not found');

    const caller = await getVerifiedCaller(event);
    const staff = isStaff(caller);
    const owner = caller !== null && Boolean(caller.sub) && caller.sub === player.userId;

    // Hidden players read as missing to everyone but themselves and staff.
    if (!isPlayerVisible(player) && !owner && !staff) return notFound('Player not found');

    const [rows, tracks] = await Promise.all([
      progression.listByPlayer(playerId),
      progression.listTracks({ isActive: true }),
    ]);
    const trackById = new Map(tracks.map((track) => [track.trackId, track]));

    const summaries: PlayerProgressionSummary[] = [];
    for (const row of rows) {
      const track = trackById.get(row.trackId);
      if (!track) continue;
      const summary: PlayerProgressionSummary = {
        trackId: track.trackId,
        kind: track.kind,
        trackName: track.name,
        progressPct: row.progressPct,
        consideration: row.consideration !== undefined,
        computedAt: row.computedAt,
      };
      if (owner || staff) summary.goals = toGoalDetails(track, row);
      if (staff && row.consideration) summary.considerationDetail = row.consideration;
      summaries.push(summary);
    }
    summaries.sort((a, b) => a.trackName.localeCompare(b.trackName));

    return success(summaries);
  } catch (err) {
    console.error('Error fetching player progression:', err);
    return serverError('Failed to fetch player progression');
  }
};
