import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const { mockGetById } = vi.hoisted(() => ({ mockGetById: vi.fn() }));

vi.mock('../../../services/api', () => ({
  tagTeamsApi: { getById: mockGetById },
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
  beforeEach(() => vi.clearAllMocks());

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
    expect(screen.getByText('common.unknown')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Stored Name/ })).not.toBeInTheDocument();
  });
});
