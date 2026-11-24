import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// --- Hoisted mocks ---
const { mockGetStandings, mockGetAllSeasons, mockGetAllDivisions, mockGetConsiderations } = vi.hoisted(() => ({
  mockGetConsiderations: vi.fn(),
  mockGetStandings: vi.fn(),
  mockGetAllSeasons: vi.fn(),
  mockGetAllDivisions: vi.fn(),
}));

vi.mock('../../services/api', () => ({
  standingsApi: { get: mockGetStandings },
  seasonsApi: { getAll: mockGetAllSeasons },
  divisionsApi: { getAll: mockGetAllDivisions },
  progressionApi: { getConsiderations: mockGetConsiderations },
}));

vi.mock('../../utils/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        'standings.table.points': 'Pts',
        'standings.howItWorks': 'How standings work',
        'standings.points.value': '{{count}} pts',
        'standings.points.showBreakdown': '{{name}}: {{points}} points',
        'standings.points.breakdown': '{{total}} = {{parts}}',
        'standings.points.fromResults': '{{count}} from results',
        'standings.points.qualityWins': '{{count}} quality wins',
        'standings.points.streakBonuses': '{{count}} streak bonus',
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
      const text = map[key] || key;
      return text.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(options?.[name] ?? ''));
    },
  }),
}));

const mockViewer = vi.hoisted(() => ({ isGm: false, publicRelegationWatch: false }));
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ isAdminOrModerator: mockViewer.isGm }),
}));
vi.mock('../../contexts/SiteConfigContext', () => ({
  useSiteConfig: () => ({ tickerSettings: { publicRelegationWatch: mockViewer.publicRelegationWatch } }),
}));

const mockMobile = vi.hoisted(() => ({ value: false }));
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => mockMobile.value }));

vi.mock('../Standings.css', () => ({}));
vi.mock('../PlayerHoverCard.css', () => ({}));

import Standings from '../Standings';
import { resetConsiderationsCache } from '../../hooks/useConsiderations';

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
    mockViewer.isGm = false;
    mockViewer.publicRelegationWatch = false;
    mockGetAllSeasons.mockResolvedValue(mockSeasons);
    mockGetAllDivisions.mockResolvedValue(mockDivisions);
    mockGetStandings.mockResolvedValue({ players: allPlayers, sortedByWins: true });
    mockGetConsiderations.mockResolvedValue([]);
    resetConsiderationsCache();
  });

  it('shows the call-up badge on a flagged player in the podium as well as in the table', async () => {
    mockGetConsiderations.mockResolvedValue([
      { playerId: 'p1', name: 'John Cena', wrestlerName: '', trackId: 't1', markedAt: '2026-11-15T00:00:00Z' },
      { playerId: 'p4', name: 'p4', wrestlerName: '', trackId: 't1', markedAt: '2026-11-15T00:00:00Z' },
    ]);
    renderStandings();

    const podium = await screen.findByRole('list', { name: 'Top three' });
    expect(await within(podium).findAllByTestId('consideration-badge')).toHaveLength(1);
    expect(within(screen.getByRole('table')).getAllByTestId('consideration-badge')).toHaveLength(1);
  });

  it('puts the top three on the podium and the rest in a seven column table', async () => {
    renderStandings();

    const podium = await screen.findByRole('list', { name: 'Top three' });
    expect(within(podium).getAllByRole('listitem')).toHaveLength(3);
    expect(within(podium).getByText('John Cena')).toBeInTheDocument();
    expect(within(podium).getByText('25 - 10 - 3')).toBeInTheDocument();
    // 25/(25+10+3) = 65.8%
    expect(within(podium).getByText('65.8%')).toBeInTheDocument();

    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('columnheader')).toHaveLength(7);
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

  it('shows a dash for the win rate of a player with no matches', async () => {
    mockGetStandings.mockResolvedValue({
      players: [{ ...chasePack[0], wins: 0, losses: 0, draws: 0 }],
      sortedByWins: true,
    });
    renderStandings();

    const table = await screen.findByRole('table');
    expect(within(table).queryByText('0.0%')).not.toBeInTheDocument();
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
  describe('promotion and relegation zones', () => {
    const ladder = [
      { divisionId: 'raw', name: 'Raw', tier: 1, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
      { divisionId: 'nxt', name: 'NXT', tier: 2, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
      { divisionId: 'yb', name: 'Young Boys', isDevelopmental: true, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    ];

    function nxtPlayer(index: number, wins: number, losses: number) {
      return {
        playerId: `n${index}`,
        name: `NXT ${index}`,
        currentWrestler: `Wrestler ${index}`,
        wins,
        losses,
        draws: 0,
        divisionId: 'nxt',
        createdAt: '2024-01-01',
        updatedAt: '2024-06-01',
      };
    }

    // Seven NXT players: six have wrestled, one is unbooked (0-0-0).
    const nxtPlayers = [
      nxtPlayer(1, 10, 1),
      nxtPlayer(2, 9, 2),
      nxtPlayer(3, 8, 3),
      nxtPlayer(4, 7, 4),
      nxtPlayer(5, 3, 8),
      nxtPlayer(6, 2, 9),
      nxtPlayer(7, 0, 0),
    ];
    const rawPlayers = [
      { ...nxtPlayer(8, 10, 0), divisionId: 'raw' },
      { ...nxtPlayer(9, 5, 5), divisionId: 'raw' },
      { ...nxtPlayer(10, 4, 6), divisionId: 'raw' },
      { ...nxtPlayer(11, 1, 9), divisionId: 'raw' },
    ];

    beforeEach(() => {
      mockGetAllDivisions.mockResolvedValue(ladder);
      mockGetStandings.mockResolvedValue({ players: [...nxtPlayers, ...rawPlayers], sortedByWins: true });
    });

    async function showDivision(name: string) {
      const user = userEvent.setup();
      renderStandings();
      await user.click(await screen.findByRole('button', { name }));
      await screen.findByRole('list', { name: 'Top three' });
      return user;
    }

    function rowFor(name: string): HTMLElement {
      const row = screen.getByText(name).closest('tr');
      if (!row) throw new Error(`No row for ${name}`);
      return row;
    }

    it('marks the top two of a lower tier as the promotion zone, on the podium too', async () => {
      await showDivision('NXT');

      const podium = screen.getByRole('list', { name: 'Top three' });
      expect(within(podium).getAllByText('standings.zones.promotion')).toHaveLength(2);
      expect(rowFor('NXT 4')).not.toHaveClass('standings-zone');
      expect(screen.getByRole('list', { name: 'standings.zones.legend' })).toHaveTextContent('standings.zones.promotionLegend');
    });

    it('hides the relegation zone from the public while publicRelegationWatch is off', async () => {
      await showDivision('NXT');

      expect(rowFor('NXT 6')).not.toHaveClass('standings-zone--relegation');
      expect(screen.queryByRole('img', { name: 'standings.zones.relegation' })).not.toBeInTheDocument();
      expect(screen.getByRole('list', { name: 'standings.zones.legend' })).not.toHaveTextContent('standings.zones.relegationLegend');
    });

    it('shows the bottom two who have wrestled as the relegation zone when publicRelegationWatch is on', async () => {
      mockViewer.publicRelegationWatch = true;
      await showDivision('NXT');

      expect(rowFor('NXT 5')).toHaveClass('standings-zone--relegation');
      expect(rowFor('NXT 6')).toHaveClass('standings-zone--relegation');
      expect(rowFor('NXT 4')).not.toHaveClass('standings-zone');
      // An unbooked wrestler is in no zone.
      expect(rowFor('NXT 7')).not.toHaveClass('standings-zone');
      expect(screen.getAllByRole('img', { name: 'standings.zones.relegation' })).toHaveLength(2);
      expect(screen.getByRole('list', { name: 'standings.zones.legend' })).toHaveTextContent('standings.zones.relegationLegend');
    });

    it('shows the relegation zone to a GM even with the setting off', async () => {
      mockViewer.isGm = true;
      await showDivision('NXT');

      expect(rowFor('NXT 6')).toHaveClass('standings-zone--relegation');
    });

    it('gives the top tier no promotion zone', async () => {
      mockViewer.isGm = true;
      await showDivision('Raw');

      const podium = screen.getByRole('list', { name: 'Top three' });
      expect(within(podium).queryByText('standings.zones.promotion')).not.toBeInTheDocument();
      // Bottom two of Raw's four: #3 on the podium, #4 in the table.
      expect(within(podium).getAllByText('standings.zones.relegation')).toHaveLength(1);
      expect(rowFor('NXT 11')).toHaveClass('standings-zone--relegation');
    });

    it('honours a zone size of 0 and a custom size', async () => {
      mockViewer.isGm = true;
      mockGetAllDivisions.mockResolvedValue(
        ladder.map((division) => (division.divisionId === 'nxt'
          ? { ...division, promotionZoneSize: 0, relegationZoneSize: 3 }
          : division)),
      );
      await showDivision('NXT');

      expect(screen.queryByText('standings.zones.promotion')).not.toBeInTheDocument();
      expect(rowFor('NXT 4')).toHaveClass('standings-zone--relegation');
      expect(rowFor('NXT 5')).toHaveClass('standings-zone--relegation');
      expect(rowFor('NXT 6')).toHaveClass('standings-zone--relegation');
    });

    it('shows no zones across all divisions', async () => {
      mockViewer.isGm = true;
      await showDivision('All');

      expect(screen.queryByText('standings.zones.promotion')).not.toBeInTheDocument();
      expect(screen.queryByRole('list', { name: 'standings.zones.legend' })).not.toBeInTheDocument();
      expect(document.querySelector('.standings-zone')).toBeNull();
    });

    it('keeps the colour bar and icon on phone rows', async () => {
      mockMobile.value = true;
      mockViewer.publicRelegationWatch = true;
      await showDivision('NXT');

      const row = screen.getByRole('link', { name: /NXT 6/ });
      expect(row.closest('li')).toHaveClass('standings-zone--relegation');
      expect(within(row).getByRole('img', { name: 'standings.zones.relegation' })).toBeInTheDocument();
    });
  });

  describe('division records (PRL-09)', () => {
    const divisionsWithHeavyweight = [
      { divisionId: 'hw', name: 'Heavyweight', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
      { divisionId: 'mc', name: 'Mid Card', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    ];

    function heavyweight(playerId: string, wins: number, losses: number) {
      return {
        playerId,
        name: `Heavy ${playerId}`,
        currentWrestler: `Wrestler ${playerId}`,
        wins,
        losses,
        draws: 0,
        divisionId: 'hw',
        createdAt: '2024-01-01',
        updatedAt: '2024-06-01',
        divisionRecord: { wins, losses, draws: 0, recentForm: ['W'], currentStreak: { type: 'W', count: 1 } },
      };
    }

    // Career 20-0-0, but promoted yesterday with no matches since.
    const promoted = {
      ...heavyweight('promoted', 20, 0),
      name: 'Promoted Star',
      divisionRecord: {
        wins: 0,
        losses: 0,
        draws: 0,
        recentForm: [],
        currentStreak: { type: 'W', count: 0 },
        since: '2026-11-23T12:00:00.000Z',
      },
    };

    beforeEach(() => {
      mockGetAllSeasons.mockResolvedValue([]);
      mockGetAllDivisions.mockResolvedValue(divisionsWithHeavyweight);
      mockGetStandings.mockResolvedValue({
        players: [promoted, heavyweight('h1', 5, 1), heavyweight('h2', 4, 2), heavyweight('h3', 3, 3), heavyweight('h4', 1, 4)],
        sortedByWins: true,
      });
    });

    it('ranks a newly promoted player last at 0-0-0 in their new division', async () => {
      renderStandings();

      const podium = await screen.findByRole('list', { name: 'Top three' });
      expect(within(podium).queryByText('Promoted Star')).not.toBeInTheDocument();

      const row = screen.getByText('Promoted Star').closest('tr');
      if (!row) throw new Error('No row for Promoted Star');
      expect(within(row).getByText('#5')).toBeInTheDocument();
      expect(within(row).getByText('0 - 0 - 0')).toBeInTheDocument();
      expect(row).not.toHaveClass('standings-zone');
      expect(screen.getByText('standings.divisionSince')).toBeInTheDocument();
    });

    it('ranks by the API order across all divisions', async () => {
      const user = userEvent.setup();
      renderStandings();
      await user.click(await screen.findByRole('button', { name: 'All' }));

      const podium = await screen.findByRole('list', { name: 'Top three' });
      const [first] = within(podium).getAllByRole('listitem');
      expect(within(first).getByText('Promoted Star')).toBeInTheDocument();
      expect(within(first).getByText('20 - 0 - 0')).toBeInTheDocument();
      expect(screen.queryByText('standings.divisionSince')).not.toBeInTheDocument();
    });
  });

  describe('league points (STR-04)', () => {
    function pointsPlayer(playerId: string, name: string, points: number, wins: number, losses: number, rank: number) {
      return {
        playerId,
        name,
        currentWrestler: `Wrestler ${playerId}`,
        wins,
        losses,
        draws: 0,
        divisionId: 'div1',
        createdAt: '2024-01-01',
        updatedAt: '2024-06-01',
        points,
        qualityWins: 0,
        streakBonuses: 0,
        rank,
      };
    }

    // API order is by points: Leader has fewer wins than Grinder but more points.
    const rankedPlayers = [
      { ...pointsPlayer('a', 'Leader', 18, 5, 1, 1), qualityWins: 2, streakBonuses: 1 },
      pointsPlayer('b', 'Grinder', 15, 6, 5, 2),
      { ...pointsPlayer('c', 'Third', 12, 4, 2, 3), divisionId: 'div2' },
      pointsPlayer('d', 'Fourth', 9, 3, 3, 4),
      { ...pointsPlayer('e', 'Fifth', 9, 7, 9, 4), divisionId: 'div2' },
      pointsPlayer('f', 'Sixth', 3, 1, 4, 6),
    ];

    beforeEach(() => {
      mockGetAllSeasons.mockResolvedValue([]);
      mockGetAllDivisions.mockResolvedValue(mockDivisions);
      mockGetStandings.mockResolvedValue({ players: rankedPlayers, rankedBy: 'points', sortedByWins: false });
    });

    const tableRows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);

    it('keeps the API points order and shows points on the podium', async () => {
      renderStandings();

      const podium = await screen.findByRole('list', { name: 'Top three' });
      const [first, second] = within(podium).getAllByRole('listitem');
      expect(within(first).getByText('Leader')).toBeInTheDocument();
      expect(within(first).getByText('18 pts')).toBeInTheDocument();
      expect(within(second).getByText('Grinder')).toBeInTheDocument();
      expect(within(second).getByText('15 pts')).toBeInTheDocument();

      expect(within(tableRows()[0]).getByText('Fourth')).toBeInTheDocument();
      expect(within(tableRows()[0]).getByRole('button', { name: 'Fourth: 9 points' })).toHaveTextContent('9');
      // Level on points with Fourth, so they share #4.
      expect(within(tableRows()[1]).getByText('#4')).toBeInTheDocument();
      expect(within(tableRows()[2]).getByText('#6')).toBeInTheDocument();
    });

    it('opens the points breakdown on click and closes it with Escape', async () => {
      const user = userEvent.setup();
      mockGetStandings.mockResolvedValue({
        players: [rankedPlayers[1], rankedPlayers[2], rankedPlayers[3], rankedPlayers[0]].map((player, index) => ({ ...player, rank: index + 1 })),
        rankedBy: 'points',
        sortedByWins: false,
      });
      renderStandings();

      const button = await screen.findByRole('button', { name: 'Leader: 18 points' });
      expect(button).toHaveAttribute('aria-expanded', 'false');
      await user.click(button);

      expect(button).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByRole('status')).toHaveTextContent('18 = 15 from results + 2 quality wins + 1 streak bonus');

      await user.keyboard('{Escape}');
      expect(button).toHaveAttribute('aria-expanded', 'false');
    });

    it('leaves zero bonuses out of the breakdown', async () => {
      const user = userEvent.setup();
      renderStandings();

      await user.click(await screen.findByRole('button', { name: 'Sixth: 3 points' }));

      expect(screen.getByRole('status')).toHaveTextContent(/^3 = 3 from results$/);
    });

    it('opens the breakdown on tap from the phone list', async () => {
      mockMobile.value = true;
      const user = userEvent.setup();
      renderStandings();

      const button = await screen.findByRole('button', { name: 'Fourth: 9 points' });
      expect(button.closest('a')).toBeNull();
      await user.click(button);

      expect(screen.getByRole('status')).toHaveTextContent('9 = 9 from results');
    });

    it('still sorts by wins from the record column', async () => {
      const user = userEvent.setup();
      renderStandings();
      await screen.findByRole('table');

      await user.click(screen.getByRole('button', { name: 'Record' }));
      await user.click(screen.getByRole('button', { name: 'Record' }));

      expect(within(tableRows()[0]).getByText('Fifth')).toBeInTheDocument();
      expect(within(tableRows()[2]).getByText('Sixth')).toBeInTheDocument();
    });

    it('ranks one division by its own points and renumbers from one', async () => {
      const user = userEvent.setup();
      mockGetStandings.mockResolvedValue({
        rankedBy: 'points',
        sortedByWins: false,
        players: rankedPlayers.map((player) => ({
          ...player,
          // In Raw since joining: Sixth leads, Leader has not wrestled yet.
          divisionRecord: {
            wins: player.playerId === 'a' ? 0 : player.wins,
            losses: player.playerId === 'a' ? 0 : player.losses,
            draws: 0,
            recentForm: [],
            currentStreak: { type: 'W', count: 0 },
            points: { a: 0, b: 6, d: 4, f: 9 }[player.playerId] ?? player.points,
            qualityWins: 0,
            streakBonuses: 0,
            rank: { a: 4, b: 2, d: 3, f: 1 }[player.playerId] ?? player.rank,
          },
        })),
      });
      renderStandings();

      await user.click(await screen.findByRole('button', { name: 'Raw' }));

      const podium = await screen.findByRole('list', { name: 'Top three' });
      const [first, second, third] = within(podium).getAllByRole('listitem');
      expect(within(first).getByText('Sixth')).toBeInTheDocument();
      expect(within(second).getByText('Grinder')).toBeInTheDocument();
      expect(within(third).getByText('Fourth')).toBeInTheDocument();
      expect(within(podium).getByText('9 pts')).toBeInTheDocument();
      // Leader has not wrestled in Raw yet, so they sit last at 0 points.
      expect(tableRows()).toHaveLength(1);
      expect(within(tableRows()[0]).getByText('Leader')).toBeInTheDocument();
      expect(within(tableRows()[0]).getByText('#4')).toBeInTheDocument();
      expect(within(tableRows()[0]).queryByRole('button', { name: /Leader/ })).not.toBeInTheDocument();
    });

    it('links to how standings work', async () => {
      renderStandings();

      expect(await screen.findByRole('link', { name: 'How standings work' })).toHaveAttribute('href', '/guide/wiki/how-standings-work');
    });
  });
});
