import type { PlayerProgressionSummary, ProgressionGoalDetail, ProgressionMetric } from '../../types/progression';

/**
 * Who is looking at a profile:
 * - `public`: any other visitor or wrestler;
 * - `owner`: the wrestler themselves (never shown relegation danger);
 * - `staff`: Moderators and Admins (see everything, flags included).
 */
export type ProfileViewer = 'public' | 'owner' | 'staff';

export function profileViewer(options: {
  isStaff: boolean;
  viewerPlayerId: string | null | undefined;
  profilePlayerId: string;
}): ProfileViewer {
  if (options.isStaff) return 'staff';
  if (options.viewerPlayerId && options.viewerPlayerId === options.profilePlayerId) return 'owner';
  return 'public';
}

/**
 * The tracks a viewer may see as meters. The API already hides relegation
 * rows from the public unless the league opted in; this repeats that rule so
 * a stale response or a misconfigured backend never leaks danger, and keeps
 * the owner's relegation meter off their own profile (they get "Stay sharp"
 * guidance instead).
 */
export function visibleMeterTracks(
  tracks: readonly PlayerProgressionSummary[],
  viewer: ProfileViewer,
  publicRelegationWatch: boolean,
): PlayerProgressionSummary[] {
  return tracks.filter((track) => {
    if (track.kind !== 'relegation') return true;
    if (viewer === 'staff') return true;
    if (viewer === 'owner') return false;
    return publicRelegationWatch;
  });
}

/** Whether the viewer may see the relegation flag (and may call kind=relegation). */
export function canSeeRelegationFlag(viewer: ProfileViewer, publicRelegationWatch: boolean): boolean {
  if (viewer === 'staff') return true;
  if (viewer === 'owner') return false;
  return publicRelegationWatch;
}

/** Friendly tip keys under `progression.staySharp.tips`. None mention a loss or a storyline. */
export type StaySharpTip = 'wins' | 'winColumn' | 'active' | 'quality' | 'momentum';

const TIP_BY_METRIC: Partial<Record<ProgressionMetric, StaySharpTip>> = {
  lossPct: 'wins',
  winPct: 'wins',
  currentLossStreak: 'winColumn',
  daysSinceLastMatch: 'active',
  matchesCompeted: 'active',
  avgStarRatingBelow: 'quality',
  avgStarRating: 'quality',
};

/**
 * A relegation goal that is met is a box the wrestler should un-tick, i.e. an
 * unmet avoidance goal. Each becomes one supportive tip, without numbers;
 * duplicates collapse so two loss goals read as a single nudge.
 */
export function staySharpTips(relegationTracks: readonly PlayerProgressionSummary[]): StaySharpTip[] {
  const goals: ProgressionGoalDetail[] = relegationTracks
    .filter((track) => track.kind === 'relegation')
    .flatMap((track) => track.goals ?? []);
  const tips = new Set<StaySharpTip>();
  for (const goal of goals) {
    if (goal.met) tips.add(TIP_BY_METRIC[goal.metric] ?? 'momentum');
  }
  return [...tips];
}
