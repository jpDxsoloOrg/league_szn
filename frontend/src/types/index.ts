export interface Player {
  playerId: string;
  name: string;
  currentWrestler: string;
  wins: number;
  losses: number;
  draws: number;
  imageUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Match {
  matchId: string;
  date: string;
  matchType: string; // "singles", "tag", "triple-threat", etc.
  stipulation?: string; // "ladder", "cage", "hell-in-a-cell", etc.
  participants: string[]; // playerIds
  winners?: string[]; // playerIds
  losers?: string[]; // playerIds
  isChampionship: boolean;
  championshipId?: string;
  tournamentId?: string;
  status: 'scheduled' | 'completed';
  createdAt: string;
}

export interface Championship {
  championshipId: string;
  name: string;
  type: 'singles' | 'tag';
  currentChampion?: string | string[]; // playerId or array for tag teams
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
}

export interface Tournament {
  tournamentId: string;
  name: string;
  type: 'single-elimination' | 'round-robin';
  status: 'upcoming' | 'in-progress' | 'completed';
  participants: string[]; // playerIds
  brackets?: TournamentBracket; // for single-elimination
  standings?: RoundRobinStanding[]; // for round-robin
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
  sortedByWins: boolean;
}
