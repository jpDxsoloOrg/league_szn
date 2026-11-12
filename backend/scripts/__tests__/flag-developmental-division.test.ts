import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScanCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import {
  buildTransaction,
  parseArgs,
  planFlags,
  run,
  tableNameForStage,
  type DivisionRow,
} from '../flag-developmental-division';

type Client = Parameters<typeof run>[0];

function fakeClient(rows: DivisionRow[]): { client: Client; commands: unknown[] } {
  const commands: unknown[] = [];
  const send = vi.fn(async (command: unknown) => {
    commands.push(command);
    if (command instanceof ScanCommand) return { Items: rows };
    return {};
  });
  return { client: { send } as unknown as Client, commands };
}

describe('flag-developmental-division', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('parseArgs', () => {
    it('is a dry run unless --apply is passed, and targets Young Boys by default', () => {
      expect(parseArgs(['--stage', 'devtest'])).toEqual({ stage: 'devtest', apply: false, name: 'Young Boys' });
      expect(parseArgs(['--stage=dev', '--apply', '--name', 'Dojo'])).toEqual({ stage: 'dev', apply: true, name: 'Dojo' });
    });

    it('requires a well-formed stage', () => {
      expect(() => parseArgs(['--apply'])).toThrow('--stage <stage> is required');
      expect(() => parseArgs(['--stage', 'dev/x'])).toThrow('--stage <stage> is required');
    });

    it('refuses unknown arguments and empty names', () => {
      expect(() => parseArgs(['--stage', 'dev', '--confirm'])).toThrow('Unknown argument: --confirm');
      expect(() => parseArgs(['--stage', 'dev', '--name='])).toThrow('--name must not be empty');
    });
  });

  it('builds the stage table name', () => {
    expect(tableNameForStage('devtest')).toBe('wwe-2k-league-api-divisions-devtest');
  });

  describe('planFlags', () => {
    it('finds the target case-insensitively and lists other defaults to clear', () => {
      const plan = planFlags(
        [
          { divisionId: 'raw', name: 'Raw', isDefaultForNewWrestlers: true },
          { divisionId: 'yb', name: 'young boys' },
        ],
        'Young Boys',
      );
      expect(plan.target?.divisionId).toBe('yb');
      expect(plan.targetAlreadyFlagged).toBe(false);
      expect(plan.clearDefaultOn.map((row) => row.divisionId)).toEqual(['raw']);
    });

    it('refuses an ambiguous name', () => {
      expect(() =>
        planFlags([{ divisionId: 'a', name: 'Young Boys' }, { divisionId: 'b', name: 'YOUNG BOYS' }], 'Young Boys'),
      ).toThrow('2 divisions are named');
    });
  });

  it('guards each cleared default on it still being the default', () => {
    const input = buildTransaction(
      'T',
      {
        target: { divisionId: 'yb' },
        targetAlreadyFlagged: false,
        clearDefaultOn: [{ divisionId: 'raw', isDefaultForNewWrestlers: true }],
      },
      'now',
    );
    expect(input.TransactItems).toHaveLength(2);
    expect(input.TransactItems?.[0].Update?.ConditionExpression).toContain('#isDefault = :true');
    expect(input.TransactItems?.[1].Update?.Key).toEqual({ divisionId: 'yb' });
  });

  describe('run', () => {
    const rows: DivisionRow[] = [
      { divisionId: 'raw', name: 'Raw' },
      { divisionId: 'yb', name: 'Young Boys' },
    ];

    it('writes nothing on a dry run', async () => {
      const { client, commands } = fakeClient(rows);
      const result = await run(client, { stage: 'devtest', apply: false, name: 'Young Boys' });
      expect(result.applied).toBe(false);
      expect(result.plan.target?.divisionId).toBe('yb');
      expect(commands.some((command) => command instanceof TransactWriteCommand)).toBe(false);
    });

    it('writes one transaction with --apply', async () => {
      const { client, commands } = fakeClient(rows);
      const result = await run(client, { stage: 'devtest', apply: true, name: 'Young Boys' });
      expect(result.applied).toBe(true);
      expect(commands.filter((command) => command instanceof TransactWriteCommand)).toHaveLength(1);
    });

    it('does nothing when the target is missing or already flagged', async () => {
      const missing = fakeClient([{ divisionId: 'raw', name: 'Raw' }]);
      expect((await run(missing.client, { stage: 'devtest', apply: true, name: 'Young Boys' })).applied).toBe(false);

      const flagged = fakeClient([
        { divisionId: 'yb', name: 'Young Boys', isDevelopmental: true, isDefaultForNewWrestlers: true },
      ]);
      expect((await run(flagged.client, { stage: 'devtest', apply: true, name: 'Young Boys' })).applied).toBe(false);
      expect(flagged.commands.some((command) => command instanceof TransactWriteCommand)).toBe(false);
    });
  });
});
