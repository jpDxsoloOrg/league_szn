export interface Player {
  playerId: string;
  userId?: string;
  name: string;
  currentWrestler: string;
  wins: number;
  losses: number;
  draws: number;
  imageUrl?: string;
  divisionId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Match {
  matchId: string;
  date: string;
  matchFormat: string; // "singles", "tag", "triple-threat", etc.
  stipulationId?: string; // References MatchTypes table
  // Legacy fields for backwards compatibility
  matchType: string; // Same as matchFormat (for legacy consumers)
  stipulation?: string; // Denormalized name from MatchType (for legacy consumers)
  participants: string[]; // playerIds
  teams?: string[][]; // Array of teams, each team is an array of playerIds (for tag team matches)
  winners?: string[]; // playerIds
  losers?: string[]; // playerIds
  winningTeam?: number; // Index of winning team (for tag team matches)
  isChampionship: boolean;
  isTitleDefense?: boolean;
  championshipId?: string;
  tournamentId?: string;
  seasonId?: string;
  status: 'scheduled' | 'completed';
  createdAt: string;
}

export interface Championship {
  championshipId: string;
  name: string;
  type: 'singles' | 'tag';
  currentChampion?: string | string[]; // playerId or array for tag teams
  divisionId?: string;
  imageUrl?: string;
  createdAt: string;
  isActive: boolean;
}

export interface ChampionshipReign {
  championshipId: string;
  champion: string | string[];
  wonDate: string;
  lostDate?: string;
  matchId: string;
  daysHeld?: number;
  defenses?: number;
}

export interface Tournament {
  tournamentId: string;
  name: string;
  type: 'single-elimination' | 'round-robin';
  status: 'upcoming' | 'in-progress' | 'completed';
  participants: string[]; // playerIds
  brackets?: TournamentBracket; // for single-elimination
  standings?: Record<string, Omit<RoundRobinStanding, 'playerId'>>; // for round-robin
  winner?: string;
  createdAt: string;
}

export interface TournamentBracket {
  rounds: BracketRound[];
}

export interface BracketRound {
  roundNumber: number;
  matches: BracketMatch[];
}

export interface BracketMatch {
  matchId?: string;
  participant1?: string;
  participant2?: string;
  winner?: string;
}

export interface RoundRobinStanding {
  playerId: string;
  wins: number;
  losses: number;
  draws: number;
  points: number; // 2 for win, 1 for draw
}

export interface Standings {
  players: Player[];
  seasonId?: string;
  sortedByWins: boolean;
}

export interface Season {
  seasonId: string;
  name: string;
  startDate: string;
  endDate?: string;
  status: 'active' | 'completed';
  createdAt: string;
  updatedAt: string;
}

export interface Division {
  divisionId: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MatchType {
  matchTypeId: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}
