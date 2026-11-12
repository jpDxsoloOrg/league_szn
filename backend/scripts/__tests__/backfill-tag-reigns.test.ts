import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { Championship, ChampionshipHistoryEntry, TagTeam } from '../../lib/repositories/types';
import { parseArgs, planBackfill, run, tableNamesForStage } from '../backfill-tag-reigns';

type Client = Parameters<typeof run>[0];

function team(tagTeamId: string, player1Id: string, player2Id: string, extra: Partial<TagTeam> = {}): TagTeam {
  return {
    tagTeamId, name: tagTeamId, player1Id, player2Id, status: 'active',
    wins: 0, losses: 0, draws: 0, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
    ...extra,
  };
}

function title(championshipId: string, extra: Partial<Championship> = {}): Championship {
  return {
    championshipId, name: championshipId, type: 'tag',
    createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
    ...extra,
  };
}

const teams = [
  team('tt-usos', 'p1', 'p2'),
  // Dissolved before the 2025 reign below: must not match it.
  team('tt-old', 'p3', 'p4', { status: 'dissolved', createdAt: '2024-01-01T00:00:00Z', dissolvedAt: '2024-06-01T00:00:00Z' }),
];

const championships = [
  title('tag1', { currentChampion: ['p2', 'p1'] }),
  title('tag2', { currentChampion: ['p1', 'p2'], currentTagTeamId: 'tt-other' }),
  title('singles', { type: 'singles', currentChampion: 'p1' }),
];

const history: ChampionshipHistoryEntry[] = [
  { championshipId: 'tag1', wonDate: '2024-03-01T00:00:00Z', champion: ['p3', 'p4'], lostDate: '2024-04-01T00:00:00Z' },
  { championshipId: 'tag1', wonDate: '2025-01-01T00:00:00Z', champion: ['p3', 'p4'], lostDate: '2025-02-01T00:00:00Z' },
  { championshipId: 'tag1', wonDate: '2025-02-01T00:00:00Z', champion: ['p2', 'p1'] },
  { championshipId: 'tag2', wonDate: '2024-05-01T00:00:00Z', champion: ['p1', 'p2'], tagTeamId: 'tt-usos' },
  { championshipId: 'tag2', wonDate: '2024-02-01T00:00:00Z', champion: ['p1', 'p9'], lostDate: '2024-05-01T00:00:00Z' },
  { championshipId: 'singles', wonDate: '2024-01-05T00:00:00Z', champion: 'p1' },
];

describe('backfill-tag-reigns', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parseArgs is a dry run unless --apply is passed', () => {
    expect(parseArgs(['--stage', 'devtest'])).toEqual({ stage: 'devtest', apply: false });
    expect(parseArgs(['--stage=dev', '--apply'])).toEqual({ stage: 'dev', apply: true });
    expect(() => parseArgs([])).toThrow('--stage');
    expect(() => parseArgs(['--stage', 'devtest', '--confirm'])).toThrow('Unknown argument');
  });

  it('builds table names for the stage', () => {
    expect(tableNamesForStage('devtest')).toEqual({
      championships: 'wwe-2k-league-api-championships-devtest',
      history: 'wwe-2k-league-api-championship-history-devtest',
      tagTeams: 'wwe-2k-league-api-tag-teams-devtest',
    });
  });

  it('plans links by wonDate, skipping singles, random pairings and existing links', () => {
    const plan = planBackfill(championships, history, teams);

    expect(plan.tagReigns).toBe(5);
    expect(plan.alreadyLinked).toBe(1);
    expect(plan.reignLinks).toEqual([
      { championshipId: 'tag1', wonDate: '2024-03-01T00:00:00Z', tagTeamId: 'tt-old' },
      { championshipId: 'tag1', wonDate: '2025-02-01T00:00:00Z', tagTeamId: 'tt-usos' },
    ]);
    // The 2025 reign by the dissolved team's pair, and the p1/p9 random pairing.
    expect(plan.unmatched).toBe(2);
    expect(plan.titleLinks).toEqual([{ championshipId: 'tag1', tagTeamId: 'tt-usos' }]);
    expect(plan.titleConflicts).toBe(1);
  });

  function fakeClient(): { client: Client; updates: UpdateCommand[] } {
    const updates: UpdateCommand[] = [];
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof UpdateCommand) {
        updates.push(command);
        return {};
      }
      if (command instanceof ScanCommand) {
        const table = command.input.TableName ?? '';
        if (table.includes('championship-history')) return { Items: history };
        if (table.includes('championships')) return { Items: championships };
        if (table.includes('tag-teams')) return { Items: teams };
      }
      return {};
    });
    return { client: { send } as unknown as Client, updates };
  }

  it('writes nothing on a dry run', async () => {
    const { client, updates } = fakeClient();
    const result = await run(client, { stage: 'devtest', apply: false });
    expect(updates).toHaveLength(0);
    expect(result.reignLinks).toHaveLength(2);
    expect(result.reignsWritten).toBe(0);
  });

  it('writes guarded updates with --apply', async () => {
    const { client, updates } = fakeClient();
    const result = await run(client, { stage: 'devtest', apply: true });

    expect(result.reignsWritten).toBe(2);
    expect(result.titlesWritten).toBe(1);
    expect(updates).toHaveLength(3);
    for (const update of updates) {
      expect(update.input.ConditionExpression).toContain('attribute_not_exists');
    }
    expect(updates[2].input).toMatchObject({
      TableName: 'wwe-2k-league-api-championships-devtest',
      Key: { championshipId: 'tag1' },
      ExpressionAttributeValues: { ':tagTeamId': 'tt-usos' },
    });
  });
});
