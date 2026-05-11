import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const {
  mockGetSchedule,
  mockUseOutletContext,
} = vi.hoisted(() => ({
  mockGetSchedule: vi.fn(),
  mockUseOutletContext: vi.fn(),
}));

vi.mock('../../../../services/api', () => ({
  factionsApi: { getSchedule: mockGetSchedule },
}));

vi.mock('react-router-dom', async () => {
  const actual: typeof import('react-router-dom') = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useOutletContext: () => mockUseOutletContext(),
  };
});

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

vi.mock('../FactionSchedule.css', () => ({}));

import FactionSchedule from '../FactionSchedule';

const baseFaction = () => ({
  stableId: 'f1',
  name: 'The Brood',
  leaderId: 'leader',
  leaderName: 'Edge',
  memberIds: ['leader', 'm1'],
  status: 'active',
  wins: 0,
  losses: 0,
  draws: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  members: [
    { playerId: 'leader', playerName: 'Edge Player', wrestlerName: 'Edge', wins: 0, losses: 0, draws: 0 },
    { playerId: 'm1', playerName: 'Christian Player', wrestlerName: 'Christian', wins: 0, losses: 0, draws: 0 },
  ],
  standings: { winPercentage: 0, recentForm: [], currentStreak: { type: 'W', count: 0 } },
  headToHead: [],
  matchTypeRecords: [],
  recentMatches: [],
});

const futureMatch = (overrides: Record<string, unknown>) => ({
  matchId: 'm-default',
  scheduledFor: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
  matchFormat: 'singles',
  eventId: null,
  eventName: null,
  location: null,
  participants: [
    { playerId: 'leader', playerName: 'Edge Player', isFactionMember: true },
    { playerId: 'outsider', playerName: 'Outsider', isFactionMember: false },
  ],
  ...overrides,
});

function renderTab() {
  return render(
    <MemoryRouter>
      <FactionSchedule />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseOutletContext.mockReturnValue({ faction: baseFaction() });
  mockGetSchedule.mockResolvedValue({ items: [] });
  // Match the impl's reliance on scrollIntoView for the calendar click test.
  Element.prototype.scrollIntoView = vi.fn();
});

describe('FactionSchedule tab (FAC-14)', () => {
  it('renders the upcoming matches list in time order', async () => {
    // Backend sorts asc; the test asserts the frontend renders that order.
    mockGetSchedule.mockResolvedValueOnce({
      items: [
        futureMatch({
          matchId: 'b',
          scheduledFor: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
          matchFormat: 'singles',
        }),
        futureMatch({
          matchId: 'a',
          scheduledFor: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
          matchFormat: 'tag',
        }),
      ],
    });

    renderTab();

    await waitFor(() => expect(mockGetSchedule).toHaveBeenCalled());
    const rows = await screen.findAllByRole('listitem');
    const matchRows = rows.filter((r) => r.classList.contains('faction-schedule__row'));
    expect(matchRows).toHaveLength(2);
    // The backend already sorts ascending — assert the order surfaces as-is.
    expect(within(matchRows[0]).getByText(/SINGLES/)).toBeInTheDocument();
    expect(within(matchRows[1]).getByText(/TAG/)).toBeInTheDocument();
  });

  it('filters the visible matches when a member chip is toggled off', async () => {
    mockGetSchedule.mockResolvedValueOnce({
      items: [
        futureMatch({
          matchId: 'a',
          participants: [
            { playerId: 'leader', playerName: 'Edge Player', isFactionMember: true },
            { playerId: 'outsider', playerName: 'Outsider', isFactionMember: false },
          ],
        }),
        futureMatch({
          matchId: 'b',
          participants: [
            { playerId: 'm1', playerName: 'Christian Player', isFactionMember: true },
            { playerId: 'outsider', playerName: 'Outsider', isFactionMember: false },
          ],
        }),
      ],
    });

    renderTab();
    await screen.findAllByRole('listitem');

    // Toggle Christian OFF — only the leader's row should remain.
    await userEvent.click(screen.getByRole('button', { name: 'Christian', pressed: true }));

    await waitFor(() => {
      const rows = screen.getAllByRole('listitem').filter((r) =>
        r.classList.contains('faction-schedule__row'),
      );
      expect(rows).toHaveLength(1);
    });
  });

  it('scrolls into view when a calendar day with matches is clicked', async () => {
    const tomorrow = new Date();
    tomorrow.setHours(0, 0, 0, 0);
    tomorrow.setDate(tomorrow.getDate() + 1);
    mockGetSchedule.mockResolvedValueOnce({
      items: [
        futureMatch({
          matchId: 'tomorrow',
          scheduledFor: new Date(tomorrow.getTime() + 12 * 60 * 60 * 1000).toISOString(),
        }),
      ],
    });

    renderTab();
    await screen.findAllByRole('listitem');

    const isoDay = tomorrow.toISOString().slice(0, 10);
    const dayBtn = screen.getByLabelText(`1 matches on ${isoDay}`);
    await userEvent.click(dayBtn);

    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('renders the empty state when there are no upcoming matches', async () => {
    renderTab();
    expect(
      await screen.findByText(
        'No upcoming matches for the selected members in the next 60 days.',
      ),
    ).toBeInTheDocument();
  });
});
