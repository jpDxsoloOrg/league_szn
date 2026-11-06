import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

let uuidCounter = 0;
vi.mock('uuid', () => ({
  v4: () => `test-uuid-${++uuidCounter}`,
}));

const { mockS3Send } = vi.hoisted(() => ({ mockS3Send: vi.fn() }));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    send = mockS3Send;
  },
  PutObjectCommand: class {
    constructor(public input: { Bucket: string; Key: string; Body: string }) {}
  },
}));

import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import { NEEDS_WRESTLER } from '../../../lib/needsWrestler';
import {
  setRepositoriesForTesting,
  resetRepositoriesForTesting,
  type Repositories,
} from '../../../lib/repositories';
import { handler as resetAssignments, RESET_ASSIGNMENTS_CONFIRM_TOKEN } from '../resetAssignments';

let repos: Repositories;
const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: JSON.stringify({ confirm: RESET_ASSIGNMENTS_CONFIRM_TOKEN }),
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/wrestlers/reset-assignments',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '/wrestlers/reset-assignments',
    requestContext: { authorizer: {} } as unknown as APIGatewayProxyEvent['requestContext'],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockS3Send.mockResolvedValue({});
  process.env.IMAGES_BUCKET = 'test-images';
  uuidCounter = 0;
  resetRepositoriesForTesting();
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
});

async function seedWrestler(name: string) {
  return repos.roster.wrestlers.create({ promotion: 'WWE', name, overallCap: 90 });
}

async function seedPlayer(name: string) {
  return repos.roster.players.create({ name, currentWrestler: '' });
}

describe('resetAssignments', () => {
  it('returns zeros as a no-op when nothing is assigned', async () => {
    await seedWrestler('Cody Rhodes');
    await seedPlayer('Alice');

    const result = await resetAssignments(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body)).toEqual({
      clearedWrestlers: 0,
      clearedPlayers: 0,
    });
    expect(mockS3Send).not.toHaveBeenCalled();
  });

  it('clears every assigned wrestler and player FK, returning counts', async () => {
    const wrestlerOne = await seedWrestler('Cody Rhodes');
    const wrestlerTwo = await seedWrestler('MJF');
    const unassigned = await seedWrestler('Kazuchika Okada');

    const playerOne = await seedPlayer('Alice');
    const playerTwo = await seedPlayer('Bob');

    await repos.runInTransaction(async (tx) => {
      tx.assignWrestlerToPlayer({
        wrestlerId: wrestlerOne.wrestlerId,
        playerId: playerOne.playerId,
        slot: 'primary',
      });
      tx.assignWrestlerToPlayer({
        wrestlerId: wrestlerTwo.wrestlerId,
        playerId: playerTwo.playerId,
        slot: 'alternate',
      });
    });
    await repos.roster.players.update(playerOne.playerId, {
      currentWrestlerId: wrestlerOne.wrestlerId,
      currentWrestler: wrestlerOne.name,
    });
    await repos.roster.players.update(playerTwo.playerId, {
      alternateWrestlerId: wrestlerTwo.wrestlerId,
      alternateWrestler: wrestlerTwo.name,
    });

    const result = await resetAssignments(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body)).toEqual({
      clearedWrestlers: 2,
      clearedPlayers: 2,
      snapshotKey: expect.stringMatching(/^backups\/wrestler-assignments\/.+\.json$/),
    });

    const clearedOne = await repos.roster.wrestlers.findById(wrestlerOne.wrestlerId);
    const clearedTwo = await repos.roster.wrestlers.findById(wrestlerTwo.wrestlerId);
    expect(clearedOne!.isInUse).toBe(false);
    expect(clearedOne!.assignedPlayerId).toBeUndefined();
    expect(clearedOne!.assignedSlot).toBeUndefined();
    expect(clearedTwo!.isInUse).toBe(false);
    expect(clearedTwo!.assignedPlayerId).toBeUndefined();

    const untouched = await repos.roster.wrestlers.findById(unassigned.wrestlerId);
    expect(untouched!.isInUse).toBe(false);

    const freedPlayerOne = await repos.roster.players.findById(playerOne.playerId);
    expect(freedPlayerOne!.currentWrestlerId).toBeUndefined();
    expect(freedPlayerOne!.currentWrestler).toBe(NEEDS_WRESTLER);

    const freedPlayerTwo = await repos.roster.players.findById(playerTwo.playerId);
    expect(freedPlayerTwo!.alternateWrestlerId).toBeUndefined();
    expect(freedPlayerTwo!.alternateWrestler).toBeUndefined();
  });

  it('releases wrestlers flagged in-use even without an assignedPlayerId', async () => {
    const wrestler = await seedWrestler('Cody Rhodes');
    // Admin-toggled isInUse without an FK link (legacy P0 toggle).
    await repos.roster.wrestlers.update(wrestler.wrestlerId, { isInUse: true });

    const result = await resetAssignments(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body)).toEqual({
      clearedWrestlers: 1,
      clearedPlayers: 0,
      snapshotKey: expect.any(String),
    });

    const released = await repos.roster.wrestlers.findById(wrestler.wrestlerId);
    expect(released!.isInUse).toBe(false);
  });

  describe('safeguards', () => {
    async function seedAssignedPlayer() {
      const wrestler = await seedWrestler('Cody Rhodes');
      const player = await seedPlayer('Alice');
      await repos.runInTransaction(async (tx) => {
        tx.assignWrestlerToPlayer({
          wrestlerId: wrestler.wrestlerId,
          playerId: player.playerId,
          slot: 'primary',
        });
      });
      await repos.roster.players.update(player.playerId, {
        currentWrestlerId: wrestler.wrestlerId,
        currentWrestler: wrestler.name,
      });
      return { wrestler, player };
    }

    it.each([
      ['no body', null],
      ['an empty object', '{}'],
      ['the wrong token', JSON.stringify({ confirm: 'yes' })],
      ['a non-object body', JSON.stringify(RESET_ASSIGNMENTS_CONFIRM_TOKEN)],
    ])('rejects %s and changes nothing', async (_label, body) => {
      const { wrestler, player } = await seedAssignedPlayer();

      const result = await resetAssignments(makeEvent({ body }), ctx, cb);

      expect(result!.statusCode).toBe(400);
      expect(mockS3Send).not.toHaveBeenCalled();
      expect((await repos.roster.wrestlers.findById(wrestler.wrestlerId))!.isInUse).toBe(true);
      expect((await repos.roster.players.findById(player.playerId))!.currentWrestlerId).toBe(
        wrestler.wrestlerId,
      );
    });

    it('snapshots the assignments as they were before the reset', async () => {
      const { wrestler, player } = await seedAssignedPlayer();
      const stateAtSnapshot: Array<string | undefined> = [];
      mockS3Send.mockImplementation(async () => {
        const current = await repos.roster.players.findById(player.playerId);
        stateAtSnapshot.push(current!.currentWrestlerId);
        return {};
      });

      await resetAssignments(makeEvent(), ctx, cb);

      expect(stateAtSnapshot).toEqual([wrestler.wrestlerId]);
      const { input } = mockS3Send.mock.calls[0][0] as {
        input: { Bucket: string; Key: string; Body: string };
      };
      expect(input.Bucket).toBe('test-images');
      const snapshot = JSON.parse(input.Body);
      expect(snapshot.players).toEqual([
        {
          playerId: player.playerId,
          currentWrestler: 'Cody Rhodes',
          currentWrestlerId: wrestler.wrestlerId,
        },
      ]);
      expect(snapshot.wrestlers).toEqual([
        {
          wrestlerId: wrestler.wrestlerId,
          isInUse: true,
          assignedPlayerId: player.playerId,
          assignedSlot: 'primary',
        },
      ]);
    });

    it('aborts without writing when the snapshot fails', async () => {
      const { wrestler, player } = await seedAssignedPlayer();
      mockS3Send.mockRejectedValue(new Error('s3 down'));

      const result = await resetAssignments(makeEvent(), ctx, cb);

      expect(result!.statusCode).toBe(500);
      expect((await repos.roster.wrestlers.findById(wrestler.wrestlerId))!.isInUse).toBe(true);
      expect((await repos.roster.players.findById(player.playerId))!.currentWrestler).toBe(
        'Cody Rhodes',
      );
    });
  });
});
