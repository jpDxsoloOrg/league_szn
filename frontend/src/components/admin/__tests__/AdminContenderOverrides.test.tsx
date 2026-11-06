import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const { mockChampionshipsApi, mockContendersApi, mockPlayersApi } = vi.hoisted(() => ({
  mockChampionshipsApi: { getAll: vi.fn() },
  mockContendersApi: { getOverrides: vi.fn(), setOverride: vi.fn(), removeOverride: vi.fn() },
  mockPlayersApi: { getAllIncludingHidden: vi.fn() },
}));

vi.mock('../../../services/api', () => ({
  championshipsApi: mockChampionshipsApi,
  contendersApi: mockContendersApi,
  playersApi: mockPlayersApi,
}));

import AdminContenderOverrides from '../AdminContenderOverrides';

const override = (championshipId: string, reason: string) => ({
  championshipId,
  playerId: 'p1',
  overrideType: 'bump_to_top' as const,
  reason,
  createdBy: 'admin',
  createdAt: '2026-01-01T00:00:00.000Z',
  active: true,
});

describe('AdminContenderOverrides', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChampionshipsApi.getAll.mockResolvedValue([
      { championshipId: 'c1', name: 'World Title', type: 'singles' },
      { championshipId: 'c2', name: 'US Title', type: 'singles' },
    ]);
    mockPlayersApi.getAllIncludingHidden.mockResolvedValue([
      { playerId: 'p1', name: 'Alex', currentWrestler: 'The Rock' },
      { playerId: 'p2', name: 'Unassigned', currentWrestler: '' },
    ]);
  });

  it('offers hidden players in the picker', async () => {
    mockContendersApi.getOverrides.mockResolvedValue([]);
    render(<AdminContenderOverrides />);

    expect(await screen.findByRole('option', { name: 'Unassigned' })).toBeInTheDocument();
  });

  it('never shows the Needs Wrestler placeholder as a wrestler name', async () => {
    mockContendersApi.getOverrides.mockResolvedValue([]);
    mockPlayersApi.getAllIncludingHidden.mockResolvedValue([
      { playerId: 'p3', name: 'Waiting', currentWrestler: 'Needs Wrestler' },
    ]);
    render(<AdminContenderOverrides />);

    expect(await screen.findByRole('option', { name: 'Waiting' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Needs Wrestler/ })).not.toBeInTheDocument();
  });

  it('ignores a slow response for the previously selected championship', async () => {
    let resolveFirst: (value: ReturnType<typeof override>[]) => void = () => undefined;
    mockContendersApi.getOverrides.mockImplementation((championshipId: string) => (
      championshipId === 'c1'
        ? new Promise((resolve) => { resolveFirst = resolve; })
        : Promise.resolve([override('c2', 'Current reason')])
    ));

    render(<AdminContenderOverrides />);
    const select = await screen.findByLabelText('contenders.admin.selectChampionship');
    await waitFor(() => expect(mockContendersApi.getOverrides).toHaveBeenCalledWith('c1'));

    fireEvent.change(select, { target: { value: 'c2' } });
    expect(await screen.findByText('Current reason')).toBeInTheDocument();

    resolveFirst([override('c1', 'Stale reason')]);
    await waitFor(() => expect(screen.getByText('Current reason')).toBeInTheDocument());
    expect(screen.queryByText('Stale reason')).not.toBeInTheDocument();
  });
});
