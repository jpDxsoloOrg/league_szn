import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  eventInjuredParticipantsField,
  injuredParticipantsField,
  injuredParticipantsFor,
  loadInjuryLookup,
  type InjuryLookup,
} from '../scheduledMatchFlags';
import { buildInMemoryRepositories } from '../../repositories/inMemory';
import { resetRepositoriesForTesting, setRepositoriesForTesting, type Repositories } from '../../repositories';
import type { CurrentInjury } from '../../repositories/injuries';
import type { FeatureFlags } from '../../repositories/SiteConfigRepository';

// INJ-07

const RETURNS_AT = '2026-12-06T05:00:00.000Z';

const injury: CurrentInjury = {
  injuryId: 'inj-1',
  startedAt: '2026-11-20T20:00:00.000Z',
  returnsAt: RETURNS_AT,
  severity: 'moderate',
  weeks: 2,
  source: 'match',
};

const lookup: InjuryLookup = new Map([
  ['hurt', { currentInjury: injury }],
  ['healthy', {}],
]);

const scheduled = (date: string, participants = ['hurt', 'healthy']) => ({
  matchId: `m-${date}`,
  status: 'scheduled',
  date,
  participants,
});

describe('injuredParticipantsFor', () => {
  it('flags a participant injured on the match date, with the return date only', () => {
    expect(injuredParticipantsFor(scheduled('2026-12-01T01:00:00.000Z'), lookup)).toEqual([
      { playerId: 'hurt', returnsAt: RETURNS_AT },
    ]);
  });

  it('does not flag a match on or after the return date', () => {
    expect(injuredParticipantsFor(scheduled(RETURNS_AT), lookup)).toEqual([]);
    expect(injuredParticipantsFor(scheduled('2026-12-10T01:00:00.000Z'), lookup)).toEqual([]);
  });

  it('never flags a completed or cancelled match', () => {
    const during = '2026-12-01T01:00:00.000Z';
    expect(injuredParticipantsFor({ ...scheduled(during), status: 'completed' }, lookup)).toEqual([]);
    expect(injuredParticipantsFor({ ...scheduled(during), status: 'cancelled' }, lookup)).toEqual([]);
  });

  it('skips players missing from the lookup and lists a repeated participant once', () => {
    expect(injuredParticipantsFor(scheduled('2026-12-01T01:00:00.000Z', ['ghost', 'hurt', 'hurt']), lookup)).toEqual([
      { playerId: 'hurt', returnsAt: RETURNS_AT },
    ]);
  });
});

describe('injuredParticipantsField', () => {
  it('adds nothing without a lookup or when nobody is flagged', () => {
    expect(injuredParticipantsField(scheduled('2026-12-01T01:00:00.000Z'), null)).toEqual({});
    expect(injuredParticipantsField(scheduled('2026-12-10T01:00:00.000Z'), lookup)).toEqual({});
  });
});

describe('eventInjuredParticipantsField', () => {
  it('lists the injured participants of each scheduled match on the card', () => {
    const during = scheduled('2026-12-01T01:00:00.000Z');
    const after = scheduled('2026-12-10T01:00:00.000Z');
    const done = { ...scheduled('2026-11-30T01:00:00.000Z'), status: 'completed' };
    const matchesById = new Map([during, after, done].map((match) => [match.matchId, match]));
    const event = { matchCards: [{ matchId: during.matchId }, { matchId: after.matchId }, { matchId: done.matchId }, {}] };

    expect(eventInjuredParticipantsField(event, matchesById, lookup)).toEqual({
      injuredParticipants: [{ playerId: 'hurt', returnsAt: RETURNS_AT, matchId: during.matchId }],
    });
  });
});

describe('loadInjuryLookup', () => {
  let repos: Repositories;

  beforeEach(async () => {
    repos = buildInMemoryRepositories();
    setRepositoriesForTesting(repos);
  });

  afterEach(() => resetRepositoriesForTesting());

  it('is null while the injuries flag is off', async () => {
    await repos.user.siteConfig.updateFeatures({ injuries: false } as Partial<FeatureFlags>);
    expect(await loadInjuryLookup([scheduled('2026-12-01T01:00:00.000Z')])).toBeNull();
  });

  it('fetches the participants it does not already know', async () => {
    await repos.user.siteConfig.updateFeatures({ injuries: true } as Partial<FeatureFlags>);
    const created = await repos.roster.players.create({ name: 'Rock', currentWrestler: 'The Rock' });
    const result = await loadInjuryLookup([scheduled('2026-12-01T01:00:00.000Z', [created.playerId])]);
    expect(result?.has(created.playerId)).toBe(true);
  });
});
