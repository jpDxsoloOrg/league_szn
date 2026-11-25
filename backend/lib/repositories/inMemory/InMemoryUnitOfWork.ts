import type {
  UnitOfWork,
  RecordDelta,
  MatchWriteCondition,
  PlayerWriteCondition,
  DivisionWriteCondition,
  ProgressionConsiderationSeed,
} from '../unitOfWork';
import type { DivisionPatch } from '../LeagueOpsRepository';
import type { ChallengeStatus, TagTeam } from '../types';
import type { Contract, ContractPatch, ContractStatus } from '../types';
import { applyContractPatch } from './InMemoryContractsRepository';
// ECO-09
import {
  applyGmInterferenceResolution,
  type GmInterferenceRequest,
  type GmInterferenceResolution,
} from '../gmInterference';
// INJ-03
import {
  InvalidInjuryWriteError,
  applyInjuryPatch,
  injuryRowId,
  validateInjury,
  validateInjuryPatch,
  validatePlayerConditionPatch,
  type Injury,
  type InjuryPatch,
  type PlayerConditionGuard,
  type PlayerConditionPatch,
} from '../injuries';
import type { FactionMessage, FactionDirectMessage } from '../factionMessages';
import type {
  Rivalry,
  RivalryMessage,
  RivalryNote,
  RivalryParticipant,
  RivalryPatch,
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
  type LedgerEntry,
  type LedgerIdempotencyRecord,
  type PostLedgerEntryInput,
  type StagedLedgerEntry,
} from '../ledger';
import { v4 as uuidv4 } from 'uuid';
import type { MatchRating, PlayerEffect, PlayerProgression, ProgressionConsideration, ProgressionEvent } from '../types';
import { applyEventAppend, applyProgressionUpsert, playerProgressionKey } from './InMemoryProgressionRepository';

type StagedOp = () => void;

export class InMemoryUnitOfWork implements UnitOfWork {
  private staged: StagedOp[] = [];
  // Run before any staged op, against pre-commit state, so a failed guard
  // leaves the stores untouched. Same semantics as DynamoDB condition checks.
  private preconditions: StagedOp[] = [];
  private releasedWrestlerIds = new Set<string>();
  private committed = false;
  // Ledger (ECO-02): players written by any other method, so a posting for
  // the same player fails as it would in DynamoDB (one operation per item).
  private playerWrites = new Set<string>();
  private ledgerPostings: Array<{ input: PostLedgerEntryInput; staged: StagedLedgerEntry }> = [];
  // INJ-03: a condition write may share the player with a record increment
  // (DynamoDB merges the two) but with no other player write.
  private conditionWritePlayers = new Set<string>();
  private plainPlayerWrites = new Set<string>();

  constructor(
    private stores: {
      players: Map<string, Record<string, unknown>>;
      tagTeams: Map<string, Record<string, unknown>>;
      championships: Map<string, Record<string, unknown>>;
      championshipHistory: Array<Record<string, unknown>>;
      challenges: Map<string, Record<string, unknown>>;
      seasonStandings: Array<Record<string, unknown>>;
      matches: Map<string, Record<string, unknown>>;
      wrestlers: Map<string, Record<string, unknown>>;
      factionMessages: FactionMessage[];
      factionDirectMessages: FactionDirectMessage[];
      rivalries: Map<string, Rivalry>;
      rivalryMessages: RivalryMessage[];
      rivalryNotes: RivalryNote[];
      matchRatings: Map<string, MatchRating>;
      playerProgression: Map<string, PlayerProgression>;
      progressionEvents: ProgressionEvent[];
      /** Optional so callers that never touch divisions need not wire it. */
      divisions?: Map<string, Record<string, unknown>>;
      /** Ledger (ECO-02). Optional so callers that never post need not wire them. */
      ledger?: LedgerEntry[];
      ledgerIdempotency?: Map<string, LedgerIdempotencyRecord>;

      /** ECO-09. Optional so callers that never touch GM interference need not wire it. */
      gmInterference?: Map<string, GmInterferenceRequest>;

      /** INJ-03, keyed by `injuryRowId`. Optional so callers that never touch injuries need not wire it. */
      injuries?: Map<string, Injury>;

      /** ECO-03. Optional so callers that never touch contracts need not wire it. */
      contracts?: Map<string, Contract>;
    },
  ) {}

  // Each method pushes a closure that mutates the in-memory stores

  updatePlayer(playerId: string, patch: Record<string, unknown>, condition?: PlayerWriteCondition): void {
    this.playerWrites.add(playerId);
    this.plainPlayerWrites.add(playerId); // INJ-03
    if (condition) {
      this.preconditions.push(() => {
        const player = this.stores.players.get(playerId);
        if (
          !player
          || (condition.disciplineVersion !== undefined && (player.disciplineVersion ?? 0) !== condition.disciplineVersion)
          || (condition.divisionId !== undefined && player.divisionId !== condition.divisionId)
        ) {
          throw new ConcurrencyError('Player', playerId);
        }
      });
    }
    this.staged.push(() => {
      const existing = this.stores.players.get(playerId);
      if (!existing) return;
      // Match DynamoUnitOfWork.updatePlayer semantics: undefined/null = REMOVE.
      const next: Record<string, unknown> = { ...existing };
      for (const [key, val] of Object.entries(patch)) {
        if (val === undefined || val === null) {
          delete next[key];
        } else {
          next[key] = val;
        }
      }
      next.updatedAt = new Date().toISOString();
      this.stores.players.set(playerId, next);
    });
  }

  incrementPlayerRecord(playerId: string, delta: RecordDelta): void {
    this.playerWrites.add(playerId);
    this.preconditions.push(() => {
      const player = this.stores.players.get(playerId);
      if (!player || player.deletedAt) throw new ConcurrencyError('Player', playerId);
    });
    this.staged.push(() => {
      const existing = this.stores.players.get(playerId);
      if (existing) {
        if (delta.wins) existing.wins = ((existing.wins as number) || 0) + delta.wins;
        if (delta.losses) existing.losses = ((existing.losses as number) || 0) + delta.losses;
        if (delta.draws) existing.draws = ((existing.draws as number) || 0) + delta.draws;
        existing.updatedAt = new Date().toISOString();
      }
    });
  }

  clearPlayerField(playerId: string, field: string): void {
    this.playerWrites.add(playerId);
    this.plainPlayerWrites.add(playerId); // INJ-03
    this.staged.push(() => {
      const existing = this.stores.players.get(playerId);
      if (existing) {
        delete existing[field];
        existing.updatedAt = new Date().toISOString();
      }
    });
  }

  setPlayerTagTeamId(playerId: string, tagTeamId: string): void {
    this.playerWrites.add(playerId);
    this.plainPlayerWrites.add(playerId); // INJ-03
    this.staged.push(() => {
      const existing = this.stores.players.get(playerId);
      if (existing) {
        existing.tagTeamId = tagTeamId;
        existing.updatedAt = new Date().toISOString();
      }
    });
  }

  createTagTeam(tagTeam: TagTeam): void {
    this.preconditions.push(() => {
      if (this.stores.tagTeams.has(tagTeam.tagTeamId)) {
        throw new ConcurrencyError('TagTeam', tagTeam.tagTeamId);
      }
    });
    this.staged.push(() => {
      this.stores.tagTeams.set(tagTeam.tagTeamId, { ...tagTeam });
    });
  }

  updateTagTeam(tagTeamId: string, patch: Record<string, unknown>): void {
    this.staged.push(() => {
      const existing = this.stores.tagTeams.get(tagTeamId);
      if (existing) {
        this.stores.tagTeams.set(tagTeamId, { ...existing, ...patch, updatedAt: new Date().toISOString() });
      }
    });
  }

  deleteTagTeam(tagTeamId: string): void {
    this.staged.push(() => { this.stores.tagTeams.delete(tagTeamId); });
  }

  updateDivision(divisionId: string, patch: DivisionPatch, condition?: DivisionWriteCondition): void {
    this.preconditions.push(() => {
      const existing = this.stores.divisions?.get(divisionId);
      if (!existing) throw new ConcurrencyError('Division', divisionId);
      if (condition && (existing.isDefaultForNewWrestlers === true) !== condition.isDefaultForNewWrestlers) {
        throw new ConcurrencyError('Division', divisionId);
      }
    });
    this.staged.push(() => {
      const existing = this.stores.divisions?.get(divisionId);
      if (!existing) return;
      const next: Record<string, unknown> = { ...existing };
      for (const [key, val] of Object.entries(patch)) {
        if (val !== undefined) next[key] = val;
      }
      next.updatedAt = new Date().toISOString();
      this.stores.divisions?.set(divisionId, next);
    });
  }

  updateChampionship(championshipId: string, patch: Record<string, unknown>): void {
    this.staged.push(() => {
      const existing = this.stores.championships.get(championshipId);
      if (existing) {
        const next: Record<string, unknown> = { ...existing, ...patch, updatedAt: new Date().toISOString() };
        // null removes the attribute, matching the Dynamo implementation.
        for (const [key, val] of Object.entries(patch)) {
          if (val === null) delete next[key];
        }
        this.stores.championships.set(championshipId, next as typeof existing);
      }
    });
  }

  removeChampion(championshipId: string): void {
    this.staged.push(() => {
      const existing = this.stores.championships.get(championshipId);
      if (existing) {
        delete existing.currentChampion;
        delete existing.currentTagTeamId;
        existing.updatedAt = new Date().toISOString();
      }
    });
  }

  closeReign(championshipId: string, wonDate: string, lostDate: string, daysHeld: number): void {
    this.staged.push(() => {
      const reign = this.stores.championshipHistory.find(
        (h) => h.championshipId === championshipId && h.wonDate === wonDate,
      );
      if (reign) {
        reign.lostDate = lostDate;
        reign.daysHeld = daysHeld;
      }
    });
  }

  startReign(entry: Record<string, unknown>): void {
    this.staged.push(() => { this.stores.championshipHistory.push(entry); });
  }

  incrementDefenses(championshipId: string, wonDate: string): void {
    this.staged.push(() => {
      const reign = this.stores.championshipHistory.find(
        (h) => h.championshipId === championshipId && h.wonDate === wonDate,
      );
      if (reign) {
        reign.defenses = ((reign.defenses as number) || 0) + 1;
      }
    });
  }

  updateChallenge(challengeId: string, patch: Record<string, unknown>, expectedStatus?: ChallengeStatus): void {
    if (expectedStatus) {
      this.preconditions.push(() => {
        if (this.stores.challenges.get(challengeId)?.status !== expectedStatus) {
          throw new ConcurrencyError('Challenge', challengeId);
        }
      });
    }
    this.staged.push(() => {
      const existing = this.stores.challenges.get(challengeId);
      if (existing) {
        this.stores.challenges.set(challengeId, { ...existing, ...patch, updatedAt: new Date().toISOString() });
      }
    });
  }

  createChallenge(challenge: Record<string, unknown>): void {
    this.staged.push(() => {
      this.stores.challenges.set(challenge.challengeId as string, challenge);
    });
  }

  incrementStanding(seasonId: string, playerId: string, delta: RecordDelta): void {
    this.staged.push(() => {
      let standing = this.stores.seasonStandings.find(
        (s) => s.seasonId === seasonId && s.playerId === playerId,
      );
      if (!standing) {
        standing = { seasonId, playerId, wins: 0, losses: 0, draws: 0, updatedAt: new Date().toISOString() };
        this.stores.seasonStandings.push(standing);
      }
      if (delta.wins) standing.wins = ((standing.wins as number) || 0) + delta.wins;
      if (delta.losses) standing.losses = ((standing.losses as number) || 0) + delta.losses;
      if (delta.draws) standing.draws = ((standing.draws as number) || 0) + delta.draws;
      standing.updatedAt = new Date().toISOString();
    });
  }

  updateMatch(
    matchId: string,
    _date: string,
    patch: Record<string, unknown>,
    condition?: MatchWriteCondition,
  ): void {
    if (condition) {
      this.preconditions.push(() => {
        const existing = this.stores.matches.get(matchId);
        const passes = existing !== undefined && (condition.kind === 'notCompleted'
          ? existing.status !== 'completed'
          : existing.updatedAt === condition.updatedAt);
        if (!passes) throw new ConcurrencyError('Match', matchId);
      });
    }
    this.staged.push(() => {
      const existing = this.stores.matches.get(matchId);
      if (existing) {
        this.stores.matches.set(matchId, { ...existing, ...patch, updatedAt: new Date().toISOString() });
      }
    });
  }

  assignWrestlerToPlayer(params: {
    wrestlerId: string;
    playerId: string;
    slot: 'primary' | 'alternate';
  }): void {
    this.preconditions.push(() => {
      // A release staged in this same unit of work frees the wrestler first.
      if (this.releasedWrestlerIds.has(params.wrestlerId)) return;
      const existing = this.stores.wrestlers.get(params.wrestlerId);
      const isFree = existing !== undefined &&
        (!existing.isInUse || existing.assignedPlayerId === params.playerId);
      if (!isFree) throw new ConcurrencyError('Wrestler', params.wrestlerId);
    });
    this.staged.push(() => {
      const existing = this.stores.wrestlers.get(params.wrestlerId);
      if (existing) {
        existing.isInUse = true;
        existing.assignedPlayerId = params.playerId;
        existing.assignedSlot = params.slot;
        existing.updatedAt = new Date().toISOString();
      }
    });
  }

  releaseWrestlerFromPlayer(params: { wrestlerId: string; expectedPlayerId?: string }): void {
    this.releasedWrestlerIds.add(params.wrestlerId);
    this.preconditions.push(() => {
      const existing = this.stores.wrestlers.get(params.wrestlerId);
      const ownerMatches = params.expectedPlayerId === undefined ||
        existing?.assignedPlayerId === params.expectedPlayerId;
      if (!existing || !ownerMatches) throw new ConcurrencyError('Wrestler', params.wrestlerId);
    });
    this.staged.push(() => {
      const existing = this.stores.wrestlers.get(params.wrestlerId);
      if (existing) {
        existing.isInUse = false;
        delete existing.assignedPlayerId;
        delete existing.assignedSlot;
        existing.updatedAt = new Date().toISOString();
      }
    });
  }

  appendFactionMessage(message: FactionMessage): void {
    this.staged.push(() => {
      this.stores.factionMessages.push({ ...message });
    });
  }

  appendFactionDirectMessage(message: FactionDirectMessage): void {
    this.staged.push(() => {
      this.stores.factionDirectMessages.push({ ...message });
    });
  }

  // ── Rivalries (RIV-01) ───────────────────────────────────────────
  createRivalry(rivalry: Rivalry): void {
    this.staged.push(() => {
      this.stores.rivalries.set(rivalry.rivalryId, {
        ...rivalry,
        participants: rivalry.participants.map((p) => ({ ...p })),
      });
    });
  }

  updateRivalry(rivalryId: string, patch: RivalryPatch): void {
    this.staged.push(() => {
      const existing = this.stores.rivalries.get(rivalryId);
      if (!existing) return;
      this.stores.rivalries.set(rivalryId, {
        ...existing,
        ...patch,
        updatedAt: new Date().toISOString(),
      });
    });
  }

  addRivalryParticipant(rivalryId: string, participant: RivalryParticipant): void {
    this.staged.push(() => {
      const existing = this.stores.rivalries.get(rivalryId);
      if (!existing) return;
      const filtered = existing.participants.filter(
        (p) => p.playerId !== participant.playerId,
      );
      this.stores.rivalries.set(rivalryId, {
        ...existing,
        participants: [...filtered, { ...participant }],
        updatedAt: new Date().toISOString(),
      });
    });
  }

  removeRivalryParticipant(rivalryId: string, playerId: string): void {
    this.staged.push(() => {
      const existing = this.stores.rivalries.get(rivalryId);
      if (!existing) return;
      this.stores.rivalries.set(rivalryId, {
        ...existing,
        participants: existing.participants.filter((p) => p.playerId !== playerId),
        updatedAt: new Date().toISOString(),
      });
    });
  }

  appendRivalryMessage(message: RivalryMessage): void {
    this.staged.push(() => {
      this.stores.rivalryMessages.push({ ...message });
    });
  }

  createRivalryNote(note: RivalryNote): void {
    this.staged.push(() => {
      this.stores.rivalryNotes.push({ ...note });
    });
  }

  deleteRivalry(rivalryId: string, _participantPlayerIds: string[]): void {
    // The in-memory store keeps the rivalry as a single aggregate, so the
    // per-participant IDs are unused here — they're only meaningful for
    // the DynamoDB SK-per-participant layout.
    void _participantPlayerIds;
    this.staged.push(() => {
      this.stores.rivalries.delete(rivalryId);
    });
  }

  deleteRivalryMessage(message: RivalryMessage): void {
    this.staged.push(() => {
      const idx = this.stores.rivalryMessages.findIndex(
        (m) =>
          m.rivalryId === message.rivalryId && m.messageId === message.messageId,
      );
      if (idx >= 0) this.stores.rivalryMessages.splice(idx, 1);
    });
  }

  deleteRivalryNote(note: RivalryNote): void {
    this.staged.push(() => {
      const idx = this.stores.rivalryNotes.findIndex(
        (n) => n.rivalryId === note.rivalryId && n.noteId === note.noteId,
      );
      if (idx >= 0) this.stores.rivalryNotes.splice(idx, 1);
    });
  }

  // ── Match ratings (RIV-20) ───────────────────────────────────────
  createMatchRating(input: { matchId: string; userId: string; rating: number }): void {
    // Pre-validate so a duplicate fails synchronously at stage time —
    // mirrors the behaviour of a DynamoDB ConditionalCheckFailed on the
    // PUT and gives handlers a deterministic place to surface the error
    // without first having to commit.
    const key = `${input.matchId}#${input.userId}`;
    if (this.stores.matchRatings.has(key)) {
      throw new RatingAlreadyExistsError(input.matchId, input.userId);
    }
    this.staged.push(() => {
      if (this.stores.matchRatings.has(key)) {
        throw new RatingAlreadyExistsError(input.matchId, input.userId);
      }
      const row: MatchRating = {
        matchId: input.matchId,
        userId: input.userId,
        rating: input.rating,
        createdAt: new Date().toISOString(),
      };
      this.stores.matchRatings.set(key, row);
    });
  }

  // ── Progression (CUP-01) ─────────────────────────────────────────
  upsertPlayerProgression(progression: PlayerProgression): void {
    const staged = structuredClone(progression);
    this.staged.push(() => {
      applyProgressionUpsert(this.stores.playerProgression, staged);
    });
  }

  appendProgressionEvent(event: ProgressionEvent): void {
    const staged = structuredClone(event);
    this.staged.push(() => {
      applyEventAppend(this.stores.progressionEvents, staged);
    });
  }

  setProgressionConsideration(
    playerId: string,
    trackId: string,
    consideration: ProgressionConsideration,
    seed?: ProgressionConsiderationSeed,
  ): void {
    const key = playerProgressionKey(playerId, trackId);
    const stagedConsideration = structuredClone(consideration);
    const stagedSeed = seed ? structuredClone(seed) : undefined;
    this.preconditions.push(() => {
      const existing = this.stores.playerProgression.get(key);
      if ((!existing && !stagedSeed) || existing?.consideration) {
        throw new ConcurrencyError('PlayerProgression', `${playerId}/${trackId}`);
      }
    });
    this.staged.push(() => {
      const existing = this.stores.playerProgression.get(key);
      const base: PlayerProgression = existing ?? { playerId, trackId, ...(stagedSeed as ProgressionConsiderationSeed) };
      this.stores.playerProgression.set(key, { ...base, consideration: stagedConsideration });
    });
  }

  clearProgressionConsideration(playerId: string, trackId: string): void {
    const key = playerProgressionKey(playerId, trackId);
    this.preconditions.push(() => {
      if (!this.stores.playerProgression.get(key)?.consideration) {
        throw new ConcurrencyError('PlayerProgression', `${playerId}/${trackId}`);
      }
    });
    this.staged.push(() => {
      const existing = this.stores.playerProgression.get(key);
      if (!existing) return;
      const next: PlayerProgression = { ...existing };
      delete next.consideration;
      this.stores.playerProgression.set(key, next);
    });
  }

  deletePlayerProgression(playerId: string, trackId: string): void {
    this.staged.push(() => {
      this.stores.playerProgression.delete(playerProgressionKey(playerId, trackId));
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
   * Check every posting against pre-commit state (same failures as the
   * DynamoDB commit) and return the write that applies them.
   */
  private prepareLedgerWrites(): () => void {
    if (this.ledgerPostings.length === 0) return () => undefined;
    const { ledger, ledgerIdempotency } = this.stores;
    if (!ledger || !ledgerIdempotency) {
      throw new Error('InMemoryUnitOfWork: ledger stores are not wired');
    }

    const byPlayer = new Map<string, Array<{ input: PostLedgerEntryInput; staged: StagedLedgerEntry }>>();
    for (const posting of this.ledgerPostings) {
      if (ledgerIdempotency.has(posting.input.idempotencyKey)) {
        throw new DuplicatePostingError(posting.input.idempotencyKey);
      }
      const list = byPlayer.get(posting.input.playerId) ?? [];
      list.push(posting);
      byPlayer.set(posting.input.playerId, list);
    }

    const writes: Array<{ playerId: string; entries: LedgerEntry[]; balance: number; effects: PlayerEffect[] }> = [];
    for (const [playerId, postings] of byPlayer) {
      if (this.playerWrites.has(playerId)) {
        throw new InvalidLedgerPostingError(
          `Player ${playerId} has a ledger posting and another player write in the same unit of work; post in a separate unit of work`,
        );
      }
      const player = this.stores.players.get(playerId);
      if (!player || player.deletedAt) throw new NotFoundError('Player', playerId);
      const startingBalance = typeof player.balance === 'number' ? player.balance : 0;
      const entries = buildLedgerEntries(startingBalance, postings);
      writes.push({
        playerId,
        entries,
        balance: entries[entries.length - 1].balanceAfter,
        effects: collectAppendedEffects(postings),
      });
    }

    return () => {
      for (const write of writes) {
        for (const entry of write.entries) {
          ledgerIdempotency.set(entry.idempotencyKey, {
            idempotencyKey: entry.idempotencyKey,
            playerId: entry.playerId,
            entryId: entry.entryId,
            sortKey: entry.sortKey,
            createdAt: entry.createdAt,
          });
          ledger.push(entry);
        }
        const player = this.stores.players.get(write.playerId);
        if (player) {
          player.balance = write.balance;
          // ECO-08: effects bought with this posting.
          if (write.effects.length > 0) {
            const existing = Array.isArray(player.effects) ? (player.effects as PlayerEffect[]) : [];
            player.effects = [...existing, ...structuredClone(write.effects)];
          }
          player.updatedAt = new Date().toISOString();
        }
      }
    };
  }

  // ── GM interference (ECO-09) ─────────────────────────────────────
  private gmInterferenceStore(): Map<string, GmInterferenceRequest> {
    if (!this.stores.gmInterference) throw new Error('InMemoryUnitOfWork: gmInterference store not wired');
    return this.stores.gmInterference;
  }

  createGmInterferenceRequest(request: GmInterferenceRequest): void {
    this.preconditions.push(() => {
      if (this.gmInterferenceStore().has(request.requestId)) {
        throw new ConcurrencyError('GmInterference', request.requestId);
      }
    });
    this.staged.push(() => {
      this.gmInterferenceStore().set(request.requestId, { ...request });
    });
  }

  resolveGmInterferenceRequest(requestId: string, resolution: GmInterferenceResolution): void {
    this.preconditions.push(() => {
      if (this.gmInterferenceStore().get(requestId)?.status !== 'pending') {
        throw new ConcurrencyError('GmInterference', requestId);
      }
    });
    this.staged.push(() => {
      const existing = this.gmInterferenceStore().get(requestId);
      if (!existing) return;
      this.gmInterferenceStore().set(requestId, applyGmInterferenceResolution(existing, resolution));
    });
  }

  // ── Stamina & injuries (INJ-03) ──────────────────────────────────
  private injuriesStore(): Map<string, Injury> {
    if (!this.stores.injuries) throw new Error('InMemoryUnitOfWork: injuries store not wired');
    return this.stores.injuries;
  }

  updatePlayerCondition(playerId: string, patch: PlayerConditionPatch, guard?: PlayerConditionGuard): void {
    validatePlayerConditionPatch(patch);
    if (this.conditionWritePlayers.has(playerId)) {
      throw new InvalidInjuryWriteError(`Player ${playerId} already has a condition write in this unit of work`);
    }
    this.conditionWritePlayers.add(playerId);
    this.playerWrites.add(playerId);
    const stagedPatch = structuredClone(patch);
    this.preconditions.push(() => {
      if (this.plainPlayerWrites.has(playerId)) {
        throw new InvalidInjuryWriteError(
          `Player ${playerId} has a condition write and another player write in the same unit of work`,
        );
      }
      const player = this.stores.players.get(playerId);
      if (!player || player.deletedAt) throw new ConcurrencyError('Player', playerId);
      if (guard?.stamina !== undefined) {
        const stored = typeof player.stamina === 'number' ? player.stamina : null;
        if (stored !== guard.stamina) throw new ConcurrencyError('Player', playerId);
      }
      if (guard?.currentInjuryId !== undefined) {
        const stored = (player.currentInjury as { injuryId?: string } | undefined)?.injuryId ?? null;
        if (stored !== guard.currentInjuryId) throw new ConcurrencyError('Player', playerId);
      }
    });
    this.staged.push(() => {
      const existing = this.stores.players.get(playerId);
      if (!existing) return;
      const next: Record<string, unknown> = { ...existing, updatedAt: new Date().toISOString() };
      if (stagedPatch.stamina !== undefined) next.stamina = stagedPatch.stamina;
      if (stagedPatch.currentInjury === null) delete next.currentInjury;
      else if (stagedPatch.currentInjury !== undefined) next.currentInjury = stagedPatch.currentInjury;
      this.stores.players.set(playerId, next);
    });
  }

  putInjury(injury: Injury): void {
    validateInjury(injury);
    const key = injuryRowId(injury.playerId, injury.startedAt);
    const row = structuredClone(injury);
    this.preconditions.push(() => {
      if (this.injuriesStore().has(key)) throw new ConcurrencyError('Injury', key);
    });
    this.staged.push(() => {
      this.injuriesStore().set(key, row);
    });
  }

  updateInjury(playerId: string, startedAt: string, patch: InjuryPatch): void {
    validateInjuryPatch(patch);
    const hasChange = Object.entries(patch).some(([field, value]) => (
      field === 'appendChanges' ? Array.isArray(value) && value.length > 0 : value !== undefined
    ));
    if (!hasChange) throw new InvalidInjuryWriteError('An injury update needs at least one change');
    const key = injuryRowId(playerId, startedAt);
    const stagedPatch = structuredClone(patch);
    this.preconditions.push(() => {
      const stored = this.injuriesStore().get(key);
      if (!stored || stored.endedAt !== undefined) throw new ConcurrencyError('Injury', key);
    });
    this.staged.push(() => {
      const existing = this.injuriesStore().get(key);
      if (!existing) return;
      this.injuriesStore().set(key, applyInjuryPatch(existing, stagedPatch));
    });
  }

  // ── Contracts (ECO-03) ───────────────────────────────────────────
  private contractsStore(): Map<string, Contract> {
    if (!this.stores.contracts) throw new Error('InMemoryUnitOfWork: contracts store not wired');
    return this.stores.contracts;
  }

  createContract(contract: Contract): void {
    this.preconditions.push(() => {
      if (this.contractsStore().has(contract.contractId)) {
        throw new ConcurrencyError('Contract', contract.contractId);
      }
    });
    this.staged.push(() => {
      this.contractsStore().set(contract.contractId, { ...contract });
    });
  }

  updateContract(
    contractId: string,
    patch: ContractPatch,
    expectedStatus: ContractStatus,
    expectedMatchesPlayed?: number,
  ): void {
    this.preconditions.push(() => {
      const stored = this.contractsStore().get(contractId);
      if (stored?.status !== expectedStatus) {
        throw new ConcurrencyError('Contract', contractId);
      }
      if (expectedMatchesPlayed !== undefined && stored.matchesPlayed !== expectedMatchesPlayed) {
        throw new ConcurrencyError('Contract', contractId);
      }
    });
    this.staged.push(() => {
      const existing = this.contractsStore().get(contractId);
      if (!existing) return;
      this.contractsStore().set(contractId, applyContractPatch(existing, patch, new Date().toISOString()));
    });
  }

  setPlayerActiveContract(playerId: string, contractId: string): void {
    this.plainPlayerWrites.add(playerId); // INJ-03
    this.preconditions.push(() => {
      const player = this.stores.players.get(playerId);
      if (!player || player.activeContractId !== undefined) {
        throw new ConcurrencyError('Player', playerId);
      }
    });
    this.staged.push(() => {
      const existing = this.stores.players.get(playerId);
      if (!existing) return;
      this.stores.players.set(playerId, {
        ...existing,
        activeContractId: contractId,
        updatedAt: new Date().toISOString(),
      });
    });
  }

  clearPlayerActiveContract(playerId: string, expectedContractId: string): void {
    this.plainPlayerWrites.add(playerId); // INJ-03
    this.preconditions.push(() => {
      if (this.stores.players.get(playerId)?.activeContractId !== expectedContractId) {
        throw new ConcurrencyError('Player', playerId);
      }
    });
    this.staged.push(() => {
      const existing = this.stores.players.get(playerId);
      if (!existing) return;
      const next: Record<string, unknown> = { ...existing, updatedAt: new Date().toISOString() };
      delete next.activeContractId;
      this.stores.players.set(playerId, next);
    });
  }

  async commit(): Promise<void> {
    if (this.committed) throw new Error('UnitOfWork already committed');
    this.committed = true;
    for (const check of this.preconditions) {
      check();
    }
    const applyLedgerWrites = this.prepareLedgerWrites();
    for (const op of this.staged) {
      op();
    }
    applyLedgerWrites();
  }

  async rollback(): Promise<void> {
    this.staged = [];
    this.preconditions = [];
    this.committed = true;
  }
}
