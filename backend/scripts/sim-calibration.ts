/**
 * Sim calibration run (BLD-15).
 *
 * Plays the match sim (lib/policies/matchSim.ts) many times and prints how
 * often the favourite wins, how often upsets happen, how much a style
 * matchup and a specialty move the needle, and the BLD-05 anchor bands:
 *
 *   - a maxed tier-1 build beats a base build 80–92% of the time (never 100%)
 *   - the same band holds with its specialty and a style edge on top
 *   - a style edge alone makes an even matchup about 55/45
 *   - allRounder against anything stays even
 *   - a build fighting in its specialty is favoured over the same build without
 *
 * The roster is the seeded one (functions/admin/seedBuilds.ts) on the seeded
 * divisions' budgets, with neutral form. Pure and offline: no AWS, no
 * database, and the same run count always prints the same numbers.
 *
 *   npm run sim-calibration                           # 10,000 runs per scenario
 *   npx ts-node scripts/sim-calibration.ts --runs 50000
 *
 * Exits 1 when an anchor falls outside its band. Retune TEMPERATURE
 * (matchSim.ts) or SPECIALTY_BONUS / STYLE_EDGE (buildRules.ts) only then, and
 * bump RULES_VERSION when you do.
 */
import {
  CORE_STATS,
  STAT_BASE,
  STYLE_BEATS,
  STYLE_IDS,
  TIER_BUDGETS,
  DEVELOPMENTAL_BUDGET,
  allowedSpecialties,
  type CoreStat,
  type SimCategory,
  type StyleId,
} from '../lib/policies/buildRules';
import { defaultBuild, effectiveBuild } from '../lib/policies/wrestlerBuild';
import {
  NEUTRAL_FORM,
  TEMPERATURE,
  competitorFromBuild,
  createRng,
  simulate,
  type SimCompetitor,
  type SimSide,
} from '../lib/policies/matchSim';
import type { WrestlerBuild, WrestlerMove } from '../lib/repositories/types';
import { SEEDED_BUILDS, type SeedBuild } from '../functions/admin/seedBuilds';

export const DEFAULT_RUNS = 10_000;

/** BLD-05 band for a maxed tier-1 build against a base build. */
export const FAVOURITE_BAND = { min: 0.8, max: 0.92 } as const;
/** A style edge alone on an even matchup: "about 55/45". */
export const STYLE_EDGE_BAND = { min: 0.53, max: 0.58 } as const;
/** allRounder against anything: even, within sampling noise. */
export const EVEN_BAND = { min: 0.48, max: 0.52 } as const;

/**
 * Seeded division of each wrestler (seedData.ts gives player i division
 * i % 4: Raw, SmackDown, NXT, Young Boys). Seth Rollins keeps the default build.
 */
const TIER_ONE = TIER_BUDGETS[1]; // Raw, SmackDown
const TIER_TWO = TIER_BUDGETS[2]; // NXT
export const SEEDED_ROSTER_BUDGETS: Readonly<Record<string, number>> = {
  'Stone Cold Steve Austin': TIER_ONE,
  'The Rock': TIER_ONE,
  'The Undertaker': TIER_TWO,
  'Triple H': DEVELOPMENTAL_BUDGET,
  'Shawn Michaels': TIER_ONE,
  'Bret Hart': TIER_ONE,
  'John Cena': TIER_TWO,
  'Randy Orton': DEVELOPMENTAL_BUDGET,
  Edge: TIER_ONE,
  'CM Punk': TIER_ONE,
  'Roman Reigns': TIER_TWO,
  'Seth Rollins': DEVELOPMENTAL_BUDGET,
};

/** Categories the seeded stipulations use. */
const ROSTER_CATEGORIES: readonly SimCategory[] = ['standard', 'hardcore', 'highRisk', 'technical', 'endurance', 'cage'];

// ─── Competitors ────────────────────────────────────────────────────

function levelMoves(levels: readonly number[] | undefined): WrestlerMove[] {
  return (levels ?? [1]).map((level) => ({ gameName: 'move', customName: '', level }));
}

function rosterCompetitor(wrestler: string, budget: number, seed: SeedBuild | undefined): SimCompetitor {
  const build: WrestlerBuild = seed
    ? { style: seed.style, stats: { ...seed.stats }, updatedAt: '', ...(seed.specialty ? { specialty: seed.specialty } : {}) }
    : defaultBuild();
  const moves = { signatures: levelMoves(seed?.signatureLevels), finishers: levelMoves(seed?.finisherLevels) };
  return competitorFromBuild(wrestler, effectiveBuild(build, moves, budget), NEUTRAL_FORM);
}

/** The seeded roster as sim competitors (over-budget builds come out scaled). */
export function seededRoster(): SimCompetitor[] {
  return Object.entries(SEEDED_ROSTER_BUDGETS).map(([wrestler, budget]) =>
    rosterCompetitor(wrestler, budget, SEEDED_BUILDS[wrestler]),
  );
}

function evenStats(value: number): Record<CoreStat, number> {
  const stats = {} as Record<CoreStat, number>;
  for (const stat of CORE_STATS) stats[stat] = value;
  return stats;
}

function plainCompetitor(
  playerId: string,
  style: StyleId,
  stats: Record<CoreStat, number>,
  options: { specialty?: SimCategory; finisherLevel?: number; budget?: number } = {},
): SimCompetitor {
  const build: WrestlerBuild = { style, stats, updatedAt: '', ...(options.specialty ? { specialty: options.specialty } : {}) };
  const moves = { signatures: levelMoves([1]), finishers: levelMoves([options.finisherLevel ?? 1]) };
  return competitorFromBuild(playerId, effectiveBuild(build, moves, options.budget ?? TIER_BUDGETS[1]), NEUTRAL_FORM);
}

/** Same competitor with its effective stats replaced (style edge with no stat bonus). */
function withEffectiveStats(competitor: SimCompetitor, stats: Record<CoreStat, number>): SimCompetitor {
  return { ...competitor, effectiveStats: { ...stats } };
}

const side = (sideId: string, member: SimCompetitor): SimSide => ({ sideId, members: [member] });

/** Share of `runs` seeded sims (seeds 0..runs-1) that side `a` wins. */
export function winShare(a: SimCompetitor, b: SimCompetitor, category: SimCategory, runs: number): number {
  const sides = [side('a', a), side('b', b)];
  let wins = 0;
  for (let seed = 0; seed < runs; seed += 1) {
    if (simulate(sides, { category, seed }).winnerSideId === 'a') wins += 1;
  }
  return wins / runs;
}

// ─── Report ─────────────────────────────────────────────────────────

export interface GapBucket {
  label: string;
  matches: number;
  /** Mean predicted win chance of the favourite. */
  expected: number;
  /** Share of these matches the favourite actually won. */
  actual: number;
}

export interface Band {
  min: number;
  max: number;
}

export interface Anchor {
  label: string;
  share: number;
  band: Band;
  inBand: boolean;
}

export interface MatchupRow {
  label: string;
  share: number;
}

export interface CalibrationReport {
  runs: number;
  temperature: number;
  roster: { matches: number; upsetRate: number; favouriteWinRate: number; buckets: GapBucket[] };
  anchors: Anchor[];
  /** Winner of the pairing's style against the loser, identical effective stats. */
  styleEdge: MatchupRow[];
  /** Same, with the same bought stats so each style's stat bonus counts too. */
  styleWithBonuses: MatchupRow[];
  /** Same build, one side fighting in its specialty. */
  specialtyLift: MatchupRow[];
}

const GAP_EDGES = [0, 2, 5, 10, 20] as const;

function bucketLabel(index: number): string {
  const low = GAP_EDGES[index];
  const high = GAP_EDGES[index + 1];
  return high === undefined ? `${low}+` : `${low}–${high}`;
}

function rosterRun(runs: number): CalibrationReport['roster'] {
  const roster = seededRoster();
  const pick = createRng(0x5eed);
  const stats = GAP_EDGES.map(() => ({ matches: 0, expected: 0, wins: 0 }));
  let upsets = 0;
  for (let seed = 0; seed < runs; seed += 1) {
    const first = Math.floor(pick() * roster.length);
    let second = Math.floor(pick() * (roster.length - 1));
    if (second >= first) second += 1;
    const category = ROSTER_CATEGORIES[Math.floor(pick() * ROSTER_CATEGORIES.length)];
    const result = simulate([side('a', roster[first]), side('b', roster[second])], { category, seed });
    const [ratingA, ratingB] = result.ratings.map((entry) => entry.rating);
    const favourite = ratingA >= ratingB ? 'a' : 'b';
    const favouriteChance = result.probabilities.find((entry) => entry.sideId === favourite)?.probability ?? 0.5;
    const gap = Math.abs(ratingA - ratingB);
    let bucket = 0;
    while (bucket + 1 < GAP_EDGES.length && gap >= GAP_EDGES[bucket + 1]) bucket += 1;
    stats[bucket].matches += 1;
    stats[bucket].expected += favouriteChance;
    if (result.winnerSideId === favourite) stats[bucket].wins += 1;
    else upsets += 1;
  }
  return {
    matches: runs,
    upsetRate: upsets / runs,
    favouriteWinRate: (runs - upsets) / runs,
    buckets: stats.map((entry, index) => ({
      label: bucketLabel(index),
      matches: entry.matches,
      expected: entry.matches === 0 ? 0 : entry.expected / entry.matches,
      actual: entry.matches === 0 ? 0 : entry.wins / entry.matches,
    })),
  };
}

function anchor(label: string, share: number, band: Band): Anchor {
  return { label, share, band, inBand: share >= band.min && share <= band.max };
}

/** Spends the full tier-1 budget: 75 in every stat (140) + finisher level 3 (16) = 156. */
function maxedTierOne(playerId: string, style: StyleId, specialty?: SimCategory): SimCompetitor {
  return plainCompetitor(playerId, style, evenStats(75), { finisherLevel: 3, ...(specialty ? { specialty } : {}) });
}

function baseBuild(playerId: string, style: StyleId): SimCompetitor {
  return plainCompetitor(playerId, style, evenStats(STAT_BASE));
}

const MID_STATS = evenStats(65);
const CYCLE: Array<[StyleId, StyleId]> = (Object.entries(STYLE_BEATS) as Array<[StyleId, StyleId]>);

export function runCalibration(runs: number = DEFAULT_RUNS): CalibrationReport {
  const anchors: Anchor[] = [
    anchor(
      'maxed tier-1 (powerhouse) vs base (allRounder), standard',
      winShare(maxedTierOne('maxed', 'powerhouse'), baseBuild('base', 'allRounder'), 'standard', runs),
      FAVOURITE_BAND,
    ),
    anchor(
      'maxed tier-1 powerhouse in its cage specialty vs base high-flyer, cage',
      winShare(maxedTierOne('maxed', 'powerhouse', 'cage'), baseBuild('base', 'highFlyer'), 'cage', runs),
      FAVOURITE_BAND,
    ),
  ];

  const styleEdge: MatchupRow[] = CYCLE.map(([winner, loser]) => {
    const a = withEffectiveStats(plainCompetitor('a', winner, MID_STATS), MID_STATS);
    const b = withEffectiveStats(plainCompetitor('b', loser, MID_STATS), MID_STATS);
    return { label: `${winner} vs ${loser}`, share: winShare(a, b, 'standard', runs) };
  });
  const evenAgainstAllRounder = STYLE_IDS.filter((style) => style !== 'allRounder').map((style) => {
    const a = withEffectiveStats(plainCompetitor('a', 'allRounder', MID_STATS), MID_STATS);
    const b = withEffectiveStats(plainCompetitor('b', style, MID_STATS), MID_STATS);
    return { label: `allRounder vs ${style}`, share: winShare(a, b, 'standard', runs) };
  });
  for (const row of styleEdge) anchors.push(anchor(`style edge alone: ${row.label}`, row.share, STYLE_EDGE_BAND));
  for (const row of evenAgainstAllRounder) anchors.push(anchor(row.label, row.share, EVEN_BAND));

  const styleWithBonuses: MatchupRow[] = CYCLE.map(([winner, loser]) => ({
    label: `${winner} vs ${loser}`,
    share: winShare(plainCompetitor('a', winner, MID_STATS), plainCompetitor('b', loser, MID_STATS), 'standard', runs),
  }));

  const specialtyLift: MatchupRow[] = STYLE_IDS.map((style) => {
    const category = allowedSpecialties(style)[0];
    const share = winShare(
      plainCompetitor('a', style, MID_STATS, { specialty: category }),
      plainCompetitor('b', style, MID_STATS),
      category,
      runs,
    );
    return { label: `${style} in ${category}`, share };
  });
  for (const row of specialtyLift) anchors.push(anchor(`specialty favoured: ${row.label}`, row.share, { min: 0.5, max: 1 }));

  return {
    runs,
    temperature: TEMPERATURE,
    roster: rosterRun(runs),
    anchors,
    styleEdge,
    styleWithBonuses,
    specialtyLift,
  };
}

const pct = (share: number): string => `${(share * 100).toFixed(1)}%`;

export function formatReport(report: CalibrationReport): string {
  const lines: string[] = [];
  lines.push(`Sim calibration: ${report.runs} runs per scenario, TEMPERATURE ${report.temperature}`);
  lines.push('');
  lines.push(`Seeded roster, random pairings and seeded categories (${report.roster.matches} sims)`);
  lines.push(`  favourite wins ${pct(report.roster.favouriteWinRate)}, upsets ${pct(report.roster.upsetRate)}`);
  lines.push('  rating gap   sims   expected   actual');
  for (const bucket of report.roster.buckets) {
    lines.push(
      `  ${bucket.label.padEnd(10)} ${String(bucket.matches).padStart(6)}   ${pct(bucket.expected).padStart(7)}   ${pct(bucket.actual).padStart(6)}`,
    );
  }
  lines.push('');
  lines.push('Style edge alone (identical effective stats), winner of the pairing:');
  for (const row of report.styleEdge) lines.push(`  ${row.label.padEnd(26)} ${pct(row.share)}`);
  lines.push('Style matchup with style stat bonuses (same bought stats, 65 each):');
  for (const row of report.styleWithBonuses) lines.push(`  ${row.label.padEnd(26)} ${pct(row.share)}`);
  lines.push('Specialty lift (same build, one side in its specialty):');
  for (const row of report.specialtyLift) {
    lines.push(`  ${row.label.padEnd(26)} ${pct(row.share)} (+${((row.share - 0.5) * 100).toFixed(1)} pts)`);
  }
  lines.push('');
  lines.push('Anchors:');
  for (const entry of report.anchors) {
    const verdict = entry.inBand ? 'ok ' : 'OUT';
    lines.push(`  [${verdict}] ${entry.label}: ${pct(entry.share)} (band ${pct(entry.band.min)}–${pct(entry.band.max)})`);
  }
  return lines.join('\n');
}

function parseRuns(argv: readonly string[]): number {
  const index = argv.indexOf('--runs');
  if (index === -1) return DEFAULT_RUNS;
  const value = Number(argv[index + 1]);
  if (!Number.isInteger(value) || value <= 0) throw new Error('--runs needs a positive whole number');
  return value;
}

if (require.main === module) {
  const report = runCalibration(parseRuns(process.argv.slice(2)));
  console.log(formatReport(report));
  if (report.anchors.some((entry) => !entry.inBand)) process.exit(1);
}
