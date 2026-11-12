import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { parseArgs, planSeed, run, tableNamesForStage } from '../seed-default-callup-track';
import { validateGoal } from '../../lib/policies/progression';
import type { Division, ProgressionTrack } from '../../lib/repositories/types';

type Client = Parameters<typeof run>[0];

const NOW = '2026-11-12T00:00:00.000Z';
const division = (divisionId: string, name: string, extra: Partial<Division> = {}): Division => ({
  divisionId,
  name,
  createdAt: NOW,
  updatedAt: NOW,
  ...extra,
});

function fakeClient(divisions: Division[], tracks: ProgressionTrack[] | 'missing'): { client: Client; commands: unknown[] } {
  const commands: unknown[] = [];
  const send = vi.fn(async (command: unknown) => {
    commands.push(command);
    if (command instanceof ScanCommand) {
      if (command.input.TableName?.includes('progression-tracks')) {
        if (tracks === 'missing') {
          const err = new Error('Requested resource not found');
          err.name = 'ResourceNotFoundException';
          throw err;
        }
        return { Items: tracks };
      }
      return { Items: divisions };
    }
    return {};
  });
  return { client: { send } as unknown as Client, commands };
}

describe('seed-default-callup-track', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('is a dry run unless --apply is passed, and needs a stage', () => {
    expect(parseArgs(['--stage', 'devtest'])).toEqual({ stage: 'devtest', apply: false });
    expect(parseArgs(['--stage=devtest', '--apply'])).toEqual({ stage: 'devtest', apply: true });
    expect(() => parseArgs([])).toThrow('--stage <stage> is required');
    expect(() => parseArgs(['--stage', 'devtest', '--force'])).toThrow('Unknown argument');
  });

  it('builds stage table names', () => {
    expect(tableNamesForStage('devtest')).toEqual({
      divisions: 'wwe-2k-league-api-divisions-devtest',
      tracks: 'wwe-2k-league-api-progression-tracks-devtest',
    });
  });

  it('prefers the developmental flag, then falls back to the Young Boys name', () => {
    const flagged = planSeed([division('yb', 'Young Boys'), division('dojo', 'Dojo', { isDevelopmental: true })], [], NOW);
    expect(flagged.action === 'create' && flagged.track.fromDivisionId).toBe('dojo');

    const byName = planSeed([division('raw', 'Raw'), division('yb', 'young boys')], [], NOW, () => 'id-1');
    expect(byName).toMatchObject({ action: 'create', track: { trackId: 'id-1', fromDivisionId: 'yb', kind: 'callup' } });

    expect(planSeed([division('raw', 'Raw')], [], NOW)).toEqual({ action: 'no-division' });
  });

  it('builds the agreed goals, all valid and equally weighted, with no destination', () => {
    const plan = planSeed([division('yb', 'Young Boys')], [], NOW);
    if (plan.action !== 'create') throw new Error('expected create');
    expect(plan.track.toDivisionId).toBeUndefined();
    expect(plan.track.goals.map((g) => [g.metric, g.threshold, g.weight, g.params])).toEqual([
      ['matchesCompeted', 10, 1, undefined],
      ['avgStarRating', 3, 1, { minRatedMatches: 5 }],
      ['promosWithReactions', 3, 1, { minReactions: 3 }],
      ['wins', 5, 1, undefined],
    ]);
    plan.track.goals.forEach((goal) => expect(() => validateGoal(goal)).not.toThrow());
  });

  it('does nothing when the division already has a call-up track', async () => {
    const existing = { trackId: 't', kind: 'callup', name: 'Old', fromDivisionId: 'yb' } as ProgressionTrack;
    const { client, commands } = fakeClient([division('yb', 'Young Boys')], [existing]);
    const result = await run(client, { stage: 'devtest', apply: true });
    expect(result.plan.action).toBe('exists');
    expect(commands.some((c) => c instanceof PutCommand)).toBe(false);
  });

  it('writes only with --apply, guarded against overwrite', async () => {
    const dry = fakeClient([division('yb', 'Young Boys')], []);
    expect((await run(dry.client, { stage: 'devtest', apply: false })).applied).toBe(false);
    expect(dry.commands.some((c) => c instanceof PutCommand)).toBe(false);

    const wet = fakeClient([division('yb', 'Young Boys')], []);
    expect((await run(wet.client, { stage: 'devtest', apply: true })).applied).toBe(true);
    const put = wet.commands.find((c): c is PutCommand => c instanceof PutCommand);
    expect(put?.input.ConditionExpression).toBe('attribute_not_exists(trackId)');
  });

  it('tolerates a missing tracks table on a dry run only', async () => {
    const dry = fakeClient([division('yb', 'Young Boys')], 'missing');
    expect(await run(dry.client, { stage: 'devtest', apply: false })).toMatchObject({ tracksTableFound: false, applied: false });
    const wet = fakeClient([division('yb', 'Young Boys')], 'missing');
    await expect(run(wet.client, { stage: 'devtest', apply: true })).rejects.toThrow('Requested resource not found');
  });
});
