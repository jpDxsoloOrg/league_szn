import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { mockGetStandings } = vi.hoisted(() => ({ mockGetStandings: vi.fn() }));

vi.mock('../../../services/api', () => ({
  factionsApi: { getStandings: mockGetStandings },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, fallback?: string) => (typeof fallback === 'string' ? fallback : key) }),
}));

import FactionStandings from '../FactionStandings';

const standing = (index: number) => ({
  stableId: `f${index}`,
  name: `Faction ${index}`,
  memberCount: 3,
  wins: 10 - index,
  losses: index,
  draws: 0,
  winPercentage: 50,
  recentForm: ['W', 'L'],
  currentStreak: { type: 'W', count: 1 },
});

function renderPage() {
  return render(
    <MemoryRouter>
      <FactionStandings />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FactionStandings', () => {
  it('puts the top three on the podium and the rest in the table', async () => {
    mockGetStandings.mockResolvedValue([1, 2, 3, 4].map(standing));
    renderPage();

    expect(await screen.findByRole('list', { name: 'Faction Standings' })).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(table).toHaveTextContent('Faction 4');
    expect(table).not.toHaveTextContent('Faction 1');
  });

  it('uses only the table when there are too few factions for a podium', async () => {
    mockGetStandings.mockResolvedValue([1, 2].map(standing));
    renderPage();

    expect(await screen.findByRole('table')).toHaveTextContent('Faction 2');
    expect(screen.queryByRole('list', { name: 'Faction Standings' })).not.toBeInTheDocument();
  });

  it('reads the members header from a string key, not the members object', async () => {
    mockGetStandings.mockResolvedValue([1].map(standing));
    const { container } = renderPage();

    await screen.findByRole('table');
    expect(container).not.toHaveTextContent('returned an object');
    expect(screen.getByRole('columnheader', { name: /Members/ })).toBeInTheDocument();
  });

  it('shows an empty state when there are no standings', async () => {
    mockGetStandings.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText('No faction standings data yet.')).toBeInTheDocument();
  });
});
