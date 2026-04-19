import { v4 as uuidv4 } from 'uuid';
import { NotFoundError } from '../errors';
import type {
  CompetitionRepository,
  ChampionshipCreateInput,
  ChampionshipPatch,
  ContenderRankingInput,
  ContenderOverrideInput,
  RankingHistoryInput,
  MatchTypeCreateInput,
  MatchTypePatch,
  StipulationCreateInput,
  StipulationPatch,
} from '../CompetitionRepository';
import type {
  Match,
  Championship,
  ChampionshipHistoryEntry,
  Tournament,
  ContenderRanking,
  ContenderOverride,
  RankingHistoryEntry,
  MatchType,
  Stipulation,
} from '../types';

export class InMemoryCompetitionRepository implements CompetitionRepository {
  // ─── Exposed stores for InMemoryUnitOfWork wiring ───────────────────

  readonly matchesStore = new Map<string, Match>();
  readonly championshipsStore = new Map<string, Championship>();
  readonly historyStore: ChampionshipHistoryEntry[] = [];
  readonly tournamentsStore = new Map<string, Tournament>();
  readonly matchTypesStore = new Map<string, MatchType>();
  readonly stipulationsStore = new Map<string, Stipulation>();
  readonly rankingsStore = new Map<string, ContenderRanking>();
  readonly overridesStore = new Map<string, ContenderOverride>();
  readonly rankingHistoryStore = new Map<string, RankingHistoryEntry>();

  // ─── Helper keys ────────────────────────────────────────────────────

  private rankingKey(championshipId: string, playerId: string): string {
    return `${championshipId}#${playerId}`;
  }

  private historyKey(playerId: string, weekKey: string): string {
    return `${playerId}#${weekKey}`;
  }

  // ─── matches ────────────────────────────────────────────────────────

  matches: CompetitionRepository['matches'] = {
    findById: async (matchId: string): Promise<Match | null> => {
      return this.matchesStore.get(matchId) ?? null;
    },

    findByIdWithDate: async (matchId: string): Promise<(Match & { date: string }) | null> => {
      const match = this.matchesStore.get(matchId);
      if (!match) return null;
      return { ...match, date: match.date };
    },

    list: async (): Promise<Match[]> => {
      return Array.from(this.matchesStore.values());
    },

    listCompleted: async (): Promise<Match[]> => {
      return Array.from(this.matchesStore.values()).filter((m) => m.status === 'completed');
    },

    listByStatus: async (status: string): Promise<Match[]> => {
      return Array.from(this.matchesStore.values()).filter((m) => m.status === status);
    },

    listByTournament: async (tournamentId: string): Promise<Match[]> => {
      return Array.from(this.matchesStore.values()).filter((m) => m.tournamentId === tournamentId);
    },

    listBySeason: async (seasonId: string): Promise<Match[]> => {
      return Array.from(this.matchesStore.values()).filter((m) => m.seasonId === seasonId);
    },

    create: async (input: Record<string, unknown>): Promise<Match> => {
      const match = input as unknown as Match;
      this.matchesStore.set(match.matchId, match);
      return match;
    },

    update: async (matchId: string, _date: string, patch: Record<string, unknown>): Promise<Match> => {
      const existing = this.matchesStore.get(matchId);
      if (!existing) throw new Error(`Match ${matchId} not found`);
      const updated: Match = { ...existing, ...patch, updatedAt: new Date().toISOString() } as Match;
      this.matchesStore.set(matchId, updated);
      return updated;
    },

    delete: async (matchId: string, _date: string): Promise<void> => {
      this.matchesStore.delete(matchId);
    },
  };

  // ─── championships ──────────────────────────────────────────────────

  championships: CompetitionRepository['championships'] = {
    findById: async (championshipId: string): Promise<Championship | null> => {
      return this.championshipsStore.get(championshipId) ?? null;
    },

    list: async (): Promise<Championship[]> => {
      return Array.from(this.championshipsStore.values());
    },

    listActive: async (): Promise<Championship[]> => {
      return Array.from(this.championshipsStore.values()).filter((c) => c.isActive !== false);
    },

    create: async (input: ChampionshipCreateInput): Promise<Championship> => {
      const now = new Date().toISOString();
      const { name, type, currentChampion, imageUrl, divisionId, ...rest } = input;
      const item = {
        championshipId: uuidv4(),
        name,
        type,
        ...(currentChampion !== undefined ? { currentChampion } : {}),
        ...(imageUrl !== undefined ? { imageUrl } : {}),
        ...(divisionId !== undefined ? { divisionId } : {}),
        ...rest,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      } as Championship;
      this.championshipsStore.set(item.championshipId, item);
      return item;
    },

    update: async (championshipId: string, patch: ChampionshipPatch): Promise<Championship> => {
      const existing = this.championshipsStore.get(championshipId);
      if (!existing) throw new NotFoundError('Championship', championshipId);
      const { currentChampion, ...rest } = patch;
      const updated: Championship = { ...existing, ...rest, updatedAt: new Date().toISOString() };
      if (currentChampion === null) {
        delete (updated as Partial<Championship>).currentChampion;
      } else if (currentChampion !== undefined) {
        updated.currentChampion = currentChampion;
      }
      this.championshipsStore.set(championshipId, updated);
      return updated;
    },

    delete: async (championshipId: string): Promise<void> => {
      this.championshipsStore.delete(championshipId);
    },

    removeChampion: async (championshipId: string): Promise<Championship> => {
      const existing = this.championshipsStore.get(championshipId);
      if (!existing) throw new NotFoundError('Championship', championshipId);
      delete (existing as Partial<Championship>).currentChampion;
      existing.updatedAt = new Date().toISOString();
      return existing;
    },

    // Championship history

    listHistory: async (championshipId: string): Promise<ChampionshipHistoryEntry[]> => {
      return this.historyStore.filter((h) => h.championshipId === championshipId);
    },

    listAllHistory: async (): Promise<ChampionshipHistoryEntry[]> => {
      return [...this.historyStore];
    },

    findCurrentReign: async (championshipId: string): Promise<ChampionshipHistoryEntry | null> => {
      const reigns = this.historyStore
        .filter((h) => h.championshipId === championshipId && !h.lostDate)
        .sort((a, b) => new Date(b.wonDate).getTime() - new Date(a.wonDate).getTime());
      return reigns[0] ?? null;
    },

    closeReign: async (championshipId: string, wonDate: string, lostDate: string, daysHeld: number): Promise<void> => {
      const reign = this.historyStore.find(
        (h) => h.championshipId === championshipId && h.wonDate === wonDate,
      );
      if (reign) {
        reign.lostDate = lostDate;
        reign.daysHeld = daysHeld;
      }
    },

    reopenReign: async (championshipId: string, wonDate: string): Promise<void> => {
      const reign = this.historyStore.find(
        (h) => h.championshipId === championshipId && h.wonDate === wonDate,
      );
      if (reign) {
        delete reign.lostDate;
        delete reign.daysHeld;
      }
    },

    deleteHistoryEntry: async (championshipId: string, wonDate: string): Promise<void> => {
      const index = this.historyStore.findIndex(
        (h) => h.championshipId === championshipId && h.wonDate === wonDate,
      );
      if (index !== -1) {
        this.historyStore.splice(index, 1);
      }
    },

    incrementDefenses: async (championshipId: string, wonDate: string): Promise<void> => {
      const reign = this.historyStore.find(
        (h) => h.championshipId === championshipId && h.wonDate === wonDate,
      );
      if (reign) {
        reign.defenses = (reign.defenses ?? 0) + 1;
      }
    },

    decrementDefenses: async (championshipId: string, wonDate: string): Promise<void> => {
      const reign = this.historyStore.find(
        (h) => h.championshipId === championshipId && h.wonDate === wonDate,
      );
      if (reign) {
        reign.defenses = (reign.defenses ?? 0) - 1;
      }
    },
  };

  // ─── tournaments ────────────────────────────────────────────────────

  tournaments: CompetitionRepository['tournaments'] = {
    findById: async (tournamentId: string): Promise<Tournament | null> => {
      return this.tournamentsStore.get(tournamentId) ?? null;
    },

    list: async (): Promise<Tournament[]> => {
      return Array.from(this.tournamentsStore.values());
    },

    create: async (input: Record<string, unknown>): Promise<Tournament> => {
      const tournament = input as unknown as Tournament;
      this.tournamentsStore.set(tournament.tournamentId, tournament);
      return tournament;
    },

    update: async (tournamentId: string, patch: Partial<Tournament>): Promise<Tournament> => {
      const existing = this.tournamentsStore.get(tournamentId);
      if (!existing) throw new NotFoundError('Tournament', tournamentId);
      const updated: Tournament = { ...existing, ...patch, updatedAt: new Date().toISOString() };
      this.tournamentsStore.set(tournamentId, updated);
      return updated;
    },
  };

  // ─── contenders ─────────────────────────────────────────────────────

  contenders: CompetitionRepository['contenders'] = {
    // Rankings

    listByChampionship: async (championshipId: string): Promise<ContenderRanking[]> => {
      return Array.from(this.rankingsStore.values()).filter(
        (r) => r.championshipId === championshipId,
      );
    },

    listByChampionshipRanked: async (championshipId: string): Promise<ContenderRanking[]> => {
      const items = Array.from(this.rankingsStore.values()).filter(
        (r) => r.championshipId === championshipId,
      );
      items.sort((a, b) => a.rank - b.rank);
      return items;
    },

    deleteAllForChampionship: async (championshipId: string): Promise<void> => {
      for (const [key, ranking] of this.rankingsStore) {
        if (ranking.championshipId === championshipId) {
          this.rankingsStore.delete(key);
        }
      }
    },

    upsertRanking: async (input: ContenderRankingInput): Promise<ContenderRanking> => {
      const now = new Date().toISOString();
      const item: ContenderRanking = {
        championshipId: input.championshipId,
        playerId: input.playerId,
        rank: input.rank,
        rankingScore: input.rankingScore,
        winPercentage: input.winPercentage,
        currentStreak: input.currentStreak,
        qualityScore: input.qualityScore,
        recencyScore: input.recencyScore,
        matchesInPeriod: input.matchesInPeriod,
        winsInPeriod: input.winsInPeriod,
        previousRank: input.previousRank ?? null,
        peakRank: input.peakRank,
        weeksAtTop: input.weeksAtTop,
        isOverridden: input.isOverridden || false,
        overrideType: input.overrideType || null,
        organicRank: input.organicRank || null,
        calculatedAt: now,
        updatedAt: now,
      };

      this.rankingsStore.set(this.rankingKey(input.championshipId, input.playerId), item);
      return item;
    },

    // Overrides

    findOverride: async (
      championshipId: string,
      playerId: string,
    ): Promise<ContenderOverride | null> => {
      return this.overridesStore.get(this.rankingKey(championshipId, playerId)) ?? null;
    },

    listActiveOverrides: async (championshipId?: string): Promise<ContenderOverride[]> => {
      return Array.from(this.overridesStore.values()).filter((o) => {
        if (!o.active) return false;
        if (championshipId && o.championshipId !== championshipId) return false;
        return true;
      });
    },

    createOverride: async (input: ContenderOverrideInput): Promise<ContenderOverride> => {
      const now = new Date().toISOString();
      const item: ContenderOverride = {
        championshipId: input.championshipId,
        playerId: input.playerId,
        overrideType: input.overrideType,
        reason: input.reason,
        createdBy: input.createdBy,
        createdAt: now,
        ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
        active: true,
      };

      this.overridesStore.set(this.rankingKey(input.championshipId, input.playerId), item);
      return item;
    },

    deactivateOverride: async (
      championshipId: string,
      playerId: string,
      reason: string,
    ): Promise<void> => {
      const key = this.rankingKey(championshipId, playerId);
      const existing = this.overridesStore.get(key);
      if (existing) {
        this.overridesStore.set(key, {
          ...existing,
          active: false,
          removedAt: new Date().toISOString(),
          removedReason: reason,
        });
      }
    },

    // Ranking history

    writeHistory: async (input: RankingHistoryInput): Promise<RankingHistoryEntry> => {
      const now = new Date().toISOString();
      const item: RankingHistoryEntry = {
        playerId: input.playerId,
        weekKey: input.weekKey,
        championshipId: input.championshipId,
        rank: input.rank,
        rankingScore: input.rankingScore,
        movement: input.movement,
        isOverridden: input.isOverridden || false,
        overrideType: input.overrideType || null,
        organicRank: input.organicRank || null,
        createdAt: now,
      };

      this.rankingHistoryStore.set(this.historyKey(input.playerId, input.weekKey), item);
      return item;
    },
  };

  // ─── matchTypes ─────────────────────────────────────────────────────

  matchTypes: CompetitionRepository['matchTypes'] = {
    findById: async (matchTypeId: string): Promise<MatchType | null> => {
      return this.matchTypesStore.get(matchTypeId) ?? null;
    },

    list: async (): Promise<MatchType[]> => {
      return Array.from(this.matchTypesStore.values());
    },

    create: async (input: MatchTypeCreateInput): Promise<MatchType> => {
      const now = new Date().toISOString();
      const item: MatchType = {
        matchTypeId: uuidv4(),
        name: input.name,
        ...(input.description !== undefined ? { description: input.description } : {}),
        createdAt: now,
        updatedAt: now,
      };
      this.matchTypesStore.set(item.matchTypeId, item);
      return item;
    },

    update: async (matchTypeId: string, patch: MatchTypePatch): Promise<MatchType> => {
      const existing = this.matchTypesStore.get(matchTypeId);
      if (!existing) throw new NotFoundError('MatchType', matchTypeId);
      const updated: MatchType = {
        ...existing,
        ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
        updatedAt: new Date().toISOString(),
      };
      this.matchTypesStore.set(matchTypeId, updated);
      return updated;
    },

    delete: async (matchTypeId: string): Promise<void> => {
      this.matchTypesStore.delete(matchTypeId);
    },
  };

  // ─── stipulations ──────────────────────────────────────────────────

  stipulations: CompetitionRepository['stipulations'] = {
    findById: async (stipulationId: string): Promise<Stipulation | null> => {
      return this.stipulationsStore.get(stipulationId) ?? null;
    },

    list: async (): Promise<Stipulation[]> => {
      return Array.from(this.stipulationsStore.values());
    },

    create: async (input: StipulationCreateInput): Promise<Stipulation> => {
      const now = new Date().toISOString();
      const item: Stipulation = {
        stipulationId: uuidv4(),
        name: input.name,
        ...(input.description !== undefined ? { description: input.description } : {}),
        createdAt: now,
        updatedAt: now,
      };
      this.stipulationsStore.set(item.stipulationId, item);
      return item;
    },

    update: async (stipulationId: string, patch: StipulationPatch): Promise<Stipulation> => {
      const existing = this.stipulationsStore.get(stipulationId);
      if (!existing) throw new NotFoundError('Stipulation', stipulationId);
      const updated: Stipulation = {
        ...existing,
        ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
        updatedAt: new Date().toISOString(),
      };
      this.stipulationsStore.set(stipulationId, updated);
      return updated;
    },

    delete: async (stipulationId: string): Promise<void> => {
      this.stipulationsStore.delete(stipulationId);
    },
  };
}
