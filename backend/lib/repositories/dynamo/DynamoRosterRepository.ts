import { v4 as uuidv4 } from 'uuid';
import { dynamoDb, TableNames } from '../../dynamodb';
import { NotFoundError } from '../errors';
import { buildUpdateExpression } from './util';
import { DynamoCrudRepository } from './DynamoCrudRepository';
import type {
  RosterRepository,
  PlayerCreateInput,
  PlayerPatch,
  TagTeamCreateInput,
  TagTeamPatch,
  StableCreateInput,
  StablePatch,
  StableInvitationCreateInput,
  StablesMethods,
  OverallSubmitInput,
  OverallsMethods,
  TransferCreateInput,
  TransferReviewInput,
  TransfersMethods,
  WrestlersMethods,
} from '../RosterRepository';
import type {
  Player,
  TagTeam,
  TagTeamStatus,
  Stable,
  StableStatus,
  StableInvitation,
  WrestlerOverall,
  TransferRequest,
  Wrestler,
  WrestlerCreateInput,
  WrestlerPromotion,
  WrestlerImportResult,
} from '../types';
import {
  WRESTLER_PROMOTIONS,
  OVERALL_CAP_MIN,
  OVERALL_CAP_MAX,
} from '../types';

export class DynamoRosterRepository implements RosterRepository {
  // ─── Players (CRUD + findByUserId) ──────────────────────────────

  private _playersCrud = new DynamoCrudRepository<Player, PlayerCreateInput, PlayerPatch>({
    tableName: TableNames.PLAYERS,
    idField: 'playerId',
    entityName: 'Player',
    buildItem: (input: PlayerCreateInput, id: string, now: string): Player => ({
      playerId: id,
      name: input.name,
      currentWrestler: input.currentWrestler,
      ...(input.alternateWrestler !== undefined ? { alternateWrestler: input.alternateWrestler } : {}),
      ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
      ...(input.psnId !== undefined ? { psnId: input.psnId } : {}),
      ...(input.divisionId !== undefined ? { divisionId: input.divisionId } : {}),
      ...(input.companyId !== undefined ? { companyId: input.companyId } : {}),
      ...(input.alignment !== undefined ? { alignment: input.alignment } : {}),
      wins: 0,
      losses: 0,
      draws: 0,
      createdAt: now,
      updatedAt: now,
    }),
  });

  players: RosterRepository['players'] = {
    findById: (id: string) => this._playersCrud.findById(id),
    list: () => this._playersCrud.list(),
    create: (input: PlayerCreateInput) => this._playersCrud.create(input),
    update: (id: string, patch: PlayerPatch) => this._playersCrud.update(id, patch),
    delete: (id: string) => this._playersCrud.delete(id),

    findByUserId: async (userId: string): Promise<Player | null> => {
      const result = await dynamoDb.query({
        TableName: TableNames.PLAYERS,
        IndexName: 'UserIdIndex',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': userId,
        },
      });
      if (!result.Items || result.Items.length === 0) {
        return null;
      }
      return result.Items[0] as Player;
    },
  };

  // ─── Tag Teams (CRUD + listByStatus, listByPlayer) ─────────────

  private _tagTeamsCrud = new DynamoCrudRepository<TagTeam, TagTeamCreateInput, TagTeamPatch>({
    tableName: TableNames.TAG_TEAMS,
    idField: 'tagTeamId',
    entityName: 'TagTeam',
    buildItem: (input: TagTeamCreateInput, id: string, now: string): TagTeam => ({
      tagTeamId: id,
      name: input.name,
      player1Id: input.player1Id,
      player2Id: input.player2Id,
      ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
      status: input.status ?? 'pending_partner',
      wins: 0,
      losses: 0,
      draws: 0,
      createdAt: now,
      updatedAt: now,
    }),
  });

  tagTeams: RosterRepository['tagTeams'] = {
    findById: (id: string) => this._tagTeamsCrud.findById(id),
    list: async (): Promise<TagTeam[]> => {
      const items = await dynamoDb.scanAll({
        TableName: TableNames.TAG_TEAMS,
      });
      const tagTeams = items as unknown as TagTeam[];
      tagTeams.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      return tagTeams;
    },
    create: (input: TagTeamCreateInput) => this._tagTeamsCrud.create(input),
    update: (id: string, patch: TagTeamPatch) => this._tagTeamsCrud.update(id, patch),
    delete: (id: string) => this._tagTeamsCrud.delete(id),

    listByStatus: async (status: TagTeamStatus): Promise<TagTeam[]> => {
      const items = await dynamoDb.queryAll({
        TableName: TableNames.TAG_TEAMS,
        IndexName: 'StatusIndex',
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': status },
      });
      return items as unknown as TagTeam[];
    },

    listByPlayer: async (playerId: string): Promise<TagTeam[]> => {
      const [player1Result, player2Result] = await Promise.all([
        dynamoDb.queryAll({
          TableName: TableNames.TAG_TEAMS,
          IndexName: 'Player1Index',
          KeyConditionExpression: 'player1Id = :pid',
          ExpressionAttributeValues: { ':pid': playerId },
        }),
        dynamoDb.queryAll({
          TableName: TableNames.TAG_TEAMS,
          IndexName: 'Player2Index',
          KeyConditionExpression: 'player2Id = :pid',
          ExpressionAttributeValues: { ':pid': playerId },
        }),
      ]);

      // Deduplicate by tagTeamId
      const seen = new Set<string>();
      const merged: TagTeam[] = [];
      for (const item of [...player1Result, ...player2Result]) {
        const tagTeam = item as unknown as TagTeam;
        if (!seen.has(tagTeam.tagTeamId)) {
          seen.add(tagTeam.tagTeamId);
          merged.push(tagTeam);
        }
      }

      merged.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      return merged;
    },
  };

  // ─── Stables (complex — implemented directly) ──────────────────

  stables: StablesMethods = {
    findById: async (stableId: string): Promise<Stable | null> => {
      const result = await dynamoDb.get({
        TableName: TableNames.STABLES,
        Key: { stableId },
      });
      return (result.Item as Stable | undefined) ?? null;
    },

    list: async (): Promise<Stable[]> => {
      const items = await dynamoDb.scanAll({
        TableName: TableNames.STABLES,
      });
      return items as unknown as Stable[];
    },

    listByStatus: async (status: StableStatus): Promise<Stable[]> => {
      const items = await dynamoDb.queryAll({
        TableName: TableNames.STABLES,
        IndexName: 'StatusIndex',
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': status },
        ScanIndexForward: false,
      });
      return items as unknown as Stable[];
    },

    findByPlayer: async (playerId: string): Promise<Stable | null> => {
      // memberIds is a list attribute; no GSI exists for this lookup,
      // so we scan with a filter using the `contains` function.
      const items = await dynamoDb.scanAll({
        TableName: TableNames.STABLES,
        FilterExpression: 'contains(memberIds, :pid)',
        ExpressionAttributeValues: { ':pid': playerId },
      });
      return (items[0] as unknown as Stable) ?? null;
    },

    create: async (input: StableCreateInput): Promise<Stable> => {
      const now = new Date().toISOString();
      const item: Stable = {
        stableId: uuidv4(),
        name: input.name,
        leaderId: input.leaderId,
        memberIds: input.memberIds,
        imageUrl: input.imageUrl,
        status: input.status ?? 'pending',
        wins: 0,
        losses: 0,
        draws: 0,
        createdAt: now,
        updatedAt: now,
      };
      await dynamoDb.put({ TableName: TableNames.STABLES, Item: item });
      return item;
    },

    update: async (stableId: string, patch: StablePatch): Promise<Stable> => {
      const expr = buildUpdateExpression(patch, new Date().toISOString());
      const result = await dynamoDb
        .update({
          TableName: TableNames.STABLES,
          Key: { stableId },
          UpdateExpression: expr.UpdateExpression,
          ExpressionAttributeNames: expr.ExpressionAttributeNames,
          ExpressionAttributeValues: expr.ExpressionAttributeValues,
          ConditionExpression: 'attribute_exists(stableId)',
          ReturnValues: 'ALL_NEW',
        })
        .catch((err: { name?: string }) => {
          if (err.name === 'ConditionalCheckFailedException') {
            throw new NotFoundError('Stable', stableId);
          }
          throw err;
        });
      return result.Attributes as Stable;
    },

    delete: async (stableId: string): Promise<void> => {
      await dynamoDb.delete({
        TableName: TableNames.STABLES,
        Key: { stableId },
      });
    },

    // ─── Invitations ───────────────────────────────────────────────

    findInvitationById: async (invitationId: string): Promise<StableInvitation | null> => {
      const result = await dynamoDb.get({
        TableName: TableNames.STABLE_INVITATIONS,
        Key: { invitationId },
      });
      return (result.Item as StableInvitation | undefined) ?? null;
    },

    listInvitationsByStable: async (stableId: string): Promise<StableInvitation[]> => {
      const items = await dynamoDb.queryAll({
        TableName: TableNames.STABLE_INVITATIONS,
        IndexName: 'StableIndex',
        KeyConditionExpression: '#stableId = :stableId',
        ExpressionAttributeNames: { '#stableId': 'stableId' },
        ExpressionAttributeValues: { ':stableId': stableId },
        ScanIndexForward: false,
      });
      return items as unknown as StableInvitation[];
    },

    listInvitationsByPlayer: async (playerId: string): Promise<StableInvitation[]> => {
      const items = await dynamoDb.queryAll({
        TableName: TableNames.STABLE_INVITATIONS,
        IndexName: 'InvitedPlayerIndex',
        KeyConditionExpression: 'invitedPlayerId = :pid',
        ExpressionAttributeValues: { ':pid': playerId },
        ScanIndexForward: false,
      });
      return items as unknown as StableInvitation[];
    },

    listPendingInvitationsByPlayer: async (playerId: string): Promise<StableInvitation[]> => {
      const items = await dynamoDb.queryAll({
        TableName: TableNames.STABLE_INVITATIONS,
        IndexName: 'InvitedPlayerIndex',
        KeyConditionExpression: 'invitedPlayerId = :pid',
        FilterExpression: '#status = :pending',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':pid': playerId, ':pending': 'pending' },
        ScanIndexForward: false,
      });
      return items as unknown as StableInvitation[];
    },

    createInvitation: async (input: StableInvitationCreateInput): Promise<StableInvitation> => {
      const now = new Date().toISOString();
      const item: StableInvitation = {
        invitationId: uuidv4(),
        stableId: input.stableId,
        invitedPlayerId: input.invitedPlayerId,
        invitedByPlayerId: input.invitedByPlayerId,
        message: input.message,
        status: 'pending',
        expiresAt: input.expiresAt,
        createdAt: now,
        updatedAt: now,
      };
      await dynamoDb.put({ TableName: TableNames.STABLE_INVITATIONS, Item: item });
      return item;
    },

    updateInvitation: async (
      invitationId: string,
      patch: Partial<StableInvitation>,
    ): Promise<StableInvitation> => {
      const expr = buildUpdateExpression(patch, new Date().toISOString());
      const result = await dynamoDb
        .update({
          TableName: TableNames.STABLE_INVITATIONS,
          Key: { invitationId },
          UpdateExpression: expr.UpdateExpression,
          ExpressionAttributeNames: expr.ExpressionAttributeNames,
          ExpressionAttributeValues: expr.ExpressionAttributeValues,
          ConditionExpression: 'attribute_exists(invitationId)',
          ReturnValues: 'ALL_NEW',
        })
        .catch((err: { name?: string }) => {
          if (err.name === 'ConditionalCheckFailedException') {
            throw new NotFoundError('StableInvitation', invitationId);
          }
          throw err;
        });
      return result.Attributes as StableInvitation;
    },

    deleteInvitation: async (invitationId: string): Promise<void> => {
      await dynamoDb.delete({
        TableName: TableNames.STABLE_INVITATIONS,
        Key: { invitationId },
      });
    },

    deleteInvitationsByStable: async (stableId: string): Promise<void> => {
      const invitations = await this.stables.listInvitationsByStable(stableId);
      for (const inv of invitations) {
        await this.stables.deleteInvitation(inv.invitationId);
      }
    },
  };

  // ─── Overalls (complex — implemented directly) ─────────────────

  overalls: OverallsMethods = {
    findByPlayerId: async (playerId: string): Promise<WrestlerOverall | null> => {
      const result = await dynamoDb.get({
        TableName: TableNames.WRESTLER_OVERALLS,
        Key: { playerId },
      });
      return (result.Item as WrestlerOverall | undefined) ?? null;
    },

    listAll: async (): Promise<WrestlerOverall[]> => {
      const items = await dynamoDb.scanAll({ TableName: TableNames.WRESTLER_OVERALLS });
      return items as unknown as WrestlerOverall[];
    },

    submit: async (input: OverallSubmitInput): Promise<WrestlerOverall> => {
      // Preserve original submittedAt if record already exists
      const existing = await this.overalls.findByPlayerId(input.playerId);
      const now = new Date().toISOString();

      const item: WrestlerOverall = {
        playerId: input.playerId,
        mainOverall: input.mainOverall,
        updatedAt: now,
        submittedAt: existing?.submittedAt ?? now,
      };

      if (input.alternateOverall !== undefined) {
        item.alternateOverall = input.alternateOverall;
      }

      await dynamoDb.put({
        TableName: TableNames.WRESTLER_OVERALLS,
        Item: item,
      });

      return item;
    },
  };

  // ─── Transfers (complex — implemented directly) ────────────────

  transfers: TransfersMethods = {
    findById: async (requestId: string): Promise<TransferRequest | null> => {
      const result = await dynamoDb.get({
        TableName: TableNames.TRANSFER_REQUESTS,
        Key: { requestId },
      });
      return (result.Item as TransferRequest | undefined) ?? null;
    },

    list: async (): Promise<TransferRequest[]> => {
      const result = await dynamoDb.scanAll({
        TableName: TableNames.TRANSFER_REQUESTS,
      });
      const items = result as unknown as TransferRequest[];
      items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return items;
    },

    listByStatus: async (status: string): Promise<TransferRequest[]> => {
      const result = await dynamoDb.queryAll({
        TableName: TableNames.TRANSFER_REQUESTS,
        IndexName: 'StatusIndex',
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': status },
      });
      const items = result as unknown as TransferRequest[];
      items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return items;
    },

    listByPlayer: async (playerId: string): Promise<TransferRequest[]> => {
      const result = await dynamoDb.queryAll({
        TableName: TableNames.TRANSFER_REQUESTS,
        IndexName: 'PlayerTransfersIndex',
        KeyConditionExpression: 'playerId = :playerId',
        ExpressionAttributeValues: { ':playerId': playerId },
      });
      const items = result as unknown as TransferRequest[];
      items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return items;
    },

    listPendingByPlayer: async (playerId: string): Promise<TransferRequest[]> => {
      const result = await dynamoDb.queryAll({
        TableName: TableNames.TRANSFER_REQUESTS,
        IndexName: 'PlayerTransfersIndex',
        KeyConditionExpression: 'playerId = :playerId',
        FilterExpression: '#status = :pending',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':playerId': playerId,
          ':pending': 'pending',
        },
      });
      return result as unknown as TransferRequest[];
    },

    create: async (input: TransferCreateInput): Promise<TransferRequest> => {
      const now = new Date().toISOString();
      const item: TransferRequest = {
        requestId: uuidv4(),
        playerId: input.playerId,
        fromDivisionId: input.fromDivisionId,
        toDivisionId: input.toDivisionId,
        reason: input.reason,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      };
      await dynamoDb.put({
        TableName: TableNames.TRANSFER_REQUESTS,
        Item: item,
      });
      return item;
    },

    review: async (
      requestId: string,
      input: TransferReviewInput,
    ): Promise<TransferRequest> => {
      const existing = await this.transfers.findById(requestId);
      if (!existing) throw new NotFoundError('TransferRequest', requestId);

      const now = new Date().toISOString();

      const updateExpr: string[] = [
        '#status = :status',
        'updatedAt = :updatedAt',
        'reviewedBy = :reviewedBy',
      ];
      const attrNames: Record<string, string> = { '#status': 'status' };
      const attrValues: Record<string, unknown> = {
        ':status': input.status,
        ':updatedAt': now,
        ':reviewedBy': input.reviewedBy,
      };

      if (input.reviewNote) {
        updateExpr.push('reviewNote = :reviewNote');
        attrValues[':reviewNote'] = input.reviewNote;
      }

      const result = await dynamoDb.update({
        TableName: TableNames.TRANSFER_REQUESTS,
        Key: { requestId },
        UpdateExpression: `SET ${updateExpr.join(', ')}`,
        ExpressionAttributeNames: attrNames,
        ExpressionAttributeValues: attrValues,
        ReturnValues: 'ALL_NEW',
      });

      return result.Attributes as TransferRequest;
    },
  };

  // ─── Wrestlers (CRUD + queries + bulkCreate) ───────────────────
  //
  // On-disk storage uses `isInUse` as a string ('true'/'false') so it can
  // be used as a GSI hash key on AvailabilityIndex. The repository exposes
  // it as a native boolean. All read paths convert string→boolean, and
  // writes serialize boolean→string.

  private wrestlerFromItem(raw: Record<string, unknown>): Wrestler {
    const { isInUse, ...rest } = raw as Record<string, unknown> & { isInUse?: unknown };
    return {
      ...(rest as unknown as Omit<Wrestler, 'isInUse'>),
      isInUse: isInUse === 'true' || isInUse === true,
    };
  }

  private validateWrestlerInput(
    input: WrestlerCreateInput,
  ): { ok: true } | { ok: false; reason: string } {
    if (
      typeof input.promotion !== 'string' ||
      !(WRESTLER_PROMOTIONS as readonly string[]).includes(input.promotion)
    ) {
      return {
        ok: false,
        reason: `promotion must be one of: ${WRESTLER_PROMOTIONS.join(', ')}`,
      };
    }
    if (
      typeof input.name !== 'string' ||
      input.name.trim().length === 0 ||
      input.name.length > 128
    ) {
      return {
        ok: false,
        reason: 'name must be a non-empty string up to 128 chars',
      };
    }
    if (
      typeof input.overallCap !== 'number' ||
      !Number.isInteger(input.overallCap) ||
      input.overallCap < OVERALL_CAP_MIN ||
      input.overallCap > OVERALL_CAP_MAX
    ) {
      return {
        ok: false,
        reason: `overallCap must be an integer between ${OVERALL_CAP_MIN} and ${OVERALL_CAP_MAX}`,
      };
    }
    return { ok: true };
  }

  wrestlers: WrestlersMethods = {
    findById: async (wrestlerId: string): Promise<Wrestler | null> => {
      const result = await dynamoDb.get({
        TableName: TableNames.WRESTLERS,
        Key: { wrestlerId },
      });
      if (!result.Item) return null;
      return this.wrestlerFromItem(result.Item as Record<string, unknown>);
    },

    list: async (): Promise<Wrestler[]> => {
      const items = await dynamoDb.scanAll({ TableName: TableNames.WRESTLERS });
      const wrestlers = items.map((i) => this.wrestlerFromItem(i));
      wrestlers.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      return wrestlers;
    },

    create: async (input: WrestlerCreateInput): Promise<Wrestler> => {
      const now = new Date().toISOString();
      const wrestlerId = uuidv4();
      const item = {
        wrestlerId,
        promotion: input.promotion,
        name: input.name,
        overallCap: input.overallCap,
        // stored as string for GSI compatibility
        isInUse: 'false',
        createdAt: now,
        updatedAt: now,
      };
      await dynamoDb.put({
        TableName: TableNames.WRESTLERS,
        Item: item,
      });
      return this.wrestlerFromItem(item);
    },

    update: async (wrestlerId: string, patch): Promise<Wrestler> => {
      // Serialize isInUse to string for on-disk storage.
      const storedPatch: Record<string, unknown> = { ...patch };
      if (typeof patch.isInUse === 'boolean') {
        storedPatch.isInUse = patch.isInUse ? 'true' : 'false';
      }
      const expr = buildUpdateExpression(storedPatch, new Date().toISOString());
      const result = await dynamoDb
        .update({
          TableName: TableNames.WRESTLERS,
          Key: { wrestlerId },
          UpdateExpression: expr.UpdateExpression,
          ExpressionAttributeNames: expr.ExpressionAttributeNames,
          ExpressionAttributeValues: expr.ExpressionAttributeValues,
          ConditionExpression: 'attribute_exists(wrestlerId)',
          ReturnValues: 'ALL_NEW',
        })
        .catch((err: { name?: string }) => {
          if (err.name === 'ConditionalCheckFailedException') {
            throw new NotFoundError('Wrestler', wrestlerId);
          }
          throw err;
        });
      return this.wrestlerFromItem(result.Attributes as Record<string, unknown>);
    },

    delete: async (wrestlerId: string): Promise<void> => {
      await dynamoDb.delete({
        TableName: TableNames.WRESTLERS,
        Key: { wrestlerId },
      });
    },

    listByPromotion: async (promotion: WrestlerPromotion): Promise<Wrestler[]> => {
      const items = await dynamoDb.queryAll({
        TableName: TableNames.WRESTLERS,
        IndexName: 'PromotionIndex',
        KeyConditionExpression: '#promotion = :promotion',
        ExpressionAttributeNames: { '#promotion': 'promotion' },
        ExpressionAttributeValues: { ':promotion': promotion },
      });
      const wrestlers = items.map((i) => this.wrestlerFromItem(i));
      wrestlers.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      return wrestlers;
    },

    listAvailable: async (): Promise<Wrestler[]> => {
      const items = await dynamoDb.queryAll({
        TableName: TableNames.WRESTLERS,
        IndexName: 'AvailabilityIndex',
        KeyConditionExpression: '#isInUse = :false',
        ExpressionAttributeNames: { '#isInUse': 'isInUse' },
        ExpressionAttributeValues: { ':false': 'false' },
      });
      const wrestlers = items.map((i) => this.wrestlerFromItem(i));
      wrestlers.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      return wrestlers;
    },

    findByName: async (
      promotion: WrestlerPromotion,
      name: string,
    ): Promise<Wrestler | null> => {
      const items = await dynamoDb.queryAll({
        TableName: TableNames.WRESTLERS,
        IndexName: 'PromotionIndex',
        KeyConditionExpression: '#promotion = :promotion',
        ExpressionAttributeNames: { '#promotion': 'promotion' },
        ExpressionAttributeValues: { ':promotion': promotion },
      });
      const target = name.toLowerCase();
      const match = items
        .map((i) => this.wrestlerFromItem(i))
        .find((w) => w.name.toLowerCase() === target);
      return match ?? null;
    },

    bulkCreate: async (
      inputs: WrestlerCreateInput[],
    ): Promise<WrestlerImportResult> => {
      const result: WrestlerImportResult = {
        created: 0,
        skipped: 0,
        errors: [],
      };

      // Track dedupes within the current payload by (promotion, lowercased name).
      const seenInPayload = new Set<string>();

      for (let row = 0; row < inputs.length; row++) {
        const input = inputs[row];
        const validation = this.validateWrestlerInput(input);
        if (!validation.ok) {
          result.errors.push({ row, reason: validation.reason });
          continue;
        }

        const key = `${input.promotion}::${input.name.toLowerCase()}`;
        if (seenInPayload.has(key)) {
          result.skipped += 1;
          result.errors.push({
            row,
            reason: 'duplicate within payload (same promotion + name, case-insensitive)',
          });
          continue;
        }

        // Check against existing records.
        const existing = await this.wrestlers.findByName(input.promotion, input.name);
        if (existing) {
          result.skipped += 1;
          result.errors.push({
            row,
            reason: 'a wrestler with this promotion + name already exists',
          });
          continue;
        }

        seenInPayload.add(key);
        await this.wrestlers.create(input);
        result.created += 1;
      }

      return result;
    },
  };
}
