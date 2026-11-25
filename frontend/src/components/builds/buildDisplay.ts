import type { BuildCoreStat, EffectiveWrestlerBuild } from '../../services/api/builds.api';

type BuildStats = Record<BuildCoreStat, number>;

/** Display order of the core stats. Mirrors CORE_STATS in backend/lib/policies/buildRules.ts. */
export const BUILD_CORE_STATS: readonly BuildCoreStat[] = ['strikes', 'grapple', 'agility', 'endurance'];

/** Mirrors STAT_CAP in buildRules.ts; the length of a full stat bar. */
export const BUILD_STAT_CAP = 100;

/**
 * Points the style adds to one stat: the final value minus the value the
 * player paid for. Never negative; zero when the cap swallowed the bonus.
 */
export function styleBonusFor(effective: Pick<EffectiveWrestlerBuild, 'stats' | 'spentStats'>, stat: BuildCoreStat): number {
  return Math.max(0, effective.stats[stat] - effective.spentStats[stat]);
}

/** The style bonus for each stat. */
export function styleBonuses(effective: Pick<EffectiveWrestlerBuild, 'stats' | 'spentStats'>): BuildStats {
  return {
    strikes: styleBonusFor(effective, 'strikes'),
    grapple: styleBonusFor(effective, 'grapple'),
    agility: styleBonusFor(effective, 'agility'),
    endurance: styleBonusFor(effective, 'endurance'),
  };
}
