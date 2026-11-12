import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DeleteCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { isPlayerOverride, parseArgs, run, tableNamesForStage } from '../cleanup-tag-title-player-overrides';

type Client = Parameters<typeof run>[0];

const championships = [
  { championshipId: 'tag-1', name: 'Tag Titles', type: 'tag' },
  { championshipId: 'world', name: 'World', type: 'singles' },
  { championshipId: 'tag-2', name: 'Other Tag', type: 'tag' },
];

const overridesByTitle: Record<string, Array<Record<string, unknown>>> = {
  'tag-1': [
    { championshipId: 'tag-1', playerId: 'p1', overrideType: 'bump_to_top', active: true },
    { championshipId: 'tag-1', playerId: 'p2', entityType: 'player', overrideType: 'send_to_bottom', active: false },
    { championshipId: 'tag-1', playerId: 'team-1', entityType: 'tagTeam', tagTeamId: 'team-1', active: true },
  ],
  'tag-2': [
    { championshipId: 'tag-2', playerId: 'p3', entityType: 'player', overrideType: 'bump_to_top', active: true },
  ],
  world: [
    { championshipId: 'world', playerId: 'p4', overrideType: 'bump_to_top', active: true },
  ],
};

/** Serves championships over two scan pages and overrides by title, recording every command. */
function fakeClient(): { client: Client; commands: unknown[] } {
  const commands: unknown[] = [];
  const send = vi.fn(async (command: unknown) => {
    commands.push(command);
    if (command instanceof ScanCommand) {
      return command.input.ExclusiveStartKey
        ? { Items: championships.slice(2) }
        : { Items: championships.slice(0, 2), LastEvaluatedKey: { championshipId: 'world' } };
    }
    if (command instanceof QueryCommand) {
      const championshipId = command.input.ExpressionAttributeValues?.[':cid'] as string;
      return { Items: overridesByTitle[championshipId] ?? [] };
    }
    return {};
  });
  return { client: { send } as unknown as Client, commands };
}

const deletes = (commands: unknown[]) => commands
  .filter((command): command is DeleteCommand => command instanceof DeleteCommand)
  .map((command) => command.input);

describe('cleanup-tag-title-player-overrides', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('parseArgs', () => {
    it('is a dry run unless --apply is passed', () => {
      expect(parseArgs(['--stage', 'devtest'])).toEqual({ stage: 'devtest', apply: false });
      expect(parseArgs(['--stage=dev', '--apply'])).toEqual({ stage: 'dev', apply: true });
    });

    it('requires an explicit, well-formed stage', () => {
      expect(() => parseArgs(['--apply'])).toThrow('--stage <stage> is required');
      expect(() => parseArgs(['--stage', 'dev/x'])).toThrow('--stage <stage> is required');
    });

    it('refuses unknown arguments', () => {
      expect(() => parseArgs(['--stage', 'devtest', '--aply'])).toThrow('Unknown argument: --aply');
    });
  });

  it('names the stage tables', () => {
    expect(tableNamesForStage('devtest')).toEqual({
      championships: 'wwe-2k-league-api-championships-devtest',
      overrides: 'wwe-2k-league-api-contender-overrides-devtest',
    });
  });

  it('reads a missing entityType as a player override', () => {
    expect(isPlayerOverride({ championshipId: 'c', playerId: 'p' })).toBe(true);
    expect(isPlayerOverride({ championshipId: 'c', playerId: 't', entityType: 'tagTeam' })).toBe(false);
  });

  it('counts player overrides on tag titles only, and deletes nothing on a dry run', async () => {
    const { client, commands } = fakeClient();

    const result = await run(client, { stage: 'devtest', apply: false });

    expect(result).toEqual({ tagTitles: 2, found: 3, active: 2, inactive: 1, deleted: 0 });
    expect(deletes(commands)).toEqual([]);
  });

  it('deletes only the active player overrides on tag titles with --apply', async () => {
    const { client, commands } = fakeClient();

    const result = await run(client, { stage: 'devtest', apply: true });

    expect(result.deleted).toBe(2);
    expect(deletes(commands)).toEqual([
      { TableName: 'wwe-2k-league-api-contender-overrides-devtest', Key: { championshipId: 'tag-1', playerId: 'p1' } },
      { TableName: 'wwe-2k-league-api-contender-overrides-devtest', Key: { championshipId: 'tag-2', playerId: 'p3' } },
    ]);
  });
});
