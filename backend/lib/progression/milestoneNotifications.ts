/**
 * Milestone notifications (CUP-11). Turns recompute changes into
 * notifications:
 *   - the player: one notification per row that reached something new
 *     (newly met goals and/or the highest newly crossed threshold)
 *   - every GM (Admin + Moderator): only when a player reaches 100%
 *
 * Exactly once: the dedupe lists are written first with an optimistic
 * check (`recordNotifiedMilestones`); a row only notifies when that write
 * wins. A lost race means another recompute already announced it.
 *
 * Detection rules live in `milestones.ts`.
 */

import { createNotifications, type CreateNotificationParams } from '../notifications';
import { getRepositories } from '../repositories';
import type { Player, ProgressionKind, ProgressionMetric, ProgressionTrack } from '../repositories/types';
import { listStaffUserIds } from '../staffUsers';
import { detectMilestones, hasNewMilestones, type MilestonePlan } from './milestones';
import type { ProgressionChange } from './recompute';

/** Rows written in parallel when storing dedupe lists. */
const WRITE_CHUNK = 10;

const NOTIFICATION_TYPE = 'progression_milestone' as const;
const SOURCE_TYPE = 'progression' as const;

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

const METRIC_LABELS: Record<ProgressionMetric, (count: number) => string> = {
  matchesCompeted: (count) => `${plural(count, 'match', 'matches')} competed`,
  wins: (count) => plural(count, 'win', 'wins'),
  winPct: (count) => `${count}% win rate`,
  avgStarRating: (count) => `${count}-star average rating`,
  promosCut: (count) => `${plural(count, 'promo', 'promos')} cut`,
  promosWithReactions: (count) => `${plural(count, 'promo', 'promos')} with reactions`,
  totalPromoReactions: (count) => plural(count, 'promo reaction', 'promo reactions'),
  matchOfTheNight: (count) => plural(count, 'Match of the Night award', 'Match of the Night awards'),
  challengesIssued: (count) => `${plural(count, 'challenge', 'challenges')} issued`,
  currentWinStreak: (count) => `${count}-match win streak`,
};

const KIND_LABELS: Record<ProgressionKind, string> = {
  callup: 'call-up',
  promotion: 'promotion',
  relegation: 'relegation',
};

export interface MilestoneNotificationSummary {
  /** Rows that announced at least one milestone. */
  rowsAnnounced: number;
  /** Notifications handed to `createNotifications`. */
  notificationsSent: number;
  /** Rows whose dedupe write failed (not counting lost races). */
  failures: { playerId: string; trackId: string; message: string }[];
}

function goalLabel(track: ProgressionTrack, goalId: string): string {
  const goal = track.goals.find((candidate) => candidate.goalId === goalId);
  return goal ? METRIC_LABELS[goal.metric](goal.threshold) : goalId;
}

/** The player's own message for one row. Exported for tests. */
export function buildPlayerMessage(plan: MilestonePlan, track: ProgressionTrack): string {
  const topThreshold = plan.newThresholds[plan.newThresholds.length - 1];
  if (topThreshold === 100) {
    return `You've completed every ${KIND_LABELS[track.kind]} goal on ${track.name}!`;
  }
  const parts: string[] = [];
  if (plan.newGoalIds.length > 0) {
    const goals = plan.newGoalIds.map((goalId) => goalLabel(track, goalId)).join(', ');
    parts.push(`Goal complete on ${track.name}: ${goals}.`);
  }
  if (topThreshold !== undefined) {
    parts.push(`You're ${topThreshold}% of the way there on ${track.name}!`);
  }
  return parts.join(' ');
}

/** The GM message when a player reaches 100%. Exported for tests. */
export function buildStaffMessage(playerName: string, track: ProgressionTrack): string {
  return `${playerName} has completed all ${KIND_LABELS[track.kind]} goals on ${track.name}.`;
}

/**
 * Detect, dedupe and send milestone notifications for a recompute's
 * changes. Never throws.
 */
export async function notifyProgressionMilestones(
  changes: readonly ProgressionChange[],
  tracks: readonly ProgressionTrack[],
  players: ReadonlyMap<string, Player>,
): Promise<MilestoneNotificationSummary> {
  const summary: MilestoneNotificationSummary = { rowsAnnounced: 0, notificationsSent: 0, failures: [] };
  try {
    const tracksById = new Map(tracks.map((track) => [track.trackId, track]));
    const plans: { plan: MilestonePlan; track: ProgressionTrack }[] = [];
    for (const change of changes) {
      const track = tracksById.get(change.trackId);
      if (!track) continue;
      const plan = detectMilestones(change, track.kind);
      if (plan.next) plans.push({ plan, track });
    }

    const { progression } = getRepositories();
    const announced: { plan: MilestonePlan; track: ProgressionTrack }[] = [];
    for (let start = 0; start < plans.length; start += WRITE_CHUNK) {
      const chunk = plans.slice(start, start + WRITE_CHUNK);
      await Promise.all(
        chunk.map(async (entry) => {
          const { plan } = entry;
          if (!plan.next) return;
          try {
            const won = await progression.recordNotifiedMilestones(
              plan.playerId,
              plan.trackId,
              plan.next,
              plan.expected,
            );
            if (won && hasNewMilestones(plan)) announced.push(entry);
          } catch (err: unknown) {
            summary.failures.push({
              playerId: plan.playerId,
              trackId: plan.trackId,
              message: err instanceof Error ? err.message : String(err),
            });
          }
        }),
      );
    }
    if (announced.length === 0) return summary;
    summary.rowsAnnounced = announced.length;

    const notifications: CreateNotificationParams[] = [];
    const completed: { player: Player; track: ProgressionTrack }[] = [];
    for (const { plan, track } of announced) {
      const player = players.get(plan.playerId);
      if (player?.userId) {
        notifications.push({
          userId: player.userId,
          type: NOTIFICATION_TYPE,
          message: buildPlayerMessage(plan, track),
          sourceId: plan.playerId,
          sourceType: SOURCE_TYPE,
        });
      }
      if (player && plan.newThresholds.includes(100)) completed.push({ player, track });
    }

    if (completed.length > 0) {
      const staffIds = await listStaffUserIds();
      for (const { player, track } of completed) {
        for (const staffId of staffIds) {
          // A GM who is also the player already got their own message.
          if (staffId === player.userId) continue;
          notifications.push({
            userId: staffId,
            type: NOTIFICATION_TYPE,
            message: buildStaffMessage(player.name, track),
            sourceId: player.playerId,
            sourceType: SOURCE_TYPE,
          });
        }
      }
    }

    if (notifications.length > 0) await createNotifications(notifications);
    summary.notificationsSent = notifications.length;
  } catch (err: unknown) {
    console.error('Progression milestone notifications failed:', err);
  }
  return summary;
}
