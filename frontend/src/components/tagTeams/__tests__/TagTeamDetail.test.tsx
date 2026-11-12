import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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

vi.mock('../TagTeamContenderChip', () => ({
  default: ({ tagTeamId }: { tagTeamId: string }) => <span data-testid="contender-chip">{tagTeamId}</span>,
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

  describe('contender chip', () => {
    it('shows for an active team', async () => {
      mockGetById.mockResolvedValue(team);
      renderDetail();
      expect(await screen.findByTestId('contender-chip')).toHaveTextContent('tt1');
    });

    it('is hidden for a dissolved team', async () => {
      mockGetById.mockResolvedValue({ ...team, status: 'dissolved' });
      renderDetail();
      expect(await screen.findByText('Dissolved')).toBeInTheDocument();
      expect(screen.queryByTestId('contender-chip')).not.toBeInTheDocument();
    });
  });
});
