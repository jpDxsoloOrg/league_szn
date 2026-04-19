import type { UnitOfWork, RecordDelta } from '../unitOfWork';

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
    },
  ) {}

  // Each method pushes a closure that mutates the in-memory stores

  updatePlayer(playerId: string, patch: Record<string, unknown>): void {
    this.staged.push(() => {
      const existing = this.stores.players.get(playerId);
      if (existing) {
        this.stores.players.set(playerId, { ...existing, ...patch, updatedAt: new Date().toISOString() });
      }
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
