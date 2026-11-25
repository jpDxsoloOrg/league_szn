import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGet, mockPut } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPut: vi.fn() }));

vi.mock('../../../dynamodb', () => ({
  dynamoDb: { get: mockGet, put: mockPut },
  TableNames: { SITE_CONFIG: 'SiteConfig' },
}));

import { DynamoUserRepository } from '../DynamoUserRepository';
import { ConflictError } from '../../errors';
import {
  DEFAULT_INJURY_TUNABLES,
  toInjuryTunablesInput,
  type InjuryTunables,
} from '../../../policies/fatigueDefaults';

function storedVersion(version: number): InjuryTunables {
  return { ...DEFAULT_INJURY_TUNABLES, maxStamina: 100 + version, version, updatedAt: `t${version}`, updatedBy: 'gm' };
}

describe('DynamoUserRepository injury tunables (INJ-01)', () => {
  const { siteConfig } = new DynamoUserRepository();
  const input = toInjuryTunablesInput(DEFAULT_INJURY_TUNABLES);

  beforeEach(() => {
    mockGet.mockReset();
    mockPut.mockReset();
    mockPut.mockResolvedValue({});
  });

  it('falls back to the defaults when no row exists', async () => {
    mockGet.mockResolvedValue({});
    expect(await siteConfig.getInjuryTunables()).toEqual(DEFAULT_INJURY_TUNABLES);
    expect(mockGet).toHaveBeenCalledWith({ TableName: 'SiteConfig', Key: { configKey: 'injuryTunables' } });
  });

  it('reads the newest stored version over the defaults', async () => {
    mockGet.mockResolvedValue({ Item: { versions: [storedVersion(4), storedVersion(3)] } });
    expect(await siteConfig.getInjuryTunables()).toMatchObject({ version: 4, maxStamina: 104 });
    expect((await siteConfig.listInjuryTunablesVersions()).map((entry) => entry.version)).toEqual([4, 3]);
  });

  it('writes the next version guarded on the version it read', async () => {
    mockGet.mockResolvedValue({ Item: { currentVersion: 2, versions: [storedVersion(2), storedVersion(1)] } });

    const saved = await siteConfig.saveInjuryTunables({ ...input, timezone: 'Asia/Tokyo' }, 'gm-jane');

    expect(saved).toMatchObject({ version: 3, timezone: 'Asia/Tokyo', updatedBy: 'gm-jane' });
    const putArgs = mockPut.mock.calls[0][0];
    expect(putArgs.Item.configKey).toBe('injuryTunables');
    expect(putArgs.ConditionExpression).toBe('attribute_not_exists(configKey) OR currentVersion = :readVersion');
    expect(putArgs.ExpressionAttributeValues).toEqual({ ':readVersion': 2 });
    expect(putArgs.Item.versions.map((version: InjuryTunables) => version.version)).toEqual([3, 2, 1]);
  });

  it('throws ConflictError on a stale expectedVersion without writing', async () => {
    mockGet.mockResolvedValue({ Item: { versions: [storedVersion(5)] } });
    await expect(siteConfig.saveInjuryTunables(input, 'gm', 4)).rejects.toBeInstanceOf(ConflictError);
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('turns a lost write race into ConflictError', async () => {
    mockGet.mockResolvedValue({});
    mockPut.mockRejectedValue(Object.assign(new Error('conditional'), { name: 'ConditionalCheckFailedException' }));
    await expect(siteConfig.saveInjuryTunables(input, 'gm')).rejects.toBeInstanceOf(ConflictError);
  });
});
