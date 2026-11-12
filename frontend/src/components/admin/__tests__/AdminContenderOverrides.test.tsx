import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const { mockChampionshipsApi, mockContendersApi, mockPlayersApi, mockTagTeamsApi } = vi.hoisted(() => ({
  mockChampionshipsApi: { getAll: vi.fn() },
  mockContendersApi: { getOverrides: vi.fn(), setOverride: vi.fn(), removeOverride: vi.fn() },
  mockPlayersApi: { getAllIncludingHidden: vi.fn() },
  mockTagTeamsApi: { getAll: vi.fn() },
}));

vi.mock('../../../services/api', () => ({
  championshipsApi: mockChampionshipsApi,
  contendersApi: mockContendersApi,
  playersApi: mockPlayersApi,
  tagTeamsApi: mockTagTeamsApi,
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
    mockTagTeamsApi.getAll.mockResolvedValue([]);
  });

  it('keeps hidden players out of the picker', async () => {
    mockContendersApi.getOverrides.mockResolvedValue([]);
    render(<AdminContenderOverrides />);

    expect(await screen.findByRole('option', { name: 'Alex (The Rock)' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Unassigned/ })).not.toBeInTheDocument();
  });

  it('still names a hidden player on an existing override', async () => {
    mockContendersApi.getOverrides.mockResolvedValue([{ ...override('c1', 'Old booking'), playerId: 'p2' }]);
    render(<AdminContenderOverrides />);

    expect(await screen.findByText('Unassigned')).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Unassigned/ })).not.toBeInTheDocument();
  });

  describe('reporting what an override did', () => {
    const applyOverride = async () => {
      mockContendersApi.getOverrides.mockResolvedValue([]);
      render(<AdminContenderOverrides />);

      await screen.findByRole('option', { name: 'Alex (The Rock)' });
      fireEvent.change(screen.getByLabelText('contenders.admin.overrides.selectPlayer'), { target: { value: 'p1' } });
      fireEvent.change(screen.getByLabelText('contenders.admin.overrides.reason'), { target: { value: 'Storyline' } });
      fireEvent.click(screen.getByRole('button', { name: 'contenders.admin.overrides.apply' }));
      const dialog = await screen.findByRole('dialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'contenders.admin.overrides.apply' }));
    };

    it('says success when the player reached the list', async () => {
      mockContendersApi.setOverride.mockResolvedValue({ ...override('c1', 'Storyline'), placement: { status: 'onList', rank: 1 } });
      await applyOverride();
      const notice = await screen.findByText('contenders.admin.overrides.placedOnList');
      expect(notice.closest('.admin-notice')).toHaveClass('admin-notice--success');
    });

    it.each([
      ['notOnList', 'contenders.admin.overrides.placedNotOnList'],
      ['noActiveSeason', 'contenders.admin.overrides.placedNoSeason'],
      ['recalculationFailed', 'contenders.admin.overrides.placedFailed'],
    ])('warns rather than claims success for %s', async (status, text) => {
      mockContendersApi.setOverride.mockResolvedValue({ ...override('c1', 'Storyline'), placement: { status, rank: null } });
      await applyOverride();
      const notice = await screen.findByText(text);
      expect(notice.closest('.admin-notice')).toHaveClass('admin-notice--warning');
    });

    it('translates the refusal of an expiry that has passed', async () => {
      mockContendersApi.setOverride.mockRejectedValue(new Error('expiresAt must be in the future'));
      await applyOverride();
      expect(await screen.findByText('contenders.admin.overrides.errorExpiryPast')).toBeInTheDocument();
    });
  });

  it('shows where each active override has put its player', async () => {
    mockContendersApi.getOverrides.mockResolvedValue([
      { ...override('c1', 'Top'), currentRank: 1 },
      { ...override('c1', 'Off list'), playerId: 'p2', overrideType: 'send_to_bottom', currentRank: null },
    ]);
    render(<AdminContenderOverrides />);

    expect(await screen.findByText('contenders.admin.overrides.positionRank')).toBeInTheDocument();
    expect(screen.getByText('contenders.admin.overrides.positionNone')).toBeInTheDocument();
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

  describe('on a tag title', () => {
    const team = (tagTeamId: string, name: string, player1Id: string, player2Id: string) => ({
      tagTeamId, name, player1Id, player2Id, status: 'active', wins: 0, losses: 0, draws: 0, createdAt: '', updatedAt: '',
    });

    beforeEach(() => {
      mockChampionshipsApi.getAll.mockResolvedValue([
        { championshipId: 'tag', name: 'Tag Titles', type: 'tag', currentChampion: ['p5', 'p6'] },
        { championshipId: 'c1', name: 'World Title', type: 'singles' },
      ]);
      mockPlayersApi.getAllIncludingHidden.mockResolvedValue([
        { playerId: 'p1', name: 'Alex', currentWrestler: 'The Rock' },
        { playerId: 'p2', name: 'Unassigned', currentWrestler: '' },
        { playerId: 'p3', name: 'Blair', currentWrestler: 'Edge' },
        { playerId: 'p4', name: 'Casey', currentWrestler: 'Christian' },
        { playerId: 'p5', name: 'Dana', currentWrestler: 'Bubba' },
        { playerId: 'p6', name: 'Eli', currentWrestler: 'D-Von' },
      ]);
      mockTagTeamsApi.getAll.mockResolvedValue([
        team('t1', 'Rated Rs', 'p3', 'p4'),
        team('t2', 'Hidden Pair', 'p1', 'p2'),
        team('t3', 'Dudleys', 'p5', 'p6'),
      ]);
      mockContendersApi.getOverrides.mockResolvedValue([]);
    });

    it('loads only active teams', async () => {
      render(<AdminContenderOverrides />);
      await screen.findByLabelText('contenders.admin.overrides.selectTagTeam');
      expect(mockTagTeamsApi.getAll).toHaveBeenCalledWith({ status: 'active' }, expect.anything());
    });

    it('lists bookable teams with member names instead of players, leaving out the champions', async () => {
      render(<AdminContenderOverrides />);

      expect(await screen.findByRole('option', { name: 'Rated Rs (Blair & Casey)' })).toBeInTheDocument();
      expect(screen.queryByLabelText('contenders.admin.overrides.selectPlayer')).not.toBeInTheDocument();
      expect(screen.queryByRole('option', { name: /Hidden Pair/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('option', { name: /Dudleys/ })).not.toBeInTheDocument();
    });

    it('sends tagTeamId, not playerId', async () => {
      mockContendersApi.setOverride.mockResolvedValue({
        championshipId: 'tag', playerId: 't1', entityType: 'tagTeam', tagTeamId: 't1', overrideType: 'bump_to_top',
        reason: 'Storyline', createdBy: 'admin', createdAt: '', active: true, placement: { status: 'onList', rank: 1 },
      });
      render(<AdminContenderOverrides />);

      await screen.findByRole('option', { name: 'Rated Rs (Blair & Casey)' });
      fireEvent.change(screen.getByLabelText('contenders.admin.overrides.selectTagTeam'), { target: { value: 't1' } });
      fireEvent.change(screen.getByLabelText('contenders.admin.overrides.reason'), { target: { value: 'Storyline' } });
      fireEvent.click(screen.getByRole('button', { name: 'contenders.admin.overrides.apply' }));
      const dialog = await screen.findByRole('dialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'contenders.admin.overrides.apply' }));

      await waitFor(() => expect(mockContendersApi.setOverride).toHaveBeenCalled());
      const request = mockContendersApi.setOverride.mock.calls[0][0];
      expect(request).toMatchObject({ championshipId: 'tag', tagTeamId: 't1', overrideType: 'bump_to_top' });
      expect(request).not.toHaveProperty('playerId');
    });

    it('names the team and members on an existing tag override, and removes it by team id', async () => {
      mockContendersApi.getOverrides.mockResolvedValue([{
        championshipId: 'tag', playerId: 't1', entityType: 'tagTeam', tagTeamId: 't1', tagTeamName: 'Rated Rs',
        members: [{ playerId: 'p3', playerName: 'Blair' }, { playerId: 'p4', playerName: 'Casey' }],
        overrideType: 'bump_to_top', reason: 'Story', createdBy: 'admin', createdAt: '2026-01-01T00:00:00.000Z', active: true,
      }]);
      mockContendersApi.removeOverride.mockResolvedValue(undefined);
      render(<AdminContenderOverrides />);

      const table = await screen.findByRole('table');
      expect(within(table).getByText('Rated Rs')).toBeInTheDocument();
      expect(within(table).getByText('Blair & Casey')).toBeInTheDocument();

      fireEvent.click(within(table).getByRole('button', { name: 'contenders.admin.overrides.remove' }));
      const dialog = await screen.findByRole('dialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'contenders.admin.overrides.remove' }));
      await waitFor(() => expect(mockContendersApi.removeOverride).toHaveBeenCalledWith('tag', 't1'));
    });
  });
});
