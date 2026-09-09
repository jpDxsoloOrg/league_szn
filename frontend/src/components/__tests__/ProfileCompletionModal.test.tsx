import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { Player } from '../../types';

const { mockGetMyProfile, mockUpdateMyProfile } = vi.hoisted(() => ({
  mockGetMyProfile: vi.fn(),
  mockUpdateMyProfile: vi.fn(),
}));

vi.mock('../../services/api', () => ({
  profileApi: { getMyProfile: mockGetMyProfile, updateMyProfile: mockUpdateMyProfile },
  wrestlersApi: { getAll: vi.fn().mockResolvedValue([]) },
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../ProfileCompletionModal.css', () => ({}));

import ProfileCompletionModal from '../ProfileCompletionModal';
import { PROFILE_SETUP_SNOOZE_KEY } from '../../utils/profileSetup';

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
  mockUpdateMyProfile.mockImplementation(async (updates: Partial<Player>) => ({ ...complete, ...updates }));
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
    expect(screen.getByText('profileModal.setupTitle')).toBeInTheDocument();
    expect(screen.getByLabelText('profileModal.pickWrestler')).toBeInTheDocument();
    expect(screen.getByText('profileModal.listedAsNeedsWrestler')).toBeInTheDocument();
    // Signature/finisher are done → no inputs for them, ticked status.
    expect(screen.queryByLabelText('profile.moves.gameName')).not.toBeInTheDocument();
    expect(screen.getAllByLabelText('profileModal.done')).toHaveLength(2);
    expect(screen.getAllByLabelText('profileModal.todo')).toHaveLength(1);
  });

  it('shows for a missing finisher only and sends the finisher appended to existing moves', async () => {
    mockGetMyProfile.mockResolvedValue({ ...complete, finishers: [] });
    renderAt();

    await screen.findByRole('dialog');
    // Wrestler is done: the item is listed (ticked) but has no input.
    expect(screen.getByText('profileModal.pickWrestler')).toBeInTheDocument();
    expect(screen.queryByLabelText('profileModal.pickWrestler')).not.toBeInTheDocument();
    const inputs = screen.getAllByLabelText('profile.moves.gameName');
    expect(inputs).toHaveLength(1); // finisher row only

    await userEvent.type(inputs[0], 'Cross Rhodes');
    await userEvent.type(screen.getByLabelText('profile.moves.customName'), 'The Cross');
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
    await userEvent.type(screen.getByLabelText('profileModal.pickWrestler'), 'Seth Rollins');
    const [sigGame] = screen.getAllByLabelText('profile.moves.gameName');
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
    expect(screen.getAllByLabelText('profile.moves.gameName')).toHaveLength(1);
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
    await userEvent.type(screen.getByLabelText('profile.moves.gameName'), 'Cody Cutter');
    await userEvent.click(screen.getByRole('button', { name: 'profileModal.saveAndContinue' }));

    await waitFor(() => expect(mockUpdateMyProfile).toHaveBeenCalledTimes(1));
    expect(mockUpdateMyProfile.mock.calls[0][0]).toEqual({
      psnId: 'alice_psn',
      signatures: [{ gameName: 'Cody Cutter', customName: '' }],
    });
  });
});
