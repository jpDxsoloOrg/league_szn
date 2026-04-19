import { v4 as uuidv4 } from 'uuid';
import { InMemoryCrudRepository } from './InMemoryCrudRepository';
import type {
  SeasonRepository,
  SeasonCreateInput,
  SeasonPatch,
  SeasonAwardCreateInput,
  StandingsMethods,
  AwardsMethods,
} from '../SeasonRepository';
import type { RecordDelta } from '../unitOfWork';
import type { Season, SeasonStanding, SeasonAward } from '../types';

// ─── Seasons (CRUD + findActive) ───────────────────────────────────

class SeasonsSubRepo extends InMemoryCrudRepository<Season, SeasonCreateInput, SeasonPatch> {
  constructor() {
    super({
      idField: 'seasonId',
      entityName: 'Season',
      buildItem: (input: SeasonCreateInput, id: string, now: string): Season => ({
        seasonId: id,
        name: input.name,
        startDate: input.startDate,
        ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
        status: 'active',
        createdAt: now,
        updatedAt: now,
      }),
    });
  }

  async findActive(): Promise<Season | null> {
    return Array.from(this.store.values()).find((s) => s.status === 'active') ?? null;
  }
}

// ─── Aggregate ─────────────────────────────────────────────────────

export class InMemorySeasonRepository implements SeasonRepository {
  readonly seasons: SeasonsSubRepo;
  readonly standings: StandingsMethods;
  readonly awards: AwardsMethods;

  /** Exposed for InMemoryUnitOfWork */
  readonly standingsStore: SeasonStanding[] = [];

  private readonly awardsStore = new Map<string, SeasonAward>();

  constructor() {
    this.seasons = new SeasonsSubRepo();

    const standingsStore = this.standingsStore;
    const awardsStore = this.awardsStore;

    // ─── Standings ───────────────────────────────────────────────────

    this.standings = {
      async listBySeason(seasonId: string): Promise<SeasonStanding[]> {
        return standingsStore.filter((s) => s.seasonId === seasonId);
      },

      async listByPlayer(playerId: string): Promise<SeasonStanding[]> {
        return standingsStore.filter((s) => s.playerId === playerId);
      },

      async findStanding(seasonId: string, playerId: string): Promise<SeasonStanding | null> {
        return standingsStore.find((s) => s.seasonId === seasonId && s.playerId === playerId) ?? null;
      },

      async increment(seasonId: string, playerId: string, delta: RecordDelta): Promise<void> {
        let standing = standingsStore.find((s) => s.seasonId === seasonId && s.playerId === playerId);
        if (!standing) {
          standing = { seasonId, playerId, wins: 0, losses: 0, draws: 0, updatedAt: new Date().toISOString() };
          standingsStore.push(standing);
        }
        if (delta.wins) standing.wins += delta.wins;
        if (delta.losses) standing.losses += delta.losses;
        if (delta.draws) standing.draws += delta.draws;
        standing.updatedAt = new Date().toISOString();
      },

      async delete(seasonId: string, playerId: string): Promise<void> {
        const index = standingsStore.findIndex((s) => s.seasonId === seasonId && s.playerId === playerId);
        if (index !== -1) {
          standingsStore.splice(index, 1);
        }
      },

      async deleteAllForSeason(seasonId: string): Promise<void> {
        for (let i = standingsStore.length - 1; i >= 0; i--) {
          if (standingsStore[i].seasonId === seasonId) {
            standingsStore.splice(i, 1);
          }
        }
      },
    };

    // ─── Awards ──────────────────────────────────────────────────────

    const awardKey = (seasonId: string, awardId: string): string => `${seasonId}#${awardId}`;

    this.awards = {
      async listBySeason(seasonId: string): Promise<SeasonAward[]> {
        return Array.from(awardsStore.values()).filter((a) => a.seasonId === seasonId);
      },

      async findById(seasonId: string, awardId: string): Promise<SeasonAward | null> {
        return awardsStore.get(awardKey(seasonId, awardId)) ?? null;
      },

      async create(input: SeasonAwardCreateInput): Promise<SeasonAward> {
        const now = new Date().toISOString();
        const item: SeasonAward = {
          awardId: uuidv4(),
          seasonId: input.seasonId,
          name: input.name,
          awardType: input.awardType,
          playerId: input.playerId,
          playerName: input.playerName,
          description: input.description ?? null,
          createdAt: now,
        };
        awardsStore.set(awardKey(item.seasonId, item.awardId), item);
        return item;
      },

      async delete(seasonId: string, awardId: string): Promise<void> {
        awardsStore.delete(awardKey(seasonId, awardId));
      },

      async deleteAllForSeason(seasonId: string): Promise<number> {
        const items = Array.from(awardsStore.values()).filter((a) => a.seasonId === seasonId);
        for (const award of items) {
          awardsStore.delete(awardKey(seasonId, award.awardId));
        }
        return items.length;
      },
    };
  }
}
