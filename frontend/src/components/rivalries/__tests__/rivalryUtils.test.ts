import { describe, it, expect } from 'vitest';
import type { Player } from '../../../types';
import type { RivalryParticipant } from '../../../types/rivalry';
import { resolvePlayerFullLabel, resolveWrestlerName, withDirectoryPlayers } from '../rivalryUtils';

const rosterPlayer: Player = {
  playerId: 'p1',
  name: 'Adam',
  currentWrestler: 'Edge',
  imageUrl: 'edge.png',
  wins: 3,
  losses: 1,
  draws: 0,
  createdAt: '',
  updatedAt: '',
};

const directory = [
  { playerId: 'p1', name: 'Adam', currentWrestler: 'Edge' },
  { playerId: 'p2', name: 'Hidden Person', currentWrestler: null },
];

describe('withDirectoryPlayers', () => {
  it('keeps the full roster record over the directory entry', () => {
    const [first] = withDirectoryPlayers([rosterPlayer], directory);

    expect(first).toBe(rosterPlayer);
  });

  it('adds a hidden participant so they read as a name, not an id', () => {
    const players = withDirectoryPlayers([rosterPlayer], directory);
    const hidden = players.find((player) => player.playerId === 'p2');
    const participant = { playerId: 'p2' } as RivalryParticipant;

    expect(resolveWrestlerName(participant, hidden)).toBe('Hidden Person');
    expect(resolvePlayerFullLabel(hidden, 'p2')).toContain('Hidden Person');
  });

  it('leaves the roster alone when the directory is unavailable', () => {
    expect(withDirectoryPlayers([rosterPlayer], [])).toEqual([rosterPlayer]);
  });
});
