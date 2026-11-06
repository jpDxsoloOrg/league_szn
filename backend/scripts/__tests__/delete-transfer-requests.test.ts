import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DeleteCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { countByStatus, parseArgs, run, tableNameForStage } from '../delete-transfer-requests';

type Client = Parameters<typeof run>[0];

const rows = [
  { requestId: 'r1', status: 'pending' },
  { requestId: 'r2', status: 'pending' },
  { requestId: 'r3', status: 'approved' },
];

/** Serves `rows` over two scan pages and records every command it receives. */
function fakeClient(): { client: Client; commands: unknown[] } {
  const commands: unknown[] = [];
  const send = vi.fn(async (command: unknown) => {
    commands.push(command);
    if (!(command instanceof ScanCommand)) return {};
    return command.input.ExclusiveStartKey
      ? { Items: rows.slice(2) }
      : { Items: rows.slice(0, 2), LastEvaluatedKey: { requestId: 'r2' } };
  });
  return { client: { send } as unknown as Client, commands };
}

describe('delete-transfer-requests', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('parseArgs', () => {
    it('is a dry run unless --confirm is passed', () => {
      expect(parseArgs(['--stage', 'devtest'])).toEqual({ stage: 'devtest', confirm: false });
      expect(parseArgs(['--stage=dev', '--confirm'])).toEqual({ stage: 'dev', confirm: true });
    });

    it('refuses --confirm without an explicit stage', () => {
      expect(() => parseArgs(['--confirm'])).toThrow('--stage <stage> is required');
    });

    it('ignores a STAGE environment variable', () => {
      vi.stubEnv('STAGE', 'dev');
      expect(() => parseArgs(['--confirm'])).toThrow('--stage <stage> is required');
      vi.unstubAllEnvs();
    });

    it('refuses a missing or malformed stage value', () => {
      expect(() => parseArgs(['--stage'])).toThrow('--stage <stage> is required');
      expect(() => parseArgs(['--stage', 'dev/x', '--confirm'])).toThrow('--stage <stage> is required');
    });

    it('refuses unknown arguments, so a mistyped flag cannot pass silently', () => {
      expect(() => parseArgs(['--stage', 'dev', '--confrim'])).toThrow('Unknown argument: --confrim');
    });
  });

  it('targets the stage\'s table', () => {
    expect(tableNameForStage('devtest')).toBe('wwe-2k-league-api-transfer-requests-devtest');
  });

  it('labels rows with no status', () => {
    expect(countByStatus([{ requestId: 'r1' }])).toEqual({ unknown: 1 });
  });

  it('dry run reads every page, counts by status and deletes nothing', async () => {
    const { client, commands } = fakeClient();

    const result = await run(client, { stage: 'devtest', confirm: false });

    expect(result).toMatchObject({
      found: 3,
      deleted: 0,
      countsByStatus: { pending: 2, approved: 1 },
    });
    expect(commands.some((command) => command instanceof DeleteCommand)).toBe(false);
  });

  it('with --confirm deletes every row from that stage\'s table and nothing else', async () => {
    const { client, commands } = fakeClient();

    const result = await run(client, { stage: 'devtest', confirm: true });

    expect(result.deleted).toBe(3);
    const deletes = commands.filter((command) => command instanceof DeleteCommand) as DeleteCommand[];
    expect(deletes.map((command) => command.input.Key)).toEqual([
      { requestId: 'r1' }, { requestId: 'r2' }, { requestId: 'r3' },
    ]);
    const tables = new Set(
      (commands as Array<ScanCommand | DeleteCommand>).map((command) => command.input.TableName),
    );
    expect([...tables]).toEqual(['wwe-2k-league-api-transfer-requests-devtest']);
  });
});
