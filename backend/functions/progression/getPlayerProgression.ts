import type { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import type {
  Player,
  PlayerProgression,
  ProgressionEvent,
  ProgressionConsideration,
  ProgressionGoal,
  ProgressionKind,
  ProgressionTrack,
} from '../../lib/repositories/types';
import { getVerifiedCaller, isStaff } from '../../lib/optionalCaller';
import { isPlayerVisible } from '../../lib/needsWrestler';
import { isRelegationWatchPublic } from '../../lib/progression/considerations';
import { progressionEpoch, resolveProgressionWindow } from '../../lib/progression/loadInputs';
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
 * Why the count restarted at `countingSince` (PRL-07). A relegation or a
 * transfer reads as a neutral `divisionChange`, so the wrestler's own view
 * never names a relegation.
 */
export type CountingSinceReason =
  | { type: 'callup' | 'promotion' | 'divisionChange'; divisionName: string | null }
  | { type: 'goalsReset' };

/**
 * One row of GET /progression/players/{playerId}. `goals` is present for the
 * player themselves and for Moderator+; `considerationDetail` (who marked
 * the player and the GM note) only for Moderator+. `countingSince` is the
 * start of the track's window (the later of the player's progression epoch
 * and, for season tracks, the season start); `countingSinceReason` is only
 * sent to the player themselves.
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
  countingSince?: string;
  countingSinceReason?: CountingSinceReason;
}

function sameInstant(first: string, second: string): boolean {
  const firstTime = Date.parse(first);
  return !Number.isNaN(firstTime) && firstTime === Date.parse(second);
}

/**
 * The event that started the player's current epoch: the newest `executed`
 * move or `goals_reset` stamped at the epoch instant. Returns null when the
 * epoch came from something else (a transfer, an admin edit, sign-up).
 */
export function epochEvent(events: readonly ProgressionEvent[], epoch: string): ProgressionEvent | null {
  let newest: ProgressionEvent | null = null;
  for (const candidate of events) {
    const restarts = candidate.type === 'goals_reset' || (candidate.type === 'executed' && Boolean(candidate.toDivisionId));
    if (!restarts || !sameInstant(candidate.createdAt, epoch)) continue;
    if (!newest || candidate.createdAt > newest.createdAt) newest = candidate;
  }
  return newest;
}

/** Turn the epoch event into the reason shown on the card. */
export function toCountingSinceReason(
  event: ProgressionEvent,
  divisionNameById: ReadonlyMap<string, string>,
): CountingSinceReason {
  if (event.type === 'goals_reset') return { type: 'goalsReset' };
  const divisionName = event.toDivisionId ? divisionNameById.get(event.toDivisionId) ?? null : null;
  const type = event.kind === 'callup' || event.kind === 'promotion' ? event.kind : 'divisionChange';
  return { type, divisionName };
}

/** The owner's reason for the epoch, or undefined when none is recorded. */
async function loadEpochReason(player: Player): Promise<CountingSinceReason | undefined> {
  const { progression, leagueOps: { divisions } } = getRepositories();
  const event = epochEvent(await progression.listEvents(player.playerId), progressionEpoch(player));
  if (!event) return undefined;
  const divisionNameById = new Map<string, string>();
  if (event.type === 'executed' && event.toDivisionId) {
    const division = await divisions.findById(event.toDivisionId);
    if (division) divisionNameById.set(division.divisionId, division.name);
  }
  return toCountingSinceReason(event, divisionNameById);
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
 * Relegation rows are left out for everyone but the owner and Moderator+,
 * and the owner's row hides the GM mark, unless `publicRelegationWatch` is on.
 */
export const getPlayerProgression: APIGatewayProxyHandler = async (event) => {
  try {
    const playerId = event.pathParameters?.playerId;
    if (!playerId) return badRequest('playerId is required');

    const { roster: { players }, progression, season: { seasons } } = getRepositories();
    const player = await players.findById(playerId);
    if (!player) return notFound('Player not found');

    const caller = await getVerifiedCaller(event);
    const staff = isStaff(caller);
    const owner = caller !== null && Boolean(caller.sub) && caller.sub === player.userId;

    // Hidden players read as missing to everyone but themselves and staff.
    if (!isPlayerVisible(player) && !owner && !staff) return notFound('Player not found');

    const [rows, tracks, relegationPublic, activeSeason, epochReason] = await Promise.all([
      progression.listByPlayer(playerId),
      progression.listTracks({ isActive: true }),
      staff ? Promise.resolve(true) : isRelegationWatchPublic(),
      seasons.findActive(),
      owner ? loadEpochReason(player) : Promise.resolve(undefined),
    ]);
    const epoch = progressionEpoch(player);
    const trackById = new Map(tracks.map((track) => [track.trackId, track]));

    const summaries: PlayerProgressionSummary[] = [];
    for (const row of rows) {
      const track = trackById.get(row.trackId);
      if (!track) continue;
      // Relegation danger is private unless the league opted in (DMV-04): the
      // player sees their own meter but never the GMs' relegation mark, and
      // everyone else sees nothing.
      const relegationHidden = track.kind === 'relegation' && !relegationPublic;
      if (relegationHidden && !owner) continue;
      const summary: PlayerProgressionSummary = {
        trackId: track.trackId,
        kind: track.kind,
        trackName: track.name,
        progressPct: row.progressPct,
        consideration: row.consideration !== undefined && !relegationHidden,
        computedAt: row.computedAt,
      };
      if (owner || staff) summary.goals = toGoalDetails(track, row);
      if (staff && row.consideration) summary.considerationDetail = row.consideration;
      const countingSince = resolveProgressionWindow(track.windowMode, player, activeSeason).since;
      if (countingSince) {
        summary.countingSince = countingSince;
        // A season track that starts at the season start did not restart at the epoch.
        if (epochReason && sameInstant(countingSince, epoch)) summary.countingSinceReason = epochReason;
      }
      summaries.push(summary);
    }
    summaries.sort((a, b) => a.trackName.localeCompare(b.trackName));

    return success(summaries);
  } catch (err) {
    console.error('Error fetching player progression:', err);
    return serverError('Failed to fetch player progression');
  }
};
