import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ─── Mocks ───────────────────────────────────────────────────────────

const mockClearAllData = vi.fn();
const mockExportAllData = vi.fn();
const mockImportAllData = vi.fn();

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    clearAllData: mockClearAllData,
    exportAllData: mockExportAllData,
    importAllData: mockImportAllData,
  }),
}));

const { mockUuidV4 } = vi.hoisted(() => {
  let counter = 0;
  return {
    mockUuidV4: vi.fn(() => `test-uuid-${++counter}`),
  };
});

vi.mock('uuid', () => ({
  v4: mockUuidV4,
}));

import { handler as seedData } from '../seedData';
import { handler as clearAll } from '../clearAll';
import { buildTagTeamIndex, splitSidesIntoTeams } from '../../../lib/tagTeams/resolveTagTeams';
import type {
  Contract,
  Match,
  Player,
  PlayerProgression,
  ProgressionEvent,
  ProgressionTrack,
  TagTeam,
} from '../../../lib/repositories/types';
import type { LedgerEntry } from '../../../lib/repositories/ledger';
import type { GmInterferenceRequest } from '../../../lib/repositories/gmInterference';

// ─── Helpers ─────────────────────────────────────────────────────────

const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '',
    requestContext: { authorizer: {} } as any,
    ...overrides,
  };
}

function withAuth(event: APIGatewayProxyEvent, groups: string, sub = 'user-sub-1'): APIGatewayProxyEvent {
  return {
    ...event,
    requestContext: {
      ...event.requestContext,
      authorizer: { groups, username: 'testuser', email: 'test@test.com', principalId: sub },
    } as any,
  };
}

beforeEach(() => {
  process.env.STAGE = 'devtest';
  delete process.env.IS_OFFLINE;
});

afterEach(() => {
  delete process.env.STAGE;
});

// ─── stage guard ────────────────────────────────────────────────────

describe('bulk data stage guard', () => {
  beforeEach(() => vi.clearAllMocks());

  const adminEvent = (overrides: Partial<APIGatewayProxyEvent> = {}) =>
    withAuth(makeEvent(overrides), 'Admin');
  const importBody = JSON.stringify({
    mode: 'import',
    payload: { version: 1, exportedAt: 'now', stage: 'devtest', data: { players: [] } },
  });

  // The serverless stage named dev is production.
  it.each([['dev'], ['prod'], ['unexpected'], [undefined]])(
    'refuses clear-all, seed and import on stage %s',
    async (stage) => {
      if (stage === undefined) delete process.env.STAGE;
      else process.env.STAGE = stage;

      const clearResult = await clearAll(adminEvent(), ctx, cb);
      const seedResult = await seedData(adminEvent(), ctx, cb);
      const importResult = await seedData(adminEvent({ body: importBody }), ctx, cb);

      expect(clearResult!.statusCode).toBe(403);
      expect(seedResult!.statusCode).toBe(403);
      expect(importResult!.statusCode).toBe(403);
      expect(mockClearAllData).not.toHaveBeenCalled();
      expect(mockImportAllData).not.toHaveBeenCalled();
    },
  );

  it.each([['devtest'], ['offline']])('allows stage %s', async (stage) => {
    process.env.STAGE = stage;
    mockClearAllData.mockResolvedValue({});
    mockImportAllData.mockResolvedValue({});

    expect((await clearAll(adminEvent(), ctx, cb))!.statusCode).toBe(200);
    expect((await seedData(adminEvent(), ctx, cb))!.statusCode).toBe(200);
  });

  it('allows a local run that has no stage set, as the seed script does', async () => {
    delete process.env.STAGE;
    process.env.IS_OFFLINE = 'true';
    mockImportAllData.mockResolvedValue({});

    expect((await seedData(adminEvent(), ctx, cb))!.statusCode).toBe(200);
  });
});

// ─── import payload ─────────────────────────────────────────────────

describe('seedData import mode', () => {
  beforeEach(() => vi.clearAllMocks());

  const importEvent = (data: unknown) =>
    withAuth(
      makeEvent({
        body: JSON.stringify({
          mode: 'import',
          payload: { version: 1, exportedAt: 'now', stage: 'devtest', data },
        }),
      }),
      'Admin',
    );

  it('passes on only the datasets the payload contains', async () => {
    mockImportAllData.mockResolvedValue({ players: 1 });

    const result = await seedData(importEvent({ players: [{ playerId: 'p1' }] }), ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(mockImportAllData).toHaveBeenCalledWith({ players: [{ playerId: 'p1' }] });
  });

  it('rejects a dataset that is not an array', async () => {
    const result = await seedData(importEvent({ players: 'nope' }), ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(mockImportAllData).not.toHaveBeenCalled();
  });

  it('rejects a payload with no known dataset', async () => {
    const result = await seedData(importEvent({ playerz: [] }), ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(mockImportAllData).not.toHaveBeenCalled();
  });

  it('does not return the underlying error text', async () => {
    mockImportAllData.mockRejectedValue(new Error('internal table detail'));

    const result = await seedData(importEvent({ players: [] }), ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to import data payload');
  });
});

// ─── seedData ───────────────────────────────────────────────────────

describe('seedData', () => {
  beforeEach(() => vi.clearAllMocks());

  it('seeds all sample data and returns created counts', async () => {
    mockImportAllData.mockResolvedValue({
      divisions: 3, players: 12, seasons: 1, seasonStandings: 12,
      championships: 4, championshipHistory: 4, matches: 12, tournaments: 2,
      events: 3, contenderRankings: 8, rankingHistory: 9,
      challenges: 6, promos: 7, siteConfig: 1,
    });

    const result = await seedData(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.message).toBe('Sample data seeded successfully!');

    // Verify all expected categories have counts
    expect(body.createdCounts.divisions).toBe(3);
    expect(body.createdCounts.players).toBe(12);
    expect(body.createdCounts.seasons).toBe(1);
    expect(body.createdCounts.seasonStandings).toBe(12);
    expect(body.createdCounts.championships).toBe(4);
    expect(body.createdCounts.championshipHistory).toBe(4);
    expect(body.createdCounts.matches).toBe(12);
    expect(body.createdCounts.tournaments).toBe(2);
    expect(body.createdCounts.events).toBe(3);
    expect(body.createdCounts.contenderRankings).toBe(8);
    expect(body.createdCounts.rankingHistory).toBe(9);
    expect(body.createdCounts.challenges).toBe(6);
    expect(body.createdCounts.promos).toBe(7);
    expect(body.createdCounts.siteConfig).toBe(1);

    // Verify importAllData was called with data
    expect(mockImportAllData).toHaveBeenCalledOnce();
    const importData = mockImportAllData.mock.calls[0][0];
    expect(importData.divisions).toHaveLength(4);
    // 12 league players plus 4 Young Boys prospects (CUP-12).
    expect(importData.players).toHaveLength(16);
  });

  it('seeds match ratings + rivalry heat aggregates (RIV-33)', async () => {
    mockImportAllData.mockResolvedValue({ players: 12, matches: 12, matchRatings: 48 });

    await seedData(makeEvent(), ctx, cb);

    const importData = mockImportAllData.mock.calls[0][0];

    // matchRatings dataset is present and populated.
    expect(Array.isArray(importData.matchRatings)).toBe(true);
    expect(importData.matchRatings.length).toBeGreaterThan(20);

    // Every rating row carries the required composite-key fields.
    for (const r of importData.matchRatings) {
      expect(typeof r.matchId).toBe('string');
      expect(typeof r.userId).toBe('string');
      expect(typeof r.rating).toBe('number');
      expect(r.rating).toBeGreaterThanOrEqual(0.5);
      expect(r.rating).toBeLessThanOrEqual(5);
    }

    // Match aggregates are stamped on completed matches that received ratings.
    const ratedMatches = importData.matches.filter(
      (m: Record<string, unknown>) => typeof m.ratingsCount === 'number' && (m.ratingsCount as number) > 0,
    );
    // 5 (rivalry 1) + 3 (rivalry 2); the Young Boys bouts are rated too but carry no rivalry.
    expect(ratedMatches.filter((m: Record<string, unknown>) => typeof m.rivalryId === 'string')).toHaveLength(8);
    for (const m of ratedMatches) {
      expect(typeof m.ratingAverage).toBe('number');
      expect(typeof m.starRating).toBe('number');
    }

    // Rivalry META rows carry tier-aligned heatScore/heat.
    const rivalryMetas = importData.rivalries.filter(
      (r: Record<string, unknown>) => r.recordType === 'META',
    );
    const tiers = rivalryMetas.map((r: Record<string, unknown>) => r.heat);
    expect(tiers).toContain('scorching');
    expect(tiers).toContain('cold');
    expect(tiers).toContain('warm');
    for (const meta of rivalryMetas) {
      expect(typeof meta.heatScore).toBe('number');
    }

    // At least one Match of the Night is flagged for the scorching rivalry.
    expect(ratedMatches.some((m: Record<string, unknown>) => m.matchOfTheNight === true)).toBe(true);
  });

  it('seeds active tag teams with enough tag matches to be ranked (TTC-11)', async () => {
    mockImportAllData.mockResolvedValue({});

    const result = await seedData(makeEvent(), ctx, cb);
    expect(result!.statusCode).toBe(200);

    const importData = mockImportAllData.mock.calls[0][0] as Record<string, Record<string, unknown>[]>;
    const tagTeams = importData.tagTeams as unknown as TagTeam[];
    expect(tagTeams.length).toBeGreaterThanOrEqual(5);
    expect(tagTeams.every((team) => team.status === 'active')).toBe(true);

    // The tag title is held by a registered team, and its reign is linked to it.
    const tagTitle = importData.championships.find((c) => c.type === 'tag');
    const championTeam = tagTeams.find((team) => team.tagTeamId === tagTitle?.currentTagTeamId);
    expect(championTeam).toBeDefined();
    expect(tagTitle?.currentChampion).toEqual([championTeam!.player1Id, championTeam!.player2Id]);
    const reign = importData.championshipHistory.find((h) => h.championshipId === tagTitle?.championshipId);
    expect(reign?.tagTeamId).toBe(championTeam!.tagTeamId);

    // Resolve the seeded season's tag matches the way the ranking does.
    const season = importData.seasons[0];
    const index = buildTagTeamIndex(tagTeams);
    const matchesPerTeam = new Map<string, number>();
    let unresolvedSides = 0;
    for (const match of importData.matches as unknown as Match[]) {
      if (match.status !== 'completed' || match.seasonId !== season.seasonId) continue;
      const split = splitSidesIntoTeams(match, index);
      if (!split) continue;
      for (const side of split.sides) {
        if (!side.tagTeamId) {
          unresolvedSides += 1;
          continue;
        }
        matchesPerTeam.set(side.tagTeamId, (matchesPerTeam.get(side.tagTeamId) ?? 0) + 1);
      }
    }

    const contenders = tagTeams.filter((team) => team.tagTeamId !== championTeam!.tagTeamId);
    expect(contenders.length).toBeGreaterThanOrEqual(4);
    for (const team of contenders) {
      expect(matchesPerTeam.get(team.tagTeamId) ?? 0).toBeGreaterThanOrEqual(3);
    }
    // The random pairing gives two sides that belong to no team.
    expect(unresolvedSides).toBe(2);

    // Precomputed tag contender rows point at the contending teams.
    const tagRows = importData.contenderRankings.filter((row) => row.championshipId === tagTitle?.championshipId);
    expect(tagRows).toHaveLength(contenders.length);
    for (const row of tagRows) {
      expect(row.entityType).toBe('tagTeam');
      expect(row.tagTeamId).toBe(row.playerId);
      expect(contenders.some((team) => team.tagTeamId === row.tagTeamId)).toBe(true);
    }
  });

  it('seeds the call-up track with Young Boys at varied progress, one flagged (CUP-12)', async () => {
    mockImportAllData.mockResolvedValue({});

    const result = await seedData(makeEvent(), ctx, cb);
    expect(result!.statusCode).toBe(200);

    const importData = mockImportAllData.mock.calls[0][0] as Record<string, Record<string, unknown>[]>;
    const youngBoys = importData.divisions.find((division) => division.isDevelopmental === true);
    expect(youngBoys).toBeDefined();

    const tracks = (importData.progressionTracks as unknown as ProgressionTrack[])
      .filter((candidate) => candidate.kind === 'callup');
    expect(tracks).toHaveLength(1);
    const [track] = tracks;
    expect(track.kind).toBe('callup');
    expect(track.fromDivisionId).toBe(youngBoys!.divisionId);
    expect(track.windowMode).toBe('sinceJoinedDivision');

    // One row per Young Boys player, all on the default track.
    const youngBoysIds = importData.players
      .filter((player) => player.divisionId === youngBoys!.divisionId)
      .map((player) => player.playerId);
    const rows = (importData.playerProgression as unknown as PlayerProgression[])
      .filter((row) => row.trackId === track.trackId);
    expect(rows.map((row) => row.playerId).sort()).toEqual([...youngBoysIds].sort());

    // The four prospects land at clearly different points: 100, ~70, ~23, 10.
    const pctByName = new Map(
      rows.map((row) => [importData.players.find((p) => p.playerId === row.playerId)?.currentWrestler, row.progressPct]),
    );
    expect(pctByName.get('Ace Rookie')).toBe(100);
    expect(pctByName.get('Blaze Carter')).toBeCloseTo(70.4, 1);
    expect(pctByName.get('Comet Kid')).toBeCloseTo(23.3, 1);
    expect(pctByName.get('Dash Malone')).toBe(10);
    const prospectPcts = ['Ace Rookie', 'Blaze Carter', 'Comet Kid', 'Dash Malone'].map((name) => pctByName.get(name));
    expect(new Set(prospectPcts).size).toBe(4);

    // Ace's pre-join match is outside the window: 10 matches count, not 11.
    const ace = rows.find((row) => row.progressPct === 100)!;
    expect(ace.goals.find((goal) => goal.goalId === 'matches-competed')?.current).toBe(10);

    // Milestones already reached are recorded, so the first recompute stays quiet.
    expect(ace.notifiedThresholds).toEqual([50, 75, 100]);
    expect(ace.notifiedGoalIds).toHaveLength(track.goals.length);

    // Exactly one prospect is flagged, with a matching history event.
    const flagged = rows.filter((row) => row.consideration);
    expect(flagged).toHaveLength(1);
    expect(flagged[0].playerId).toBe(ace.playerId);
    expect(flagged[0].consideration?.status).toBe('considering');
    const events = (importData.progressionEvents as unknown as ProgressionEvent[])
      .filter((event) => event.kind === 'callup' && event.type === 'consideration_added');
    expect(events).toEqual([
      expect.objectContaining({ playerId: ace.playerId, type: 'consideration_added', kind: 'callup' }),
    ]);
  });

  it('seeds the division ladder: tracks, watch flags, a hot-angle slump, history and a season review (DMV-10)', async () => {
    mockImportAllData.mockResolvedValue({});

    const result = await seedData(makeEvent(), ctx, cb);
    expect(result!.statusCode).toBe(200);

    const importData = mockImportAllData.mock.calls[0][0] as Record<string, Record<string, unknown>[]>;
    const divisionId = (name: string): string =>
      importData.divisions.find((division) => division.name === name)?.divisionId as string;
    const playerId = (wrestler: string): string =>
      importData.players.find((player) => player.currentWrestler === wrestler)?.playerId as string;

    // Default tracks: NXT can go up and down, the tier-1 brands only down.
    const tracks = importData.progressionTracks as unknown as ProgressionTrack[];
    const trackOf = (kind: string, division: string): ProgressionTrack | undefined =>
      tracks.find((track) => track.kind === kind && track.fromDivisionId === divisionId(division));
    expect(trackOf('promotion', 'NXT')).toBeDefined();
    expect(trackOf('relegation', 'NXT')).toBeDefined();
    expect(trackOf('relegation', 'Raw')).toBeDefined();
    expect(trackOf('relegation', 'SmackDown')).toBeDefined();
    expect(trackOf('promotion', 'Raw')).toBeUndefined();
    expect(trackOf('promotion', 'SmackDown')).toBeUndefined();

    const rows = importData.playerProgression as unknown as PlayerProgression[];
    const rowOf = (wrestler: string, track: ProgressionTrack | undefined): PlayerProgression | undefined =>
      rows.find((row) => row.playerId === playerId(wrestler) && row.trackId === track?.trackId);

    // Promotion watch: Undertaker and Cena, both well on their way.
    for (const wrestler of ['The Undertaker', 'John Cena']) {
      const row = rowOf(wrestler, trackOf('promotion', 'NXT'));
      expect(row?.consideration?.status, wrestler).toBe('considering');
      expect(row?.progressPct, wrestler).toBeGreaterThanOrEqual(50);
    }
    expect(rowOf('The Undertaker', trackOf('promotion', 'NXT'))?.progressPct).toBe(75);

    // Relegation watch: CM Punk, in real danger.
    const punk = rowOf('CM Punk', trackOf('relegation', 'SmackDown'));
    expect(punk?.consideration?.status).toBe('considering');
    expect(punk?.progressPct).toBeGreaterThanOrEqual(60);
    expect(punk?.goals.find((goal) => goal.goalId === 'loss-pct')?.met).toBe(true);
    const flagged = rows.filter((row) => row.consideration && row.trackId !== tracks.find((t) => t.kind === 'callup')?.trackId);
    expect(flagged).toHaveLength(3);

    // The Rock keeps losing to Stone Cold in their scorching rivalry, yet his
    // relegation danger stays near zero: hot-angle losses never count.
    const scorching = importData.rivalries.find((row) => row.recordType === 'META' && row.heat === 'scorching');
    const rockLosses = (importData.matches as unknown as Match[]).filter((match) =>
      match.rivalryId === scorching?.rivalryId && match.losers?.includes(playerId('The Rock')));
    expect(rockLosses.length).toBeGreaterThanOrEqual(5);
    const rock = rowOf('The Rock', trackOf('relegation', 'SmackDown'));
    expect(rock?.progressPct).toBeLessThan(10);
    expect(rock?.goals.find((goal) => goal.goalId === 'loss-pct')?.met).toBe(false);
    expect(rock?.consideration).toBeUndefined();

    // Edge's history: Young Boys -> NXT -> Raw, the promotion announced.
    const events = importData.progressionEvents as unknown as Array<ProgressionEvent & { createdAtEventId?: string; recordType?: string }>;
    const edgeMoves = events
      .filter((event) => event.playerId === playerId('Edge') && event.type === 'executed')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    expect(edgeMoves.map((event) => [event.kind, event.fromDivisionId, event.toDivisionId])).toEqual([
      ['callup', divisionId('Young Boys'), divisionId('NXT')],
      ['promotion', divisionId('NXT'), divisionId('Raw')],
    ]);
    expect(edgeMoves[1].announced).toBe(true);
    // Every event row carries the table's sort key, or the import put fails.
    for (const event of events.filter((row) => row.recordType === undefined)) {
      expect(event.createdAtEventId).toBe(`${event.createdAt}#${event.eventId}`);
    }

    // A completed Pilot Season with its review: Edge's promotion applied,
    // CM Punk's relegation recommended and waiting for a GM.
    const pilot = importData.seasons.find((season) => season.status === 'completed');
    expect(pilot).toBeDefined();
    const reviews = events.filter((row) => row.playerId === `seasonReview#${pilot?.seasonId}`) as unknown as Array<Record<string, unknown>>;
    expect(reviews).toHaveLength(9);
    const reviewOf = (wrestler: string) => reviews.find((review) => review.reviewPlayerId === playerId(wrestler));
    expect(reviewOf('Edge')).toMatchObject({ divisionId: divisionId('NXT'), recommendation: 'promote', decision: 'promote', toDivisionId: divisionId('Raw') });
    expect(reviewOf('CM Punk')).toMatchObject({ recommendation: 'relegate' });
    expect(reviewOf('CM Punk')?.decision).toBeUndefined();
    expect(reviewOf('The Rock')).toMatchObject({ recommendation: 'stay' });

    // Zones of 1 or 2 on the three-player tables.
    expect(importData.divisions.find((division) => division.name === 'NXT')).toMatchObject({ promotionZoneSize: 2, relegationZoneSize: 1 });
  });

  it('seeds contracts, wallets, a debt, fines and a pending GM interference request (ECO-15)', async () => {
    mockImportAllData.mockResolvedValue({});

    const result = await seedData(makeEvent(), ctx, cb);
    expect(result!.statusCode).toBe(200);

    const importData = mockImportAllData.mock.calls[0][0] as Record<string, Record<string, unknown>[]>;
    const players = importData.players as unknown as Player[];
    const playerOf = (wrestler: string): Player => {
      const found = players.find((player) => player.currentWrestler === wrestler);
      if (!found) throw new Error(`No seeded player for ${wrestler}`);
      return found;
    };
    const contracts = importData.contracts as unknown as Contract[];
    const ledger = importData.ledger as unknown as LedgerEntry[];
    const contractsOf = (wrestler: string): Contract[] =>
      contracts.filter((contract) => contract.playerId === playerOf(wrestler).playerId);

    // The economy flag is on, so the seeded data shows up.
    const features = importData.siteConfig.find((row) => row.configKey === 'features')?.features as Record<string, boolean>;
    expect(features.economy).toBe(true);

    // Every contract type, plus open offers and a finished and a released contract.
    expect(new Set(contracts.filter((contract) => contract.status === 'active').map((contract) => contract.type)))
      .toEqual(new Set(['tryout', 'matches', 'season']));
    expect(contracts.filter((contract) => contract.status === 'offered')).toHaveLength(2);
    expect(contractsOf('The Undertaker').map((contract) => contract.status).sort()).toEqual(['completed', 'offered']);
    expect(contractsOf('CM Punk')[0]).toMatchObject({ status: 'released', endReason: 'released' });
    for (const contract of contracts) {
      expect(contract.createdAt).toBe(contract.offeredAt);
      if (contract.type === 'season') expect(contract.seasonId).toBeDefined();
      else expect(contract.matchesTotal).toBeGreaterThan(0);
    }

    // activeContractId points at the one active contract; everyone else is a free agent.
    for (const player of players) {
      const active = contracts.find((contract) => contract.playerId === player.playerId && contract.status === 'active');
      expect(player.activeContractId, player.currentWrestler).toBe(active?.contractId);
    }
    expect(players.filter((player) => player.activeContractId === undefined).length).toBeGreaterThan(5);

    // Each cached balance is the last balanceAfter, and the running totals add up.
    const byPlayer = new Map<string, LedgerEntry[]>();
    for (const entry of ledger) byPlayer.set(entry.playerId, [...(byPlayer.get(entry.playerId) ?? []), entry]);
    for (const [playerId, entries] of byPlayer) {
      const ordered = [...entries].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
      let running = 0;
      for (const entry of ordered) {
        running += entry.amount;
        expect(entry.balanceAfter).toBe(running);
        expect(entry.sortKey).toBe(`${entry.createdAt}#${entry.entryId}`);
      }
      expect(players.find((player) => player.playerId === playerId)?.balance).toBe(running);
    }
    const keys = ledger.map((entry) => entry.idempotencyKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect((importData.ledgerIdempotency ?? []).map((row) => row.idempotencyKey).sort()).toEqual([...keys].sort());

    // Fixed amounts from the default settings and the DMV-10 bouts.
    expect(playerOf('Stone Cold Steve Austin').balance).toBe(1100 - 300);
    expect(playerOf('Stone Cold Steve Austin').effects).toEqual([expect.objectContaining({ kind: 'injuryShield' })]);
    expect(playerOf('The Rock').balance).toBe(1000 + 3 * 150 - 1000);
    expect(playerOf('Edge').balance).toBe(2 * (100 + 50));
    expect(playerOf('The Undertaker').balance).toBe(3 * (100 + 50) + 4 * 50);
    expect(playerOf('Bret Hart').balance).toBe(50);
    expect(playerOf('CM Punk').balance).toBeUndefined();

    // Shawn is in debt after two fines.
    const shawn = playerOf('Shawn Michaels');
    expect(shawn.balance).toBeLessThan(0);
    expect(ledger.filter((entry) => entry.playerId === shawn.playerId && entry.kind === 'fine')).toHaveLength(2);

    // One pending GM interference request, paid for by its charge entry.
    const requests = importData.gmInterference as unknown as GmInterferenceRequest[];
    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request).toMatchObject({ playerId: playerOf('The Rock').playerId, status: 'pending', sequence: 1 });
    const charge = ledger.find((entry) => entry.entryId === request.chargeEntryId);
    expect(charge).toMatchObject({ kind: 'purchase', amount: -request.price, idempotencyKey: request.chargeKey });
  });

  it('returns 500 when importAllData throws', async () => {
    mockImportAllData.mockRejectedValue(new Error('write error'));

    const result = await seedData(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to seed data');
  });

  it('accepts optional body with modules array and still runs full seed', async () => {
    mockImportAllData.mockResolvedValue({
      divisions: 3, players: 12, seasons: 1, seasonStandings: 12,
      championships: 4, championshipHistory: 4, matches: 12, tournaments: 2,
      events: 3, contenderRankings: 8, rankingHistory: 9,
      challenges: 6, promos: 7, siteConfig: 1,
    });

    const result = await seedData(
      makeEvent({ body: '{"modules":["core"]}' }),
      ctx,
      cb
    );

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.createdCounts.divisions).toBe(3);
    expect(body.createdCounts.players).toBe(12);
  });

  it('runs full seed when body is empty or modules array is empty', async () => {
    mockImportAllData.mockResolvedValue({
      divisions: 3, players: 12, seasons: 1, seasonStandings: 12,
      championships: 4, championshipHistory: 4, matches: 12, tournaments: 2,
      events: 3, contenderRankings: 8, rankingHistory: 9,
      challenges: 6, promos: 7, siteConfig: 1,
    });

    const resultEmptyBody = await seedData(makeEvent({ body: '{}' }), ctx, cb);
    expect(resultEmptyBody!.statusCode).toBe(200);
    expect(JSON.parse(resultEmptyBody!.body).createdCounts.players).toBe(12);

    const resultEmptyModules = await seedData(
      makeEvent({ body: '{"modules":[]}' }),
      ctx,
      cb
    );
    expect(resultEmptyModules!.statusCode).toBe(200);
    expect(JSON.parse(resultEmptyModules!.body).createdCounts.players).toBe(12);
  });

  it('returns 400 when body has only invalid module IDs', async () => {
    const result = await seedData(
      makeEvent({ body: '{"modules":["unknown-module"]}' }),
      ctx,
      cb
    );
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toMatch(/Invalid|unknown/i);
  });
});

// ─── clearAll ───────────────────────────────────────────────────────

describe('clearAll', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 403 when user has no auth groups', async () => {
    const event = makeEvent();

    const result = await clearAll(event, ctx, cb);

    expect(result!.statusCode).toBe(403);
    expect(JSON.parse(result!.body).message).toContain('Admin privileges');
  });

  it('returns 403 when user is Moderator (not full Admin)', async () => {
    const event = withAuth(makeEvent(), 'Moderator');

    const result = await clearAll(event, ctx, cb);

    expect(result!.statusCode).toBe(403);
    expect(JSON.parse(result!.body).message).toContain('Admin privileges');
  });

  it('returns 403 when user is Wrestler role', async () => {
    const event = withAuth(makeEvent(), 'Wrestler');

    const result = await clearAll(event, ctx, cb);

    expect(result!.statusCode).toBe(403);
  });

  it('clears all tables and returns deleted counts when Admin', async () => {
    mockClearAllData.mockResolvedValue({
      players: { deleted: 2, errors: 0 },
      matches: { deleted: 2, errors: 0 },
      championships: { deleted: 2, errors: 0 },
      championshipHistory: { deleted: 2, errors: 0 },
      tournaments: { deleted: 2, errors: 0 },
      seasons: { deleted: 2, errors: 0 },
      seasonStandings: { deleted: 2, errors: 0 },
      divisions: { deleted: 2, errors: 0 },
      events: { deleted: 2, errors: 0 },
      contenderRankings: { deleted: 2, errors: 0 },
      contenderOverrides: { deleted: 2, errors: 0 },
      rankingHistory: { deleted: 2, errors: 0 },
      challenges: { deleted: 2, errors: 0 },
      promos: { deleted: 2, errors: 0 },
    });
    const event = withAuth(makeEvent(), 'Admin');

    const result = await clearAll(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.message).toBe('All data cleared successfully');
    expect(mockClearAllData).toHaveBeenCalledOnce();

    const labels = ['players', 'matches', 'championships', 'championshipHistory',
      'tournaments', 'seasons', 'seasonStandings', 'divisions', 'events',
      'contenderRankings', 'contenderOverrides', 'rankingHistory', 'challenges', 'promos'];
    for (const label of labels) {
      expect(body.deletedCounts[label]).toBe(2);
    }
  });

  it('returns zero counts when all tables are empty', async () => {
    mockClearAllData.mockResolvedValue({
      players: { deleted: 0, errors: 0 },
      matches: { deleted: 0, errors: 0 },
    });

    const event = withAuth(makeEvent(), 'Admin');

    const result = await clearAll(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.message).toBe('All data cleared successfully');
    expect(body.deletedCounts.players).toBe(0);
    expect(body.deletedCounts.matches).toBe(0);
  });

  it('reports error counts when individual deletes fail', async () => {
    mockClearAllData.mockResolvedValue({
      players: { deleted: 2, errors: 1 },
      matches: { deleted: 3, errors: 0 },
    });

    const event = withAuth(makeEvent(), 'Admin');

    const result = await clearAll(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.message).toContain('error(s)');
    expect(body.errorCounts).toBeDefined();
    expect(body.errorCounts.players).toBe(1);
  });

  it('returns 500 when clearAllData throws', async () => {
    mockClearAllData.mockRejectedValue(new Error('scan error'));

    const event = withAuth(makeEvent(), 'Admin');

    const result = await clearAll(event, ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to clear all data');
  });
});
