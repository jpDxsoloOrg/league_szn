import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { mockUseAuth, mockRivalriesApi, mockPlayersApi } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  mockRivalriesApi: { list: vi.fn() },
  mockPlayersApi: { getDirectory: vi.fn() },
}));

vi.mock('react-i18next', async () => (await import('./i18nMock')).i18nMock);
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: mockUseAuth }));
vi.mock('../../../services/api', () => ({
  rivalriesApi: mockRivalriesApi,
  playersApi: mockPlayersApi,
}));

import AdminRivalries from '../AdminRivalries';

function renderPage() {
  return render(<MemoryRouter><AdminRivalries /></MemoryRouter>);
}

describe('AdminRivalries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRivalriesApi.list.mockResolvedValue({ rivalries: [] });
    mockPlayersApi.getDirectory.mockResolvedValue([]);
  });

  it('links full Admins to Heat Tunables', async () => {
    mockUseAuth.mockReturnValue({ isSuperAdmin: true });
    renderPage();

    expect(await screen.findByRole('link', { name: 'Heat Tunables' })).toHaveAttribute('href', '/admin/heat-config');
  });

  it('names a hidden player on an existing rivalry by their own name', async () => {
    mockUseAuth.mockReturnValue({ isSuperAdmin: false });
    mockPlayersApi.getDirectory.mockResolvedValue([
      { playerId: 'p1', name: 'Alex', currentWrestler: 'The Rock' },
      { playerId: 'p2', name: 'Newbie', currentWrestler: null },
    ]);
    mockRivalriesApi.list.mockResolvedValue({
      rivalries: [{
        rivalryId: 'r1',
        title: 'Old feud',
        heat: 'warm',
        heatScore: 10,
        status: 'active',
        requestedBy: 'p1',
        participants: [{ playerId: 'p1' }, { playerId: 'p2' }],
        createdAt: '2026-01-01T00:00:00Z',
      }],
    });
    renderPage();

    expect(await screen.findByText(/The Rock vs Newbie/)).toBeInTheDocument();
  });

  it('leaves the Heat Tunables link out for Moderators', async () => {
    mockUseAuth.mockReturnValue({ isSuperAdmin: false });
    renderPage();

    await waitFor(() => expect(mockRivalriesApi.list).toHaveBeenCalled());
    expect(screen.queryByRole('link', { name: 'Heat Tunables' })).not.toBeInTheDocument();
  });
});
