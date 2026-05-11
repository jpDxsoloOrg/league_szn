import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const {
  mockListMessages,
  mockPostMessage,
  mockListMyThreads,
  mockListThread,
  mockPostDm,
  mockUseOutletContext,
  mockUseAuth,
} = vi.hoisted(() => ({
  mockListMessages: vi.fn(),
  mockPostMessage: vi.fn(),
  mockListMyThreads: vi.fn(),
  mockListThread: vi.fn(),
  mockPostDm: vi.fn(),
  mockUseOutletContext: vi.fn(),
  mockUseAuth: vi.fn(),
}));

vi.mock('../../../../services/api', () => ({
  factionsApi: {
    messages: {
      list: mockListMessages,
      post: mockPostMessage,
    },
    directMessages: {
      listMyThreads: mockListMyThreads,
      listThread: mockListThread,
      post: mockPostDm,
    },
  },
}));

vi.mock('react-router-dom', async () => {
  const actual: typeof import('react-router-dom') = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useOutletContext: () => mockUseOutletContext(),
  };
});

vi.mock('../../../../contexts/AuthContext', () => ({
  useAuth: mockUseAuth,
}));

const interpolatingT = (_key: string, fallback?: string, options?: Record<string, unknown>) => {
  let text = fallback ?? _key;
  if (options) {
    for (const [name, value] of Object.entries(options)) {
      text = text.replace(new RegExp(`{{\\s*${name}\\s*}}`, 'g'), String(value));
    }
  }
  return text;
};
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: interpolatingT }),
}));

vi.mock('../FactionMessages.css', () => ({}));

import FactionMessages from '../FactionMessages';

const baseFaction = () => ({
  stableId: 'f1',
  name: 'The Brood',
  leaderId: 'me',
  leaderName: 'Edge',
  memberIds: ['me', 'partner-1', 'partner-2'],
  status: 'active',
  wins: 0,
  losses: 0,
  draws: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  members: [
    { playerId: 'me', playerName: 'Me Player', wrestlerName: 'Edge', wins: 0, losses: 0, draws: 0 },
    { playerId: 'partner-1', playerName: 'Partner 1', wrestlerName: 'Christian', wins: 0, losses: 0, draws: 0 },
    { playerId: 'partner-2', playerName: 'Partner 2', wrestlerName: 'Gangrel', wins: 0, losses: 0, draws: 0 },
  ],
  standings: { winPercentage: 0, recentForm: [], currentStreak: { type: 'W', count: 0 } },
  headToHead: [],
  matchTypeRecords: [],
  recentMatches: [],
});

const channelMsg = (overrides: Record<string, unknown> = {}) => ({
  messageId: 'm-1',
  factionId: 'f1',
  authorPlayerId: 'partner-1',
  body: 'Existing channel message',
  messageType: 'user' as const,
  createdAt: '2026-05-01T10:00:00.000Z',
  ...overrides,
});

function renderTab(initialEntries: string[] = ['/factions/f1/messages']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <FactionMessages />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({ playerId: 'me', isWrestler: true });
  mockUseOutletContext.mockReturnValue({ faction: baseFaction() });
  mockListMessages.mockResolvedValue({ items: [channelMsg()] });
  mockListMyThreads.mockResolvedValue([
    {
      partnerPlayerId: 'partner-1',
      partnerPlayerName: 'Partner 1',
      partnerWrestlerName: 'Christian',
      partnerImageUrl: 'https://example.com/christian.jpg',
      lastMessage: {
        messageId: 'dm-1',
        factionId: 'f1',
        threadKey: 'me#partner-1',
        senderPlayerId: 'partner-1',
        recipientPlayerId: 'me',
        body: 'Last DM from Christian',
        createdAt: '2026-04-30T10:00:00.000Z',
      },
      lastMessageAt: '2026-04-30T10:00:00.000Z',
    },
  ]);
  mockListThread.mockResolvedValue({ items: [] });
  Element.prototype.scrollIntoView = vi.fn();
  // Default to "visible" for polling tests; can be overridden per-test.
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => 'visible',
  });
});

afterEach(() => {
  // Some tests opt into fake timers; reset before the next one.
  vi.useRealTimers();
});

describe('FactionMessages tab (FAC-15)', () => {
  it('appends a pending bubble on send and replaces it with the server response on success', async () => {
    const user = userEvent.setup();
    mockPostMessage.mockResolvedValueOnce(
      channelMsg({ messageId: 'real-1', authorPlayerId: 'me', body: 'Hello faction' }),
    );

    renderTab();

    // Wait for initial channel + thread load
    await waitFor(() => {
      expect(screen.getAllByText('Existing channel message').length).toBeGreaterThan(0);
    });

    const textarea = screen.getByPlaceholderText('Message the faction…');
    await user.type(textarea, 'Hello faction');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    // Pending bubble appears immediately
    await screen.findByText('Hello faction');

    await waitFor(() => {
      expect(mockPostMessage).toHaveBeenCalledWith('f1', 'Hello faction');
    });

    // Pending styling resolves once the server response is merged in.
    await waitFor(() => {
      const bubbles = document.querySelectorAll('.faction-messages__bubble--pending');
      expect(bubbles.length).toBe(0);
    });
  });

  it('shows an error state with Retry when the send fails', async () => {
    const user = userEvent.setup();
    mockPostMessage.mockRejectedValueOnce(new Error('Boom'));

    renderTab();
    await waitFor(() => {
      expect(screen.getAllByText('Existing channel message').length).toBeGreaterThan(0);
    });

    await user.type(screen.getByPlaceholderText('Message the faction…'), 'Doomed message');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    await screen.findByText('Doomed message');

    const retryBtn = await screen.findByRole('button', { name: 'Retry' });
    expect(retryBtn).toBeInTheDocument();

    // Subsequent post succeeds → Retry resolves the bubble.
    mockPostMessage.mockResolvedValueOnce(
      channelMsg({ messageId: 'real-2', authorPlayerId: 'me', body: 'Doomed message' }),
    );
    await user.click(retryBtn);

    await waitFor(() => {
      expect(mockPostMessage).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    });
  });

  it('renders the DM threads list and switches the active pane when a row is clicked', async () => {
    const user = userEvent.setup();
    renderTab();

    expect(await screen.findByText('Last DM from Christian')).toBeInTheDocument();

    // Clicking the DM row swaps the active pane header. Use the DM thread
    // button specifically — "Christian" also appears in the +New DM dropdown
    // and on bubbles, so getByRole alone could be ambiguous.
    const threadButton = screen
      .getAllByRole('button', { name: /Christian/ })
      .find((b) => b.className.includes('faction-messages__thread-row'))!;
    await user.click(threadButton);

    await waitFor(() => {
      expect(screen.getByText('DIRECT · Christian')).toBeInTheDocument();
    });
    expect(screen.getByText('PRIVATE — JUST YOU TWO')).toBeInTheDocument();
  });

  // FAC-21: thread row avatars must use the partner's profile picture when
  // we have one, and fall back to the default placeholder when we don't.
  it("renders the partner's profile image on each DM row when available", async () => {
    mockListMyThreads.mockResolvedValueOnce([
      {
        partnerPlayerId: 'partner-with-pic',
        partnerPlayerName: 'Partner With Pic',
        partnerWrestlerName: 'Edge',
        partnerImageUrl: 'https://example.com/edge-portrait.jpg',
        lastMessage: {
          messageId: 'dm-a',
          factionId: 'f1',
          threadKey: 'me#partner-with-pic',
          senderPlayerId: 'partner-with-pic',
          recipientPlayerId: 'me',
          body: 'Hi',
          createdAt: '2026-04-30T10:00:00.000Z',
        },
        lastMessageAt: '2026-04-30T10:00:00.000Z',
      },
      {
        partnerPlayerId: 'partner-no-pic',
        partnerPlayerName: 'Partner No Pic',
        partnerWrestlerName: 'Christian',
        partnerImageUrl: null,
        lastMessage: {
          messageId: 'dm-b',
          factionId: 'f1',
          threadKey: 'me#partner-no-pic',
          senderPlayerId: 'partner-no-pic',
          recipientPlayerId: 'me',
          body: 'Hey',
          createdAt: '2026-04-30T10:00:00.000Z',
        },
        lastMessageAt: '2026-04-30T10:00:00.000Z',
      },
    ]);
    renderTab();

    const withPic = await screen.findByAltText('Edge');
    expect(withPic).toHaveAttribute('src', 'https://example.com/edge-portrait.jpg');

    const withoutPic = screen.getByAltText('Christian');
    // resolveImageSrc returns the default image when input is undefined/null —
    // we don't assert the exact URL of the default (changing the asset would
    // break the test) but we confirm we did NOT keep the partner's null URL.
    expect(withoutPic.getAttribute('src')).not.toBe('null');
    expect(withoutPic.getAttribute('src')).not.toBe('');
  });

  it('opens the deep-linked DM on mount when ?dm=<partnerPlayerId> is set', async () => {
    renderTab(['/factions/f1/messages?dm=partner-1']);

    await waitFor(() => {
      expect(screen.getByText('DIRECT · Christian')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(mockListThread).toHaveBeenCalledWith(
        'f1',
        'partner-1',
        { limit: 50 },
        expect.anything(),
      );
    });
  });

  it('pauses polling while the document is hidden', async () => {
    // Start hidden.
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });

    renderTab();
    await waitFor(() => {
      expect(screen.getAllByText('Existing channel message').length).toBeGreaterThan(0);
    });

    // Switch to fake timers AFTER initial load so promise resolution isn't
    // blocked. Advance past several poll intervals and confirm no new calls.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const initialCallCount = mockListMessages.mock.calls.length;
    vi.advanceTimersByTime(25_000);
    expect(mockListMessages.mock.calls.length).toBe(initialCallCount);
  });

  it('renders the channel audience pill when the channel is active', async () => {
    renderTab();
    expect(await screen.findByText('VISIBLE TO FACTION ONLY')).toBeInTheDocument();
    // Header reads "FACTION-WIDE CHANNEL · 3 members"
    expect(screen.getByText(/FACTION-WIDE CHANNEL · 3 members/)).toBeInTheDocument();
  });

  it('disables Send while the composer is empty and enables it once non-whitespace is typed', async () => {
    const user = userEvent.setup();
    renderTab();
    await waitFor(() => {
      expect(screen.getAllByText('Existing channel message').length).toBeGreaterThan(0);
    });

    const send = screen.getByRole('button', { name: 'Send' });
    expect(send).toBeDisabled();

    await user.type(screen.getByPlaceholderText('Message the faction…'), '   ');
    expect(send).toBeDisabled();

    await user.type(screen.getByPlaceholderText('Message the faction…'), 'hello');
    expect(send).toBeEnabled();
  });

  it('marks the attachments + emoji icons as disabled with a coming-soon tooltip', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getAllByText('Existing channel message').length).toBeGreaterThan(0);
    });

    const attach = within(screen.getByLabelText('Attach (coming soon)'));
    expect(screen.getByLabelText('Attach (coming soon)')).toBeDisabled();
    expect(screen.getByLabelText('Emoji (coming soon)')).toBeDisabled();
    // Use within just to assert the button is present and named.
    expect(attach).toBeTruthy();
  });
});
