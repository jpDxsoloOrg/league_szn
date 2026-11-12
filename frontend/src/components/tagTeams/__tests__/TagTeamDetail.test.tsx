import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const { mockGetById, mockGetDirectory } = vi.hoisted(() => ({ mockGetById: vi.fn(), mockGetDirectory: vi.fn() }));

vi.mock('../../../services/api', () => ({
  tagTeamsApi: { getById: mockGetById },
  playersApi: { getDirectory: mockGetDirectory },
}));

const stableTranslation = { t: (key: string, fallback?: string) => fallback ?? key };
vi.mock('react-i18next', () => ({
  useTranslation: () => stableTranslation,
}));

import TagTeamDetail from '../TagTeamDetail';

const team = {
  tagTeamId: 'tt1',
  name: 'The Team',
  player1Id: 'p1',
  player2Id: 'p2',
  status: 'active',
  wins: 0,
  losses: 0,
  draws: 0,
  createdAt: '',
  updatedAt: '',
  player1: { playerId: 'p1', playerName: 'Adam', wrestlerName: 'Edge' },
  player2: { playerId: 'p2', playerName: 'Jay', wrestlerName: 'Christian' },
  standings: { winPercentage: 0, recentForm: [], currentStreak: { type: 'W', count: 0 } },
  headToHead: [],
  matchTypeRecords: [],
  recentMatches: [],
};

const renderDetail = () =>
  render(
    <MemoryRouter initialEntries={['/tag-teams/tt1']}>
      <Routes>
        <Route path="/tag-teams/:tagTeamId" element={<TagTeamDetail />} />
      </Routes>
    </MemoryRouter>,
  );

describe('TagTeamDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDirectory.mockResolvedValue([
      { playerId: 'p3', name: 'Mark', currentWrestler: 'Undertaker' },
      { playerId: 'p4', name: 'Glenn', currentWrestler: null },
    ]);
  });

  it('links both members', async () => {
    mockGetById.mockResolvedValue(team);

    renderDetail();

    expect(await screen.findByRole('link', { name: /Edge/ })).toHaveAttribute('href', '/player/p1');
    expect(screen.getByRole('link', { name: /Christian/ })).toHaveAttribute('href', '/player/p2');
  });

  it('lists the title reigns the team won', async () => {
    mockGetById.mockResolvedValue({
      ...team,
      titleReigns: [
        { championshipId: 'c1', championshipName: 'Tag Team Titles', wonDate: '2024-06-01T00:00:00Z', defenses: 1 },
        {
          championshipId: 'c1', championshipName: 'Tag Team Titles', wonDate: '2024-01-01T00:00:00Z',
          lostDate: '2024-03-01T00:00:00Z', daysHeld: 60, defenses: 2,
        },
      ],
    });

    renderDetail();

    const table = await screen.findByRole('table', { name: 'Title Reigns' });
    expect(screen.getByRole('heading', { name: 'Title Reigns' })).toBeInTheDocument();
    expect(within(table).getAllByText('Tag Team Titles')).toHaveLength(2);
    expect(within(table).getByText('common.current')).toBeInTheDocument();
    expect(within(table).getByText('60 common.days')).toBeInTheDocument();
  });

  it('hides the title reigns section when the team never held a title', async () => {
    mockGetById.mockResolvedValue({ ...team, titleReigns: [] });

    renderDetail();

    await screen.findByRole('link', { name: /Edge/ });
    expect(screen.queryByRole('heading', { name: 'Title Reigns' })).not.toBeInTheDocument();
  });

  it('renders an unlinked row from the stored name when a player record is gone', async () => {
    mockGetById.mockResolvedValue({
      ...team,
      player1: null,
      player2: null,
      player1WrestlerName: 'Stored Name',
    });

    renderDetail();

    expect(await screen.findByText('Stored Name')).toBeInTheDocument();
    expect(screen.getByText('common.formerMember')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Stored Name/ })).not.toBeInTheDocument();
  });

  describe('recent matches', () => {
    const recentMatch = (opponentPlayerIds: string[]) => ({
      matchId: 'm1',
      date: '2026-05-26T00:00:00.000Z',
      matchFormat: 'tag',
      result: 'W',
      opponentPlayerIds,
    });

    it('names live opponents, using the player name when they have no wrestler', async () => {
      mockGetById.mockResolvedValue({ ...team, recentMatches: [recentMatch(['p3', 'p4'])] });

      renderDetail();

      expect(await screen.findByText('vs Undertaker & Glenn')).toBeInTheDocument();
    });

    it('shows the match format', async () => {
      mockGetById.mockResolvedValue({ ...team, recentMatches: [{ ...recentMatch(['p3']), matchFormat: 'singles' }] });

      renderDetail();

      expect(await screen.findByText(/Singles/)).toBeInTheDocument();
    });

    it('calls only the opponent whose row is gone a former member', async () => {
      mockGetById.mockResolvedValue({ ...team, recentMatches: [recentMatch(['p3', 'gone'])] });

      renderDetail();

      expect(await screen.findByText('vs Undertaker & common.formerMember')).toBeInTheDocument();
    });

    it('keeps Unknown for a match with no opponent ids', async () => {
      mockGetById.mockResolvedValue({ ...team, recentMatches: [recentMatch([])] });

      renderDetail();

      expect(await screen.findByText('vs Unknown')).toBeInTheDocument();
    });

    it('does not call opponents former members when the names failed to load', async () => {
      mockGetDirectory.mockRejectedValue(new Error('burst'));
      mockGetById.mockResolvedValue({ ...team, recentMatches: [recentMatch(['p3'])] });

      renderDetail();

      expect(await screen.findByText('vs common.unknown')).toBeInTheDocument();
    });
  });
});
