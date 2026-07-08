import { TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import { dynamoDb, TableNames } from '../../dynamodb';
import type { UnitOfWork, RecordDelta } from '../unitOfWork';
import type { FactionMessage, FactionDirectMessage } from '../factionMessages';
import {
  participantSk,
  RIVALRY_META_SK,
  type Rivalry,
  type RivalryMessage,
  type RivalryNote,
  type RivalryParticipant,
  type RivalryPatch,
} from '../rivalries';
import { RatingAlreadyExistsError } from '../matchRatings';

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
  // Sidecar metadata mirroring `staged`. Lets us map a generic
  // ConditionalCheckFailed (which DynamoDB does NOT tag with the failing
  // table) back to a typed domain error like `RatingAlreadyExistsError`.
  private stagedMeta: Array<{ kind?: 'matchRating'; matchId?: string; userId?: string } | undefined> = [];
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
  //
  // Both operations require the wrestler row to exist: DynamoDB Updates are
  // upserts, and an unconditioned assign/release against a deleted wrestlerId
  // creates a ghost row ({wrestlerId, isInUse, updatedAt} only) that crashes
  // roster dropdowns in the frontend. Callers must verify existence first
  // (resolveWrestlerForAssignment / filterExistingWrestlerIds); the condition
  // turns the remaining delete race into a failed transaction instead of a
  // silent ghost.
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
        ConditionExpression: 'attribute_exists(wrestlerId)',
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
        ConditionExpression: 'attribute_exists(wrestlerId)',
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

  // ── Rivalries (RIV-01) ───────────────────────────────────────────
  createRivalry(rivalry: Rivalry): void {
    this.staged.push({
      Put: {
        TableName: TableNames.RIVALRIES,
        Item: {
          rivalryId: rivalry.rivalryId,
          recordType: RIVALRY_META_SK,
          title: rivalry.title,
          ...(rivalry.description !== undefined && { description: rivalry.description }),
          status: rivalry.status,
          heat: rivalry.heat,
          requestedBy: rivalry.requestedBy,
          ...(rivalry.moderatedBy !== undefined && { moderatedBy: rivalry.moderatedBy }),
          ...(rivalry.moderationNote !== undefined && { moderationNote: rivalry.moderationNote }),
          ...(rivalry.startedAt !== undefined && { startedAt: rivalry.startedAt }),
          ...(rivalry.endedAt !== undefined && { endedAt: rivalry.endedAt }),
          createdAt: rivalry.createdAt,
          updatedAt: rivalry.updatedAt,
        },
      },
    });
    for (const participant of rivalry.participants) {
      this.addRivalryParticipant(rivalry.rivalryId, participant);
    }
  }

  updateRivalry(rivalryId: string, patch: RivalryPatch): void {
    const now = new Date().toISOString();
    const sets: string[] = ['#updatedAt = :now'];
    const names: Record<string, string> = { '#updatedAt': 'updatedAt' };
    const values: Record<string, unknown> = { ':now': now };
    let i = 0;
    for (const [key, val] of Object.entries(patch)) {
      if (val === undefined) continue;
      const nameKey = `#f${i}`;
      const valKey = `:v${i}`;
      names[nameKey] = key;
      values[valKey] = val;
      sets.push(`${nameKey} = ${valKey}`);
      i++;
    }
    this.staged.push({
      Update: {
        TableName: TableNames.RIVALRIES,
        Key: { rivalryId, recordType: RIVALRY_META_SK },
        UpdateExpression: `SET ${sets.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      },
    });
  }

  addRivalryParticipant(rivalryId: string, participant: RivalryParticipant): void {
    this.staged.push({
      Put: {
        TableName: TableNames.RIVALRIES,
        Item: {
          rivalryId,
          recordType: participantSk(participant.playerId),
          participantId: participant.playerId,
          role: participant.role,
          addedAt: participant.addedAt,
        },
      },
    });
  }

  removeRivalryParticipant(rivalryId: string, playerId: string): void {
    this.staged.push({
      Delete: {
        TableName: TableNames.RIVALRIES,
        Key: { rivalryId, recordType: participantSk(playerId) },
      },
    });
  }

  appendRivalryMessage(message: RivalryMessage): void {
    this.staged.push({
      Put: {
        TableName: TableNames.RIVALRY_MESSAGES,
        Item: {
          rivalryId: message.rivalryId,
          createdAtMessageId: `${message.createdAt}#${message.messageId}`,
          messageId: message.messageId,
          authorPlayerId: message.authorPlayerId,
          body: message.body,
          audience: message.audience,
          createdAt: message.createdAt,
        },
      },
    });
  }

  createRivalryNote(note: RivalryNote): void {
    this.staged.push({
      Put: {
        TableName: TableNames.RIVALRY_NOTES,
        Item: {
          rivalryId: note.rivalryId,
          noteId: note.noteId,
          noteType: note.noteType,
          visibility: note.visibility,
          body: note.body,
          authorPlayerId: note.authorPlayerId,
          createdAt: note.createdAt,
          updatedAt: note.updatedAt,
        },
      },
    });
  }

  deleteRivalry(rivalryId: string, participantPlayerIds: string[]): void {
    this.staged.push({
      Delete: {
        TableName: TableNames.RIVALRIES,
        Key: { rivalryId, recordType: RIVALRY_META_SK },
      },
    });
    for (const playerId of participantPlayerIds) {
      this.staged.push({
        Delete: {
          TableName: TableNames.RIVALRIES,
          Key: { rivalryId, recordType: participantSk(playerId) },
        },
      });
    }
  }

  deleteRivalryMessage(message: RivalryMessage): void {
    this.staged.push({
      Delete: {
        TableName: TableNames.RIVALRY_MESSAGES,
        Key: {
          rivalryId: message.rivalryId,
          createdAtMessageId: `${message.createdAt}#${message.messageId}`,
        },
      },
    });
  }

  deleteRivalryNote(note: RivalryNote): void {
    this.staged.push({
      Delete: {
        TableName: TableNames.RIVALRY_NOTES,
        Key: { rivalryId: note.rivalryId, noteId: note.noteId },
      },
    });
  }

  // ── Match ratings (RIV-20) ───────────────────────────────────────
  createMatchRating(input: { matchId: string; userId: string; rating: number }): void {
    const item: Record<string, unknown> = {
      matchId: input.matchId,
      userId: input.userId,
      rating: input.rating,
      createdAt: new Date().toISOString(),
    };
    this.staged.push({
      Put: {
        TableName: TableNames.MATCH_RATINGS,
        Item: item,
        // Composite-key uniqueness: with a (matchId, userId) row, the
        // attribute_not_exists guard on the hash key is sufficient — Dynamo
        // applies it scoped to that exact key, so the write only succeeds
        // when no row for that pair is present.
        ConditionExpression: 'attribute_not_exists(matchId)',
      },
    });
    this.stagedMeta.push({
      kind: 'matchRating',
      matchId: input.matchId,
      userId: input.userId,
    });
  }

  // ── Commit / Rollback ────────────────────────────────────────────
  async commit(): Promise<void> {
    if (this.committed) throw new Error('UnitOfWork already committed');
    this.committed = true;

    if (this.staged.length === 0) return;

    // Pad stagedMeta so it stays index-aligned with staged. Helpers above
    // only push meta on the createMatchRating path; everything else needs
    // an `undefined` placeholder.
    while (this.stagedMeta.length < this.staged.length) {
      this.stagedMeta.push(undefined);
    }

    // Chunk into ≤100-item batches (DynamoDB TransactWriteItems limit)
    const CHUNK_SIZE = 100;
    for (let i = 0; i < this.staged.length; i += CHUNK_SIZE) {
      const chunk = this.staged.slice(i, i + CHUNK_SIZE);
      const chunkMeta = this.stagedMeta.slice(i, i + CHUNK_SIZE);
      if (chunk.length > CHUNK_SIZE) {
        console.warn(`UoW: chunking ${this.staged.length} items into ${Math.ceil(this.staged.length / CHUNK_SIZE)} transactions — NOT globally atomic`);
      }
      try {
        await dynamoDb.transactWrite({ TransactItems: chunk } as TransactWriteCommandInput);
      } catch (err: unknown) {
        // DynamoDB returns TransactionCanceledException with a
        // CancellationReasons array; the entry index lines up with the
        // staged item that tripped the condition.
        const failedIdx = extractConditionalFailureIndex(err);
        if (failedIdx >= 0) {
          const meta = chunkMeta[failedIdx];
          if (meta?.kind === 'matchRating' && meta.matchId && meta.userId) {
            throw new RatingAlreadyExistsError(meta.matchId, meta.userId);
          }
        }
        throw err;
      }
    }
  }

  rollback(): Promise<void> {
    this.staged = [];
    this.stagedMeta = [];
    this.committed = true;
    return Promise.resolve();
  }
}

function extractConditionalFailureIndex(err: unknown): number {
  if (!err || typeof err !== 'object') return -1;
  const e = err as { name?: unknown; CancellationReasons?: unknown };
  if (e.name !== 'TransactionCanceledException') return -1;
  if (!Array.isArray(e.CancellationReasons)) return -1;
  for (let i = 0; i < e.CancellationReasons.length; i++) {
    const reason = e.CancellationReasons[i] as { Code?: unknown } | null | undefined;
    if (reason && reason.Code === 'ConditionalCheckFailed') return i;
  }
  return -1;
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
