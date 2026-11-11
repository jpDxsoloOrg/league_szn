import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Player } from '../../types';

/**
 * The whole path for a new member, through the real AuthProvider: sign in with
 * no wrestler, get prompted, type a name, and have the app see it. Only the
 * network and Cognito are faked. The fake API keeps the saved fields, so the
 * next profile read returns them the way the server would.
 */
const { mockCognito, serverPlayer, mockGetMyProfile, mockUpdateMyProfile } = vi.hoisted(() => {
  const player = { current: {} as Record<string, unknown> };
  return {
    serverPlayer: player,
    mockCognito: {
      getCurrentUser: vi.fn(),
      refreshSession: vi.fn(),
      getUserGroups: vi.fn(),
      isAuthenticatedSync: vi.fn(),
      signIn: vi.fn(),
      signUp: vi.fn(),
      confirmSignUp: vi.fn(),
      signOut: vi.fn(),
    },
    mockGetMyProfile: vi.fn(async () => ({ ...player.current })),
    mockUpdateMyProfile: vi.fn(async (updates: Record<string, unknown>) => {
      player.current = { ...player.current, ...updates };
      return { ...player.current };
    }),
  };
});

vi.mock('../../services/cognito', () => ({
  cognitoAuth: mockCognito,
  UnconfirmedUserError: class UnconfirmedUserError extends Error {},
}));

vi.mock('../../services/api', () => ({
  profileApi: { getMyProfile: mockGetMyProfile, updateMyProfile: mockUpdateMyProfile },
  wrestlersApi: { getAll: vi.fn().mockResolvedValue([]) },
  playersApi: { getAll: vi.fn().mockResolvedValue([]) },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { AuthProvider, useAuth } from '../../contexts/AuthContext';
import { isNeedsWrestler } from '../../utils/needsWrestler';
import Login from '../auth/Login';
import ProfileCompletionModal from '../ProfileCompletionModal';

function AuthProbe() {
  const { isAuthenticated, currentWrestler } = useAuth();
  return (
    <output data-testid="auth">
      {isAuthenticated ? 'signed-in' : 'signed-out'}|{currentWrestler ?? 'none'}
    </output>
  );
}

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider>
        <ProfileCompletionModal />
        <AuthProbe />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<main>home</main>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

async function signIn() {
  await userEvent.type(screen.getByLabelText('auth.email'), 'new@league.test');
  await userEvent.type(screen.getByLabelText('auth.password'), 'password123');
  await userEvent.click(screen.getByRole('button', { name: 'auth.signInTitle' }));
}

describe('new member with no wrestler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    serverPlayer.current = {
      playerId: 'p1',
      name: 'Alice',
      psnId: 'alice_psn',
      currentWrestler: 'Needs Wrestler',
      signatures: [{ gameName: 'Cutter', customName: '' }],
      finishers: [{ gameName: 'Cross Rhodes', customName: '' }],
      wins: 0,
      losses: 0,
      draws: 0,
    } as Partial<Player>;
    mockCognito.getCurrentUser.mockResolvedValue(null);
    mockCognito.isAuthenticatedSync.mockReturnValue(false);
    mockCognito.getUserGroups.mockReturnValue([]);
    mockCognito.signIn.mockResolvedValue({ groups: ['Wrestler'] });
  });

  it('can sign in, is told they are hidden, and is visible once a typed name is saved', async () => {
    renderApp();
    await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('signed-out|none'));

    // Login is not gated on having a wrestler.
    await signIn();
    await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('signed-in|Needs Wrestler'));
    expect(await screen.findByText('home')).toBeInTheDocument();

    // The prompt opens without the player doing anything, and says why.
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('me.setup.hiddenNotice')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('me.setup.wrestlerLabel'), 'El Generico Jr');
    await userEvent.click(screen.getByRole('button', { name: 'profileModal.saveAndContinue' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockUpdateMyProfile).toHaveBeenCalledWith({ currentWrestler: 'El Generico Jr' });

    // AuthContext now holds the saved name rather than the sign-in value.
    await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('signed-in|El Generico Jr'));
    expect(isNeedsWrestler(String(serverPlayer.current['currentWrestler']))).toBe(false);
  });

  it('does not prompt a member who already has a wrestler', async () => {
    serverPlayer.current = { ...serverPlayer.current, currentWrestler: 'Cody Rhodes' };
    renderApp();
    await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('signed-out|none'));

    await signIn();
    await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('signed-in|Cody Rhodes'));
    expect(await screen.findByText('home')).toBeInTheDocument();
    // Sign-in loads the row; the setup check reuses it rather than asking again.
    await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('signed-in'));
    expect(mockGetMyProfile).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('still signs in when the prompt is put off, and the next tab prompts again', async () => {
    const first = renderApp();
    await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('signed-out|none'));
    await signIn();
    await screen.findByRole('dialog');

    await userEvent.click(screen.getByRole('button', { name: 'profileModal.remindLater' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('auth')).toHaveTextContent('signed-in|Needs Wrestler');
    expect(mockUpdateMyProfile).not.toHaveBeenCalled();

    first.unmount();
    sessionStorage.clear(); // a new tab has its own session storage
    renderApp();
    await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('signed-out|none'));
    await signIn();
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});
