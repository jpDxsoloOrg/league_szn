export interface WinLossRecord {
  wins: number;
  losses: number;
  draws: number;
}

export interface SeasonRecord extends WinLossRecord {
  seasonId: string;
  seasonName: string;
  seasonStatus: string;
}

export function formatRecord({ wins, losses, draws }: WinLossRecord): string {
  return `${wins}-${losses}-${draws}`;
}

export function getWinPercentage({ wins, losses, draws }: WinLossRecord): string {
  const total = wins + losses + draws;
  if (total === 0) return '0';
  return ((wins / total) * 100).toFixed(1);
}

/** Colour band for a win rate. Empty when no matches have been played. */
export function getWinTone({ wins, losses, draws }: WinLossRecord): '' | 'high' | 'medium' | 'low' {
  const total = wins + losses + draws;
  if (total === 0) return '';
  const percentage = (wins / total) * 100;
  if (percentage >= 60) return 'high';
  if (percentage >= 40) return 'medium';
  return 'low';
}
