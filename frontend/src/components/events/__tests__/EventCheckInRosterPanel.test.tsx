import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { EventCheckInRoster } from '../../../types/event';

// --- Hoisted mocks ---
const { mockGetCheckIns } = vi.hoisted(() => ({
  mockGetCheckIns: vi.fn(),
}));

vi.mock('../../../services/api/events.api', () => ({
  eventsApi: {
    getCheckIns: mockGetCheckIns,
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}));

vi.mock('../EventCheckInRosterPanel.css', () => ({}));

import EventCheckInRosterPanel from '../EventCheckInRosterPanel';

const sampleRoster: EventCheckInRoster = {
  available: [
    {
      playerId: 'p1',
      name: 'Alice',
      currentWrestler: 'Alpha',
      imageUrl: 'https://example.com/a.png',
    },
    {
      playerId: 'p2',
      name: 'Bob',
      currentWrestler: 'Bravo',
    },
  ],
  tentative: [
    {
      playerId: 'p3',
      name: 'Carol',
      currentWrestler: 'Charlie',
    },
  ],
  unavailable: [
    {
      playerId: 'p4',
      name: 'Dave',
      currentWrestler: 'Delta',
    },
  ],
  noResponse: [
    {
      playerId: 'p5',
      name: 'Eve',
      currentWrestler: 'Echo',
    },
  ],
};

describe('EventCheckInRosterPanel', () => {
  beforeEach(() => {
    mockGetCheckIns.mockReset();
    mockGetCheckIns.mockResolvedValue(sampleRoster);
  });

  it('calls getCheckIns on mount with the correct eventId', async () => {
    render(<EventCheckInRosterPanel eventId="evt-123" />);
    await waitFor(() => {
      expect(mockGetCheckIns).toHaveBeenCalledWith('evt-123');
    });
  });

  it('renders all four buckets when data loads', async () => {
    render(<EventCheckInRosterPanel eventId="evt-123" />);
    await waitFor(() => {
      expect(screen.getByText(/Available \(2\)/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Tentative \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Unavailable \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/No Response \(1\)/)).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Carol')).toBeInTheDocument();
    expect(screen.getByText('Dave')).toBeInTheDocument();
    expect(screen.getByText('Eve')).toBeInTheDocument();
  });

  it('refetches when refresh button clicked', async () => {
    const user = userEvent.setup();
    render(<EventCheckInRosterPanel eventId="evt-123" />);
    await waitFor(() => {
      expect(mockGetCheckIns).toHaveBeenCalledTimes(1);
    });
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => {
      expect(mockGetCheckIns).toHaveBeenCalledTimes(2);
    });
  });

  it('copies plaintext roster to clipboard when copy button clicked', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    });

    render(<EventCheckInRosterPanel eventId="evt-123" />);
    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Copy as text' }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    const text = writeText.mock.calls[0][0] as string;
    expect(text).toContain('Available (2):');
    expect(text).toContain('- Alice (Alpha)');
    expect(text).toContain('- Bob (Bravo)');
    expect(text).toContain('Tentative (1):');
    expect(text).toContain('- Carol (Charlie)');
    expect(text).toContain('Unavailable (1):');
    expect(text).toContain('No Response (1):');

    await waitFor(() => {
      expect(screen.getByText('Copied!')).toBeInTheDocument();
    });
  });

  it('compact mode renders only available bucket with no refresh/copy buttons', async () => {
    render(<EventCheckInRosterPanel eventId="evt-123" compact />);
    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });
    expect(screen.getByText('Bob')).toBeInTheDocument();
    // Other buckets' players should not appear
    expect(screen.queryByText('Carol')).not.toBeInTheDocument();
    expect(screen.queryByText('Dave')).not.toBeInTheDocument();
    expect(screen.queryByText('Eve')).not.toBeInTheDocument();
    // No refresh/copy buttons
    expect(
      screen.queryByRole('button', { name: 'Refresh' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Copy as text' })
    ).not.toBeInTheDocument();
  });

  it('shows error state when API throws', async () => {
    mockGetCheckIns.mockRejectedValueOnce(new Error('network down'));
    render(<EventCheckInRosterPanel eventId="evt-err" />);
    await waitFor(() => {
      expect(
        screen.getByText('Failed to load check-in roster.')
      ).toBeInTheDocument();
    });
  });
});
