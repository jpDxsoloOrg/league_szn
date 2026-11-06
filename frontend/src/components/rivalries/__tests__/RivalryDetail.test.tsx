import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const { mockGet, mockUpdate, mockGetDirectory, mockListMessages, mockListNotes, authState, mockShowToast } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockUpdate: vi.fn(),
  mockGetDirectory: vi.fn(),
  mockListMessages: vi.fn(),
  mockListNotes: vi.fn(),
  authState: {
    isAdminOrModerator: false,
    isAuthenticated: false,
    isLoading: false,
    email: null as string | null,
    playerId: null as string | null,
  },
  mockShowToast: vi.fn(),
}));

vi.mock('../../../services/api', () => ({
  rivalriesApi: {
    get: mockGet,
    update: mockUpdate,
    messages: { list: mockListMessages, post: vi.fn() },
    notes: { list: mockListNotes, upsert: vi.fn(), delete: vi.fn() },
  },
  playersApi: {
    getAll: vi.fn().mockResolvedValue([]),
    getDirectory: mockGetDirectory,
  },
  matchesApi: { getAll: vi.fn().mockResolvedValue([]) },
  promosApi: { getAll: vi.fn().mockResolvedValue([]) },
}));

vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('../../ui/toastContext', () => ({ useToast: () => ({ showToast: mockShowToast }) }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

import RivalryDetail from '../RivalryDetail';

const hydrated = {
  rivalry: {
    rivalryId: 'r1',
    title: 'Bad Blood',
    status: 'active',
    heat: 'hot',
    heatScore: 40,
    participants: [
      { playerId: 'p1', role: 'instigator', addedAt: '' },
      { playerId: 'p2', role: 'rival', addedAt: '' },
    ],
    createdAt: '',
    updatedAt: '',
  },
  headToHead: { winsByParticipant: { p1: 2, p2: 1 }, draws: 0, totalMatches: 3 },
  notes: [],
  recentPromos: [],
  nextEvent: null,
};

function Where() {
  return <p data-testid="path">{useLocation().pathname}</p>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/rivalries/:rivalryId/*" element={<RivalryDetail />} />
      </Routes>
      <Where />
    </MemoryRouter>,
  );
}

describe('RivalryDetail private tabs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue(hydrated);
    mockGetDirectory.mockResolvedValue([]);
    mockListMessages.mockResolvedValue({ items: [], nextCursor: null });
    mockListNotes.mockResolvedValue({ notes: [] });
    Object.assign(authState, { isAdminOrModerator: false, isAuthenticated: false, isLoading: false, playerId: null });
  });

  it('hides Notes and Messages from signed-out visitors', async () => {
    renderAt('/rivalries/r1');

    expect((await screen.findAllByRole('link', { name: 'rivalries.detail.promosTab' })).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'rivalries.detail.notesTab' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'rivalries.detail.messagesTab' })).not.toBeInTheDocument();
  });

  it.each(['messages', 'notes'])('sends a signed-out visitor from /%s to the overview with no request', async (tab) => {
    renderAt(`/rivalries/r1/${tab}`);

    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent(/^\/rivalries\/r1$/));
    expect(mockShowToast).toHaveBeenCalledWith('Only the rivals and the GMs can open this tab.', 'success');
    expect(mockListMessages).not.toHaveBeenCalled();
    expect(mockListNotes).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('turns away a signed-in player who is not in the rivalry', async () => {
    Object.assign(authState, { isAuthenticated: true, playerId: 'outsider' });
    renderAt('/rivalries/r1/messages');

    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent(/^\/rivalries\/r1$/));
    expect(mockListMessages).not.toHaveBeenCalled();
  });

  it('opens the tabs for a participant', async () => {
    Object.assign(authState, { isAuthenticated: true, playerId: 'p1' });
    renderAt('/rivalries/r1/messages');

    await waitFor(() => expect(mockListMessages).toHaveBeenCalled());
    expect(screen.getByRole('link', { name: 'rivalries.detail.notesTab' })).toBeInTheDocument();
  });

  it('opens the tabs for GMs', async () => {
    Object.assign(authState, { isAuthenticated: true, isAdminOrModerator: true, playerId: 'gm' });
    renderAt('/rivalries/r1/notes');

    await waitFor(() => expect(mockListNotes).toHaveBeenCalled());
  });

  it("books under the GM's player name, never their email", async () => {
    Object.assign(authState, {
      isAuthenticated: true,
      isAdminOrModerator: true,
      playerId: 'gm',
      email: 'jane.private@example.com',
    });
    mockGetDirectory.mockResolvedValue([{ playerId: 'gm', name: 'Jane GM' }]);
    mockUpdate.mockResolvedValue({ ...hydrated.rivalry, bookerName: 'Jane GM' });
    renderAt('/rivalries/r1');

    fireEvent.click(await screen.findByRole('button', { name: "I'll book this" }));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('r1', { bookerName: 'Jane GM' }));
    expect(await screen.findByRole('button', { name: 'Clear booker' })).toBeInTheDocument();
  });

  it('offers no booking to a GM with no linked player', async () => {
    Object.assign(authState, {
      isAuthenticated: true,
      isAdminOrModerator: true,
      playerId: null,
      email: 'jane.private@example.com',
    });
    renderAt('/rivalries/r1');

    expect(await screen.findByRole('button', { name: "I'll book this" })).toBeDisabled();
  });

  it('waits for the session rather than bouncing a rival on reload', async () => {
    Object.assign(authState, { isLoading: true });
    renderAt('/rivalries/r1/notes');

    await screen.findAllByRole('link', { name: 'rivalries.detail.promosTab' });
    expect(screen.getByTestId('path')).toHaveTextContent('/rivalries/r1/notes');
    expect(mockListNotes).not.toHaveBeenCalled();
  });

  it('says a missing rivalry is missing only once', async () => {
    mockGet.mockRejectedValue(new Error('Rivalry not found'));
    renderAt('/rivalries/r1');

    expect(await screen.findByRole('heading', { name: 'Rivalry not found' })).toBeInTheDocument();
    expect(screen.getAllByText('Rivalry not found')).toHaveLength(1);
  });
});
