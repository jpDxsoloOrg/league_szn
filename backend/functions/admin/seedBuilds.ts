/**
 * Seeded wrestler builds (BLD-15).
 *
 * Shared by the seed (`seedData.ts`) and the sim calibration run
 * (`scripts/sim-calibration.ts`), so the calibration plays the same roster a
 * fresh seed creates. Fixed values only: no randomness, so every seed gives
 * the same builds.
 *
 * Budgets of the seeded divisions: Raw and SmackDown are tier 1 (160), NXT
 * tier 2 (130), Young Boys is developmental (80). Every style appears, each
 * with a specialty its style allows. Roman Reigns was relegated from
 * SmackDown to NXT with a build bought on the bigger budget, so he is over
 * budget and the sim uses a scaled-down copy until he re-spends. Seth Rollins
 * and the Young Boys prospects keep the default build (no build card for
 * other viewers).
 */
import type { SimCategory, StyleId, CoreStat } from '../../lib/policies/buildRules';
import type { WrestlerBuild, WrestlerMove } from '../../lib/repositories/types';

export interface SeedBuild {
  style: StyleId;
  specialty?: SimCategory;
  stats: Record<CoreStat, number>;
  /** Levels for the player's seeded signatures, in order. Missing = level 1. */
  signatureLevels?: readonly number[];
  /** Levels for the player's seeded finishers, in order. Missing = level 1. */
  finisherLevels?: readonly number[];
}

/** The wrestler the seed relegates with a build over the new budget. */
export const OVER_BUDGET_SEED_WRESTLER = 'Roman Reigns';

/** Seeded builds by `currentWrestler`. Costs are in the comments (stats + moves). */
export const SEEDED_BUILDS: Readonly<Record<string, SeedBuild>> = {
  // Raw (160): 135 + 5 + 16 = 156.
  'Stone Cold Steve Austin': {
    style: 'brawler',
    specialty: 'hardcore',
    stats: { strikes: 85, grapple: 70, agility: 55, endurance: 75 },
    signatureLevels: [2, 1],
    finisherLevels: [3],
  },
  // SmackDown (160): 125 + 5 + 16 = 146.
  'The Rock': {
    style: 'striker',
    specialty: 'endurance',
    stats: { strikes: 85, grapple: 60, agility: 60, endurance: 70 },
    signatureLevels: [1, 2, 1],
    finisherLevels: [3, 1],
  },
  // NXT (130): 115 + 8 = 123.
  'The Undertaker': {
    style: 'powerhouse',
    specialty: 'cage',
    stats: { strikes: 65, grapple: 85, agility: 45, endurance: 70 },
    finisherLevels: [2],
  },
  // Young Boys (80): 70 + 5 = 75, 5 unspent.
  'Triple H': {
    style: 'technician',
    specialty: 'technical',
    stats: { strikes: 55, grapple: 70, agility: 45, endurance: 60 },
    signatureLevels: [2, 1],
  },
  // Raw (160): 140.
  'Shawn Michaels': {
    style: 'highFlyer',
    specialty: 'highRisk',
    stats: { strikes: 70, grapple: 55, agility: 90, endurance: 70 },
  },
  // SmackDown (160): 145.
  'Bret Hart': {
    style: 'technician',
    specialty: 'technical',
    stats: { strikes: 60, grapple: 90, agility: 55, endurance: 80 },
  },
  // NXT (130): 115.
  'John Cena': {
    style: 'allRounder',
    specialty: 'endurance',
    stats: { strikes: 70, grapple: 70, agility: 60, endurance: 75 },
  },
  // Young Boys (80): 75.
  'Randy Orton': {
    style: 'striker',
    specialty: 'hardcore',
    stats: { strikes: 75, grapple: 55, agility: 50, endurance: 55 },
  },
  // Raw (160): 135.
  Edge: {
    style: 'highFlyer',
    specialty: 'cage',
    stats: { strikes: 70, grapple: 60, agility: 85, endurance: 70 },
  },
  // SmackDown (160): 130.
  'CM Punk': {
    style: 'brawler',
    specialty: 'endurance',
    stats: { strikes: 80, grapple: 70, agility: 60, endurance: 75 },
  },
  // Bought on SmackDown's 160, now in NXT (130): 155, over by 25.
  [OVER_BUDGET_SEED_WRESTLER]: {
    style: 'powerhouse',
    specialty: 'hardcore',
    stats: { strikes: 75, grapple: 90, agility: 50, endurance: 80 },
  },
};

function withLevels(moves: readonly WrestlerMove[] | undefined, levels: readonly number[] | undefined): WrestlerMove[] | undefined {
  if (!moves) return undefined;
  return moves.map((move, index) => {
    const level = levels?.[index];
    return level !== undefined && level > 1 ? { ...move, level } : { ...move };
  });
}

export interface SeedBuildPatch {
  build?: WrestlerBuild;
  signatures?: WrestlerMove[];
  finishers?: WrestlerMove[];
}

/**
 * The build and leveled moves for a seeded player, or `{}` for a wrestler
 * with no seeded build (they keep the default).
 */
export function seedBuildPatch(
  player: { currentWrestler?: string; signatures?: readonly WrestlerMove[]; finishers?: readonly WrestlerMove[] },
  updatedAt: string,
): SeedBuildPatch {
  const seed = player.currentWrestler ? SEEDED_BUILDS[player.currentWrestler] : undefined;
  if (!seed) return {};
  const build: WrestlerBuild = { style: seed.style, stats: { ...seed.stats }, updatedAt };
  if (seed.specialty) build.specialty = seed.specialty;
  const patch: SeedBuildPatch = { build };
  const signatures = withLevels(player.signatures, seed.signatureLevels);
  const finishers = withLevels(player.finishers, seed.finisherLevels);
  if (signatures) patch.signatures = signatures;
  if (finishers) patch.finishers = finishers;
  return patch;
}
