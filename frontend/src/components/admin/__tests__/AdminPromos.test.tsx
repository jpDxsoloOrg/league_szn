import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const { mockPromosApi, mockChallengesApi } = vi.hoisted(() => ({
  mockPromosApi: {
    getAll: vi.fn(),
    adminUpdate: vi.fn(),
    delete: vi.fn(),
    bulkDelete: vi.fn(),
  },
  mockChallengesApi: {
    getAll: vi.fn(),
    cancel: vi.fn(),
    delete: vi.fn(),
    bulkDelete: vi.fn(),
  },
}));

const { mockUseAuth } = vi.hoisted(() => ({ mockUseAuth: vi.fn() }));
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: mockUseAuth }));
vi.mock('../../../services/api/promos.api', () => ({ promosApi: mockPromosApi }));
vi.mock('../../../services/api/challenges.api', () => ({ challengesApi: mockChallengesApi }));

import AdminPromos from '../AdminPromos';

const basePromo = {
  promoId: 'promo-1',
  playerId: 'p1',
  promoType: 'open-mic' as const,
  content: 'Live promo content',
  reactions: {},
  reactionCounts: { fire: 2, mic: 1, trash: 0, 'mind-blown': 0, clap: 0 },
  isPinned: false,
  isHidden: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  playerName: 'Alex',
  wrestlerName: 'The Rock',
  responseCount: 0,
};

const archivedPromo = {
  ...basePromo,
  promoId: 'promo-2',
  promoType: 'call-out' as const,
  content: 'Old call-out content',
  isArchived: true,
};

const challenge = {
  challengeId: 'c1',
  challengerId: 'p1',
  challengedId: 'p2',
  matchType: 'Singles',
  status: 'pending' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
  challenger: { wrestlerName: 'The Rock', playerName: 'Alex' },
  challenged: { wrestlerName: 'Triple H', playerName: 'Sam' },
};

function renderPage(route = '/admin/promos') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AdminPromos />
    </MemoryRouter>,
  );
}

describe('AdminPromos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ isSuperAdmin: true });
    mockPromosApi.getAll.mockResolvedValue([basePromo, archivedPromo]);
    mockChallengesApi.getAll.mockResolvedValue([challenge]);
  });

  it('requests hidden and archived promos and marks archived rows', async () => {
    renderPage();

    expect(await screen.findByText('Old call-out content')).toBeInTheDocument();
    expect(mockPromosApi.getAll).toHaveBeenCalledWith(
      { includeHidden: true, includeArchived: true },
      expect.any(AbortSignal),
    );
    expect(screen.getByText('Archived')).toBeInTheDocument();
    expect(screen.getByText('Live promo content')).toBeInTheDocument();
  });

  it('shows a hidden badge instead of the Needs Wrestler placeholder', async () => {
    mockPromosApi.getAll.mockResolvedValue([{ ...basePromo, wrestlerName: 'Needs Wrestler' }]);
    renderPage();

    expect(await screen.findByText('Hidden')).toBeInTheDocument();
    expect(screen.queryByText('Needs Wrestler')).not.toBeInTheDocument();
  });

  it('asks for confirmation before deleting a promo', async () => {
    const user = userEvent.setup();
    mockPromosApi.delete.mockResolvedValue(undefined);
    renderPage();

    await screen.findByText('Live promo content');
    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0]!);
    expect(mockPromosApi.delete).not.toHaveBeenCalled();

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(mockPromosApi.delete).toHaveBeenCalledWith('promo-1'));
  });

  it('shows call-outs moderation as a sub-tab', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('tab', { name: 'Call-outs' }));

    expect(await screen.findByText('Triple H')).toBeInTheDocument();
    expect(mockChallengesApi.getAll).toHaveBeenCalled();
  });

  it('shows a hidden badge instead of the Needs Wrestler placeholder on call-outs', async () => {
    mockChallengesApi.getAll.mockResolvedValue([
      { ...challenge, challenger: { wrestlerName: 'Needs Wrestler', playerName: 'Sam' } },
    ]);
    renderPage('/admin/promos?view=call-outs');

    expect(await screen.findByText('Hidden')).toBeInTheDocument();
    expect(screen.queryByText('Needs Wrestler')).not.toBeInTheDocument();
  });

  it('offers call-out Delete and Clear Resolved to full Admins', async () => {
    renderPage('/admin/promos?view=call-outs');

    expect(await screen.findByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear Resolved' })).toBeInTheDocument();
  });

  it('hides call-out Delete and Clear Resolved from Moderators, which the API refuses', async () => {
    mockUseAuth.mockReturnValue({ isSuperAdmin: false });
    renderPage('/admin/promos?view=call-outs');

    await screen.findByText('Triple H');
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear Resolved' })).not.toBeInTheDocument();
  });

  it('opens straight on call-outs from the view parameter', async () => {
    renderPage('/admin/promos?view=call-outs');

    expect(await screen.findByText('Triple H')).toBeInTheDocument();
    expect(mockPromosApi.getAll).not.toHaveBeenCalled();
  });
});
