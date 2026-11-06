import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// --- Hoisted mocks ---
const { mockGetStandings, mockGetAllSeasons, mockGetAllDivisions } = vi.hoisted(() => ({
  mockGetStandings: vi.fn(),
  mockGetAllSeasons: vi.fn(),
  mockGetAllDivisions: vi.fn(),
}));

vi.mock('../../services/api', () => ({
  standingsApi: { get: mockGetStandings },
  seasonsApi: { getAll: mockGetAllSeasons },
  divisionsApi: { getAll: mockGetAllDivisions },
}));

vi.mock('../../utils/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'standings.title': 'Standings',
        'standings.pageTitle': 'Standings',
        'standings.loading': 'Loading standings...',
        'standings.noPlayers': 'No players found.',
        'standings.season': 'Season',
        'standings.allTime': 'All Time',
        'standings.record': 'Record',
        'standings.emptyTitle': 'No standings yet',
        'standings.noMatchesTitle': 'No wrestlers match',
        'standings.topThree': 'Top three',
        'standings.restOfTable': 'The chase pack',
        'standings.alignment.label': 'Alignment',
        'standings.alignment.all': 'All alignments',
        'standings.alignment.heel': 'Heel',
        'standings.filterByDivision': 'Filter by Division',
        'standings.noDivision': 'No Division',
        'standings.table.rank': 'Rank',
        'standings.table.image': 'Image',
        'standings.table.player': 'Player',
        'standings.table.wrestler': 'Wrestler',
        'standings.table.division': 'Division',
        'standings.table.wins': 'W',
        'standings.table.losses': 'L',
        'standings.table.draws': 'D',
        'standings.table.winPercent': 'Win %',
        'standings.table.form': 'Last 5',
        'standings.table.streak': 'Streak',
        'standings.lastResult': 'Last result',
        'standings.winStreak': 'Win Streak',
        'standings.lossStreak': 'Loss Streak',
        'standings.drawStreak': 'Draw Streak',
        'common.all': 'All',
        'common.error': 'Error',
        'common.retry': 'Retry',
        'common.active': 'Active',
      };
      return map[key] || key;
    },
  }),
}));

const mockMobile = vi.hoisted(() => ({ value: false }));
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => mockMobile.value }));

vi.mock('../Standings.css', () => ({}));
vi.mock('../PlayerHoverCard.css', () => ({}));

import Standings from '../Standings';

function renderStandings() {
  return render(
    <MemoryRouter>
      <Standings />
    </MemoryRouter>
  );
}

// --- Test data ---
const mockPlayers = [
  {
    playerId: 'p1',
    name: 'John Cena',
    currentWrestler: 'The Champ',
    wins: 25,
    losses: 10,
    draws: 3,
    divisionId: 'div1',
    createdAt: '2024-01-01',
    updatedAt: '2024-06-01',
  },
  {
    playerId: 'p2',
    name: 'The Rock',
    currentWrestler: 'The Great One',
    wins: 20,
    losses: 12,
    draws: 1,
    divisionId: 'div2',
    createdAt: '2024-01-01',
    updatedAt: '2024-06-01',
  },
  {
    playerId: 'p3',
    name: 'Undertaker',
    currentWrestler: 'The Deadman',
    wins: 18,
    losses: 5,
    draws: 0,
    createdAt: '2024-01-01',
    updatedAt: '2024-06-01',
  },
];

const chasePack = [
  {
    playerId: 'p4',
    name: 'Stone Cold',
    currentWrestler: 'The Rattlesnake',
    wins: 10,
    losses: 5,
    draws: 5,
    divisionId: 'div1',
    alignment: 'heel' as const,
    createdAt: '2024-01-01',
    updatedAt: '2024-06-01',
  },
  {
    playerId: 'p5',
    name: 'Mankind',
    currentWrestler: 'Mick Foley',
    wins: 5,
    losses: 15,
    draws: 0,
    divisionId: 'div2',
    createdAt: '2024-01-01',
    updatedAt: '2024-06-01',
  },
];

const allPlayers = [...mockPlayers, ...chasePack];

const mockSeasons = [
  {
    seasonId: 's1',
    name: 'Season 1',
    startDate: '2024-01-01',
    status: 'completed' as const,
    createdAt: '2024-01-01',
    updatedAt: '2024-06-01',
  },
  {
    seasonId: 's2',
    name: 'Season 2',
    startDate: '2024-06-01',
    status: 'active' as const,
    createdAt: '2024-06-01',
    updatedAt: '2024-06-01',
  },
];

const mockDivisions = [
  { divisionId: 'div1', name: 'Raw', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  { divisionId: 'div2', name: 'SmackDown', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
];

describe('Standings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMobile.value = false;
    mockGetAllSeasons.mockResolvedValue(mockSeasons);
    mockGetAllDivisions.mockResolvedValue(mockDivisions);
    mockGetStandings.mockResolvedValue({ players: allPlayers, sortedByWins: true });
  });

  it('puts the top three on the podium and the rest in a six column table', async () => {
    renderStandings();

    const podium = await screen.findByRole('list', { name: 'Top three' });
    expect(within(podium).getAllByRole('listitem')).toHaveLength(3);
    expect(within(podium).getByText('John Cena')).toBeInTheDocument();
    expect(within(podium).getByText('25 - 10 - 3')).toBeInTheDocument();
    // 25/(25+10+3) = 65.8%
    expect(within(podium).getByText('65.8%')).toBeInTheDocument();

    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('columnheader')).toHaveLength(6);
    expect(within(table).queryByText('John Cena')).not.toBeInTheDocument();
    expect(within(table).getByText('#4')).toBeInTheDocument();
    expect(within(table).getByText('The Rattlesnake')).toBeInTheDocument();
    expect(within(table).getByText('10 - 5 - 5')).toBeInTheDocument();
    expect(within(table).getByText('50.0%')).toBeInTheDocument();
  });

  it('links players to their profile', async () => {
    renderStandings();

    const link = await screen.findByRole('link', { name: 'Stone Cold' });
    expect(link).toHaveAttribute('href', '/player/p4');
    expect(screen.getByRole('link', { name: /John Cena/ })).toHaveAttribute('href', '/player/p1');
  });

  it('shows form oldest to newest and the current streak', async () => {
    mockGetStandings.mockResolvedValue({
      players: [
        ...mockPlayers,
        { ...chasePack[0], recentForm: ['L', 'W', 'W', 'W', 'W'], currentStreak: { type: 'L', count: 1 } },
      ],
      sortedByWins: true,
    });

    renderStandings();

    const table = await screen.findByRole('table');
    expect(within(table).getByTitle('Loss Streak')).toHaveTextContent('L1');
    const dots = within(table).getByRole('img', { name: /ui\.formDots\.label/ });
    // API order is newest first, so the newest loss must land last.
    expect(dots.lastElementChild).toHaveClass('ui-form-dots__dot--l');
  });

  it('renders a dash when a player has no form or streak', async () => {
    renderStandings();

    const table = await screen.findByRole('table');
    expect(within(table).getAllByText('-').length).toBeGreaterThanOrEqual(2);
  });

  it('skips the podium while nobody has played', async () => {
    mockGetStandings.mockResolvedValue({
      players: mockPlayers.map((player) => ({ ...player, wins: 0, losses: 0, draws: 0 })),
      sortedByWins: true,
    });

    renderStandings();

    const table = await screen.findByRole('table');
    expect(screen.queryByRole('list', { name: 'Top three' })).not.toBeInTheDocument();
    expect(within(table).getByText('#1')).toBeInTheDocument();
  });

  it('gives medals only to players who have wrestled and keeps ranks in step with the table', async () => {
    mockGetStandings.mockResolvedValue({
      sortedByWins: true,
      // The API order, which puts 0-0-0 above 0-2-0.
      players: [
        { ...mockPlayers[0], wins: 3, losses: 0, draws: 0 },
        { ...chasePack[0], wins: 2, losses: 0, draws: 0 },
        { ...mockPlayers[1], wins: 0, losses: 0, draws: 0, recentForm: ['W'], currentStreak: { type: 'W', count: 1 } },
        { ...mockPlayers[2], wins: 0, losses: 2, draws: 0 },
      ],
    });

    renderStandings();

    const podium = await screen.findByRole('list', { name: 'Top three' });
    expect(within(podium).getByText('John Cena')).toBeInTheDocument();
    expect(within(podium).getByText('Stone Cold')).toBeInTheDocument();
    expect(within(podium).getByText('Undertaker')).toBeInTheDocument();
    expect(within(podium).queryByText('The Rock')).not.toBeInTheDocument();

    const table = screen.getByRole('table');
    expect(within(table).getByText('#4')).toBeInTheDocument();
    expect(within(table).getByText('The Rock')).toBeInTheDocument();
    // Nothing recorded in this scope, so form from elsewhere stays out of the row.
    expect(within(table).queryByText('W1')).not.toBeInTheDocument();
  });

  it('skips the podium until three players have wrestled, so the table starts at #1', async () => {
    mockGetStandings.mockResolvedValue({
      sortedByWins: true,
      players: [
        { ...mockPlayers[0], wins: 3, losses: 0, draws: 0 },
        { ...mockPlayers[1], wins: 1, losses: 2, draws: 0 },
        { ...mockPlayers[2], wins: 0, losses: 0, draws: 0 },
      ],
    });

    renderStandings();

    const table = await screen.findByRole('table');
    expect(screen.queryByRole('list', { name: 'Top three' })).not.toBeInTheDocument();
    expect(screen.queryByText('The chase pack')).not.toBeInTheDocument();
    expect(within(table).getByText('#1')).toBeInTheDocument();
    expect(within(table).getByText('John Cena')).toBeInTheDocument();
  });

  it('shows the win rate on the phone rows', async () => {
    mockMobile.value = true;

    renderStandings();

    const link = await screen.findByRole('link', { name: /Stone Cold/ });
    expect(link).toHaveTextContent('50.0%');
  });

  it('uses a row list instead of the table on phones', async () => {
    mockMobile.value = true;

    renderStandings();

    const link = await screen.findByRole('link', { name: /Stone Cold/ });
    expect(link).toHaveAttribute('href', '/player/p4');
    expect(link).toHaveTextContent('10 - 5 - 5');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('defaults to the active season and reloads when the season changes', async () => {
    const user = userEvent.setup();
    renderStandings();

    const seasonSelect = await screen.findByRole('combobox', { name: 'Season' });
    expect(seasonSelect).toHaveTextContent('Season 2 (Active)');
    await waitFor(() => {
      expect(mockGetStandings).toHaveBeenCalledWith('s2', expect.any(AbortSignal));
    });

    await user.click(seasonSelect);
    expect(await screen.findByRole('option', { name: 'All Time' })).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'Season 1' }));

    await waitFor(() => {
      expect(mockGetStandings).toHaveBeenCalledWith('s1', expect.any(AbortSignal));
    });
    expect(await screen.findByText('Season 1', { selector: '.page-header__eyebrow' })).toBeInTheDocument();
  });

  it('filters by division and re-ranks from one', async () => {
    const user = userEvent.setup();
    renderStandings();

    await user.click(await screen.findByRole('button', { name: 'SmackDown' }));

    expect(screen.getByRole('button', { name: 'SmackDown' })).toHaveAttribute('aria-pressed', 'true');
    const table = screen.getByRole('table');
    expect(within(table).getByText('#1')).toBeInTheDocument();
    expect(within(table).getByText('The Rock')).toBeInTheDocument();
    expect(within(table).getByText('Mankind')).toBeInTheDocument();
    expect(screen.queryByText('John Cena')).not.toBeInTheDocument();
  });

  describe('with more players than one page', () => {
    // 120 played players, best record first, plus one unbeaten player far down the list.
    const longTable = Array.from({ length: 120 }, (_, index) => ({
      ...chasePack[0],
      playerId: `long-${index}`,
      name: `Player ${index + 1}`,
      wins: 200 - index,
      losses: index === 110 ? 0 : 50,
      draws: 0,
      divisionId: index % 2 === 0 ? 'div1' : 'div2',
    }));

    beforeEach(() => {
      mockGetAllSeasons.mockResolvedValue([]);
      mockGetAllDivisions.mockResolvedValue(mockDivisions);
      mockGetStandings.mockResolvedValue({ players: longTable, sortedByWins: true });
    });

    const showMoreButton = () => screen.findByRole('button', { name: 'common.showMore' });
    const tableRows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);

    it('caps the table and keeps true ranks as more rows are shown', async () => {
      const user = userEvent.setup();
      renderStandings();

      await user.click(await showMoreButton());

      expect(tableRows()).toHaveLength(100);
      expect(within(tableRows()[0]).getByText('#4')).toBeInTheDocument();
      expect(within(tableRows()[99]).getByText('#103')).toBeInTheDocument();

      await user.click(await showMoreButton());

      expect(tableRows()).toHaveLength(117);
      expect(within(tableRows()[116]).getByText('#120')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'common.showMore' })).not.toBeInTheDocument();
    });

    it('caps the phone list too', async () => {
      mockMobile.value = true;
      const user = userEvent.setup();
      renderStandings();

      await user.click(await showMoreButton());

      const rows = within(document.querySelector('.standings-list') as HTMLElement).getAllByRole('listitem');
      expect(rows).toHaveLength(100);
      expect(within(rows[99]).getByText('#103')).toBeInTheDocument();
    });

    it('goes back to one page when a filter changes', async () => {
      const user = userEvent.setup();
      renderStandings();
      await user.click(await showMoreButton());
      expect(tableRows()).toHaveLength(100);

      await user.click(screen.getByRole('button', { name: 'SmackDown' }));

      expect(tableRows()).toHaveLength(50);
      expect(within(tableRows()[0]).getByText('#4')).toBeInTheDocument();
    });

    it('sorts every row, not just the rows on screen', async () => {
      const user = userEvent.setup();
      renderStandings();
      await showMoreButton();

      await user.click(screen.getByRole('button', { name: 'Win %' }));
      await user.click(screen.getByRole('button', { name: 'Win %' }));

      expect(tableRows()).toHaveLength(50);
      expect(within(tableRows()[0]).getByText('Player 111')).toBeInTheDocument();
      expect(within(tableRows()[0]).getByText('#111')).toBeInTheDocument();
    });
  });

  it('keeps the filters on screen when nothing matches them', async () => {
    const user = userEvent.setup();
    mockGetStandings.mockResolvedValue({ players: mockPlayers, sortedByWins: true });
    renderStandings();

    await user.click(await screen.findByRole('combobox', { name: 'Alignment' }));
    await user.click(await screen.findByRole('option', { name: 'Heel' }));

    expect(await screen.findByText('No wrestlers match')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Season' })).toBeInTheDocument();
  });

  it('shows empty state when no players exist', async () => {
    mockGetStandings.mockResolvedValue({ players: [], sortedByWins: true });

    renderStandings();

    expect(await screen.findByText('No players found.')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Season' })).toBeInTheDocument();
  });

  it('shows error state with retry button when API fails', async () => {
    mockGetStandings.mockRejectedValue(new Error('Server down'));
    mockGetAllSeasons.mockResolvedValue([]);
    mockGetAllDivisions.mockResolvedValue([]);

    renderStandings();

    expect(await screen.findByText(/Server down/)).toBeInTheDocument();

    mockGetStandings.mockResolvedValue({ players: mockPlayers, sortedByWins: true });
    await userEvent.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(mockGetStandings).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByRole('list', { name: 'Top three' })).toBeInTheDocument();
  });
});
