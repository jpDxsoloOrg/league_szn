import { describe, it, expect, beforeEach } from 'vitest';
import { buildInMemoryRepositories } from '../inMemory';
import type { Repositories } from '../registry';

describe('UnitOfWork wrestler assignment methods', () => {
  let repos: Repositories;

  beforeEach(() => {
    repos = buildInMemoryRepositories();
  });

  it('assignWrestlerToPlayer sets isInUse + assignedPlayerId + assignedSlot', async () => {
    const wrestler = await repos.roster.wrestlers.create({
      promotion: 'WWE',
      name: 'The Rock',
      overallCap: 90,
    });
    expect(wrestler.isInUse).toBe(false);

    await repos.runInTransaction(async (tx) => {
      tx.assignWrestlerToPlayer({
        wrestlerId: wrestler.wrestlerId,
        playerId: 'player-1',
        slot: 'primary',
      });
    });

    const after = await repos.roster.wrestlers.findById(wrestler.wrestlerId);
    expect(after?.isInUse).toBe(true);
    expect(after?.assignedPlayerId).toBe('player-1');
    expect(after?.assignedSlot).toBe('primary');
  });

  it('releaseWrestlerFromPlayer clears assignment and flips isInUse', async () => {
    const wrestler = await repos.roster.wrestlers.create({
      promotion: 'WWE',
      name: 'The Rock',
      overallCap: 90,
    });

    await repos.runInTransaction(async (tx) => {
      tx.assignWrestlerToPlayer({
        wrestlerId: wrestler.wrestlerId,
        playerId: 'player-1',
        slot: 'alternate',
      });
    });
    await repos.runInTransaction(async (tx) => {
      tx.releaseWrestlerFromPlayer({ wrestlerId: wrestler.wrestlerId });
    });

    const after = await repos.roster.wrestlers.findById(wrestler.wrestlerId);
    expect(after?.isInUse).toBe(false);
    expect(after?.assignedPlayerId).toBeUndefined();
    expect(after?.assignedSlot).toBeUndefined();
  });

  it('batches multiple assigns + releases atomically in one transaction', async () => {
    const rock = await repos.roster.wrestlers.create({
      promotion: 'WWE',
      name: 'The Rock',
      overallCap: 90,
    });
    const cena = await repos.roster.wrestlers.create({
      promotion: 'WWE',
      name: 'John Cena',
      overallCap: 89,
    });

    // Set up: rock assigned to player-1 primary, cena assigned to player-2 primary
    await repos.runInTransaction(async (tx) => {
      tx.assignWrestlerToPlayer({
        wrestlerId: rock.wrestlerId,
        playerId: 'player-1',
        slot: 'primary',
      });
      tx.assignWrestlerToPlayer({
        wrestlerId: cena.wrestlerId,
        playerId: 'player-2',
        slot: 'primary',
      });
    });

    // Swap: release both, then reassign to the opposite player
    await repos.runInTransaction(async (tx) => {
      tx.releaseWrestlerFromPlayer({ wrestlerId: rock.wrestlerId });
      tx.releaseWrestlerFromPlayer({ wrestlerId: cena.wrestlerId });
      tx.assignWrestlerToPlayer({
        wrestlerId: rock.wrestlerId,
        playerId: 'player-2',
        slot: 'primary',
      });
      tx.assignWrestlerToPlayer({
        wrestlerId: cena.wrestlerId,
        playerId: 'player-1',
        slot: 'primary',
      });
    });

    const rockAfter = await repos.roster.wrestlers.findById(rock.wrestlerId);
    const cenaAfter = await repos.roster.wrestlers.findById(cena.wrestlerId);
    expect(rockAfter?.assignedPlayerId).toBe('player-2');
    expect(cenaAfter?.assignedPlayerId).toBe('player-1');
  });
});
