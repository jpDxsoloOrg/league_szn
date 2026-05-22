import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';

const { mockList, mockGetActivity, mockEventsGetAll, mockPlayersGetAll, mockUseAuth } = vi.hoisted(() => ({
  mockList: vi.fn(),
  mockGetActivity: vi.fn(),
  mockEventsGetAll: vi.fn(),
  mockPlayersGetAll: vi.fn(),
  mockUseAuth: vi.fn(),
}));

vi.mock('../../../services/api', () => ({
  rivalriesApi: { list: mockList, getActivity: mockGetActivity },
  eventsApi: { getAll: mockEventsGetAll },
  playersApi: { getAll: mockPlayersGetAll },
}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, opts?: Record<string, unknown>) => {
    if (opts && 'count' in opts) return `${opts.count} ${k}`;
    return k;
  } }),
}));

vi.mock('../RivalryHub.css', () => ({}));
vi.mock('../RivalryCard.css', () => ({}));

import RivalryHub from '../RivalryHub';

function rivalry(over: Record<string, unknown> = {}) {
  return {
    rivalryId: 'r1',
    title: 'feud',
    status: 'active',
    heat: 'warm',
    requestedBy: 'p1',
    participants: [
      { playerId: 'p1', role: 'instigator', addedAt: '' },
      { playerId: 'p2', role: 'rival', addedAt: '' },
    ],
    createdAt: '',
    updatedAt: '',
    ...over,
  };
}

describe('RivalryHub', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEventsGetAll.mockResolvedValue([]);
    mockPlayersGetAll.mockResolvedValue([]);
    mockGetActivity.mockResolvedValue({ items: [], nextCursor: null });
    mockList.mockResolvedValue({ rivalries: [rivalry()], nextCursor: null });
    mockUseAuth.mockReturnValue({ isAuthenticated: false, playerId: null });
  });

  function setup() {
    return render(
      <BrowserRouter>
        <RivalryHub />
      </BrowserRouter>,
    );
  }

  it('calls list with status=active on first render', async () => {
    setup();
    await waitFor(() => {
      expect(mockList).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'active' }),
        expect.any(AbortSignal),
      );
    });
  });

  it('hides the My Rivalries tab for unauthenticated visitors', async () => {
    setup();
    await waitFor(() => expect(mockList).toHaveBeenCalled());
    expect(screen.queryByText('rivalries.hub.tabs.mine')).toBeNull();
  });

  it('switches the API filter when the Legacy Archive tab is clicked', async () => {
    setup();
    await waitFor(() => expect(mockList).toHaveBeenCalled());

    const archiveBtn = screen.getByText('rivalries.hub.tabs.archive');
    await userEvent.click(archiveBtn);

    await waitFor(() => {
      const lastCall = mockList.mock.calls[mockList.mock.calls.length - 1][0];
      expect(lastCall.status).toBe('completed');
    });
  });

  it('applies heat chip on top of tab filter without refetching', async () => {
    mockList.mockResolvedValueOnce({
      rivalries: [
        rivalry({ rivalryId: 'r-hot', heat: 'hot' }),
        rivalry({ rivalryId: 'r-warm', heat: 'warm' }),
      ],
      nextCursor: null,
    });
    setup();
    await waitFor(() => expect(mockList).toHaveBeenCalled());
    const callsBefore = mockList.mock.calls.length;

    const heatedChip = screen.getByText('rivalries.hub.chips.heated');
    await userEvent.click(heatedChip);

    // Chip filtering is purely client-side; no additional list call.
    expect(mockList).toHaveBeenCalledTimes(callsBefore);
  });

  it('hides the Request a Rivalry CTA from non-GM viewers', async () => {
    setup();
    await waitFor(() => expect(mockList).toHaveBeenCalled());
    expect(screen.queryByText('rivalries.hub.requestCta')).toBeNull();
  });

  it('renders the CTA for GMs and points it at /rivalries/new', async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      playerId: 'gm-player',
      isAdminOrModerator: true,
    });
    setup();
    const cta = await screen.findByText('rivalries.hub.requestCta');
    expect(cta.closest('a')?.getAttribute('href')).toBe('/rivalries/new');
  });

  it('shows the My Rivalries tab for authenticated users and scopes the API call', async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, playerId: 'p1' });
    setup();
    await waitFor(() => expect(mockList).toHaveBeenCalled());

    const mineTab = screen.getByText('rivalries.hub.tabs.mine');
    await userEvent.click(mineTab);

    await waitFor(() => {
      const lastCall = mockList.mock.calls[mockList.mock.calls.length - 1][0];
      expect(lastCall.participantId).toBe('p1');
    });
  });
});
