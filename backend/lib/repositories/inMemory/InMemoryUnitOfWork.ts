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
import type { FactionMessage, FactionDirectMessage } from '../factionMessages';
import type {
  Rivalry,
  RivalryMessage,
  RivalryNote,
  RivalryParticipant,
  RivalryPatch,
} from '../rivalries';
import { RatingAlreadyExistsError } from '../matchRatings';
import { ConcurrencyError } from '../errors';
import type { MatchRating, PlayerProgression, ProgressionConsideration, ProgressionEvent } from '../types';
import { applyEventAppend, applyProgressionUpsert, playerProgressionKey } from './InMemoryProgressionRepository';

type StagedOp = () => void;

export class InMemoryUnitOfWork implements UnitOfWork {
  private staged: StagedOp[] = [];
  // Run before any staged op, against pre-commit state, so a failed guard
  // leaves the stores untouched. Same semantics as DynamoDB condition checks.
  private preconditions: StagedOp[] = [];
  private releasedWrestlerIds = new Set<string>();
  private committed = false;

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
    },
  ) {}

  // Each method pushes a closure that mutates the in-memory stores

  updatePlayer(playerId: string, patch: Record<string, unknown>, condition?: PlayerWriteCondition): void {
    if (condition) {
      this.preconditions.push(() => {
        const player = this.stores.players.get(playerId);
        if (!player || (player.disciplineVersion ?? 0) !== condition.disciplineVersion) {
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
    this.staged.push(() => {
      const existing = this.stores.players.get(playerId);
      if (existing) {
        delete existing[field];
        existing.updatedAt = new Date().toISOString();
      }
    });
  }

  setPlayerTagTeamId(playerId: string, tagTeamId: string): void {
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

  async commit(): Promise<void> {
    if (this.committed) throw new Error('UnitOfWork already committed');
    this.committed = true;
    for (const check of this.preconditions) {
      check();
    }
    for (const op of this.staged) {
      op();
    }
  }

  async rollback(): Promise<void> {
    this.staged = [];
    this.preconditions = [];
    this.committed = true;
  }
}
