/**
 * Stamina and injury tunables (INJ-01). Every number is a placeholder: GMs
 * tune them on the admin injury page without a deploy. Stored in SiteConfig
 * under `injuryTunables`; a stored row is merged over these defaults on read,
 * so a field added later still has a value.
 *
 * Each save is a new `version`. Injury rolls record the version they used,
 * and the last INJURY_TUNABLES_VERSIONS_KEPT versions are kept so an old
 * condition report can still be explained.
 */

import { SIM_CATEGORIES, STAT_BASE, STAT_CAP, type SimCategory } from './buildRules';
import { deepMergeSettings } from './economyDefaults';
import { DEFAULT_LEAGUE_TIME_ZONE } from '../leagueWeek';

/** Endurance at which drain is neither reduced nor increased (the base build stat). */
export const ENDURANCE_BASELINE = STAT_BASE;
/** Endurance points above the baseline that give the full `enduranceDrainReduction`. */
export const ENDURANCE_REDUCTION_RANGE = STAT_CAP - STAT_BASE;

/** Format keys the default multipliers cover. Any other format uses 1. */
export const DEFAULT_FORMAT_KEYS = ['singles', 'tag', 'multiPerson', 'battleRoyal'] as const;

export const INJURY_SEVERITY_KEYS = ['minor', 'moderate', 'major'] as const;
export type InjurySeverityKey = typeof INJURY_SEVERITY_KEYS[number];

/** Injury chance for anyone whose stamina after the match is at least `minStamina`. */
export interface InjuryChanceBand {
  minStamina: number;
  /** Probability in [0, 1]. */
  chance: number;
}

export interface InjurySeverity {
  key: InjurySeverityKey;
  /** Relative weight of this severity when an injury happens. */
  weight: number;
  /** Weeks out, drawn uniformly from minWeeks to maxWeeks. */
  minWeeks: number;
  maxWeeks: number;
}

/** The fields a GM edits. */
export interface InjuryTunablesInput {
  /** Highest stamina a wrestler can have. A player with no stamina stored is at this value. */
  maxStamina: number;
  /** Stamina one match takes, before the format and Endurance adjustments. */
  drainByCategory: Record<SimCategory, number>;
  /** Drain multiplier per match format key. A format not listed uses 1. */
  formatMultiplier: Record<string, number>;
  /**
   * k in drain × (1 − k × (endurance − ENDURANCE_BASELINE) / ENDURANCE_REDUCTION_RANGE).
   * 0 turns the Endurance effect off.
   */
  enduranceDrainReduction: number;
  /** Sorted by `minStamina`, highest first; the last band starts at 0. */
  injuryChanceBands: InjuryChanceBand[];
  /** Injury chance multiplier per sim category. */
  categoryRisk: Record<SimCategory, number>;
  /** One entry per severity key, mildest first. */
  severities: InjurySeverity[];
  /** Below this stamina, injuries lean towards the worse severities. */
  lowStaminaSeverityShift: number;
  /** Stamina restored each Sunday: `'full'` or a fixed amount (capped at maxStamina). */
  weeklyRecovery: number | 'full';
  /** League time zone (IANA). The league week starts Sunday 00:00 here. */
  timezone: string;
  /** Sim rating multiplier at 0 stamina; 1 at full stamina, linear between. */
  simStaminaFloor: number;
  /** Extra sim rating multiplier for an injured competitor. */
  simInjuredPenalty: number;
}

export interface InjuryTunables extends InjuryTunablesInput {
  /** 0 until a GM first saves; each save adds 1. */
  version: number;
  updatedAt: string | null;
  /** Username of the GM who saved this version. */
  updatedBy: string | null;
}

/** How many saved versions SiteConfig keeps, newest first. */
export const INJURY_TUNABLES_VERSIONS_KEPT = 20;

export const DEFAULT_INJURY_TUNABLES: InjuryTunables = {
  maxStamina: 100,
  drainByCategory: {
    standard: 15,
    highRisk: 25,
    technical: 20,
    endurance: 30,
    hardcore: 25,
    cage: 25,
  },
  formatMultiplier: {
    singles: 1,
    tag: 0.7,
    multiPerson: 0.8,
    battleRoyal: 0.6,
  },
  enduranceDrainReduction: 0.3,
  injuryChanceBands: [
    { minStamina: 70, chance: 0.01 },
    { minStamina: 40, chance: 0.03 },
    { minStamina: 20, chance: 0.08 },
    { minStamina: 0, chance: 0.15 },
  ],
  categoryRisk: {
    standard: 1,
    highRisk: 1.4,
    technical: 1.1,
    endurance: 1.2,
    hardcore: 1.5,
    cage: 1.3,
  },
  severities: [
    { key: 'minor', weight: 60, minWeeks: 1, maxWeeks: 1 },
    { key: 'moderate', weight: 30, minWeeks: 2, maxWeeks: 3 },
    { key: 'major', weight: 10, minWeeks: 4, maxWeeks: 6 },
  ],
  lowStaminaSeverityShift: 20,
  weeklyRecovery: 'full',
  timezone: DEFAULT_LEAGUE_TIME_ZONE,
  simStaminaFloor: 0.85,
  simInjuredPenalty: 0.75,
  version: 0,
  updatedAt: null,
  updatedBy: null,
};

// Keeps the defaults honest if a sim category is added later.
for (const category of SIM_CATEGORIES) {
  if (!(category in DEFAULT_INJURY_TUNABLES.drainByCategory) || !(category in DEFAULT_INJURY_TUNABLES.categoryRisk)) {
    throw new Error(`Injury tunables are missing defaults for sim category "${category}"`);
  }
}

/** A stored row over the defaults, with fresh copies of every nested value. */
export function mergeInjuryTunables(stored: Partial<InjuryTunables> | undefined): InjuryTunables {
  const merged = deepMergeSettings(structuredClone(DEFAULT_INJURY_TUNABLES), structuredClone(stored ?? {}));
  // A stored format map is the whole list: formats a GM removed stay removed.
  if (stored?.formatMultiplier) merged.formatMultiplier = structuredClone(stored.formatMultiplier);
  return merged;
}

/** The editable fields of a tunables object, without the version metadata. */
export function toInjuryTunablesInput(tunables: InjuryTunables): InjuryTunablesInput {
  const input: Partial<InjuryTunables> = structuredClone(tunables);
  delete input.version;
  delete input.updatedAt;
  delete input.updatedBy;
  return input as InjuryTunablesInput;
}

/**
 * Adds a saved tunables object as the next version on top of `versions`
 * (newest first) and drops anything past INJURY_TUNABLES_VERSIONS_KEPT.
 */
export function appendInjuryTunablesVersion(
  versions: readonly InjuryTunables[],
  input: InjuryTunablesInput,
  updatedBy: string,
  now: string,
): InjuryTunables[] {
  const currentVersion = versions[0]?.version ?? 0;
  const next: InjuryTunables = {
    ...structuredClone(input),
    version: currentVersion + 1,
    updatedAt: now,
    updatedBy,
  };
  return [next, ...versions].slice(0, INJURY_TUNABLES_VERSIONS_KEPT);
}
