import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const { mockDashboard } = vi.hoisted(() => ({ mockDashboard: vi.fn() }));

vi.mock('../services/api', () => ({ dashboardApi: { get: mockDashboard } }));
vi.mock('../utils/deferShellRequest', () => ({ waitForPageRequests: () => Promise.resolve() }));

import { resetLeaguePulse, useLeaguePulse } from './useLeaguePulse';

beforeEach(() => {
  resetLeaguePulse();
  mockDashboard.mockReset().mockResolvedValue({ seasonInfo: { seasonId: 's1', name: 'Season 1', status: 'active' } });
});

describe('useLeaguePulse', () => {
  it('loads the dashboard once and shares it between callers', async () => {
    const first = renderHook(() => useLeaguePulse());
    const second = renderHook(() => useLeaguePulse());
    await waitFor(() => expect(first.result.current.dashboard).not.toBeNull());
    await waitFor(() => expect(second.result.current.dashboard).not.toBeNull());
    expect(first.result.current.dashboard?.seasonInfo?.name).toBe('Season 1');
    expect(mockDashboard).toHaveBeenCalledTimes(1);
  });

  it('stays empty when the dashboard fails', async () => {
    mockDashboard.mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => useLeaguePulse());
    await waitFor(() => expect(mockDashboard).toHaveBeenCalled());
    expect(result.current.dashboard).toBeNull();
  });
});
