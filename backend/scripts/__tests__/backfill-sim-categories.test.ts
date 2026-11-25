import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  guessSimCategory,
  parseArgs,
  planTable,
  run,
  tableNameForStage,
} from '../backfill-sim-categories';

type Client = Parameters<typeof run>[0];

describe('guessSimCategory', () => {
  it.each([
    ['Ladder Match', 'highRisk'],
    ['TLC', 'highRisk'],
    ['Tables, Ladders & Chairs', 'highRisk'],
    ['Scaffold Match', 'highRisk'],
    ['Submission Match', 'technical'],
    ['I Quit', 'technical'],
    ['2 Out of 3 Falls', 'technical'],
    ['Two Out Of Three Falls', 'technical'],
    ['Iron Man', 'endurance'],
    ['Ironman Match', 'endurance'],
    ['Last Man Standing', 'endurance'],
    ['Street Fight', 'hardcore'],
    ['Extreme Rules', 'hardcore'],
    ['Tables Match', 'hardcore'],
    ['Hardcore', 'hardcore'],
    ['Falls Count Anywhere', 'hardcore'],
    ['No DQ', 'hardcore'],
    ['Steel Cage', 'cage'],
    ['Hell in a Cell', 'cage'],
    ['Elimination Chamber', 'cage'],
  ])('%s -> %s', (name, category) => {
    expect(guessSimCategory(name)).toBe(category);
  });

  it.each(['Singles', 'Tag Team', 'Standard', 'Battle Royal', 'Equality', ''])('%s matches nothing', (name) => {
    expect(guessSimCategory(name)).toBeNull();
  });
});

describe('planTable', () => {
  it('only fills rows without a valid category', () => {
    const plan = planTable([
      { id: 's1', name: 'Ladder Match' },
      { id: 's2', name: 'Steel Cage', simCategory: 'hardcore' },
      { id: 's3', name: 'Singles' },
      { id: 's4', name: 'Iron Man', simCategory: 'garbage' },
    ]);
    expect(plan.rows).toBe(4);
    expect(plan.alreadySet).toBe(1);
    expect(plan.unmatched).toEqual(['Singles']);
    expect(plan.writes).toEqual([
      { id: 's1', name: 'Ladder Match', simCategory: 'highRisk' },
      { id: 's4', name: 'Iron Man', simCategory: 'endurance' },
    ]);
  });
});

describe('parseArgs', () => {
  it('requires a stage and defaults to a dry run', () => {
    expect(parseArgs(['--stage', 'devtest'])).toEqual({ stage: 'devtest', apply: false });
    expect(parseArgs(['--stage=dev', '--apply'])).toEqual({ stage: 'dev', apply: true });
    expect(() => parseArgs([])).toThrow('--stage');
    expect(() => parseArgs(['--stage', 'devtest', '--force'])).toThrow('Unknown argument');
  });

  it('names both tables per stage', () => {
    expect(tableNameForStage('stipulations', 'devtest')).toBe('wwe-2k-league-api-stipulations-devtest');
    expect(tableNameForStage('matchTypes', 'dev')).toBe('wwe-2k-league-api-match-types-dev');
  });
});

describe('run', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function fakeClient(): { client: Client; send: ReturnType<typeof vi.fn> } {
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof ScanCommand) {
        if (command.input.TableName?.includes('stipulations')) {
          return { Items: [{ stipulationId: 's1', name: 'Ladder Match' }, { stipulationId: 's2', name: 'Standard' }] };
        }
        return { Items: [{ matchTypeId: 'm1', name: 'Iron Man' }, { matchTypeId: 'm2', name: 'Singles', simCategory: 'standard' }] };
      }
      return {};
    });
    return { client: { send } as unknown as Client, send };
  }

  it('writes nothing on a dry run', async () => {
    const { client, send } = fakeClient();
    const result = await run(client, { stage: 'devtest', apply: false });
    expect(result.written).toBe(0);
    expect(result.stipulations.writes).toHaveLength(1);
    expect(result.matchTypes.writes).toHaveLength(1);
    expect(send.mock.calls.some(([command]) => command instanceof UpdateCommand)).toBe(false);
  });

  it('writes only missing categories, guarded against overwrites, with --apply', async () => {
    const { client, send } = fakeClient();
    const result = await run(client, { stage: 'devtest', apply: true });
    expect(result.written).toBe(2);
    const updates = send.mock.calls
      .map(([command]) => command)
      .filter((command): command is UpdateCommand => command instanceof UpdateCommand);
    expect(updates.map((update) => update.input.Key)).toEqual([{ stipulationId: 's1' }, { matchTypeId: 'm1' }]);
    expect(updates[0].input.ExpressionAttributeValues).toEqual({ ':category': 'highRisk' });
    expect(updates[1].input.ExpressionAttributeValues).toEqual({ ':category': 'endurance' });
    for (const update of updates) {
      expect(update.input.ConditionExpression).toContain('attribute_not_exists(simCategory)');
    }
  });
});
