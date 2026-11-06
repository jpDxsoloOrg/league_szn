import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const {
  mockFactionsGetById,
  mockFactionsGetPromos,
  mockFactionsGetSchedule,
  mockGetDirectory,
  authState,
} = vi.hoisted(() => ({
  mockFactionsGetById: vi.fn(),
  mockFactionsGetPromos: vi.fn(),
  mockFactionsGetSchedule: vi.fn(),
  mockGetDirectory: vi.fn(),
  authState: { playerId: null as string | null, isAdminOrModerator: false },
}));

vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => authState }));

vi.mock('../../../services/api', () => ({
  factionsApi: {
    getById: mockFactionsGetById,
    getPromos: mockFactionsGetPromos,
    getSchedule: mockFactionsGetSchedule,
  },
  playersApi: { getDirectory: mockGetDirectory },
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
// Stub the non-Overview tabs so the shell test stays focused on routing —
// the tab components have their own dedicated test files.
vi.mock('../tabs/FactionMembers', () => ({
  default: () => <p>Members placeholder</p>,
}));
vi.mock('../tabs/FactionStats', () => ({
  default: () => <p>Stats placeholder</p>,
}));
vi.mock('../tabs/FactionSchedule', () => ({
  default: () => <p>Schedule placeholder</p>,
}));
vi.mock('../tabs/FactionPromos', () => ({
  default: () => <p>Promos placeholder</p>,
}));
vi.mock('../tabs/FactionMessages', () => ({
  default: () => <p>Messages placeholder</p>,
}));
vi.mock('../tabs/FactionManage', () => ({
  default: () => <p>Manage placeholder</p>,
}));

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
  mockGetDirectory.mockResolvedValue([]);
  Object.assign(authState, { playerId: null, isAdminOrModerator: false });
});

describe('FactionDetail shell (FAC-11)', () => {
  it('renders the hero with name, status, leader, record, and heat label', async () => {
    // Wait on the record value as the "got past loading" signal, and verify
    // the banner image alt announces the faction name.
    renderShell();
    expect(await screen.findByText('12-4-1')).toBeInTheDocument();
    expect(screen.getByAltText('The Brood faction banner')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Led by Edge')).toBeInTheDocument();
    expect(screen.getByLabelText('Heat: 3 of 5')).toBeInTheDocument();
  });

  it('renders all seven tabs for the leader, with Overview active by default', async () => {
    authState.playerId = 'p-leader';
    renderShell();
    await screen.findByText('12-4-1');
    for (const label of ['Overview', 'Members', 'Stats', 'Schedule', 'Promos', 'Messages', 'Manage']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
  });

  it('shows signed-out visitors only the public tabs', async () => {
    renderShell();
    await screen.findByText('12-4-1');
    expect(screen.getByRole('link', { name: 'Schedule' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Messages' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Manage' })).not.toBeInTheDocument();
  });

  it('gives staff outside the faction Manage but not Messages, which the API refuses them', async () => {
    Object.assign(authState, { playerId: 'staff', isAdminOrModerator: true });
    renderShell();
    await screen.findByText('12-4-1');
    expect(screen.getByRole('link', { name: 'Manage' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Messages' })).not.toBeInTheDocument();
  });

  it('labels a leader who is missing instead of leaving "Led by" blank', async () => {
    mockFactionsGetById.mockResolvedValueOnce(baseFaction({ leaderName: '' }));
    renderShell();
    expect(await screen.findByText('Leader no longer listed')).toBeInTheDocument();
  });

  it('reads a streak sent as a string', async () => {
    mockFactionsGetById.mockResolvedValueOnce(
      baseFaction({ standings: { winPercentage: 40, recentForm: ['L'], currentStreak: 'L2' } }),
    );
    renderShell();
    expect(await screen.findByLabelText('Heat: 2 of 5')).toBeInTheDocument();
  });

  it('shows no heat gauge without a streak', async () => {
    mockFactionsGetById.mockResolvedValueOnce(
      baseFaction({ standings: { winPercentage: 0, recentForm: [], currentStreak: { type: 'W', count: 0 } } }),
    );
    renderShell();
    await screen.findByText('12-4-1');
    expect(screen.queryByRole('img', { name: /Heat/ })).not.toBeInTheDocument();
  });

  it('navigates between tabs and applies the active class', async () => {
    authState.playerId = 'p-leader';
    renderShell();
    await screen.findByText('12-4-1');

    // Tabs are stubbed at the top of the file so this assertion stays
    // focused on routing — placeholders verify the right tab rendered.
    await userEvent.click(screen.getByRole('link', { name: 'Manage' }));
    await waitFor(() => {
      expect(screen.getByText('Manage placeholder')).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: 'Manage' })).toHaveAttribute('aria-current', 'page');

    await userEvent.click(screen.getByRole('link', { name: 'Members' }));
    await waitFor(() => {
      expect(screen.getByText('Members placeholder')).toBeInTheDocument();
    });
  });

  it('renders an error state with a Retry button when the fetch fails', async () => {
    mockFactionsGetById.mockRejectedValueOnce(new Error('Boom'));
    renderShell();

    expect(await screen.findByText('Boom')).toBeInTheDocument();
    const retry = screen.getByRole('button', { name: 'Retry' });

    // Subsequent call succeeds — Retry recovers without a page reload.
    mockFactionsGetById.mockResolvedValueOnce(baseFaction());
    await userEvent.click(retry);
    expect(await screen.findByText('12-4-1')).toBeInTheDocument();
  });
});

describe('FactionDetail hero — FAC-22 record + banner-name fixes', () => {
  it('shows the banner whole beside a visible name, never under it', async () => {
    mockFactionsGetById.mockResolvedValueOnce(
      baseFaction({ imageUrl: '/images/brood.png' }),
    );
    renderShell();

    // Wait for the hero to render (record is the "got past loading" signal).
    await screen.findByText('12-4-1');
    expect(screen.getByRole('heading', { level: 1, name: 'The Brood' })).not.toHaveClass('sr-only');
    // The art sits in its own frame, so no text is laid over it.
    expect(screen.getByAltText('The Brood faction banner').parentElement).toHaveClass('poster-hero__frame');
  });

  it('renders the name <h1> when the faction has no custom banner', async () => {
    mockFactionsGetById.mockResolvedValueOnce(
      baseFaction({ imageUrl: undefined }),
    );
    renderShell();

    // No banner → the fallback gradient has no text of its own, so the
    // name needs to be visible.
    expect(
      await screen.findByRole('heading', { name: 'The Brood' }),
    ).not.toHaveClass('sr-only');
  });

  it('clamps undefined wins/losses/draws to 0 instead of rendering "-1"', async () => {
    mockFactionsGetById.mockResolvedValueOnce(
      baseFaction({ wins: undefined, losses: undefined, draws: undefined }),
    );
    renderShell();

    // Pre-fix this would render "" + "-" + "1" + "-" + ... → "--" mess.
    expect(await screen.findByText('0-0-0')).toBeInTheDocument();
  });

  it('clamps negative wins to 0 instead of bleeding into the record string', async () => {
    mockFactionsGetById.mockResolvedValueOnce(
      baseFaction({ wins: -1, losses: 1, draws: 0 }),
    );
    renderShell();

    // The reported bug: hero showed "-1-1-0" because wins came through
    // as -1 and JSX interpolated it raw. formatRecord should clamp.
    expect(await screen.findByText('0-1-0')).toBeInTheDocument();
    expect(screen.queryByText('-1-1-0')).toBeNull();
  });
});

describe('FactionOverview tab (FAC-11)', () => {
  it('says members are missing instead of "No members yet", and names the opponent in a result', async () => {
    mockGetDirectory.mockResolvedValue([{ playerId: 'rival', name: 'Rival Player', currentWrestler: 'Sting' }]);
    mockFactionsGetById.mockResolvedValueOnce(baseFaction({
      memberIds: ['gone-1', 'gone-2'],
      members: [],
      recentMatches: [{ matchId: 'm1', date: '2026-05-26', matchFormat: 'Single', participants: ['gone-1', 'rival'], losers: ['gone-1'], winners: ['rival'] }],
    }));
    renderShell();

    expect(await screen.findByText('2 members are no longer listed on the roster.')).toBeInTheDocument();
    expect(screen.queryByText('No members yet.')).not.toBeInTheDocument();
    expect(await screen.findByText('vs Sting')).toBeInTheDocument();
    expect(screen.getByText('Singles')).toBeInTheDocument();
  });

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
    expect(screen.getByText(/newest on the right/)).toBeInTheDocument();

    // Upcoming card displays count
    expect(await screen.findByText('Upcoming Matches (1)')).toBeInTheDocument();
    expect(screen.getByText(/In .* days/)).toBeInTheDocument();

    expect(screen.getByText('Faction Activity')).toBeInTheDocument();
    expect(screen.getByText('The Brood was formed')).toBeInTheDocument();
  });
});
