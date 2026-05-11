import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const {
  mockFactionsGetById,
  mockFactionsGetPromos,
  mockFactionsGetSchedule,
} = vi.hoisted(() => ({
  mockFactionsGetById: vi.fn(),
  mockFactionsGetPromos: vi.fn(),
  mockFactionsGetSchedule: vi.fn(),
}));

vi.mock('../../../services/api', () => ({
  factionsApi: {
    getById: mockFactionsGetById,
    getPromos: mockFactionsGetPromos,
    getSchedule: mockFactionsGetSchedule,
  },
}));

const interpolatingT = (_key: string, fallback?: string, options?: Record<string, unknown>) => {
  let text = fallback ?? _key;
  if (options) {
    for (const [name, value] of Object.entries(options)) {
      text = text.replace(new RegExp(`{{\\s*${name}\\s*}}`, 'g'), String(value));
    }
  }
  return text;
};
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: interpolatingT }),
}));

vi.mock('../FactionDetail.css', () => ({}));
vi.mock('../tabs/FactionOverview.css', () => ({}));

import FactionDetail from '../FactionDetail';
import FactionOverview from '../tabs/FactionOverview';
import FactionMembers from '../tabs/FactionMembers';
import FactionStats from '../tabs/FactionStats';
import FactionScheduleTab from '../tabs/FactionSchedule';
import FactionPromosTab from '../tabs/FactionPromos';
import FactionMessages from '../tabs/FactionMessages';
import FactionManage from '../tabs/FactionManage';

const baseFaction = (overrides: Record<string, unknown> = {}) => ({
  stableId: 'f1',
  name: 'The Brood',
  leaderId: 'p-leader',
  leaderName: 'Edge',
  memberIds: ['p-leader', 'p-2'],
  status: 'active',
  wins: 12,
  losses: 4,
  draws: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-04-01T00:00:00.000Z',
  imageUrl: '/images/brood.png',
  members: [
    {
      playerId: 'p-leader',
      playerName: 'Edge Player',
      wrestlerName: 'Edge',
      wins: 6,
      losses: 1,
      draws: 0,
      imageUrl: '/img/edge.png',
    },
    {
      playerId: 'p-2',
      playerName: 'Christian Player',
      wrestlerName: 'Christian',
      wins: 6,
      losses: 3,
      draws: 1,
      imageUrl: '/img/christian.png',
    },
  ],
  standings: {
    winPercentage: 75.0,
    recentForm: ['W', 'W', 'L', 'W', 'W'],
    currentStreak: { type: 'W', count: 3 },
  },
  headToHead: [],
  matchTypeRecords: [],
  recentMatches: [
    {
      matchId: 'm1',
      date: '2026-04-01T00:00:00.000Z',
      matchFormat: 'singles',
      winners: ['p-leader'],
      losers: ['outsider'],
      status: 'completed',
    },
  ],
  ...overrides,
});

function renderShell(initialPath = '/factions/f1') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/factions/:factionId" element={<FactionDetail />}>
          <Route index element={<FactionOverview />} />
          <Route path="members" element={<FactionMembers />} />
          <Route path="stats" element={<FactionStats />} />
          <Route path="schedule" element={<FactionScheduleTab />} />
          <Route path="promos" element={<FactionPromosTab />} />
          <Route path="messages" element={<FactionMessages />} />
          <Route path="manage" element={<FactionManage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFactionsGetById.mockResolvedValue(baseFaction());
  mockFactionsGetPromos.mockResolvedValue({ items: [] });
  mockFactionsGetSchedule.mockResolvedValue({ items: [] });
});

describe('FactionDetail shell (FAC-11)', () => {
  it('renders the hero with name, status, leader, record, and heat label', async () => {
    renderShell();
    expect(await screen.findByRole('heading', { name: 'The Brood' })).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Led by Edge')).toBeInTheDocument();
    expect(screen.getByText('12-4-1')).toBeInTheDocument();
    expect(screen.getByLabelText('Heat: 3 of 5')).toBeInTheDocument();
  });

  it('renders all seven tabs with Overview active by default', async () => {
    renderShell();
    await screen.findByRole('heading', { name: 'The Brood' });
    for (const label of ['Overview', 'Members', 'Stats', 'Schedule', 'Promos', 'Messages', 'Manage']) {
      expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
  });

  it('navigates between tabs and applies the active class', async () => {
    renderShell();
    await screen.findByRole('heading', { name: 'The Brood' });

    await userEvent.click(screen.getByRole('tab', { name: 'Stats' }));
    await waitFor(() => {
      expect(screen.getByText('Stats tab — coming soon.')).toBeInTheDocument();
    });
    expect(screen.getByRole('tab', { name: 'Stats' })).toHaveAttribute('aria-current', 'page');

    await userEvent.click(screen.getByRole('tab', { name: 'Manage' }));
    await waitFor(() => {
      expect(screen.getByText('Manage tab — coming soon.')).toBeInTheDocument();
    });
  });

  it('renders an error state with a Retry button when the fetch fails', async () => {
    mockFactionsGetById.mockRejectedValueOnce(new Error('Boom'));
    renderShell();

    expect(await screen.findByText(/Error.*Boom/)).toBeInTheDocument();
    const retry = screen.getByRole('button', { name: 'Retry' });

    // Subsequent call succeeds — Retry recovers without a page reload.
    mockFactionsGetById.mockResolvedValueOnce(baseFaction());
    await userEvent.click(retry);
    expect(await screen.findByRole('heading', { name: 'The Brood' })).toBeInTheDocument();
  });
});

describe('FactionOverview tab (FAC-11)', () => {
  it('renders the roster row, recent results, streak, upcoming, and activity sections', async () => {
    mockFactionsGetSchedule.mockResolvedValueOnce({
      items: [
        {
          matchId: 's1',
          scheduledFor: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
          matchFormat: 'singles',
          eventId: null,
          eventName: null,
          location: null,
          participants: [
            { playerId: 'p-leader', playerName: 'Edge Player', isFactionMember: true },
            { playerId: 'outsider', playerName: 'Outsider', isFactionMember: false },
          ],
        },
      ],
    });
    mockFactionsGetPromos.mockResolvedValueOnce({
      items: [
        {
          promoId: 'pr1',
          promoType: 'call-out',
          thumbnail: null,
          headline: 'The Brood calls out',
          excerpt: 'short body',
          authorPlayerId: 'p-leader',
          authorPlayerName: 'Edge Player',
          authorWrestlerName: 'Edge',
          targetPlayerId: 'outsider',
          targetPlayerName: 'Outsider',
          targetWrestlerName: 'Outsider Wrestler',
          date: '2026-04-15T00:00:00.000Z',
          viewCount: null,
          heatImpact: null,
          isReplyable: true,
        },
      ],
    });

    renderShell();

    expect(await screen.findByText('Member Roster at a Glance')).toBeInTheDocument();
    // Position label + roster wrestler names. "Edge" also appears in the hero
    // ("Led by Edge"), so scope the assertion to the roster row's link.
    expect(screen.getByText('LEADER')).toBeInTheDocument();
    const rosterLeaderLink = screen.getByRole('link', { name: /LEADER\s+Edge\s+6-1-0/ });
    expect(rosterLeaderLink).toBeInTheDocument();
    expect(screen.getByText('Christian')).toBeInTheDocument();

    expect(screen.getByText('Recent Faction Results')).toBeInTheDocument();
    expect(screen.getByText('Promos Involving This Faction')).toBeInTheDocument();
    expect(await screen.findByText('The Brood calls out')).toBeInTheDocument();

    expect(screen.getByText('Streak')).toBeInTheDocument();
    expect(screen.getByText('3W')).toBeInTheDocument();
    expect(screen.getByLabelText('Last 10 results')).toBeInTheDocument();

    // Upcoming card displays count
    expect(await screen.findByText('Upcoming Matches (1)')).toBeInTheDocument();
    expect(screen.getByText(/In .* days/)).toBeInTheDocument();

    expect(screen.getByText('Faction Activity')).toBeInTheDocument();
    expect(screen.getByText('The Brood was formed')).toBeInTheDocument();
  });
});
