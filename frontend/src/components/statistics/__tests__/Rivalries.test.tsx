import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { mockGetRivalries } = vi.hoisted(() => ({ mockGetRivalries: vi.fn() }));

vi.mock('../../../services/api', () => ({
  rivalriesApi: { getRivalries: mockGetRivalries },
  seasonsApi: { getAll: vi.fn().mockResolvedValue([]) },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => ({
      'nav.tabs.feudHistory': 'Feud History',
      'rivalries.noRivalries': 'No rivalries yet.',
      'rivalries.viewHeadToHead': 'View Head-to-Head',
    }[key] ?? key),
  }),
}));

import Rivalries from '../Rivalries';

const rivalry = {
  player1Id: 'p1',
  player2Id: 'p2',
  player1: { playerId: 'p1', name: 'One', wrestlerName: 'The Champ' },
  player2: { playerId: 'p2', name: 'Two', wrestlerName: 'The Great One' },
  player1Wins: 3,
  player2Wins: 1,
  draws: 0,
  matchCount: 4,
  lastMatchDate: '2024-06-01',
  championshipMatches: 1,
  recentMatchIds: [],
  intensityBadge: 'intense',
};

function renderComponent() {
  return render(
    <MemoryRouter>
      <Rivalries />
    </MemoryRouter>
  );
}

describe('Rivalries (Feud History)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('links each feud to Head-to-Head with the parameters that page reads', async () => {
    mockGetRivalries.mockResolvedValue({ rivalries: [rivalry] });

    renderComponent();

    expect(await screen.findByRole('link', { name: 'View Head-to-Head' })).toHaveAttribute(
      'href',
      '/stats/head-to-head?player1=p1&player2=p2'
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Feud History' })).toBeInTheDocument();
  });

  it('shows the empty state when no feuds exist', async () => {
    mockGetRivalries.mockResolvedValue({ rivalries: [] });

    renderComponent();

    expect(await screen.findByText('No rivalries yet.')).toBeInTheDocument();
  });
});
