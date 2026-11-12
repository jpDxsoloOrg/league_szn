import type { TagTeamStatus } from './tagTeam';

export interface ContenderRanking {
  championshipId: string;
  playerId: string;
  rank: number;
  rankingScore: number;
  winPercentage: number;
  currentStreak: number;
  qualityScore: number;
  recencyScore: number;
  matchesInPeriod: number;
  winsInPeriod: number;
  previousRank?: number;
  peakRank: number;
  weeksAtTop: number;
  calculatedAt: string;
  updatedAt: string;
}

export interface RankingMovement {
  playerId: string;
  currentRank: number;
  previousRank?: number;
  movement: number;
  isNew: boolean;
}

export interface ContenderConfig {
  championshipId: string;
  minimumMatches: number;
  maxContenders: number;
  includeDraws: boolean;
  divisionRestricted: boolean;
}

export type OverrideType = 'bump_to_top' | 'send_to_bottom';

export interface ContenderOverride {
  championshipId: string;
  playerId: string;
  overrideType: OverrideType;
  reason: string;
  createdBy: string;
  createdAt: string;
  expiresAt?: string;
  active: boolean;
  /** Stored position on the title's list, or null when the player isn't on it. */
  currentRank?: number | null;
}

/** Where a new override left the player, once the title was recalculated. */
export type OverridePlacement =
  | { status: 'onList'; rank: number }
  | { status: 'notOnList' | 'noActiveSeason' | 'recalculationFailed'; rank: null };

export interface SetOverrideResult extends ContenderOverride {
  placement: OverridePlacement;
}

export interface SetOverrideRequest {
  championshipId: string;
  playerId: string;
  overrideType: OverrideType;
  reason: string;
  expiresAt?: string;
}

// Display types for UI

/** A player contender row. The API sends no `entityType` on these rows. */
export interface ContenderWithPlayer extends ContenderRanking {
  entityType?: 'player';
  playerName: string;
  wrestlerName: string;
  imageUrl?: string | null;
  movement: number;
  isNew: boolean;
  isOverridden?: boolean;
  overrideType?: OverrideType | null;
  organicRank?: number | null;
}

/** One member of a tag team, on a contender row or the tag champion block. */
export interface ContenderMember {
  playerId: string;
  /** "Former member" when the player row is gone. */
  playerName: string;
  wrestlerName: string;
  imageUrl: string | null;
}

/**
 * A tag-team contender row on a tag title. `playerId` equals `tagTeamId`
 * (it is the rankings table key, and the id overrides use).
 *
 * `playerName`, `wrestlerName` and `imageUrl` are display fallbacks so
 * player-only UI still renders something: the members' player names joined
 * with " & ", the team name, and the team image. Prefer the team fields.
 */
export interface ContenderWithTagTeam extends Omit<ContenderWithPlayer, 'entityType' | 'imageUrl'> {
  entityType: 'tagTeam';
  tagTeamId: string;
  tagTeamName: string;
  tagTeamImageUrl: string | null;
  /** The team's status today. A dissolved team can still have a stored row. */
  tagTeamStatus: TagTeamStatus;
  members: [ContenderMember, ContenderMember];
  imageUrl: string | null;
}

/** A contender row: narrow with `entry.entityType === 'tagTeam'`. */
export type ContenderListEntry = ContenderWithPlayer | ContenderWithTagTeam;

/** The champion of a singles title. The API sends no `type` on this block. */
export interface PlayerContenderChampion {
  type?: 'player';
  playerId: string;
  playerName: string;
  wrestlerName: string;
  imageUrl?: string | null;
}

/**
 * The holders of a tag title, built from every id in `currentChampion`.
 * The team fields are null when the holders are not a known tag team.
 * `playerName` / `wrestlerName` / `imageUrl` are display fallbacks as on
 * `ContenderWithTagTeam` (wrestlerName falls back to the members' wrestler
 * names joined with " & " when there is no team).
 */
export interface TagTeamContenderChampion {
  type: 'tagTeam';
  tagTeamId: string | null;
  tagTeamName: string | null;
  tagTeamImageUrl: string | null;
  members: ContenderMember[];
  playerName: string;
  wrestlerName: string;
  imageUrl: string | null;
}

/** The champion block: narrow with `champion.type === 'tagTeam'`. */
export type ContenderChampion = PlayerContenderChampion | TagTeamContenderChampion;

export interface ChampionshipContenders {
  championshipId: string;
  championshipName: string;
  divisionId?: string | null;
  currentChampion: ContenderChampion | null;
  contenders: ContenderListEntry[];
  calculatedAt: string | null;
  config?: ContenderConfig;
}

export interface PlayerContenderStatus {
  playerId: string;
  playerName: string;
  championships: Array<{
    championshipId: string;
    championshipName: string;
    rank: number;
    rankingScore: number;
    isEligible: boolean;
    matchesNeeded: number;
    pathToTitle: string;
  }>;
}
