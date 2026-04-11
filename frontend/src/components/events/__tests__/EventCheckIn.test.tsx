import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { EventCheckInSummary } from '../../../types/event';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        'events.checkIn.available': 'Available',
        'events.checkIn.tentative': 'Tentative',
        'events.checkIn.unavailable': 'Unavailable',
        'events.checkIn.clearResponse': 'Clear my response',
        'events.checkIn.lockedAfterStart': 'RSVP is locked after the event starts',
      };
      if (key === 'events.checkIn.summary') {
        const opts = options || {};
        return `${opts.available} available · ${opts.tentative} tentative · ${opts.unavailable} unavailable`;
      }
      return translations[key] || key;
    },
  }),
}));

vi.mock('../EventCheckIn.css', () => ({}));

import EventCheckIn from '../EventCheckIn';

const summary: EventCheckInSummary = {
  eventId: 'e1',
  available: 3,
  tentative: 1,
  unavailable: 2,
  total: 6,
};

describe('EventCheckIn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders three RSVP buttons', () => {
    render(
      <EventCheckIn
        eventStatus="upcoming"
        currentStatus={null}
        summary={summary}
        onChange={vi.fn().mockResolvedValue(undefined)}
      />
    );

    expect(screen.getByRole('button', { name: 'Available' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentative' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unavailable' })).toBeInTheDocument();
  });

  it('clicking a button calls onChange with that status', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(
      <EventCheckIn
        eventStatus="upcoming"
        currentStatus={null}
        summary={summary}
        onChange={onChange}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Available' }));
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('available');
    });
  });

  it('highlights the current status button with selected class', () => {
    render(
      <EventCheckIn
        eventStatus="upcoming"
        currentStatus="tentative"
        summary={summary}
        onChange={vi.fn().mockResolvedValue(undefined)}
      />
    );

    const tentativeBtn = screen.getByRole('button', { name: 'Tentative' });
    expect(tentativeBtn.classList.contains('selected')).toBe(true);

    const availableBtn = screen.getByRole('button', { name: 'Available' });
    expect(availableBtn.classList.contains('selected')).toBe(false);
  });

  it('disables buttons when event is completed', () => {
    render(
      <EventCheckIn
        eventStatus="completed"
        currentStatus={null}
        summary={summary}
        onChange={vi.fn().mockResolvedValue(undefined)}
      />
    );

    expect(screen.getByRole('button', { name: 'Available' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Tentative' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Unavailable' })).toBeDisabled();
    expect(screen.getByText('RSVP is locked after the event starts')).toBeInTheDocument();
  });

  it('disables buttons when event is cancelled', () => {
    render(
      <EventCheckIn
        eventStatus="cancelled"
        currentStatus={null}
        summary={summary}
        onChange={vi.fn().mockResolvedValue(undefined)}
      />
    );

    expect(screen.getByRole('button', { name: 'Available' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Tentative' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Unavailable' })).toBeDisabled();
  });

  it('clear-response link calls onChange(null)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(
      <EventCheckIn
        eventStatus="upcoming"
        currentStatus="available"
        summary={summary}
        onChange={onChange}
      />
    );

    const clearBtn = screen.getByRole('button', { name: 'Clear my response' });
    await user.click(clearBtn);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(null);
    });
  });

  it('clear-response link is not visible when currentStatus is null', () => {
    render(
      <EventCheckIn
        eventStatus="upcoming"
        currentStatus={null}
        summary={summary}
        onChange={vi.fn().mockResolvedValue(undefined)}
      />
    );

    expect(screen.queryByRole('button', { name: 'Clear my response' })).not.toBeInTheDocument();
  });

  it('renders summary line with counts', () => {
    render(
      <EventCheckIn
        eventStatus="upcoming"
        currentStatus={null}
        summary={summary}
        onChange={vi.fn().mockResolvedValue(undefined)}
      />
    );

    expect(screen.getByText('3 available · 1 tentative · 2 unavailable')).toBeInTheDocument();
  });
});
