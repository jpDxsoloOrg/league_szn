import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { PlayerDisciplineSummary } from '../../../types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en-US' },
    t: (key: string, options: Record<string, unknown> = {}) => {
      if (key.startsWith('discipline.countdown.')) return `${options.count} ${key.split('.').pop()}`;
      const values = Object.entries(options).map(([name, value]) => `${name}=${value}`).join(' ');
      return values ? `${key} ${values}` : key;
    },
  }),
}));

import DisciplineNotice from '../DisciplineNotice';
import SuspensionNotice from '../SuspensionNotice';

const NOW = Date.parse('2026-11-06T12:00:00.000Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const at = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

const strikes = [
  { strikeId: 's1', issuedAt: at(-2 * DAY), reason: 'Missed a booked match' },
  { strikeId: 's2', issuedAt: at(-DAY), reason: 'Abusive message' },
];

const warned: PlayerDisciplineSummary = {
  status: 'warned',
  activeStrikeCount: 1,
  activeStrikes: [strikes[0]!],
  cooldownEndsAt: at(5 * DAY + 3 * HOUR),
  signupBlockedUntil: null,
  deactivatedAt: null,
};

const blocked: PlayerDisciplineSummary = {
  status: 'signup-blocked',
  activeStrikeCount: 2,
  activeStrikes: strikes,
  cooldownEndsAt: at(13 * DAY),
  signupBlockedUntil: at(6 * DAY),
  deactivatedAt: null,
};

const renderNotice = (discipline?: PlayerDisciplineSummary | null) => render(
  <MemoryRouter><DisciplineNotice discipline={discipline} /></MemoryRouter>,
);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('DisciplineNotice', () => {
  it('renders nothing with no record or a clear one', () => {
    const { container, rerender } = renderNotice(undefined);
    expect(container).toBeEmptyDOMElement();
    rerender(
      <MemoryRouter>
        <DisciplineNotice
          discipline={{ ...warned, status: 'clear', activeStrikes: [], activeStrikeCount: 0, cooldownEndsAt: null }}
        />
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a warning with its date, reason, countdown and exact end, and no suspension', () => {
    renderNotice(warned);
    expect(screen.getByText('discipline.status.warned')).toBeInTheDocument();
    expect(screen.getByText(/reason=Missed a booked match/)).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent('time=5 days 3 hours');
    expect(screen.getByText(/discipline\.notice\.cooldownEnds/)).toHaveAttribute('datetime', warned.cooldownEndsAt);
    expect(screen.queryByText('discipline.notice.suspendedTitle')).not.toBeInTheDocument();
  });

  it('shows both windows while blocked, and every active strike', () => {
    renderNotice(blocked);
    expect(screen.getByText('discipline.status.signupBlocked')).toBeInTheDocument();
    const [suspension, cooldown] = screen.getAllByRole('timer');
    expect(suspension).toHaveTextContent('liftsIn time=6 days');
    expect(cooldown).toHaveTextContent('fallsOffIn count=2 time=13 days');
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(2);
  });

  it('shows no suspension during the cooldown', () => {
    renderNotice({ ...blocked, status: 'cooldown', signupBlockedUntil: null });
    expect(screen.getByText('discipline.status.cooldown')).toBeInTheDocument();
    expect(screen.getAllByRole('timer')).toHaveLength(1);
  });

  it('states a deactivation with no countdown', () => {
    renderNotice({ ...blocked, status: 'deactivated', cooldownEndsAt: null, signupBlockedUntil: null, deactivatedAt: at(-HOUR) });
    expect(screen.getByText('discipline.notice.deactivated')).toBeInTheDocument();
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
  });

  it('counts down live', () => {
    renderNotice({ ...warned, cooldownEndsAt: at(2 * HOUR) });
    expect(screen.getByRole('timer')).toHaveTextContent('2 hours');
    act(() => {
      vi.advanceTimersByTime(HOUR + 60_000);
    });
    expect(screen.getByRole('timer')).toHaveTextContent('59 minutes');
  });

  it('moves on by itself when the block ends, and goes away with the cooldown', () => {
    const { container } = renderNotice(blocked);
    act(() => {
      vi.advanceTimersByTime(6 * DAY);
    });
    expect(screen.getByText('discipline.status.cooldown')).toBeInTheDocument();
    expect(screen.getAllByRole('timer')).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(7 * DAY);
    });
    expect(container).toBeEmptyDOMElement();
  });
});

describe('SuspensionNotice', () => {
  it('shows the time left and the date, and goes when the block ends', () => {
    const until = at(HOUR);
    const { container } = render(<SuspensionNotice until={until} />);
    expect(screen.getByRole('timer')).toHaveTextContent('time=1 hours');
    expect(screen.getByText(/signupBlockedUntil/)).toHaveAttribute('datetime', until);
    act(() => {
      vi.advanceTimersByTime(HOUR);
    });
    expect(container).toBeEmptyDOMElement();
  });
});
