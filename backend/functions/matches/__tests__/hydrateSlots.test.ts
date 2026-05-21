import { describe, it, expect } from 'vitest';
import type { MatchSlot, Player } from '../../../lib/repositories/types';
import { hydrateMatchSlots, collectSlotPlayerIds } from '../hydrateSlots';

const player = (over: Partial<Player> = {}): Player => ({
  playerId: 'p1',
  name: 'Doe',
  currentWrestler: 'Stone Cold',
  wins: 0,
  losses: 0,
  draws: 0,
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
  ...over,
});

describe('hydrateMatchSlots', () => {
  it('falls back to player.currentWrestler when no snapshot is set (legacy slot)', () => {
    const slots: MatchSlot[] = [
      { slotId: 's1', position: 1, playerId: 'p1' },
    ];
    const lookup = new Map<string, Player>([['p1', player({ currentWrestler: 'Stone Cold' })]]);
    const out = hydrateMatchSlots(slots, lookup);
    expect(out[0].wrestlerName).toBe('Stone Cold');
  });

  it('prefers wrestlerNameSnapshot over the player\'s current wrestler', () => {
    // MSL-03 snapshot rule: a player who later renamed their gimmick must NOT
    // retroactively rewrite what was billed for past matches.
    const slots: MatchSlot[] = [
      {
        slotId: 's1',
        position: 1,
        playerId: 'p1',
        wrestlerChoice: 'alternate',
        wrestlerNameSnapshot: 'The Rock',
      },
    ];
    const lookup = new Map<string, Player>([
      ['p1', player({ currentWrestler: 'Stone Cold', alternateWrestler: 'Some New Name' })],
    ]);
    const out = hydrateMatchSlots(slots, lookup);
    expect(out[0].wrestlerName).toBe('The Rock');
    expect(out[0].playerName).toBe('Doe');
  });

  it('returns "Unknown Wrestler" when neither snapshot nor player record is available', () => {
    const slots: MatchSlot[] = [
      { slotId: 's1', position: 1, playerId: 'p-missing' },
    ];
    const out = hydrateMatchSlots(slots, new Map());
    expect(out[0].wrestlerName).toBe('Unknown Wrestler');
    expect(out[0].playerName).toBe('Unknown Player');
  });

  it('leaves open (unfilled) slots untouched', () => {
    const slots: MatchSlot[] = [
      { slotId: 's1', position: 1 },
    ];
    const out = hydrateMatchSlots(slots, new Map());
    expect(out[0].wrestlerName).toBeUndefined();
    expect(out[0].playerName).toBeUndefined();
    expect(out[0].psnId).toBeUndefined();
  });

  it('plumbs psnId from the player record onto filled slots', () => {
    const slots: MatchSlot[] = [
      { slotId: 's1', position: 1, playerId: 'p1' },
    ];
    const lookup = new Map<string, Player>([['p1', player({ psnId: 'StoneCold_316' })]]);
    const out = hydrateMatchSlots(slots, lookup);
    expect(out[0].psnId).toBe('StoneCold_316');
  });

  it('leaves psnId undefined when the player has none on file', () => {
    const slots: MatchSlot[] = [
      { slotId: 's1', position: 1, playerId: 'p1' },
    ];
    const lookup = new Map<string, Player>([['p1', player({ psnId: undefined })]]);
    const out = hydrateMatchSlots(slots, lookup);
    expect(out[0].psnId).toBeUndefined();
  });
});

describe('collectSlotPlayerIds', () => {
  it('returns unique playerIds from filled slots only', () => {
    const slots: MatchSlot[] = [
      { slotId: 's1', position: 1, playerId: 'p1' },
      { slotId: 's2', position: 2 },
      { slotId: 's3', position: 3, playerId: 'p1' }, // dup
      { slotId: 's4', position: 4, playerId: 'p2' },
    ];
    expect(collectSlotPlayerIds(slots).sort()).toEqual(['p1', 'p2']);
  });
});
