import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Player } from '../../../types';

const {
  mockGetMyProfile,
  mockUpdateMyProfile,
  mockGetWrestlers,
} = vi.hoisted(() => ({
  mockGetMyProfile: vi.fn(),
  mockUpdateMyProfile: vi.fn(),
  mockGetWrestlers: vi.fn(),
}));

vi.mock('../../../services/api', () => ({
  profileApi: {
    getMyProfile: mockGetMyProfile,
    updateMyProfile: mockUpdateMyProfile,
  },
  imagesApi: { getUploadUrl: vi.fn() },
  overallsApi: { getMyOverall: vi.fn().mockResolvedValue(null), submitOverall: vi.fn() },
  transfersApi: { getMyRequests: vi.fn().mockResolvedValue([]), create: vi.fn() },
  divisionsApi: { getAll: vi.fn().mockResolvedValue([]) },
  storylineRequestsApi: { getMine: vi.fn().mockResolvedValue([]), create: vi.fn() },
  playersApi: { getAll: vi.fn().mockResolvedValue([]) },
  wrestlersApi: { getAll: mockGetWrestlers },
}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true, isWrestler: true, playerId: 'p1' }),
}));

vi.mock('../../../contexts/SiteConfigContext', () => ({
  useSiteConfig: () => ({ features: {}, isLoading: false, refreshConfig: vi.fn() }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}));

vi.mock('../../statistics/EmbeddedPlayerStats', () => ({
  default: () => null,
}));

vi.mock('../WrestlerProfile.css', () => ({}));

import WrestlerProfile from '../WrestlerProfile';

const basePlayer = {
  playerId: 'p1',
  name: 'Alice',
  currentWrestler: 'Alpha',
  alternateWrestler: 'Bravo',
  // A roster assignment left over from the FK-backed system.
  currentWrestlerId: 'w1',
  alternateWrestlerId: 'w2',
  wins: 0,
  losses: 0,
  draws: 0,
} as unknown as Player;

async function openEditForm() {
  render(<WrestlerProfile />);
  await waitFor(() => expect(mockGetMyProfile).toHaveBeenCalled());
  await userEvent.click(await screen.findByRole('button', { name: /edit profile/i }));
}

describe('WrestlerProfile — free-text wrestler entry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetMyProfile.mockResolvedValue(basePlayer);
    mockUpdateMyProfile.mockResolvedValue(basePlayer);
    mockGetWrestlers.mockResolvedValue([
      { wrestlerId: 'w1', name: 'Alpha', promotion: 'WWE' },
      { wrestlerId: 'w2', name: 'Bravo', promotion: 'WWE' },
    ]);
  });

  it('renders text inputs for the wrestler names, not the roster dropdowns', async () => {
    await openEditForm();

    const current = screen.getByLabelText('Current Wrestler');
    expect(current).toBeInstanceOf(HTMLInputElement);
    expect(current).toHaveValue('Alpha');

    const alternate = screen.getByLabelText('Alternate Wrestler');
    expect(alternate).toBeInstanceOf(HTMLInputElement);
    expect(alternate).toHaveValue('Bravo');
  });

  it('saves the typed names and leaves the roster assignment untouched', async () => {
    await openEditForm();

    const current = screen.getByLabelText('Current Wrestler');
    await userEvent.clear(current);
    await userEvent.type(current, 'The Rock');
    await userEvent.click(screen.getByRole('button', { name: /save profile/i }));

    await waitFor(() => expect(mockUpdateMyProfile).toHaveBeenCalled());
    const payload = mockUpdateMyProfile.mock.calls[0][0];
    expect(payload.currentWrestler).toBe('The Rock');
    // The FK fields must not be sent: the backend lets an FK win over the
    // text, and omitting them preserves the existing assignment.
    expect(payload).not.toHaveProperty('currentWrestlerId');
    expect(payload).not.toHaveProperty('alternateWrestlerId');
  });

  it('falls back to the Needs Wrestler placeholder when the name is cleared', async () => {
    await openEditForm();

    await userEvent.clear(screen.getByLabelText('Current Wrestler'));
    await userEvent.click(screen.getByRole('button', { name: /save profile/i }));

    await waitFor(() => expect(mockUpdateMyProfile).toHaveBeenCalled());
    expect(mockUpdateMyProfile.mock.calls[0][0].currentWrestler).toBe('Needs Wrestler');
  });

  it('clears the alternate with an empty string', async () => {
    await openEditForm();

    await userEvent.clear(screen.getByLabelText('Alternate Wrestler'));
    await userEvent.click(screen.getByRole('button', { name: /save profile/i }));

    await waitFor(() => expect(mockUpdateMyProfile).toHaveBeenCalled());
    expect(mockUpdateMyProfile.mock.calls[0][0].alternateWrestler).toBe('');
  });

  it('starts the field empty when the player is on the placeholder', async () => {
    mockGetMyProfile.mockResolvedValue({
      ...basePlayer,
      currentWrestler: 'Needs Wrestler',
      currentWrestlerId: undefined,
    } as unknown as Player);

    await openEditForm();

    expect(screen.getByLabelText('Current Wrestler')).toHaveValue('');
  });
});
