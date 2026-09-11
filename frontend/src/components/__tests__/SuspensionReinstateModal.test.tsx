import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { SuspensionRow } from '../../types';

const { mockGetSuspensions, mockReinstate } = vi.hoisted(() => ({
  mockGetSuspensions: vi.fn(),
  mockReinstate: vi.fn(),
}));

vi.mock('../../services/api', () => ({
  playersApi: { getSuspensions: mockGetSuspensions, reinstate: mockReinstate },
}));

const authState = vi.hoisted(() => ({ isAuthenticated: true, isLoading: false, isAdminOrModerator: true }));
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authState,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${Object.values(opts).join(',')}` : key,
  }),
}));

vi.mock('../SuspensionReinstateModal.css', () => ({}));

import SuspensionReinstateModal from '../SuspensionReinstateModal';
import { setAnnouncementOpen } from '../../hooks/useAnnouncementOpen';
import { setProfileSetupOpen } from '../../hooks/useProfileSetupOpen';
import { SUSPENSION_REINSTATE_SNOOZE_KEY } from '../../utils/suspensionModal';

const dateRow: SuspensionRow = {
  playerId: 'p1',
  name: 'Alice',
  currentWrestler: 'Cody Rhodes',
  suspension: { suspendedAt: '2026-08-01T00:00:00.000Z', until: '2026-09-08' },
  showsServed: 0,
  showsRemaining: null,
  eligibleForReinstatement: true,
  eligibleReason: 'date',
};

const showsRow: SuspensionRow = {
  playerId: 'p2',
  name: 'Bob',
  currentWrestler: 'Seth Rollins',
  suspension: { suspendedAt: '2026-08-01T00:00:00.000Z', showsRequired: 4 },
  showsServed: 4,
  showsRemaining: 0,
  eligibleForReinstatement: true,
  eligibleReason: 'shows',
};

const pendingRow: SuspensionRow = {
  playerId: 'p3',
  name: 'Carol',
  currentWrestler: 'Rhea Ripley',
  suspension: { suspendedAt: '2026-08-01T00:00:00.000Z', showsRequired: 4 },
  showsServed: 1,
  showsRemaining: 3,
  eligibleForReinstatement: false,
  eligibleReason: null,
};

function renderAt(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SuspensionReinstateModal />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  setAnnouncementOpen(false);
  setProfileSetupOpen(false);
  authState.isAuthenticated = true;
  authState.isLoading = false;
  authState.isAdminOrModerator = true;
  mockGetSuspensions.mockResolvedValue([dateRow, showsRow, pendingRow]);
  mockReinstate.mockResolvedValue({});
});

describe('SuspensionReinstateModal', () => {
  it('renders only the rows eligible for reinstatement with their reason', async () => {
    renderAt();
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.queryByText('Carol')).not.toBeInTheDocument();
    expect(screen.getByText(/admin\.suspensions\.datePassed:Sep 8/)).toBeInTheDocument();
    expect(screen.getByText('admin.suspensions.showsServed:4,4')).toBeInTheDocument();
  });

  it('renders nothing when no suspension has been served', async () => {
    mockGetSuspensions.mockResolvedValue([pendingRow]);
    renderAt();
    await waitFor(() => expect(mockGetSuspensions).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Reinstate calls the API and removes the row; closes when the list empties', async () => {
    renderAt();
    await screen.findByRole('dialog');

    await userEvent.click(screen.getByRole('button', { name: 'suspensionsModal.reinstate — Alice' }));
    await waitFor(() => expect(mockReinstate).toHaveBeenCalledWith('p1'));
    await waitFor(() => expect(screen.queryByText('Alice')).not.toBeInTheDocument());
    expect(screen.getByText('Bob')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'suspensionsModal.reinstate — Bob' }));
    await waitFor(() => expect(mockReinstate).toHaveBeenCalledWith('p2'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('Reinstate all reinstates every listed player', async () => {
    renderAt();
    await screen.findByRole('dialog');

    await userEvent.click(screen.getByRole('button', { name: 'suspensionsModal.reinstateAll' }));
    await waitFor(() => expect(mockReinstate).toHaveBeenCalledTimes(2));
    expect(mockReinstate).toHaveBeenCalledWith('p1');
    expect(mockReinstate).toHaveBeenCalledWith('p2');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('keeps the row and shows the error when reinstating fails', async () => {
    mockReinstate.mockRejectedValueOnce(new Error('boom'));
    renderAt();
    await screen.findByRole('dialog');

    await userEvent.click(screen.getByRole('button', { name: 'suspensionsModal.reinstate — Alice' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('boom');
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('"Remind me later" hides the modal and snoozes for the session', async () => {
    const first = renderAt();
    await screen.findByRole('dialog');

    await userEvent.click(screen.getByRole('button', { name: 'suspensionsModal.remindLater' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(sessionStorage.getItem(SUSPENSION_REINSTATE_SNOOZE_KEY)).toBe('1');

    first.unmount();
    mockGetSuspensions.mockClear();
    renderAt();
    await new Promise((r) => setTimeout(r, 20));
    expect(mockGetSuspensions).not.toHaveBeenCalled();
  });

  it('renders nothing for non-staff and never calls the API', async () => {
    authState.isAdminOrModerator = false;
    renderAt();
    await new Promise((r) => setTimeout(r, 20));
    expect(mockGetSuspensions).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('is hidden on excluded routes such as /profile', async () => {
    renderAt('/profile');
    await new Promise((r) => setTimeout(r, 20));
    expect(mockGetSuspensions).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('waits behind the announcement and profile-setup modals', async () => {
    setAnnouncementOpen(true);
    setProfileSetupOpen(true);
    renderAt();
    await waitFor(() => expect(mockGetSuspensions).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await act(async () => { setAnnouncementOpen(false); await Promise.resolve(); });
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await act(async () => { setProfileSetupOpen(false); await Promise.resolve(); });
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});
