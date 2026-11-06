import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { mockChallengesApi } = vi.hoisted(() => ({
  mockChallengesApi: { getAll: vi.fn(), cancel: vi.fn(), delete: vi.fn(), bulkDelete: vi.fn() },
}));

const { mockUseAuth } = vi.hoisted(() => ({ mockUseAuth: vi.fn() }));
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: mockUseAuth }));
vi.mock('react-i18next', async () => (await import('./i18nMock')).i18nMock);
vi.mock('../../../services/api/challenges.api', () => ({ challengesApi: mockChallengesApi }));
vi.mock('../../ui/toastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));

import AdminChallenges from '../AdminChallenges';

const openCallOut = {
  challengeId: 'c1',
  challengerId: 'p1',
  challengedId: 'p2',
  matchType: 'singles',
  status: 'pending',
  expiresAt: '2030-01-01',
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
  challenger: { playerName: 'Adam', wrestlerName: 'Edge' },
  challenged: { playerName: 'Bea', wrestlerName: 'Lita' },
};

function renderPage() {
  return render(<MemoryRouter><AdminChallenges /></MemoryRouter>);
}

describe('AdminChallenges', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChallengesApi.getAll.mockResolvedValue([openCallOut]);
  });

  it('offers Expire on an open call-out to Admins', async () => {
    mockUseAuth.mockReturnValue({ isSuperAdmin: true });
    renderPage();

    expect(await screen.findByRole('button', { name: 'Expire' })).toBeInTheDocument();
  });

  it('hides Expire from Moderators, which the API refuses', async () => {
    mockUseAuth.mockReturnValue({ isSuperAdmin: false });
    renderPage();

    await screen.findByRole('link', { name: 'View Details' });
    expect(screen.queryByRole('button', { name: 'Expire' })).not.toBeInTheDocument();
  });
});
