import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockInvokeAsync } = vi.hoisted(() => ({ mockInvokeAsync: vi.fn() }));
vi.mock('../../asyncLambda', () => ({ invokeAsync: mockInvokeAsync }));

import { triggerProgressionRecompute } from '../trigger';

describe('triggerProgressionRecompute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvokeAsync.mockResolvedValue(undefined);
  });

  it('sends one invoke with deduplicated ids', async () => {
    await triggerProgressionRecompute(['p1', 'p2', 'p1', undefined, null, ''], 'test');

    expect(mockInvokeAsync).toHaveBeenCalledTimes(1);
    expect(mockInvokeAsync).toHaveBeenCalledWith('progression', { playerIds: ['p1', 'p2'], source: 'test' });
  });

  it('sends nothing when no id is left', async () => {
    await triggerProgressionRecompute([undefined, ''], 'test');
    expect(mockInvokeAsync).not.toHaveBeenCalled();
  });

  it('never throws when the invoke fails', async () => {
    mockInvokeAsync.mockRejectedValue(new Error('lambda down'));
    await expect(triggerProgressionRecompute(['p1'], 'test')).resolves.toBeUndefined();
  });
});
