import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { Player } from '../../types';

const { mockGetMyProfile, mockUpdateMyProfile, mockRefreshProfile, mockShowToast } = vi.hoisted(() => ({
  mockGetMyProfile: vi.fn(),
  mockUpdateMyProfile: vi.fn(),
  mockRefreshProfile: vi.fn(),
  mockShowToast: vi.fn(),
}));

vi.mock('../../services/api', () => ({
  profileApi: { getMyProfile: mockGetMyProfile, updateMyProfile: mockUpdateMyProfile },
  wrestlersApi: { getAll: vi.fn().mockResolvedValue([]) },
}));

const authState = vi.hoisted(() => ({
  isAuthenticated: true,
  isLoading: false,
  isAdminOrModerator: false,
  isWrestler: true,
  profile: null as Player | null,
}));
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ ...authState, refreshProfile: mockRefreshProfile }),
}));

vi.mock('../ui/toastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import ProfileCompletionModal from '../ProfileCompletionModal';
import { ANNOUNCEMENT_OPEN_ATTR, WRESTLER_PROMPT_PENDING_ATTR, setAnnouncementOpen } from '../../hooks/useAnnouncementOpen';
import { ApiError } from '../../services/api/apiClient';
import { NO_PLAYER_ROW_KEY, PROFILE_SETUP_SNOOZE_KEY } from '../../utils/profileSetup';

const complete = {
  playerId: 'p1',
  name: 'Alice',
  psnId: 'alice_psn',
  currentWrestler: 'Cody Rhodes',
  signatures: [{ gameName: 'Cody Cutter', customName: '' }],
  finishers: [{ gameName: 'Cross Rhodes', customName: '' }],
  wins: 0,
  losses: 0,
  draws: 0,
} as unknown as Player;

function renderAt(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ProfileCompletionModal />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  setAnnouncementOpen(false);
  authState.isAuthenticated = true;
  authState.isAdminOrModerator = false;
  authState.isWrestler = true;
  authState.profile = null;
  mockUpdateMyProfile.mockImplementation(async (updates: Partial<Player>) => ({ ...complete, ...updates }));
});

describe('ProfileCompletionModal — order and requests', () => {
  const hiddenPlayer = { ...complete, currentWrestler: 'Needs Wrestler' } as Player;

  it('shows the wrestler prompt to a hidden player even with an announcement up', async () => {
    setAnnouncementOpen(true);
    mockGetMyProfile.mockResolvedValue(hiddenPlayer);
    renderAt();
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('me.setup.hiddenNotice')).toBeInTheDocument();
  });

  it('holds announcements while checking and until the prompt is put off', async () => {
    let finishCheck: (player: Player) => void = () => undefined;
    mockGetMyProfile.mockReturnValue(new Promise<Player>((resolve) => { finishCheck = resolve; }));
    renderAt();
    await waitFor(() => expect(document.body).toHaveAttribute(WRESTLER_PROMPT_PENDING_ATTR));

    finishCheck(hiddenPlayer);
    await screen.findByRole('dialog');
    expect(document.body).toHaveAttribute(WRESTLER_PROMPT_PENDING_ATTR);

    await userEvent.click(screen.getByRole('button', { name: 'profileModal.remindLater' }));
    await waitFor(() => expect(document.body).not.toHaveAttribute(WRESTLER_PROMPT_PENDING_ATTR));
  });

  it('lets announcements go first when the wrestler is already set', async () => {
    mockGetMyProfile.mockResolvedValue({ ...complete, signatures: [] });
    renderAt();
    await waitFor(() => expect(mockGetMyProfile).toHaveBeenCalled());
    await waitFor(() => expect(document.body).not.toHaveAttribute(WRESTLER_PROMPT_PENDING_ATTR));
    expect(document.body).not.toHaveAttribute(ANNOUNCEMENT_OPEN_ATTR);
  });

  it('uses the profile the session already loaded instead of fetching it again', async () => {
    authState.profile = hiddenPlayer;
    renderAt();
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(mockGetMyProfile).not.toHaveBeenCalled();
  });

  it('asks once per session for a staff account with no player row', async () => {
    authState.isWrestler = false;
    mockGetMyProfile.mockRejectedValue(new ApiError('Player not found', 404));
    const first = renderAt();
    await waitFor(() => expect(sessionStorage.getItem(NO_PLAYER_ROW_KEY)).toBe('1'));
    first.unmount();

    renderAt();
    await waitFor(() => expect(document.body).not.toHaveAttribute(WRESTLER_PROMPT_PENDING_ATTR));
    expect(mockGetMyProfile).toHaveBeenCalledTimes(1);
  });

  it('keeps checking a wrestler whose row may still be on its way', async () => {
    mockGetMyProfile.mockRejectedValue(new ApiError('Player not found', 404));
    renderAt();
    await waitFor(() => expect(mockGetMyProfile).toHaveBeenCalled());
    await waitFor(() => expect(document.body).not.toHaveAttribute(WRESTLER_PROMPT_PENDING_ATTR));
    expect(sessionStorage.getItem(NO_PLAYER_ROW_KEY)).toBeNull();
  });
});

describe('ProfileCompletionModal — setup gate', () => {
  it('stays hidden when the profile is complete', async () => {
    mockGetMyProfile.mockResolvedValue(complete);
    renderAt();
    await waitFor(() => expect(mockGetMyProfile).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows for a Needs Wrestler player with the wrestler item expanded and the others ticked', async () => {
    mockGetMyProfile.mockResolvedValue({ ...complete, currentWrestler: 'Needs Wrestler' });
    renderAt();

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('me.setup.title')).toBeInTheDocument();
    expect(screen.getByText('me.setup.hiddenNotice')).toBeInTheDocument();
    expect(screen.getByLabelText('me.setup.wrestlerLabel')).toBeInTheDocument();
    expect(screen.getByText('me.setup.wrestlerHint')).toBeInTheDocument();
    // Signature/finisher are done → no inputs for them, ticked status.
    expect(screen.queryByLabelText(/profile\.moves\.gameName/)).not.toBeInTheDocument();
    expect(screen.getAllByLabelText('profileModal.done')).toHaveLength(2);
    expect(screen.getAllByLabelText('profileModal.todo')).toHaveLength(1);
  });

  it('shows for a missing finisher only and sends the finisher appended to existing moves', async () => {
    mockGetMyProfile.mockResolvedValue({ ...complete, finishers: [] });
    renderAt();

    await screen.findByRole('dialog');
    // Wrestler is done: the item is listed (ticked) but has no input.
    expect(screen.getByText('me.setup.wrestlerLabel')).toBeInTheDocument();
    expect(screen.queryByLabelText('me.setup.wrestlerLabel')).not.toBeInTheDocument();
    const inputs = screen.getAllByLabelText(/profile\.moves\.gameName/);
    expect(inputs).toHaveLength(1); // finisher row only
    expect(inputs[0]).toHaveAccessibleName('profileModal.addFinisher — profile.moves.gameName');

    await userEvent.type(inputs[0], 'Cross Rhodes');
    await userEvent.type(screen.getByLabelText(/profile\.moves\.customName/), 'The Cross');
    await userEvent.click(screen.getByRole('button', { name: 'profileModal.saveAndContinue' }));

    await waitFor(() => expect(mockUpdateMyProfile).toHaveBeenCalledTimes(1));
    expect(mockUpdateMyProfile.mock.calls[0][0]).toEqual({
      finishers: [{ gameName: 'Cross Rhodes', customName: 'The Cross' }],
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('sends only the changed fields and keeps the modal open for what is still missing', async () => {
    mockGetMyProfile.mockResolvedValue({
      ...complete,
      currentWrestler: 'Needs Wrestler',
      signatures: [],
      finishers: [],
    });
    // Server accepts the wrestler + signature but the finisher is left blank.
    mockUpdateMyProfile.mockImplementation(async (updates: Partial<Player>) => ({
      ...complete,
      currentWrestler: 'Needs Wrestler',
      signatures: [],
      finishers: [],
      ...updates,
    }));
    renderAt();

    await screen.findByRole('dialog');
    await userEvent.type(screen.getByLabelText('me.setup.wrestlerLabel'), 'Seth Rollins');
    const [sigGame] = screen.getAllByLabelText(/profile\.moves\.gameName/);
    await userEvent.type(sigGame, 'Sling Blade');
    await userEvent.click(screen.getByRole('button', { name: 'profileModal.saveAndContinue' }));

    await waitFor(() => expect(mockUpdateMyProfile).toHaveBeenCalledTimes(1));
    expect(mockUpdateMyProfile.mock.calls[0][0]).toEqual({
      currentWrestler: 'Seth Rollins',
      signatures: [{ gameName: 'Sling Blade', customName: '' }],
    });
    // Still open: finisher missing. Wrestler + signature now ticked.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByLabelText('profileModal.done')).toHaveLength(2));
    expect(screen.getAllByLabelText(/profile\.moves\.gameName/)).toHaveLength(1);
  });

  it('refuses to save with nothing filled in', async () => {
    mockGetMyProfile.mockResolvedValue({ ...complete, signatures: [] });
    renderAt();
    await screen.findByRole('dialog');

    await userEvent.click(screen.getByRole('button', { name: 'profileModal.saveAndContinue' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('profileModal.fillRequired');
    expect(mockUpdateMyProfile).not.toHaveBeenCalled();
  });

  it('is hidden on /profile so it never covers the full form', async () => {
    mockGetMyProfile.mockResolvedValue({ ...complete, currentWrestler: 'Needs Wrestler' });
    renderAt('/profile');
    await new Promise((r) => setTimeout(r, 20));
    expect(mockGetMyProfile).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('"Remind me later" snoozes for the session', async () => {
    mockGetMyProfile.mockResolvedValue({ ...complete, finishers: [] });
    const first = renderAt();
    await screen.findByRole('dialog');

    await userEvent.click(screen.getByRole('button', { name: 'profileModal.remindLater' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(sessionStorage.getItem(PROFILE_SETUP_SNOOZE_KEY)).toBe('1');

    first.unmount();
    mockGetMyProfile.mockClear();
    renderAt();
    await new Promise((r) => setTimeout(r, 20));
    expect(mockGetMyProfile).not.toHaveBeenCalled();
  });

  it('still handles the legacy name / PSN gaps alongside the setup items', async () => {
    mockGetMyProfile.mockResolvedValue({ ...complete, psnId: '', signatures: [] });
    renderAt();
    await screen.findByRole('dialog');

    await userEvent.type(screen.getByLabelText('profileModal.psnId'), 'alice_psn');
    await userEvent.type(screen.getByLabelText(/profile\.moves\.gameName/), 'Cody Cutter');
    await userEvent.click(screen.getByRole('button', { name: 'profileModal.saveAndContinue' }));

    await waitFor(() => expect(mockUpdateMyProfile).toHaveBeenCalledTimes(1));
    expect(mockUpdateMyProfile.mock.calls[0][0]).toEqual({
      psnId: 'alice_psn',
      signatures: [{ gameName: 'Cody Cutter', customName: '' }],
    });
  });

  it('hides again after the profile is completed elsewhere (e.g. on /profile)', async () => {
    mockGetMyProfile.mockResolvedValue({ ...complete, finishers: [] });
    const { unmount } = render(
      <MemoryRouter initialEntries={['/']}>
        <ProfileCompletionModal />
      </MemoryRouter>,
    );
    await screen.findByRole('dialog');
    unmount();

    // Back on a normal route, the re-probe finds a complete profile.
    mockGetMyProfile.mockResolvedValue(complete);
    renderAt('/standings');
    await waitFor(() => expect(mockGetMyProfile).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('nags staff on Needs Wrestler exactly like everyone else', async () => {
    authState.isAdminOrModerator = true;
    mockGetMyProfile.mockResolvedValue({ ...complete, currentWrestler: 'Needs Wrestler', signatures: [], finishers: [] });
    renderAt();
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getAllByLabelText('profileModal.todo')).toHaveLength(3);
  });

  it('focuses the first input on open and Escape snoozes', async () => {
    mockGetMyProfile.mockResolvedValue({ ...complete, finishers: [] });
    renderAt();
    await screen.findByRole('dialog');

    await waitFor(() =>
      expect(screen.getByLabelText(/profileModal\.addFinisher — profile\.moves\.gameName/)).toHaveFocus(),
    );
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(sessionStorage.getItem(PROFILE_SETUP_SNOOZE_KEY)).toBe('1');
  });

  it('Enter submits the form', async () => {
    mockGetMyProfile.mockResolvedValue({ ...complete, finishers: [] });
    renderAt();
    await screen.findByRole('dialog');

    await userEvent.type(screen.getByLabelText(/profile\.moves\.gameName/), 'Cross Rhodes{Enter}');
    await waitFor(() => expect(mockUpdateMyProfile).toHaveBeenCalledTimes(1));
  });

  it('keeps the dialog open and shows the error when saving fails', async () => {
    mockGetMyProfile.mockResolvedValue({ ...complete, finishers: [] });
    mockUpdateMyProfile.mockRejectedValueOnce(new Error('boom'));
    renderAt();
    await screen.findByRole('dialog');

    await userEvent.type(screen.getByLabelText(/profile\.moves\.gameName/), 'Cross Rhodes');
    await userEvent.click(screen.getByRole('button', { name: 'profileModal.saveAndContinue' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('boom');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('"Open full profile" hides the modal for the session', async () => {
    mockGetMyProfile.mockResolvedValue({ ...complete, finishers: [] });
    renderAt();
    await screen.findByRole('dialog');

    await userEvent.click(screen.getByRole('link', { name: 'profileModal.openFullProfile' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('drops blank legacy rows when appending a move', async () => {
    mockGetMyProfile.mockResolvedValue({
      ...complete,
      finishers: [{ gameName: '  ', customName: 'ghost' }],
    });
    renderAt();
    await screen.findByRole('dialog');

    await userEvent.type(screen.getByLabelText(/profile\.moves\.gameName/), 'Cross Rhodes');
    await userEvent.click(screen.getByRole('button', { name: 'profileModal.saveAndContinue' }));

    await waitFor(() => expect(mockUpdateMyProfile).toHaveBeenCalledTimes(1));
    expect(mockUpdateMyProfile.mock.calls[0][0]).toEqual({
      finishers: [{ gameName: 'Cross Rhodes', customName: '' }],
    });
  });

  it('resets when the user signs out so the next account is checked afresh', async () => {
    mockGetMyProfile.mockResolvedValue({ ...complete, finishers: [] });
    const { rerender } = renderAt();
    await screen.findByRole('dialog');
    await userEvent.click(screen.getByRole('button', { name: 'profileModal.remindLater' }));
    sessionStorage.removeItem(PROFILE_SETUP_SNOOZE_KEY); // AuthContext does this on sign-out

    authState.isAuthenticated = false;
    rerender(
      <MemoryRouter initialEntries={['/']}>
        <ProfileCompletionModal />
      </MemoryRouter>,
    );
    authState.isAuthenticated = true;
    mockGetMyProfile.mockClear();
    rerender(
      <MemoryRouter initialEntries={['/']}>
        <ProfileCompletionModal />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('waits behind an open announcement modal and appears once it closes', async () => {
    setAnnouncementOpen(true);
    mockGetMyProfile.mockResolvedValue({ ...complete, finishers: [] });
    renderAt();
    await waitFor(() => expect(mockGetMyProfile).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    setAnnouncementOpen(false);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  describe('a player with no wrestler', () => {
    const hidden = { ...complete, currentWrestler: 'Needs Wrestler' };

    it('saves any typed name, refreshes auth, and confirms they are visible', async () => {
      mockGetMyProfile.mockResolvedValue(hidden);
      renderAt();
      await screen.findByRole('dialog');

      await userEvent.type(screen.getByLabelText('me.setup.wrestlerLabel'), '  The Masked Wonder 3000  ');
      await userEvent.click(screen.getByRole('button', { name: 'profileModal.saveAndContinue' }));

      await waitFor(() => expect(mockUpdateMyProfile).toHaveBeenCalledTimes(1));
      expect(mockUpdateMyProfile.mock.calls[0][0]).toEqual({ currentWrestler: 'The Masked Wonder 3000' });
      await waitFor(() => expect(mockRefreshProfile).toHaveBeenCalledTimes(1));
      expect(mockRefreshProfile.mock.invocationCallOrder[0]).toBeGreaterThan(
        mockUpdateMyProfile.mock.invocationCallOrder[0],
      );
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(mockShowToast).toHaveBeenCalledWith('me.setup.nowVisible', 'success');
    });

    it('asks for the wrestler name when saved blank, rather than any field', async () => {
      mockGetMyProfile.mockResolvedValue(hidden);
      renderAt();
      await screen.findByRole('dialog');

      await userEvent.type(screen.getByLabelText('me.setup.wrestlerLabel'), '   ');
      await userEvent.click(screen.getByRole('button', { name: 'profileModal.saveAndContinue' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('me.setup.wrestlerRequired');
      expect(mockUpdateMyProfile).not.toHaveBeenCalled();
    });

    it('moves the confirmation to a toast when an announcement takes over the dialog', async () => {
      mockGetMyProfile.mockResolvedValue({ ...hidden, finishers: [] });
      mockUpdateMyProfile.mockImplementation(async (updates: Partial<Player>) => ({
        ...complete,
        finishers: [],
        ...updates,
      }));
      renderAt();
      await screen.findByRole('dialog');

      await userEvent.type(screen.getByLabelText('me.setup.wrestlerLabel'), 'Seth Rollins');
      await userEvent.click(screen.getByRole('button', { name: 'profileModal.saveAndContinue' }));
      await screen.findByText('me.setup.nowVisible');
      expect(mockShowToast).not.toHaveBeenCalled();

      act(() => setAnnouncementOpen(true));

      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('me.setup.nowVisible', 'success'));
      expect(mockShowToast).toHaveBeenCalledTimes(1);

      act(() => setAnnouncementOpen(false));
      await screen.findByRole('dialog');
      expect(screen.queryByText('me.setup.nowVisible')).not.toBeInTheDocument();
    });

    it('confirms once when one save finishes setup and an announcement follows', async () => {
      mockGetMyProfile.mockResolvedValue(hidden);
      mockUpdateMyProfile.mockImplementation(async (updates: Partial<Player>) => ({ ...complete, ...updates }));
      renderAt();
      await screen.findByRole('dialog');

      await userEvent.type(screen.getByLabelText('me.setup.wrestlerLabel'), 'Seth Rollins');
      await userEvent.click(screen.getByRole('button', { name: 'profileModal.saveAndContinue' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(mockShowToast).toHaveBeenCalledTimes(1);

      act(() => setAnnouncementOpen(true));

      await act(async () => {});
      expect(mockShowToast).toHaveBeenCalledTimes(1);
    });

    it('does not repeat a confirmation already shown in the dialog', async () => {
      mockGetMyProfile.mockResolvedValue({ ...hidden, finishers: [] });
      mockUpdateMyProfile.mockImplementation(async (updates: Partial<Player>) => ({
        ...complete,
        finishers: [],
        ...updates,
      }));
      renderAt();
      await screen.findByRole('dialog');

      await userEvent.type(screen.getByLabelText('me.setup.wrestlerLabel'), 'Seth Rollins');
      await userEvent.click(screen.getByRole('button', { name: 'profileModal.saveAndContinue' }));
      await screen.findByText('me.setup.nowVisible');

      await userEvent.type(screen.getByLabelText(/profileModal\.addFinisher — profile\.moves\.gameName/), 'Curb Stomp');
      await userEvent.click(screen.getByRole('button', { name: 'profileModal.saveAndContinue' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

      act(() => setAnnouncementOpen(true));

      await act(async () => {});
      expect(mockShowToast).not.toHaveBeenCalled();
    });

    it('offers the wrestler field before anything else', async () => {
      mockGetMyProfile.mockResolvedValue({ ...hidden, psnId: '', signatures: [], finishers: [] });
      renderAt();
      await screen.findByRole('dialog');

      await waitFor(() => expect(screen.getByLabelText('me.setup.wrestlerLabel')).toHaveFocus());
    });

    it('confirms visibility while other items are still open', async () => {
      mockGetMyProfile.mockResolvedValue({ ...hidden, finishers: [] });
      mockUpdateMyProfile.mockImplementation(async (updates: Partial<Player>) => ({
        ...complete,
        finishers: [],
        ...updates,
      }));
      renderAt();
      await screen.findByRole('dialog');

      await userEvent.type(screen.getByLabelText('me.setup.wrestlerLabel'), 'Seth Rollins');
      await userEvent.click(screen.getByRole('button', { name: 'profileModal.saveAndContinue' }));

      expect(await screen.findByText('me.setup.nowVisible')).toBeInTheDocument();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(mockRefreshProfile).toHaveBeenCalledTimes(1);
      // The prompt moves on from the hidden message to the remaining setup.
      expect(screen.getByText('profileModal.setupTitle')).toBeInTheDocument();
      expect(screen.queryByText('me.setup.hiddenNotice')).not.toBeInTheDocument();
    });

    it('rejects the placeholder text instead of leaving them hidden with no message', async () => {
      mockGetMyProfile.mockResolvedValue(hidden);
      renderAt();
      await screen.findByRole('dialog');

      await userEvent.type(screen.getByLabelText('me.setup.wrestlerLabel'), 'needs wrestler');
      await userEvent.click(screen.getByRole('button', { name: 'profileModal.saveAndContinue' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('me.setup.placeholderRejected');
      expect(mockUpdateMyProfile).not.toHaveBeenCalled();
    });

    it('does not refresh auth when the save fails', async () => {
      mockGetMyProfile.mockResolvedValue(hidden);
      mockUpdateMyProfile.mockRejectedValueOnce(new Error('boom'));
      renderAt();
      await screen.findByRole('dialog');

      await userEvent.type(screen.getByLabelText('me.setup.wrestlerLabel'), 'Seth Rollins');
      await userEvent.click(screen.getByRole('button', { name: 'profileModal.saveAndContinue' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('boom');
      expect(mockRefreshProfile).not.toHaveBeenCalled();
    });

    it('caps the name at the length the API accepts', async () => {
      mockGetMyProfile.mockResolvedValue(hidden);
      renderAt();
      await screen.findByRole('dialog');

      expect(screen.getByLabelText('me.setup.wrestlerLabel')).toHaveAttribute('maxlength', '100');
    });
  });
});
