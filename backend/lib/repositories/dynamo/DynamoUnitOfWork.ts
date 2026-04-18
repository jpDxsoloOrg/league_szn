import { TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import { dynamoDb, TableNames } from '../../dynamodb';
import type { UnitOfWork, RecordDelta } from '../unitOfWork';

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
    const sets: string[] = ['updatedAt = :updatedAt'];
    const names: Record<string, string> = {};
    const values: Record<string, unknown> = { ':updatedAt': now };
    let i = 0;
    for (const [key, val] of Object.entries(patch)) {
      const nameKey = `#f${i}`;
      const valKey = `:v${i}`;
      names[nameKey] = key;
      values[valKey] = val;
      sets.push(`${nameKey} = ${valKey}`);
      i++;
    }
    this.staged.push({
      Update: {
        TableName: TableNames.PLAYERS,
        Key: { playerId },
        UpdateExpression: `SET ${sets.join(', ')}`,
        ExpressionAttributeNames: Object.keys(names).length > 0 ? names : undefined,
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
