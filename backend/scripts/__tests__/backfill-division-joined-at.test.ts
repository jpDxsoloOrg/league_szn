import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { Player } from '../../lib/repositories/types';
import { parseArgs, planBackfill, playersTableForStage, run } from '../backfill-division-joined-at';

type Client = Parameters<typeof run>[0];

function player(playerId: string, extra: Partial<Player> = {}): Player {
  return {
    playerId,
    name: playerId,
    currentWrestler: 'Someone',
    wins: 0,
    losses: 0,
    draws: 0,
    createdAt: `2025-01-0${playerId.slice(-1)}T00:00:00.000Z`,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  };
}

const players: Player[] = [
  player('p1', { divisionId: 'd1' }),
  player('p2', { divisionId: 'd1', divisionJoinedAt: '2025-06-01T00:00:00.000Z' }),
  player('p3'),
  player('p4', { divisionId: 'd2', deletedAt: '2026-01-01T00:00:00.000Z' }),
  { ...player('p5', { divisionId: 'd2' }), createdAt: '' },
];

function fakeClient(rows: Player[], failFor: string[] = []): { client: Client; send: ReturnType<typeof vi.fn> } {
  const send = vi.fn(async (command: unknown) => {
    if (command instanceof ScanCommand) return { Items: rows };
    if (command instanceof UpdateCommand) {
      const playerId = (command.input.Key as { playerId: string }).playerId;
      if (failFor.includes(playerId)) {
        const err = new Error('conditional');
        err.name = 'ConditionalCheckFailedException';
        throw err;
      }
      return {};
    }
    throw new Error('unexpected command');
  });
  return { client: { send } as unknown as Client, send };
}

describe('backfill-division-joined-at', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requires a stage and accepts --apply', () => {
    expect(() => parseArgs([])).toThrow('--stage');
    expect(parseArgs(['--stage', 'devtest'])).toEqual({ stage: 'devtest', apply: false });
    expect(parseArgs(['--stage=devtest', '--apply'])).toEqual({ stage: 'devtest', apply: true });
    expect(() => parseArgs(['--stage', 'devtest', '--force'])).toThrow('Unknown argument');
    expect(playersTableForStage('devtest')).toBe('wwe-2k-league-api-players-devtest');
  });

  it('plans createdAt for players with a division and no join date only', () => {
    expect(planBackfill(players)).toEqual({
      players: 5,
      alreadySet: 1,
      noDivision: 1,
      missingCreatedAt: 1,
      writes: [
        { playerId: 'p1', divisionJoinedAt: '2025-01-01T00:00:00.000Z' },
        { playerId: 'p4', divisionJoinedAt: '2025-01-04T00:00:00.000Z' },
      ],
    });
  });

  it('writes nothing on a dry run', async () => {
    const { client, send } = fakeClient(players);

    const result = await run(client, { stage: 'devtest', apply: false });

    expect(result.written).toBe(0);
    expect(result.writes).toHaveLength(2);
    expect(send.mock.calls.every(([command]) => command instanceof ScanCommand)).toBe(true);
  });

  it('writes guarded updates on --apply and skips rows that changed since the scan', async () => {
    const { client, send } = fakeClient(players, ['p4']);

    const result = await run(client, { stage: 'devtest', apply: true });

    expect(result.written).toBe(1);
    const updates = send.mock.calls
      .map(([command]) => command)
      .filter((command): command is UpdateCommand => command instanceof UpdateCommand);
    expect(updates).toHaveLength(2);
    expect(updates[0].input).toMatchObject({
      TableName: 'wwe-2k-league-api-players-devtest',
      Key: { playerId: 'p1' },
      ExpressionAttributeValues: { ':joinedAt': '2025-01-01T00:00:00.000Z' },
    });
    expect(updates[0].input.ConditionExpression).toContain('attribute_not_exists(divisionJoinedAt)');
    expect(updates[0].input.UpdateExpression).not.toContain('updatedAt');
  });
});
