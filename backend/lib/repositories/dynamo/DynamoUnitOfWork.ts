import { TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import { dynamoDb, TableNames } from '../../dynamodb';
import type {
  UnitOfWork,
  RecordDelta,
  MatchWriteCondition,
  PlayerWriteCondition,
  DivisionWriteCondition,
  ProgressionConsiderationSeed,
} from '../unitOfWork';
import type { DivisionPatch } from '../LeagueOpsRepository';
import type { ChallengeStatus, PlayerProgression, ProgressionConsideration, ProgressionEvent, TagTeam } from '../types';
import type { Contract, ContractPatch, ContractStatus } from '../types';
import { buildContractUpdate } from './contractRows';
import type { GmInterferenceRequest, GmInterferenceResolution } from '../gmInterference'; // ECO-09
// INJ-03
import {
  InvalidInjuryWriteError,
  injuryRowId,
  validateInjury,
  validateInjuryPatch,
  validatePlayerConditionPatch,
  type Injury,
  type InjuryPatch,
  type PlayerConditionGuard,
  type PlayerConditionPatch,
} from '../injuries';
import {
  buildClearConsiderationUpdate,
  buildSetConsiderationUpdate,
  buildUpsertProgressionUpdate,
  toProgressionEventItem,
} from './progressionRows';
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
import { ConcurrencyError, NotFoundError } from '../errors';
import {
  buildLedgerEntries,
  collectAppendedEffects,
  DuplicatePostingError,
  InvalidLedgerPostingError,
  ledgerSortKey,
  validateLedgerPosting,
  type LedgerIdempotencyRecord,
  type PostLedgerEntryInput,
  type StagedLedgerEntry,
} from '../ledger';
import { v4 as uuidv4 } from 'uuid';

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

type StagedMeta =
  | { kind: 'matchRating'; matchId: string; userId: string }
  | { kind: 'guarded'; entityName: string; id: string }
  | { kind: 'ledgerIdempotency'; idempotencyKey: string };

interface StagedLedgerPosting {
  input: PostLedgerEntryInput;
  staged: StagedLedgerEntry;
}

/** A transaction holds at most 100 items; ledger writes must fit in the first one. */
const TRANSACTION_ITEM_LIMIT = 100;

export class DynamoUnitOfWork implements UnitOfWork {
  private staged: TransactWriteItem[] = [];
  // Sidecar metadata mirroring `staged`. Lets us map a generic
  // ConditionalCheckFailed (which DynamoDB does NOT tag with the failing
  // table) back to a typed domain error like `RatingAlreadyExistsError`.
  private stagedMeta: Array<StagedMeta | undefined> = [];
  private committed = false;
  // Ledger postings (ECO-02) are turned into items at commit, once the
  // starting balances have been read.
  private ledgerPostings: StagedLedgerPosting[] = [];

  // INJ-03: condition writes are turned into items at commit, merged into the
  // player's record increment when there is one (one operation per item).
  private conditionWrites = new Map<string, { patch: PlayerConditionPatch; guard?: PlayerConditionGuard }>();
  private recordIncrementIndex = new Map<string, number>();

  /** Attach metadata to the item most recently pushed onto `staged`. */
  private tagLastStaged(meta: StagedMeta): void {
    this.stagedMeta[this.staged.length - 1] = meta;
  }

  // ── Players ──────────────────────────────────────────────────────
  updatePlayer(playerId: string, patch: Record<string, unknown>, condition?: PlayerWriteCondition): void {
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
    let conditionExpression: string | undefined;
    if (condition) {
      const clauses = ['attribute_exists(playerId)'];
      if (condition.disciplineVersion !== undefined) {
        names['#disciplineVersion'] = 'disciplineVersion';
        values[':expectedDisciplineVersion'] = condition.disciplineVersion;
        // Only version 0 may match a row with no version, as in updateDiscipline.
        const matchesVersion = '#disciplineVersion = :expectedDisciplineVersion';
        clauses.push(condition.disciplineVersion === 0
          ? `(attribute_not_exists(#disciplineVersion) OR ${matchesVersion})`
          : matchesVersion);
      }
      if (condition.divisionId !== undefined) {
        names['#expectedDivisionId'] = 'divisionId';
        values[':expectedDivisionId'] = condition.divisionId;
        clauses.push('#expectedDivisionId = :expectedDivisionId');
      }
      conditionExpression = clauses.join(' AND ');
    }
    this.staged.push({
      Update: {
        TableName: TableNames.PLAYERS,
        Key: { playerId },
        UpdateExpression: expr,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ...(conditionExpression && { ConditionExpression: conditionExpression }),
      },
    });
    if (conditionExpression) {
      this.tagLastStaged({ kind: 'guarded', entityName: 'Player', id: playerId });
    }
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
    // Updates are upserts: without this condition a stale playerId creates a
    // nameless Player row holding only the record fields. A soft-deleted row
    // counts as stale too.
    this.staged.push({
      Update: {
        TableName: TableNames.PLAYERS,
        Key: { playerId },
        UpdateExpression: `SET ${parts.join(', ')}`,
        ConditionExpression: 'attribute_exists(playerId) AND attribute_not_exists(deletedAt)',
        ExpressionAttributeValues: values,
      },
    });
    this.recordIncrementIndex.set(playerId, this.staged.length - 1); // INJ-03
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
  createTagTeam(tagTeam: TagTeam): void {
    this.staged.push({
      Put: {
        TableName: TableNames.TAG_TEAMS,
        Item: { ...tagTeam },
        ConditionExpression: 'attribute_not_exists(tagTeamId)',
      },
    });
    this.tagLastStaged({ kind: 'guarded', entityName: 'TagTeam', id: tagTeam.tagTeamId });
  }

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

  // ── Divisions ────────────────────────────────────────────────────
  updateDivision(divisionId: string, patch: DivisionPatch, condition?: DivisionWriteCondition): void {
    const now = new Date().toISOString();
    const sets: string[] = [];
    const names: Record<string, string> = {};
    const values: Record<string, unknown> = {};
    let i = 0;
    for (const [key, val] of Object.entries(patch)) {
      if (val === undefined || key === 'updatedAt') continue;
      names[`#f${i}`] = key;
      values[`:v${i}`] = val;
      sets.push(`#f${i} = :v${i}`);
      i++;
    }
    names[`#f${i}`] = 'updatedAt';
    values[`:v${i}`] = now;
    sets.push(`#f${i} = :v${i}`);

    let conditionExpression = 'attribute_exists(divisionId)';
    if (condition) {
      names['#isDefault'] = 'isDefaultForNewWrestlers';
      values[':expectedDefault'] = true;
      conditionExpression += condition.isDefaultForNewWrestlers
        ? ' AND #isDefault = :expectedDefault'
        : ' AND (attribute_not_exists(#isDefault) OR #isDefault <> :expectedDefault)';
    }
    this.staged.push({
      Update: {
        TableName: TableNames.DIVISIONS,
        Key: { divisionId },
        UpdateExpression: `SET ${sets.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ConditionExpression: conditionExpression,
      },
    });
    this.tagLastStaged({ kind: 'guarded', entityName: 'Division', id: divisionId });
  }

  // ── Championships ────────────────────────────────────────────────
  updateChampionship(championshipId: string, patch: Record<string, unknown>): void {
    const now = new Date().toISOString();
    const sets: string[] = [];
    const removes: string[] = [];
    const names: Record<string, string> = {};
    const values: Record<string, unknown> = {};
    let i = 0;
    for (const [key, val] of Object.entries(patch)) {
      const nameKey = `#f${i}`;
      names[nameKey] = key;
      if (val === null) {
        // null removes the attribute (e.g. currentTagTeamId when a non-team wins).
        removes.push(nameKey);
      } else {
        const valKey = `:v${i}`;
        values[valKey] = val;
        sets.push(`${nameKey} = ${valKey}`);
      }
      i++;
    }
    names[`#f${i}`] = 'updatedAt';
    values[`:v${i}`] = now;
    sets.push(`#f${i} = :v${i}`);
    const removeClause = removes.length > 0 ? ` REMOVE ${removes.join(', ')}` : '';
    this.staged.push({
      Update: {
        TableName: TableNames.CHAMPIONSHIPS,
        Key: { championshipId },
        UpdateExpression: `SET ${sets.join(', ')}${removeClause}`,
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
        UpdateExpression: 'REMOVE currentChampion, currentTagTeamId SET updatedAt = :now, version = if_not_exists(version, :zero) + :one',
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
  updateChallenge(challengeId: string, patch: Record<string, unknown>, expectedStatus?: ChallengeStatus): void {
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
    if (expectedStatus) {
      names['#s'] = 'status';
      values[':expectedStatus'] = expectedStatus;
    }
    this.staged.push({
      Update: {
        TableName: TableNames.CHALLENGES,
        Key: { challengeId },
        UpdateExpression: `SET ${sets.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ...(expectedStatus && { ConditionExpression: '#s = :expectedStatus' }),
      },
    });
    if (expectedStatus) {
      this.tagLastStaged({ kind: 'guarded', entityName: 'Challenge', id: challengeId });
    }
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
  //
  // Assign also requires the wrestler to be free or already held by this
  // player, so two requests that both saw it as free cannot both take it.
  // Rows that predate `isInUse` read back as free, so a missing attribute
  // counts as free here too.
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
        ConditionExpression:
          'attribute_exists(wrestlerId) AND (attribute_not_exists(isInUse) OR isInUse = :notInUse OR assignedPlayerId = :playerId)',
        UpdateExpression:
          'SET isInUse = :isInUse, assignedPlayerId = :playerId, assignedSlot = :slot, updatedAt = :now',
        ExpressionAttributeValues: {
          ':isInUse': 'true',
          ':notInUse': 'false',
          ':playerId': params.playerId,
          ':slot': params.slot,
          ':now': now,
        },
      },
    });
    this.tagLastStaged({ kind: 'guarded', entityName: 'Wrestler', id: params.wrestlerId });
  }

  releaseWrestlerFromPlayer(params: { wrestlerId: string; expectedPlayerId?: string }): void {
    const now = new Date().toISOString();
    const values: Record<string, unknown> = { ':isInUse': 'false', ':now': now };
    let conditionExpression = 'attribute_exists(wrestlerId)';
    if (params.expectedPlayerId !== undefined) {
      conditionExpression += ' AND assignedPlayerId = :expectedPlayerId';
      values[':expectedPlayerId'] = params.expectedPlayerId;
    }
    this.staged.push({
      Update: {
        TableName: TableNames.WRESTLERS,
        Key: { wrestlerId: params.wrestlerId },
        ConditionExpression: conditionExpression,
        UpdateExpression:
          'SET isInUse = :isInUse, updatedAt = :now REMOVE assignedPlayerId, assignedSlot',
        ExpressionAttributeValues: values,
      },
    });
    this.tagLastStaged({ kind: 'guarded', entityName: 'Wrestler', id: params.wrestlerId });
  }

  // ── Matches ──────────────────────────────────────────────────────
  updateMatch(
    matchId: string,
    date: string,
    patch: Record<string, unknown>,
    condition?: MatchWriteCondition,
  ): void {
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
    const updatedAtName = `#f${i}`;
    names[updatedAtName] = 'updatedAt';
    values[`:v${i}`] = now;
    sets.push(`${updatedAtName} = :v${i}`);

    let conditionExpression: string | undefined;
    if (condition?.kind === 'notCompleted') {
      names['#s'] = 'status';
      values[':completedStatus'] = 'completed';
      conditionExpression = 'attribute_exists(matchId) AND #s <> :completedStatus';
    } else if (condition?.kind === 'unchangedSince') {
      if (condition.updatedAt === undefined) {
        conditionExpression = `attribute_exists(matchId) AND attribute_not_exists(${updatedAtName})`;
      } else {
        values[':expectedUpdatedAt'] = condition.updatedAt;
        conditionExpression = `attribute_exists(matchId) AND ${updatedAtName} = :expectedUpdatedAt`;
      }
    }

    this.staged.push({
      Update: {
        TableName: TableNames.MATCHES,
        Key: { matchId, date },
        UpdateExpression: `SET ${sets.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ...(conditionExpression && { ConditionExpression: conditionExpression }),
      },
    });
    if (conditionExpression) {
      this.tagLastStaged({ kind: 'guarded', entityName: 'Match', id: matchId });
    }
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
    this.tagLastStaged({
      kind: 'matchRating',
      matchId: input.matchId,
      userId: input.userId,
    });
  }

  // ── Progression (CUP-01) ─────────────────────────────────────────
  upsertPlayerProgression(progression: PlayerProgression): void {
    this.staged.push({
      Update: {
        TableName: TableNames.PLAYER_PROGRESSION,
        ...buildUpsertProgressionUpdate(progression),
      },
    });
  }

  appendProgressionEvent(event: ProgressionEvent): void {
    this.staged.push({
      Put: {
        TableName: TableNames.PROGRESSION_EVENTS,
        Item: toProgressionEventItem(event),
      },
    });
  }

  setProgressionConsideration(
    playerId: string,
    trackId: string,
    consideration: ProgressionConsideration,
    seed?: ProgressionConsiderationSeed,
  ): void {
    this.staged.push({
      Update: {
        TableName: TableNames.PLAYER_PROGRESSION,
        ...buildSetConsiderationUpdate(playerId, trackId, consideration, seed),
      },
    });
    this.tagLastStaged({ kind: 'guarded', entityName: 'PlayerProgression', id: `${playerId}/${trackId}` });
  }

  clearProgressionConsideration(playerId: string, trackId: string): void {
    this.staged.push({
      Update: {
        TableName: TableNames.PLAYER_PROGRESSION,
        ...buildClearConsiderationUpdate(playerId, trackId),
      },
    });
    this.tagLastStaged({ kind: 'guarded', entityName: 'PlayerProgression', id: `${playerId}/${trackId}` });
  }

  deletePlayerProgression(playerId: string, trackId: string): void {
    this.staged.push({
      Delete: {
        TableName: TableNames.PLAYER_PROGRESSION,
        Key: { playerId, trackId },
      },
    });
  }

  // ── Ledger (ECO-02) ──────────────────────────────────────────────
  postLedgerEntry(input: PostLedgerEntryInput): StagedLedgerEntry {
    validateLedgerPosting(input);
    if (this.ledgerPostings.some((posting) => posting.input.idempotencyKey === input.idempotencyKey)) {
      throw new InvalidLedgerPostingError(`idempotencyKey ${input.idempotencyKey} is staged twice`);
    }
    const entryId = uuidv4();
    const createdAt = new Date().toISOString();
    const staged: StagedLedgerEntry = { entryId, createdAt, sortKey: ledgerSortKey({ createdAt, entryId }) };
    this.ledgerPostings.push({ input: { ...input }, staged });
    return { ...staged };
  }

  /**
   * Turn the staged postings into transaction items: per player, one
   * idempotency PUT and one entry PUT per posting, then a single balance
   * update guarded on the balance read here.
   */
  private async buildLedgerItems(): Promise<{ items: TransactWriteItem[]; meta: Array<StagedMeta | undefined> }> {
    const byPlayer = new Map<string, StagedLedgerPosting[]>();
    for (const posting of this.ledgerPostings) {
      const list = byPlayer.get(posting.input.playerId) ?? [];
      list.push(posting);
      byPlayer.set(posting.input.playerId, list);
    }

    for (const playerId of byPlayer.keys()) {
      const alsoWritten = this.staged.some((item) => {
        const op = item.Update ?? item.Put ?? item.Delete;
        if (!op || op.TableName !== TableNames.PLAYERS) return false;
        const key = item.Put ? item.Put.Item : (op as { Key: Record<string, unknown> }).Key;
        return key.playerId === playerId;
      });
      if (alsoWritten) {
        throw new InvalidLedgerPostingError(
          `Player ${playerId} has a ledger posting and another player write in the same unit of work; post in a separate unit of work`,
        );
      }
    }

    const items: TransactWriteItem[] = [];
    const meta: Array<StagedMeta | undefined> = [];
    for (const [playerId, postings] of byPlayer) {
      const read = await dynamoDb.get({
        TableName: TableNames.PLAYERS,
        Key: { playerId },
        ConsistentRead: true,
        ProjectionExpression: '#playerId, #balance, #deletedAt',
        ExpressionAttributeNames: { '#playerId': 'playerId', '#balance': 'balance', '#deletedAt': 'deletedAt' },
      });
      const player = read.Item as { balance?: unknown; deletedAt?: unknown } | undefined;
      if (!player || player.deletedAt) throw new NotFoundError('Player', playerId);
      const hasBalance = typeof player.balance === 'number';
      const startingBalance = hasBalance ? (player.balance as number) : 0;

      const entries = buildLedgerEntries(startingBalance, postings);
      for (const entry of entries) {
        const idempotency: LedgerIdempotencyRecord = {
          idempotencyKey: entry.idempotencyKey,
          playerId,
          entryId: entry.entryId,
          sortKey: entry.sortKey,
          createdAt: entry.createdAt,
        };
        items.push({
          Put: {
            TableName: TableNames.LEDGER_IDEMPOTENCY,
            Item: { ...idempotency },
            ConditionExpression: 'attribute_not_exists(idempotencyKey)',
          },
        });
        meta.push({ kind: 'ledgerIdempotency', idempotencyKey: entry.idempotencyKey });
        items.push({ Put: { TableName: TableNames.LEDGER, Item: { ...entry } } });
        meta.push(undefined);
      }

      const delta = postings.reduce((sum, posting) => sum + posting.input.amount, 0);
      const values: Record<string, unknown> = {
        ':delta': delta,
        ':zero': 0,
        ':updatedAt': new Date().toISOString(),
      };
      if (hasBalance) values[':expectedBalance'] = startingBalance;
      const names: Record<string, string> = {
        '#balance': 'balance',
        '#updatedAt': 'updatedAt',
        '#deletedAt': 'deletedAt',
      };
      let updateExpression = 'SET #balance = if_not_exists(#balance, :zero) + :delta, #updatedAt = :updatedAt';

      // ECO-08: shop effects ride on the balance write (one operation per item).
      const appendedEffects = collectAppendedEffects(postings);
      if (appendedEffects.length > 0) {
        names['#effects'] = 'effects';
        values[':effects'] = appendedEffects;
        values[':noEffects'] = [];
        updateExpression += ', #effects = list_append(if_not_exists(#effects, :noEffects), :effects)';
      }

      items.push({
        Update: {
          TableName: TableNames.PLAYERS,
          Key: { playerId },
          UpdateExpression: updateExpression,
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: values,
          ConditionExpression: `attribute_exists(playerId) AND attribute_not_exists(#deletedAt) AND ${
            hasBalance ? '#balance = :expectedBalance' : 'attribute_not_exists(#balance)'
          }`,
        },
      });
      meta.push({ kind: 'guarded', entityName: 'Player', id: playerId });
    }

    if (items.length > TRANSACTION_ITEM_LIMIT) {
      throw new InvalidLedgerPostingError(
        `Too many ledger postings for one unit of work (${items.length} items, limit ${TRANSACTION_ITEM_LIMIT})`,
      );
    }
    return { items, meta };
  }

  // ── GM interference (ECO-09) ─────────────────────────────────────
  createGmInterferenceRequest(request: GmInterferenceRequest): void {
    this.staged.push({
      Put: {
        TableName: TableNames.GM_INTERFERENCE,
        Item: { ...request },
        ConditionExpression: 'attribute_not_exists(requestId)',
      },
    });
    this.tagLastStaged({ kind: 'guarded', entityName: 'GmInterference', id: request.requestId });
  }

  resolveGmInterferenceRequest(requestId: string, resolution: GmInterferenceResolution): void {
    const names: Record<string, string> = {
      '#requestId': 'requestId',
      '#status': 'status',
      '#resolvedAt': 'resolvedAt',
      '#resolvedBy': 'resolvedBy',
      '#updatedAt': 'updatedAt',
    };
    const values: Record<string, unknown> = {
      ':status': resolution.status,
      ':pending': 'pending',
      ':resolvedAt': resolution.resolvedAt,
      ':resolvedBy': resolution.resolvedBy,
    };
    const sets = ['#status = :status', '#resolvedAt = :resolvedAt', '#resolvedBy = :resolvedBy', '#updatedAt = :resolvedAt'];
    for (const field of ['publicNote', 'privateNote', 'refundEntryId'] as const) {
      const value = resolution[field];
      if (value === undefined) continue;
      names[`#${field}`] = field;
      values[`:${field}`] = value;
      sets.push(`#${field} = :${field}`);
    }
    this.staged.push({
      Update: {
        TableName: TableNames.GM_INTERFERENCE,
        Key: { requestId },
        UpdateExpression: `SET ${sets.join(', ')}`,
        ConditionExpression: 'attribute_exists(#requestId) AND #status = :pending',
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      },
    });
    this.tagLastStaged({ kind: 'guarded', entityName: 'GmInterference', id: requestId });
  }

  // ── Stamina & injuries (INJ-03) ──────────────────────────────────
  updatePlayerCondition(playerId: string, patch: PlayerConditionPatch, guard?: PlayerConditionGuard): void {
    validatePlayerConditionPatch(patch);
    if (this.conditionWrites.has(playerId)) {
      throw new InvalidInjuryWriteError(`Player ${playerId} already has a condition write in this unit of work`);
    }
    this.conditionWrites.set(playerId, {
      patch: structuredClone(patch),
      ...(guard && { guard: { ...guard } }),
    });
  }

  /**
   * Turn the staged condition writes into items: merged into the player's
   * record increment when this unit of work has one, else a write of its own.
   */
  private stageConditionWrites(): void {
    for (const [playerId, { patch, guard }] of this.conditionWrites) {
      const incrementIdx = this.recordIncrementIndex.get(playerId);
      const otherWrite = this.staged.some((item, idx) => {
        if (idx === incrementIdx) return false;
        const op = item.Update ?? item.Put ?? item.Delete;
        if (!op || op.TableName !== TableNames.PLAYERS) return false;
        const key = item.Put ? item.Put.Item : (op as { Key: Record<string, unknown> }).Key;
        return key.playerId === playerId;
      });
      if (otherWrite) {
        throw new InvalidInjuryWriteError(
          `Player ${playerId} has a condition write and another player write in the same unit of work`,
        );
      }

      const names: Record<string, string> = {};
      const values: Record<string, unknown> = {};
      const sets: string[] = [];
      const removes: string[] = [];
      const guards: string[] = [];
      if (patch.stamina !== undefined) {
        names['#condStamina'] = 'stamina';
        values[':condStamina'] = patch.stamina;
        sets.push('#condStamina = :condStamina');
      }
      if (patch.currentInjury !== undefined) {
        names['#condInjury'] = 'currentInjury';
        if (patch.currentInjury === null) {
          removes.push('#condInjury');
        } else {
          values[':condInjury'] = patch.currentInjury;
          sets.push('#condInjury = :condInjury');
        }
      }
      if (guard?.stamina !== undefined) {
        names['#condStamina'] = 'stamina';
        if (guard.stamina === null) {
          guards.push('attribute_not_exists(#condStamina)');
        } else {
          values[':condExpectedStamina'] = guard.stamina;
          guards.push('#condStamina = :condExpectedStamina');
        }
      }
      if (guard?.currentInjuryId !== undefined) {
        names['#condInjury'] = 'currentInjury';
        if (guard.currentInjuryId === null) {
          guards.push('attribute_not_exists(#condInjury)');
        } else {
          names['#condInjuryId'] = 'injuryId';
          values[':condExpectedInjuryId'] = guard.currentInjuryId;
          guards.push('#condInjury.#condInjuryId = :condExpectedInjuryId');
        }
      }

      if (incrementIdx !== undefined) {
        // The increment's expression is `SET ...`; add to it.
        const update = this.staged[incrementIdx].Update!;
        update.UpdateExpression = [
          sets.length > 0 ? `${update.UpdateExpression}, ${sets.join(', ')}` : update.UpdateExpression,
          ...(removes.length > 0 ? [`REMOVE ${removes.join(', ')}`] : []),
        ].join(' ');
        update.ExpressionAttributeNames = { ...(update.ExpressionAttributeNames ?? {}), ...names };
        update.ExpressionAttributeValues = { ...(update.ExpressionAttributeValues ?? {}), ...values };
        if (guards.length > 0) {
          update.ConditionExpression = `${update.ConditionExpression} AND ${guards.join(' AND ')}`;
          this.stagedMeta[incrementIdx] = { kind: 'guarded', entityName: 'Player', id: playerId };
        }
        continue;
      }

      names['#condUpdatedAt'] = 'updatedAt';
      names['#condPlayerId'] = 'playerId';
      names['#condDeletedAt'] = 'deletedAt';
      values[':condUpdatedAt'] = new Date().toISOString();
      sets.push('#condUpdatedAt = :condUpdatedAt');
      this.staged.push({
        Update: {
          TableName: TableNames.PLAYERS,
          Key: { playerId },
          UpdateExpression: [`SET ${sets.join(', ')}`, ...(removes.length > 0 ? [`REMOVE ${removes.join(', ')}`] : [])].join(' '),
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: values,
          ConditionExpression: ['attribute_exists(#condPlayerId)', 'attribute_not_exists(#condDeletedAt)', ...guards].join(' AND '),
        },
      });
      this.tagLastStaged({ kind: 'guarded', entityName: 'Player', id: playerId });
    }
    this.conditionWrites.clear();
  }

  putInjury(injury: Injury): void {
    validateInjury(injury);
    this.staged.push({
      Put: {
        TableName: TableNames.INJURIES,
        Item: structuredClone(injury) as unknown as Record<string, unknown>,
        ConditionExpression: 'attribute_not_exists(playerId)',
      },
    });
    this.tagLastStaged({ kind: 'guarded', entityName: 'Injury', id: injuryRowId(injury.playerId, injury.startedAt) });
  }

  updateInjury(playerId: string, startedAt: string, patch: InjuryPatch): void {
    validateInjuryPatch(patch);
    const names: Record<string, string> = { '#playerId': 'playerId', '#endedAt': 'endedAt' };
    const values: Record<string, unknown> = {};
    const sets: string[] = [];
    const { appendChanges, ...fields } = patch;
    for (const [field, value] of Object.entries(fields)) {
      if (value === undefined) continue;
      names[`#${field}`] = field;
      values[`:${field}`] = value;
      sets.push(`#${field} = :${field}`);
    }
    if (appendChanges?.length) {
      names['#changes'] = 'changes';
      values[':appendChanges'] = structuredClone(appendChanges);
      values[':noChanges'] = [];
      sets.push('#changes = list_append(if_not_exists(#changes, :noChanges), :appendChanges)');
    }
    if (sets.length === 0) throw new InvalidInjuryWriteError('An injury update needs at least one change');
    this.staged.push({
      Update: {
        TableName: TableNames.INJURIES,
        Key: { playerId, startedAt },
        UpdateExpression: `SET ${sets.join(', ')}`,
        ConditionExpression: 'attribute_exists(#playerId) AND attribute_not_exists(#endedAt)',
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      },
    });
    this.tagLastStaged({ kind: 'guarded', entityName: 'Injury', id: injuryRowId(playerId, startedAt) });
  }

  // ── Contracts (ECO-03) ───────────────────────────────────────────
  createContract(contract: Contract): void {
    this.staged.push({
      Put: {
        TableName: TableNames.CONTRACTS,
        Item: { ...contract },
        ConditionExpression: 'attribute_not_exists(contractId)',
      },
    });
    this.tagLastStaged({ kind: 'guarded', entityName: 'Contract', id: contract.contractId });
  }

  updateContract(
    contractId: string,
    patch: ContractPatch,
    expectedStatus: ContractStatus,
    expectedMatchesPlayed?: number,
  ): void {
    const parts = buildContractUpdate(patch, new Date().toISOString(), expectedStatus, expectedMatchesPlayed);
    this.staged.push({
      Update: {
        TableName: TableNames.CONTRACTS,
        Key: { contractId },
        ...parts,
      },
    });
    this.tagLastStaged({ kind: 'guarded', entityName: 'Contract', id: contractId });
  }

  setPlayerActiveContract(playerId: string, contractId: string): void {
    this.staged.push({
      Update: {
        TableName: TableNames.PLAYERS,
        Key: { playerId },
        UpdateExpression: 'SET #activeContractId = :contractId, #updatedAt = :updatedAt',
        ConditionExpression: 'attribute_exists(#playerId) AND attribute_not_exists(#activeContractId)',
        ExpressionAttributeNames: {
          '#activeContractId': 'activeContractId',
          '#updatedAt': 'updatedAt',
          '#playerId': 'playerId',
        },
        ExpressionAttributeValues: { ':contractId': contractId, ':updatedAt': new Date().toISOString() },
      },
    });
    this.tagLastStaged({ kind: 'guarded', entityName: 'Player', id: playerId });
  }

  clearPlayerActiveContract(playerId: string, expectedContractId: string): void {
    this.staged.push({
      Update: {
        TableName: TableNames.PLAYERS,
        Key: { playerId },
        UpdateExpression: 'REMOVE #activeContractId SET #updatedAt = :updatedAt',
        ConditionExpression: '#activeContractId = :expectedContractId',
        ExpressionAttributeNames: { '#activeContractId': 'activeContractId', '#updatedAt': 'updatedAt' },
        ExpressionAttributeValues: {
          ':expectedContractId': expectedContractId,
          ':updatedAt': new Date().toISOString(),
        },
      },
    });
    this.tagLastStaged({ kind: 'guarded', entityName: 'Player', id: playerId });
  }

  // ── Commit / Rollback ────────────────────────────────────────────
  async commit(): Promise<void> {
    if (this.committed) throw new Error('UnitOfWork already committed');
    this.committed = true;

    // INJ-03: before the ledger, whose same-player check must see these.
    this.stageConditionWrites();

    // Pad stagedMeta so it stays index-aligned with staged. Only guarded
    // items, ratings and idempotency rows carry meta; everything else needs
    // an `undefined` placeholder.
    while (this.stagedMeta.length < this.staged.length) {
      this.stagedMeta.push(undefined);
    }

    if (this.ledgerPostings.length > 0) {
      // Ledger writes go first so they always share the first transaction
      // chunk: an idempotency row must never commit without its balance.
      const ledger = await this.buildLedgerItems();
      this.staged = [...ledger.items, ...this.staged];
      this.stagedMeta = [...ledger.meta, ...this.stagedMeta];
    }

    if (this.staged.length === 0) return;

    // Chunk into ≤100-item batches (DynamoDB TransactWriteItems limit)
    const CHUNK_SIZE = 100;
    if (this.staged.length > CHUNK_SIZE) {
      console.warn(`UoW: chunking ${this.staged.length} items into ${Math.ceil(this.staged.length / CHUNK_SIZE)} transactions — NOT globally atomic`);
    }
    for (let i = 0; i < this.staged.length; i += CHUNK_SIZE) {
      const chunk = this.staged.slice(i, i + CHUNK_SIZE);
      const chunkMeta = this.stagedMeta.slice(i, i + CHUNK_SIZE);
      try {
        await dynamoDb.transactWrite({ TransactItems: chunk } as TransactWriteCommandInput);
      } catch (err: unknown) {
        // DynamoDB returns TransactionCanceledException with a
        // CancellationReasons array; the entry index lines up with the
        // staged item that tripped the condition.
        const failedIdx = extractConditionalFailureIndex(err);
        if (failedIdx >= 0) {
          const meta = chunkMeta[failedIdx];
          if (meta?.kind === 'matchRating') {
            throw new RatingAlreadyExistsError(meta.matchId, meta.userId);
          }
          if (meta?.kind === 'ledgerIdempotency') {
            throw new DuplicatePostingError(meta.idempotencyKey);
          }
          if (meta?.kind === 'guarded') {
            throw new ConcurrencyError(meta.entityName, meta.id);
          }
        }
        throw err;
      }
    }
  }

  rollback(): Promise<void> {
    this.staged = [];
    this.stagedMeta = [];
    this.ledgerPostings = [];
    this.conditionWrites.clear(); // INJ-03
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
