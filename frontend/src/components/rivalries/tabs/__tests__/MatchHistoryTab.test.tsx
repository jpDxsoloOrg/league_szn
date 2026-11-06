import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { HydratedRivalry } from '../../../../types/rivalry';

const { mockGetAll } = vi.hoisted(() => ({ mockGetAll: vi.fn() }));

vi.mock('../../../../services/api', () => ({ matchesApi: { getAll: mockGetAll } }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => (key === 'dashboard.draw' ? 'Draw' : key) }),
}));

import MatchHistoryTab from '../MatchHistoryTab';

const hydrated = {
  rivalry: {
    rivalryId: 'r1',
    participants: [{ playerId: 'p1' }, { playerId: 'p2' }],
    startedAt: '2026-01-01T00:00:00.000Z',
  },
} as unknown as HydratedRivalry;

const match = {
  matchId: 'm1',
  date: '2026-02-01T00:00:00.000Z',
  matchFormat: 'singles',
  status: 'completed',
  rivalryId: 'r1',
  participants: ['p1', 'p2'],
};

function renderTab() {
  render(
    <MemoryRouter>
      <MatchHistoryTab hydrated={hydrated} players={[]} />
    </MemoryRouter>,
  );
}

describe('MatchHistoryTab', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows a draw as a draw, not a win for everyone', async () => {
    mockGetAll.mockResolvedValue([{ ...match, winners: ['p1', 'p2'], losers: [], isDraw: true }]);
    renderTab();

    expect(await screen.findByText('Draw')).toBeInTheDocument();
    expect(screen.queryByText(/^W:/)).not.toBeInTheDocument();
  });

  it('still names the winner of a decided match', async () => {
    mockGetAll.mockResolvedValue([{ ...match, winners: ['p1'], losers: ['p2'] }]);
    renderTab();

    expect(await screen.findByText(/^W:/)).toBeInTheDocument();
    expect(screen.queryByText('Draw')).not.toBeInTheDocument();
  });
});
