import { v4 as uuidv4 } from 'uuid';
import { dynamoDb, TableNames } from '../../dynamodb';
import { NotFoundError } from '../errors';
import { DynamoCrudRepository } from './DynamoCrudRepository';
import type {
  SeasonRepository,
  SeasonCreateInput,
  SeasonPatch,
  SeasonAwardCreateInput,
  StandingsMethods,
  AwardsMethods,
} from '../SeasonRepository';
import type { Season, SeasonStanding, SeasonAward } from '../types';
import type { RecordDelta } from '../unitOfWork';

export class DynamoSeasonRepository implements SeasonRepository {
  // ─── Seasons (CRUD delegated to DynamoCrudRepository) ──────────────

  private _seasonsCrud = new DynamoCrudRepository<Season, SeasonCreateInput, SeasonPatch>({
    tableName: TableNames.SEASONS,
    idField: 'seasonId',
    entityName: 'Season',
    buildItem: (input, id, now) => ({
      seasonId: id,
      name: input.name,
      startDate: input.startDate,
      ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
      status: 'active' as const,
      createdAt: now,
      updatedAt: now,
    }),
  });

  seasons: SeasonRepository['seasons'] = {
    findById: (id: string) => this._seasonsCrud.findById(id),
    list: async () => {
      const seasons = await this._seasonsCrud.list();
      seasons.sort(
        (a, b) =>
          new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
      );
      return seasons;
    },
    create: (input: SeasonCreateInput) => this._seasonsCrud.create(input),
    update: async (id: string, patch: SeasonPatch): Promise<Season> => {
      const existing = await this._seasonsCrud.findById(id);
      if (!existing) throw new NotFoundError('Season', id);

      const now = new Date().toISOString();
      const setExpressions: string[] = [];
      const expressionAttributeValues: Record<string, unknown> = {
        ':updatedAt': now,
      };
      const expressionAttributeNames: Record<string, string> = {};

      if (patch.name !== undefined) {
        setExpressions.push('#name = :name');
        expressionAttributeNames['#name'] = 'name';
        expressionAttributeValues[':name'] = patch.name;
      }

      if (patch.status !== undefined) {
        setExpressions.push('#status = :status');
        expressionAttributeNames['#status'] = 'status';
        expressionAttributeValues[':status'] = patch.status;
      }

      if (patch.endDate !== undefined) {
        setExpressions.push('endDate = :endDate');
        expressionAttributeValues[':endDate'] = patch.endDate;
      }

      // If ending season, auto-set endDate if not provided
      if (patch.status === 'completed' && !patch.endDate && !existing.endDate) {
        setExpressions.push('endDate = :autoEndDate');
        expressionAttributeValues[':autoEndDate'] = now;
      }

      setExpressions.push('updatedAt = :updatedAt');

      const result = await dynamoDb.update({
        TableName: TableNames.SEASONS,
        Key: { seasonId: id },
        UpdateExpression: `SET ${setExpressions.join(', ')}`,
        ExpressionAttributeNames:
          Object.keys(expressionAttributeNames).length > 0
            ? expressionAttributeNames
            : undefined,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW',
      });

      return result.Attributes as Season;
    },
    delete: (id: string) => this._seasonsCrud.delete(id),
    findActive: async (): Promise<Season | null> => {
      const result = await dynamoDb.scan({
        TableName: TableNames.SEASONS,
        FilterExpression: '#status = :active',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':active': 'active' },
      });
      return ((result.Items?.[0]) as Season | undefined) ?? null;
    },
  };

  // ─── Standings (composite key, no standard CRUD) ───────────────────

  standings: StandingsMethods = {
    listBySeason: async (seasonId: string): Promise<SeasonStanding[]> => {
      return (await dynamoDb.queryAll({
        TableName: TableNames.SEASON_STANDINGS,
        KeyConditionExpression: 'seasonId = :seasonId',
        ExpressionAttributeValues: { ':seasonId': seasonId },
      })) as unknown as SeasonStanding[];
    },

    listByPlayer: async (playerId: string): Promise<SeasonStanding[]> => {
      return (await dynamoDb.queryAll({
        TableName: TableNames.SEASON_STANDINGS,
        IndexName: 'PlayerIndex',
        KeyConditionExpression: 'playerId = :pid',
        ExpressionAttributeValues: { ':pid': playerId },
      })) as unknown as SeasonStanding[];
    },

    findStanding: async (
      seasonId: string,
      playerId: string,
    ): Promise<SeasonStanding | null> => {
      const result = await dynamoDb.get({
        TableName: TableNames.SEASON_STANDINGS,
        Key: { seasonId, playerId },
      });
      return (result.Item as SeasonStanding | undefined) ?? null;
    },

    increment: async (
      seasonId: string,
      playerId: string,
      delta: RecordDelta,
    ): Promise<void> => {
      const parts: string[] = [];
      const values: Record<string, unknown> = {
        ':timestamp': new Date().toISOString(),
      };

      if (delta.wins) {
        parts.push('wins = if_not_exists(wins, :zero) + :dw');
        values[':dw'] = delta.wins;
        values[':zero'] = 0;
      }
      if (delta.losses) {
        parts.push('losses = if_not_exists(losses, :zero) + :dl');
        values[':dl'] = delta.losses;
        if (!values[':zero']) values[':zero'] = 0;
      }
      if (delta.draws) {
        parts.push('draws = if_not_exists(draws, :zero) + :dd');
        values[':dd'] = delta.draws;
        if (!values[':zero']) values[':zero'] = 0;
      }
      parts.push('updatedAt = :timestamp');

      await dynamoDb.update({
        TableName: TableNames.SEASON_STANDINGS,
        Key: { seasonId, playerId },
        UpdateExpression: `SET ${parts.join(', ')}`,
        ExpressionAttributeValues: values,
      });
    },

    delete: async (seasonId: string, playerId: string): Promise<void> => {
      await dynamoDb.delete({
        TableName: TableNames.SEASON_STANDINGS,
        Key: { seasonId, playerId },
      });
    },

    deleteAllForSeason: async (seasonId: string): Promise<void> => {
      const items = await this.standings.listBySeason(seasonId);
      for (const standing of items) {
        await this.standings.delete(seasonId, standing.playerId);
      }
    },
  };

  // ─── Awards (composite key, deleteAllForSeason) ────────────────────

  awards: AwardsMethods = {
    listBySeason: async (seasonId: string): Promise<SeasonAward[]> => {
      const result = await dynamoDb.query({
        TableName: TableNames.SEASON_AWARDS,
        KeyConditionExpression: '#seasonId = :seasonId',
        ExpressionAttributeNames: { '#seasonId': 'seasonId' },
        ExpressionAttributeValues: { ':seasonId': seasonId },
      });
      return (result.Items || []) as unknown as SeasonAward[];
    },

    findById: async (
      seasonId: string,
      awardId: string,
    ): Promise<SeasonAward | null> => {
      const result = await dynamoDb.get({
        TableName: TableNames.SEASON_AWARDS,
        Key: { seasonId, awardId },
      });
      return (result.Item as SeasonAward | undefined) ?? null;
    },

    create: async (input: SeasonAwardCreateInput): Promise<SeasonAward> => {
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
      await dynamoDb.put({ TableName: TableNames.SEASON_AWARDS, Item: item });
      return item;
    },

    delete: async (seasonId: string, awardId: string): Promise<void> => {
      await dynamoDb.delete({
        TableName: TableNames.SEASON_AWARDS,
        Key: { seasonId, awardId },
      });
    },

    deleteAllForSeason: async (seasonId: string): Promise<number> => {
      const items = await this.awards.listBySeason(seasonId);
      for (const award of items) {
        await dynamoDb.delete({
          TableName: TableNames.SEASON_AWARDS,
          Key: { seasonId, awardId: award.awardId },
        });
      }
      return items.length;
    },
  };
}
