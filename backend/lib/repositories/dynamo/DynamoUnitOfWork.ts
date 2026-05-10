import { TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import { dynamoDb, TableNames } from '../../dynamodb';
import type { UnitOfWork, RecordDelta } from '../unitOfWork';
import type { FactionMessage, FactionDirectMessage } from '../factionMessages';

interface TransactWriteItem {
  Put?: { TableName: string; Item: Record<string, unknown>; ConditionExpression?: string };
  Update?: {
    TableName: string;
    Key: Record<string, unknown>;
    UpdateExpression: string;
    ExpressionAttributeNames?: Record<string, string>;
    ExpressionAttributeValues?: Record<string, unknown>;
    ConditionExpression?: string;
  };
  Delete?: { TableName: string; Key: Record<string, unknown> };
}

export class DynamoUnitOfWork implements UnitOfWork {
  private staged: TransactWriteItem[] = [];
  private committed = false;

  // ── Players ──────────────────────────────────────────────────────
  updatePlayer(playerId: string, patch: Record<string, unknown>): void {
    const now = new Date().toISOString();
    const sets: string[] = ['#fUpdatedAt = :updatedAt'];
    const removes: string[] = [];
    const names: Record<string, string> = { '#fUpdatedAt': 'updatedAt' };
    const values: Record<string, unknown> = { ':updatedAt': now };
    let i = 0;
    for (const [key, val] of Object.entries(patch)) {
      const nameKey = `#f${i}`;
      names[nameKey] = key;
      if (val === undefined || val === null) {
        // Clear the attribute instead of storing a DynamoDB NULL — matches
        // the semantics of `buildUpdateExpression` used by the non-tx repo
        // `players.update()` path, so both paths produce identical items.
        removes.push(nameKey);
      } else {
        const valKey = `:v${i}`;
        values[valKey] = val;
        sets.push(`${nameKey} = ${valKey}`);
      }
      i++;
    }
    let expr = `SET ${sets.join(', ')}`;
    if (removes.length > 0) {
      expr += ` REMOVE ${removes.join(', ')}`;
    }
    this.staged.push({
      Update: {
        TableName: TableNames.PLAYERS,
        Key: { playerId },
        UpdateExpression: expr,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      },
    });
  }

  incrementPlayerRecord(playerId: string, delta: RecordDelta): void {
    const parts: string[] = [];
    const values: Record<string, unknown> = { ':timestamp': new Date().toISOString() };
    if (delta.wins) {
      parts.push(`wins = if_not_exists(wins, :zero) + :dw`);
      values[':dw'] = delta.wins;
      values[':zero'] = 0;
    }
    if (delta.losses) {
      parts.push(`losses = if_not_exists(losses, :zero) + :dl`);
      values[':dl'] = delta.losses;
      if (!values[':zero']) values[':zero'] = 0;
    }
    if (delta.draws) {
      parts.push(`draws = if_not_exists(draws, :zero) + :dd`);
      values[':dd'] = delta.draws;
      if (!values[':zero']) values[':zero'] = 0;
    }
    parts.push('updatedAt = :timestamp');
    this.staged.push({
      Update: {
        TableName: TableNames.PLAYERS,
        Key: { playerId },
        UpdateExpression: `SET ${parts.join(', ')}`,
        ExpressionAttributeValues: values,
      },
    });
  }

  clearPlayerField(playerId: string, field: string): void {
    this.staged.push({
      Update: {
        TableName: TableNames.PLAYERS,
        Key: { playerId },
        UpdateExpression: `REMOVE #field SET updatedAt = :now`,
        ExpressionAttributeNames: { '#field': field },
        ExpressionAttributeValues: { ':now': new Date().toISOString() },
      },
    });
  }

  setPlayerTagTeamId(playerId: string, tagTeamId: string): void {
    const now = new Date().toISOString();
    this.staged.push({
      Update: {
        TableName: TableNames.PLAYERS,
        Key: { playerId },
        UpdateExpression: 'SET #tagTeamId = :tagTeamId, #updatedAt = :updatedAt',
        ConditionExpression: 'attribute_not_exists(#tagTeamId) OR #tagTeamId = :null',
        ExpressionAttributeNames: { '#tagTeamId': 'tagTeamId', '#updatedAt': 'updatedAt' },
        ExpressionAttributeValues: { ':tagTeamId': tagTeamId, ':updatedAt': now, ':null': null },
      },
    });
  }

  // ── Tag Teams ────────────────────────────────────────────────────
  updateTagTeam(tagTeamId: string, patch: Record<string, unknown>): void {
    const now = new Date().toISOString();
    const sets: string[] = [];
    const names: Record<string, string> = {};
    const values: Record<string, unknown> = {};
    let i = 0;
    for (const [key, val] of Object.entries(patch)) {
      const nameKey = `#f${i}`;
      const valKey = `:v${i}`;
      names[nameKey] = key;
      values[valKey] = val;
      sets.push(`${nameKey} = ${valKey}`);
      i++;
    }
    names[`#f${i}`] = 'updatedAt';
    values[`:v${i}`] = now;
    sets.push(`#f${i} = :v${i}`);
    this.staged.push({
      Update: {
        TableName: TableNames.TAG_TEAMS,
        Key: { tagTeamId },
        UpdateExpression: `SET ${sets.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      },
    });
  }

  deleteTagTeam(tagTeamId: string): void {
    this.staged.push({
      Delete: { TableName: TableNames.TAG_TEAMS, Key: { tagTeamId } },
    });
  }

  // ── Championships ────────────────────────────────────────────────
  updateChampionship(championshipId: string, patch: Record<string, unknown>): void {
    const now = new Date().toISOString();
    const sets: string[] = [];
    const names: Record<string, string> = {};
    const values: Record<string, unknown> = {};
    let i = 0;
    for (const [key, val] of Object.entries(patch)) {
      const nameKey = `#f${i}`;
      const valKey = `:v${i}`;
      names[nameKey] = key;
      values[valKey] = val;
      sets.push(`${nameKey} = ${valKey}`);
      i++;
    }
    names[`#f${i}`] = 'updatedAt';
    values[`:v${i}`] = now;
    sets.push(`#f${i} = :v${i}`);
    this.staged.push({
      Update: {
        TableName: TableNames.CHAMPIONSHIPS,
        Key: { championshipId },
        UpdateExpression: `SET ${sets.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      },
    });
  }

  removeChampion(championshipId: string): void {
    this.staged.push({
      Update: {
        TableName: TableNames.CHAMPIONSHIPS,
        Key: { championshipId },
        UpdateExpression: 'REMOVE currentChampion SET updatedAt = :now, version = if_not_exists(version, :zero) + :one',
        ExpressionAttributeValues: { ':now': new Date().toISOString(), ':zero': 0, ':one': 1 },
      },
    });
  }

  closeReign(championshipId: string, wonDate: string, lostDate: string, daysHeld: number): void {
    this.staged.push({
      Update: {
        TableName: TableNames.CHAMPIONSHIP_HISTORY,
        Key: { championshipId, wonDate },
        UpdateExpression: 'SET lostDate = :lostDate, daysHeld = :daysHeld',
        ExpressionAttributeValues: { ':lostDate': lostDate, ':daysHeld': daysHeld },
      },
    });
  }

  startReign(entry: Record<string, unknown>): void {
    this.staged.push({
      Put: { TableName: TableNames.CHAMPIONSHIP_HISTORY, Item: entry },
    });
  }

  incrementDefenses(championshipId: string, wonDate: string): void {
    this.staged.push({
      Update: {
        TableName: TableNames.CHAMPIONSHIP_HISTORY,
        Key: { championshipId, wonDate },
        UpdateExpression: 'SET defenses = if_not_exists(defenses, :zero) + :one, updatedAt = :now',
        ExpressionAttributeValues: { ':zero': 0, ':one': 1, ':now': new Date().toISOString() },
      },
    });
  }

  // ── Challenges ───────────────────────────────────────────────────
  updateChallenge(challengeId: string, patch: Record<string, unknown>): void {
    const now = new Date().toISOString();
    const sets: string[] = [];
    const names: Record<string, string> = {};
    const values: Record<string, unknown> = {};
    let i = 0;
    for (const [key, val] of Object.entries(patch)) {
      if (key === 'status') {
        names['#s'] = 'status';
        values[`:v${i}`] = val;
        sets.push(`#s = :v${i}`);
      } else {
        const nameKey = `#f${i}`;
        names[nameKey] = key;
        values[`:v${i}`] = val;
        sets.push(`${nameKey} = :v${i}`);
      }
      i++;
    }
    names[`#f${i}`] = 'updatedAt';
    values[`:v${i}`] = now;
    sets.push(`#f${i} = :v${i}`);
    this.staged.push({
      Update: {
        TableName: TableNames.CHALLENGES,
        Key: { challengeId },
        UpdateExpression: `SET ${sets.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      },
    });
  }

  createChallenge(challenge: Record<string, unknown>): void {
    this.staged.push({
      Put: { TableName: TableNames.CHALLENGES, Item: challenge },
    });
  }

  // ── Season Standings ─────────────────────────────────────────────
  incrementStanding(seasonId: string, playerId: string, delta: RecordDelta): void {
    const parts: string[] = [];
    const values: Record<string, unknown> = { ':timestamp': new Date().toISOString() };
    if (delta.wins) {
      parts.push(`wins = if_not_exists(wins, :zero) + :dw`);
      values[':dw'] = delta.wins;
      values[':zero'] = 0;
    }
    if (delta.losses) {
      parts.push(`losses = if_not_exists(losses, :zero) + :dl`);
      values[':dl'] = delta.losses;
      if (!values[':zero']) values[':zero'] = 0;
    }
    if (delta.draws) {
      parts.push(`draws = if_not_exists(draws, :zero) + :dd`);
      values[':dd'] = delta.draws;
      if (!values[':zero']) values[':zero'] = 0;
    }
    parts.push('updatedAt = :timestamp');
    this.staged.push({
      Update: {
        TableName: TableNames.SEASON_STANDINGS,
        Key: { seasonId, playerId },
        UpdateExpression: `SET ${parts.join(', ')}`,
        ExpressionAttributeValues: values,
      },
    });
  }

  // ── Wrestlers ────────────────────────────────────────────────────
  //
  // `isInUse` is persisted as string "true"/"false" because DynamoDB GSI keys
  // cannot be Boolean; the repository boundary converts back to boolean on
  // read. See DynamoRosterRepository wrestlers.* for the read path.
  assignWrestlerToPlayer(params: {
    wrestlerId: string;
    playerId: string;
    slot: 'primary' | 'alternate';
  }): void {
    const now = new Date().toISOString();
    this.staged.push({
      Update: {
        TableName: TableNames.WRESTLERS,
        Key: { wrestlerId: params.wrestlerId },
        UpdateExpression:
          'SET isInUse = :isInUse, assignedPlayerId = :playerId, assignedSlot = :slot, updatedAt = :now',
        ExpressionAttributeValues: {
          ':isInUse': 'true',
          ':playerId': params.playerId,
          ':slot': params.slot,
          ':now': now,
        },
      },
    });
  }

  releaseWrestlerFromPlayer(params: { wrestlerId: string }): void {
    const now = new Date().toISOString();
    this.staged.push({
      Update: {
        TableName: TableNames.WRESTLERS,
        Key: { wrestlerId: params.wrestlerId },
        UpdateExpression:
          'SET isInUse = :isInUse, updatedAt = :now REMOVE assignedPlayerId, assignedSlot',
        ExpressionAttributeValues: { ':isInUse': 'false', ':now': now },
      },
    });
  }

  // ── Matches ──────────────────────────────────────────────────────
  updateMatch(matchId: string, date: string, patch: Record<string, unknown>): void {
    const now = new Date().toISOString();
    const sets: string[] = [];
    const names: Record<string, string> = {};
    const values: Record<string, unknown> = {};
    let i = 0;
    for (const [key, val] of Object.entries(patch)) {
      if (key === 'status') {
        names['#s'] = 'status';
        values[`:v${i}`] = val;
        sets.push(`#s = :v${i}`);
      } else {
        const nameKey = `#f${i}`;
        names[nameKey] = key;
        values[`:v${i}`] = val;
        sets.push(`${nameKey} = :v${i}`);
      }
      i++;
    }
    names[`#f${i}`] = 'updatedAt';
    values[`:v${i}`] = now;
    sets.push(`#f${i} = :v${i}`);
    this.staged.push({
      Update: {
        TableName: TableNames.MATCHES,
        Key: { matchId, date },
        UpdateExpression: `SET ${sets.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      },
    });
  }

  // ── Faction messaging ────────────────────────────────────────────
  appendFactionMessage(message: FactionMessage): void {
    this.staged.push({
      Put: {
        TableName: TableNames.FACTION_MESSAGES,
        Item: {
          factionId: message.factionId,
          createdAtMessageId: `${message.createdAt}#${message.messageId}`,
          messageId: message.messageId,
          authorPlayerId: message.authorPlayerId,
          body: message.body,
          messageType: message.messageType,
          createdAt: message.createdAt,
        },
      },
    });
  }

  appendFactionDirectMessage(message: FactionDirectMessage): void {
    this.staged.push({
      Put: {
        TableName: TableNames.FACTION_DIRECT_MESSAGES,
        Item: {
          factionThreadKey: `${message.factionId}#${message.threadKey}`,
          createdAtMessageId: `${message.createdAt}#${message.messageId}`,
          factionId: message.factionId,
          threadKey: message.threadKey,
          messageId: message.messageId,
          senderPlayerId: message.senderPlayerId,
          recipientPlayerId: message.recipientPlayerId,
          body: message.body,
          createdAt: message.createdAt,
        },
      },
    });
  }

  // ── Commit / Rollback ────────────────────────────────────────────
  async commit(): Promise<void> {
    if (this.committed) throw new Error('UnitOfWork already committed');
    this.committed = true;

    if (this.staged.length === 0) return;

    // Chunk into ≤100-item batches (DynamoDB TransactWriteItems limit)
    const CHUNK_SIZE = 100;
    for (let i = 0; i < this.staged.length; i += CHUNK_SIZE) {
      const chunk = this.staged.slice(i, i + CHUNK_SIZE);
      if (chunk.length > CHUNK_SIZE) {
        console.warn(`UoW: chunking ${this.staged.length} items into ${Math.ceil(this.staged.length / CHUNK_SIZE)} transactions — NOT globally atomic`);
      }
      await dynamoDb.transactWrite({ TransactItems: chunk } as TransactWriteCommandInput);
    }
  }

  rollback(): Promise<void> {
    this.staged = [];
    this.committed = true;
    return Promise.resolve();
  }
}

export function createDynamoUnitOfWorkFactory(): <T>(fn: (tx: UnitOfWork) => Promise<T>) => Promise<T> {
  return async <T>(fn: (tx: UnitOfWork) => Promise<T>): Promise<T> => {
    const uow = new DynamoUnitOfWork();
    try {
      const result = await fn(uow);
      await uow.commit();
      return result;
    } catch (err) {
      await uow.rollback();
      throw err;
    }
  };
}
