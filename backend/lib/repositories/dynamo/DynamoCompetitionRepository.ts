import { v4 as uuidv4 } from 'uuid';
import { dynamoDb, TableNames } from '../../dynamodb';
import { buildUpdateExpression } from './util';
import { NotFoundError } from '../errors';
import { DynamoCrudRepository } from './DynamoCrudRepository';
import type {
  CompetitionRepository,
  MatchesMethods,
  ChampionshipsMethods,
  TournamentsMethods,
  ContendersMethods,
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
import type { CrudRepository } from '../CrudRepository';
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

// ─── Matches ────────────────────────────────────────────────────────

class MatchesDynamo implements MatchesMethods {
  async findById(matchId: string): Promise<Match | null> {
    const result = await dynamoDb.get({
      TableName: TableNames.MATCHES,
      Key: { matchId },
    });
    return (result.Item as Match | undefined) ?? null;
  }

  async findByIdWithDate(matchId: string): Promise<(Match & { date: string }) | null> {
    const result = await dynamoDb.query({
      TableName: TableNames.MATCHES,
      KeyConditionExpression: 'matchId = :matchId',
      ExpressionAttributeValues: { ':matchId': matchId },
      Limit: 1,
    });
    return ((result.Items?.[0]) as (Match & { date: string }) | undefined) ?? null;
  }

  async list(): Promise<Match[]> {
    return await dynamoDb.scanAll({ TableName: TableNames.MATCHES }) as unknown as Match[];
  }

  async listCompleted(): Promise<Match[]> {
    return await dynamoDb.scanAll({
      TableName: TableNames.MATCHES,
      FilterExpression: '#status = :completed',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':completed': 'completed' },
    }) as unknown as Match[];
  }

  async listByStatus(status: string): Promise<Match[]> {
    return await dynamoDb.scanAll({
      TableName: TableNames.MATCHES,
      FilterExpression: '#status = :status',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': status },
    }) as unknown as Match[];
  }

  async listByTournament(tournamentId: string): Promise<Match[]> {
    return await dynamoDb.queryAll({
      TableName: TableNames.MATCHES,
      IndexName: 'TournamentIndex',
      KeyConditionExpression: 'tournamentId = :tournamentId',
      ExpressionAttributeValues: { ':tournamentId': tournamentId },
    }) as unknown as Match[];
  }

  async listBySeason(seasonId: string): Promise<Match[]> {
    return await dynamoDb.scanAll({
      TableName: TableNames.MATCHES,
      FilterExpression: 'seasonId = :seasonId',
      ExpressionAttributeValues: { ':seasonId': seasonId },
    }) as unknown as Match[];
  }

  async create(input: Record<string, unknown>): Promise<Match> {
    await dynamoDb.put({
      TableName: TableNames.MATCHES,
      Item: input,
    });
    return input as unknown as Match;
  }

  async update(matchId: string, date: string, patch: Record<string, unknown>): Promise<Match> {
    const { UpdateExpression, ExpressionAttributeNames, ExpressionAttributeValues } =
      buildUpdateExpression(patch, new Date().toISOString());
    const result = await dynamoDb.update({
      TableName: TableNames.MATCHES,
      Key: { matchId, date },
      UpdateExpression,
      ExpressionAttributeNames,
      ExpressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    });
    return result.Attributes as Match;
  }

  async delete(matchId: string, date: string): Promise<void> {
    await dynamoDb.delete({
      TableName: TableNames.MATCHES,
      Key: { matchId, date },
    });
  }
}

// ─── Championships ──────────────────────────────────────────────────

class ChampionshipsDynamo implements ChampionshipsMethods {
  async findById(championshipId: string): Promise<Championship | null> {
    const result = await dynamoDb.get({
      TableName: TableNames.CHAMPIONSHIPS,
      Key: { championshipId },
    });
    return (result.Item as Championship | undefined) ?? null;
  }

  async list(): Promise<Championship[]> {
    return await dynamoDb.scanAll({ TableName: TableNames.CHAMPIONSHIPS }) as unknown as Championship[];
  }

  async listActive(): Promise<Championship[]> {
    const all = await this.list();
    return all.filter((c) => c.isActive !== false);
  }

  async create(input: ChampionshipCreateInput): Promise<Championship> {
    const now = new Date().toISOString();
    const { name, type, currentChampion, imageUrl, divisionId, ...rest } = input;
    const item: Record<string, unknown> = {
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
    };
    await dynamoDb.put({ TableName: TableNames.CHAMPIONSHIPS, Item: item });
    return item as unknown as Championship;
  }

  async update(championshipId: string, patch: ChampionshipPatch): Promise<Championship> {
    const { UpdateExpression, ExpressionAttributeNames, ExpressionAttributeValues } =
      buildUpdateExpression(patch, new Date().toISOString());
    try {
      const result = await dynamoDb.update({
        TableName: TableNames.CHAMPIONSHIPS,
        Key: { championshipId },
        UpdateExpression,
        ExpressionAttributeNames,
        ExpressionAttributeValues,
        ConditionExpression: 'attribute_exists(championshipId)',
        ReturnValues: 'ALL_NEW',
      });
      return result.Attributes as Championship;
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'ConditionalCheckFailedException') {
        throw new NotFoundError('Championship', championshipId);
      }
      throw err;
    }
  }

  async delete(championshipId: string): Promise<void> {
    await dynamoDb.delete({ TableName: TableNames.CHAMPIONSHIPS, Key: { championshipId } });
  }

  async removeChampion(championshipId: string): Promise<Championship> {
    const result = await dynamoDb.update({
      TableName: TableNames.CHAMPIONSHIPS,
      Key: { championshipId },
      UpdateExpression: 'REMOVE currentChampion SET updatedAt = :now, version = if_not_exists(version, :zero) + :one',
      ExpressionAttributeValues: { ':now': new Date().toISOString(), ':zero': 0, ':one': 1 },
      ReturnValues: 'ALL_NEW',
    });
    return result.Attributes as Championship;
  }

  // ── Championship history ────────────────────────────────────────

  async listHistory(championshipId: string): Promise<ChampionshipHistoryEntry[]> {
    return await dynamoDb.queryAll({
      TableName: TableNames.CHAMPIONSHIP_HISTORY,
      KeyConditionExpression: 'championshipId = :cid',
      ExpressionAttributeValues: { ':cid': championshipId },
    }) as unknown as ChampionshipHistoryEntry[];
  }

  async listAllHistory(): Promise<ChampionshipHistoryEntry[]> {
    return await dynamoDb.scanAll({
      TableName: TableNames.CHAMPIONSHIP_HISTORY,
    }) as unknown as ChampionshipHistoryEntry[];
  }

  async findCurrentReign(championshipId: string): Promise<ChampionshipHistoryEntry | null> {
    const result = await dynamoDb.query({
      TableName: TableNames.CHAMPIONSHIP_HISTORY,
      KeyConditionExpression: 'championshipId = :cid',
      FilterExpression: 'attribute_not_exists(lostDate)',
      ExpressionAttributeValues: { ':cid': championshipId },
      ScanIndexForward: false,
      Limit: 1,
    });
    return ((result.Items?.[0]) as ChampionshipHistoryEntry | undefined) ?? null;
  }

  async closeReign(championshipId: string, wonDate: string, lostDate: string, daysHeld: number): Promise<void> {
    await dynamoDb.update({
      TableName: TableNames.CHAMPIONSHIP_HISTORY,
      Key: { championshipId, wonDate },
      UpdateExpression: 'SET lostDate = :lostDate, daysHeld = :daysHeld',
      ExpressionAttributeValues: { ':lostDate': lostDate, ':daysHeld': daysHeld },
    });
  }

  async reopenReign(championshipId: string, wonDate: string): Promise<void> {
    await dynamoDb.update({
      TableName: TableNames.CHAMPIONSHIP_HISTORY,
      Key: { championshipId, wonDate },
      UpdateExpression: 'REMOVE lostDate, daysHeld SET updatedAt = :now',
      ExpressionAttributeValues: { ':now': new Date().toISOString() },
    });
  }

  async deleteHistoryEntry(championshipId: string, wonDate: string): Promise<void> {
    await dynamoDb.delete({
      TableName: TableNames.CHAMPIONSHIP_HISTORY,
      Key: { championshipId, wonDate },
    });
  }

  async incrementDefenses(championshipId: string, wonDate: string): Promise<void> {
    await dynamoDb.update({
      TableName: TableNames.CHAMPIONSHIP_HISTORY,
      Key: { championshipId, wonDate },
      UpdateExpression: 'SET defenses = if_not_exists(defenses, :zero) + :one, updatedAt = :now',
      ExpressionAttributeValues: { ':zero': 0, ':one': 1, ':now': new Date().toISOString() },
    });
  }

  async decrementDefenses(championshipId: string, wonDate: string): Promise<void> {
    await dynamoDb.update({
      TableName: TableNames.CHAMPIONSHIP_HISTORY,
      Key: { championshipId, wonDate },
      UpdateExpression: 'SET defenses = defenses - :one, updatedAt = :now',
      ExpressionAttributeValues: { ':one': 1, ':now': new Date().toISOString() },
    });
  }
}

// ─── Tournaments ────────────────────────────────────────────────────

class TournamentsDynamo implements TournamentsMethods {
  async findById(tournamentId: string): Promise<Tournament | null> {
    const result = await dynamoDb.get({
      TableName: TableNames.TOURNAMENTS,
      Key: { tournamentId },
    });
    return (result.Item as Tournament | undefined) ?? null;
  }

  async list(): Promise<Tournament[]> {
    return await dynamoDb.scanAll({ TableName: TableNames.TOURNAMENTS }) as unknown as Tournament[];
  }

  async create(input: Record<string, unknown>): Promise<Tournament> {
    await dynamoDb.put({
      TableName: TableNames.TOURNAMENTS,
      Item: input,
    });
    return input as unknown as Tournament;
  }

  async update(tournamentId: string, patch: Partial<Tournament>): Promise<Tournament> {
    const { UpdateExpression, ExpressionAttributeNames, ExpressionAttributeValues } =
      buildUpdateExpression(patch, new Date().toISOString());
    try {
      const result = await dynamoDb.update({
        TableName: TableNames.TOURNAMENTS,
        Key: { tournamentId },
        UpdateExpression,
        ExpressionAttributeNames,
        ExpressionAttributeValues,
        ConditionExpression: 'attribute_exists(tournamentId)',
        ReturnValues: 'ALL_NEW',
      });
      return result.Attributes as Tournament;
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'ConditionalCheckFailedException') {
        throw new NotFoundError('Tournament', tournamentId);
      }
      throw err;
    }
  }
}

// ─── Contenders ─────────────────────────────────────────────────────

class ContendersDynamo implements ContendersMethods {
  // ── Rankings ──────────────────────────────────────────────────────

  async listByChampionship(championshipId: string): Promise<ContenderRanking[]> {
    const items = await dynamoDb.queryAll({
      TableName: TableNames.CONTENDER_RANKINGS,
      KeyConditionExpression: 'championshipId = :cid',
      ExpressionAttributeValues: { ':cid': championshipId },
    });
    return items as unknown as ContenderRanking[];
  }

  async listByChampionshipRanked(championshipId: string): Promise<ContenderRanking[]> {
    const items = await dynamoDb.queryAll({
      TableName: TableNames.CONTENDER_RANKINGS,
      IndexName: 'RankIndex',
      KeyConditionExpression: 'championshipId = :cid',
      ExpressionAttributeValues: { ':cid': championshipId },
      ScanIndexForward: true,
    });
    return items as unknown as ContenderRanking[];
  }

  async deleteAllForChampionship(championshipId: string): Promise<void> {
    const existing = await this.listByChampionship(championshipId);
    for (const item of existing) {
      await dynamoDb.delete({
        TableName: TableNames.CONTENDER_RANKINGS,
        Key: {
          championshipId: item.championshipId,
          playerId: item.playerId,
        },
      });
    }
  }

  async upsertRanking(input: ContenderRankingInput): Promise<ContenderRanking> {
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

    await dynamoDb.put({
      TableName: TableNames.CONTENDER_RANKINGS,
      Item: item,
    });
    return item;
  }

  // ── Overrides ─────────────────────────────────────────────────────

  async findOverride(
    championshipId: string,
    playerId: string,
  ): Promise<ContenderOverride | null> {
    const result = await dynamoDb.get({
      TableName: TableNames.CONTENDER_OVERRIDES,
      Key: { championshipId, playerId },
    });
    return (result.Item as ContenderOverride | undefined) ?? null;
  }

  async listActiveOverrides(championshipId?: string): Promise<ContenderOverride[]> {
    if (championshipId) {
      const items = await dynamoDb.queryAll({
        TableName: TableNames.CONTENDER_OVERRIDES,
        IndexName: 'ActiveOverridesIndex',
        KeyConditionExpression: 'championshipId = :cid',
        FilterExpression: 'active = :active',
        ExpressionAttributeValues: {
          ':cid': championshipId,
          ':active': true,
        },
        ScanIndexForward: false,
      });
      return items as unknown as ContenderOverride[];
    }

    const items = await dynamoDb.scanAll({
      TableName: TableNames.CONTENDER_OVERRIDES,
      FilterExpression: 'active = :active',
      ExpressionAttributeValues: { ':active': true },
    });
    return items as unknown as ContenderOverride[];
  }

  async createOverride(input: ContenderOverrideInput): Promise<ContenderOverride> {
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

    await dynamoDb.put({
      TableName: TableNames.CONTENDER_OVERRIDES,
      Item: item,
    });
    return item;
  }

  async deactivateOverride(
    championshipId: string,
    playerId: string,
    reason: string,
  ): Promise<void> {
    const now = new Date().toISOString();
    await dynamoDb.update({
      TableName: TableNames.CONTENDER_OVERRIDES,
      Key: { championshipId, playerId },
      UpdateExpression: 'SET active = :false, removedAt = :now, removedReason = :reason',
      ExpressionAttributeValues: {
        ':false': false,
        ':now': now,
        ':reason': reason,
      },
    });
  }

  // ── Ranking history ───────────────────────────────────────────────

  async writeHistory(input: RankingHistoryInput): Promise<RankingHistoryEntry> {
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

    await dynamoDb.put({
      TableName: TableNames.RANKING_HISTORY,
      Item: item,
    });
    return item;
  }
}

// ─── Aggregate ──────────────────────────────────────────────────────

export class DynamoCompetitionRepository implements CompetitionRepository {
  matches: MatchesMethods = new MatchesDynamo();
  championships: ChampionshipsMethods = new ChampionshipsDynamo();
  tournaments: TournamentsMethods = new TournamentsDynamo();
  contenders: ContendersMethods = new ContendersDynamo();

  matchTypes: CrudRepository<MatchType, MatchTypeCreateInput, MatchTypePatch> =
    new DynamoCrudRepository<MatchType, MatchTypeCreateInput, MatchTypePatch>({
      tableName: TableNames.MATCH_TYPES,
      idField: 'matchTypeId',
      entityName: 'MatchType',
      buildItem: (input, id, now) => ({
        matchTypeId: id,
        name: input.name,
        ...(input.description !== undefined ? { description: input.description } : {}),
        createdAt: now,
        updatedAt: now,
      } as MatchType),
    });

  stipulations: CrudRepository<Stipulation, StipulationCreateInput, StipulationPatch> =
    new DynamoCrudRepository<Stipulation, StipulationCreateInput, StipulationPatch>({
      tableName: TableNames.STIPULATIONS,
      idField: 'stipulationId',
      entityName: 'Stipulation',
      buildItem: (input, id, now) => ({
        stipulationId: id,
        name: input.name,
        ...(input.description !== undefined ? { description: input.description } : {}),
        createdAt: now,
        updatedAt: now,
      } as Stipulation),
    });
}
