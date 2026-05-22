import type { UnitOfWork, RecordDelta } from '../unitOfWork';
import type { FactionMessage, FactionDirectMessage } from '../factionMessages';
import type {
  Rivalry,
  RivalryMessage,
  RivalryNote,
  RivalryParticipant,
  RivalryPatch,
} from '../rivalries';

type StagedOp = () => void;

export class InMemoryUnitOfWork implements UnitOfWork {
  private staged: StagedOp[] = [];
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
    },
  ) {}

  // Each method pushes a closure that mutates the in-memory stores

  updatePlayer(playerId: string, patch: Record<string, unknown>): void {
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

  updateChampionship(championshipId: string, patch: Record<string, unknown>): void {
    this.staged.push(() => {
      const existing = this.stores.championships.get(championshipId);
      if (existing) {
        this.stores.championships.set(championshipId, { ...existing, ...patch, updatedAt: new Date().toISOString() });
      }
    });
  }

  removeChampion(championshipId: string): void {
    this.staged.push(() => {
      const existing = this.stores.championships.get(championshipId);
      if (existing) {
        delete existing.currentChampion;
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

  updateChallenge(challengeId: string, patch: Record<string, unknown>): void {
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

  updateMatch(matchId: string, _date: string, patch: Record<string, unknown>): void {
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

  releaseWrestlerFromPlayer(params: { wrestlerId: string }): void {
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

  async commit(): Promise<void> {
    if (this.committed) throw new Error('UnitOfWork already committed');
    this.committed = true;
    for (const op of this.staged) {
      op();
    }
  }

  async rollback(): Promise<void> {
    this.staged = [];
    this.committed = true;
  }
}
