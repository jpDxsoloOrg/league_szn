import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { createNotification, listStaffUserIds } = vi.hoisted(() => ({
  createNotification: vi.fn(),
  listStaffUserIds: vi.fn(),
}));

vi.mock('../../notifications', () => ({ createNotification }));
vi.mock('../../staffUsers', () => ({ listStaffUserIds }));

import { injuryImpact, notifyStaffOfInjuries, staffInjuryMessage } from '../notifyStaff';
import { buildInMemoryRepositories } from '../../repositories/inMemory';
import { resetRepositoriesForTesting, setRepositoriesForTesting, type Repositories } from '../../repositories';
import type { Match } from '../../repositories/types';

// INJ-07

const TZ = 'America/New_York';
const RETURNS_AT = '2026-12-06T05:00:00.000Z';

const match = (matchId: string, date: string, status: Match['status'], participants: string[]) =>
  ({ matchId, date, status, participants });

describe('injuryImpact', () => {
  it('counts scheduled matches before the return date and the titles held', () => {
    const impact = injuryImpact('p1', RETURNS_AT, [
      match('during', '2026-12-01T01:00:00.000Z', 'scheduled', ['p1', 'p2']),
      match('after', '2026-12-08T01:00:00.000Z', 'scheduled', ['p1', 'p2']),
      match('done', '2026-11-30T01:00:00.000Z', 'completed', ['p1', 'p2']),
      match('other', '2026-12-01T01:00:00.000Z', 'scheduled', ['p2', 'p3']),
    ], [
      { name: 'World Title', currentChampion: 'p1', isActive: true },
      { name: 'Tag Titles', currentChampion: ['p1', 'p4'] },
      { name: 'Retired Title', currentChampion: 'p1', isActive: false },
      { name: 'Midcard Title', currentChampion: 'p2' },
    ]);
    expect(impact).toEqual({ scheduledMatchIds: ['during'], titles: ['World Title', 'Tag Titles'] });
  });
});

describe('staffInjuryMessage', () => {
  it('names the matches and titles', () => {
    expect(staffInjuryMessage('The Rock', RETURNS_AT, { scheduledMatchIds: ['a', 'b'], titles: ['World Title', 'Tag Titles'] }, TZ))
      .toBe('The Rock is injured until Sun, Dec 6. Affected: 2 scheduled matches, holds World Title and Tag Titles');
  });

  it('uses the singular and leaves out titles when none are held', () => {
    expect(staffInjuryMessage('The Rock', RETURNS_AT, { scheduledMatchIds: ['a'], titles: [] }, TZ))
      .toBe('The Rock is injured until Sun, Dec 6. Affected: 1 scheduled match');
  });
});

describe('notifyStaffOfInjuries', () => {
  let repos: Repositories;

  beforeEach(async () => {
    repos = buildInMemoryRepositories();
    setRepositoriesForTesting(repos);
    createNotification.mockReset();
    listStaffUserIds.mockReset().mockResolvedValue(['admin-sub', 'mod-sub']);
  });

  afterEach(() => resetRepositoriesForTesting());

  it('sends every GM a notice listing the affected matches and titles', async () => {
    const player = await repos.roster.players.create({ name: 'Rock', currentWrestler: 'The Rock' });
    await repos.competition.matches.create({
      matchId: 'm1', date: '2026-12-01T01:00:00.000Z', status: 'scheduled', participants: [player.playerId, 'p2'],
    });
    await repos.competition.matches.create({
      matchId: 'm2', date: '2026-12-02T01:00:00.000Z', status: 'scheduled', participants: [player.playerId, 'p3'],
    });
    const title = await repos.competition.championships.create({ name: 'World Title', type: 'singles' });
    await repos.competition.championships.update(title.championshipId, { currentChampion: player.playerId });

    await notifyStaffOfInjuries([{ player, returnsAt: RETURNS_AT }], { timeZone: TZ });

    expect(createNotification).toHaveBeenCalledTimes(2);
    for (const userId of ['admin-sub', 'mod-sub']) {
      expect(createNotification).toHaveBeenCalledWith({
        userId,
        type: 'injury_staff_notice',
        message: 'The Rock is injured until Sun, Dec 6. Affected: 2 scheduled matches, holds World Title',
        sourceId: player.playerId,
        sourceType: 'injury',
      });
    }
  });

  it('never throws when a lookup fails', async () => {
    listStaffUserIds.mockRejectedValue(new Error('cognito down'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(notifyStaffOfInjuries([{
      player: { playerId: 'p1', name: 'A', currentWrestler: 'A' },
      returnsAt: RETURNS_AT,
    }])).resolves.toBeUndefined();
    expect(createNotification).not.toHaveBeenCalled();
  });
});
