import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, optsOrDefault?: unknown, maybeOpts?: Record<string, unknown>) => {
      // Supports t(key, defaultString) and t(key, { ...opts, defaultValue }).
      if (typeof optsOrDefault === 'string') return optsOrDefault;
      if (optsOrDefault && typeof optsOrDefault === 'object') {
        const opts = optsOrDefault as Record<string, unknown>;
        const def = (opts.defaultValue as string | undefined) ?? key;
        let out = def;
        for (const [k, v] of Object.entries(opts)) {
          if (k === 'defaultValue') continue;
          out = out.replace(new RegExp(`{{${k}}}`, 'g'), String(v));
        }
        return out;
      }
      if (maybeOpts && typeof maybeOpts === 'object') {
        let out = key;
        for (const [k, v] of Object.entries(maybeOpts)) {
          out = out.replace(new RegExp(`{{${k}}}`, 'g'), String(v));
        }
        return out;
      }
      return key;
    },
  }),
}));

vi.mock('../RateMatchWidget.css', () => ({}));
vi.mock('../StarRating.css', () => ({}));

// Auth mock — overridable per test.
const authMock = { isAuthenticated: true };
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => authMock,
}));

// API mock.
const submitRatingMock = vi.fn();
vi.mock('../../../services/api/matches.api', () => ({
  matchesApi: {
    submitRating: (matchId: string, rating: number) => submitRatingMock(matchId, rating),
  },
}));

import { RateMatchWidget } from '../RateMatchWidget';

describe('RateMatchWidget', () => {
  beforeEach(() => {
    submitRatingMock.mockReset();
    authMock.isAuthenticated = true;
  });

  it('renders nothing when matchStatus is not completed', () => {
    const { container } = render(
      <RateMatchWidget
        matchId="m1"
        matchStatus="scheduled"
        userHasRated={false}
        userRating={null}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders a sign-in prompt for guests', () => {
    authMock.isAuthenticated = false;
    render(
      <RateMatchWidget
        matchId="m1"
        matchStatus="completed"
        userHasRated={false}
        userRating={null}
      />
    );
    expect(screen.getByText('Sign in to rate this match')).toBeInTheDocument();
  });

  it('renders read-only state when userHasRated is true', () => {
    render(
      <RateMatchWidget
        matchId="m1"
        matchStatus="completed"
        userHasRated={true}
        userRating={4}
      />
    );
    expect(screen.getByText('You rated this 4')).toBeInTheDocument();
    // No interactive radio buttons in the locked state.
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });

  it('submits the half-star value when a half hit-target is clicked', async () => {
    submitRatingMock.mockResolvedValue({
      matchId: 'm1',
      userId: 'u1',
      rating: 4.5,
      matchAggregate: { ratingAverage: 4.5, starRating: 4.5, ratingsCount: 1 },
      rivalry: null,
    });
    render(
      <RateMatchWidget
        matchId="m1"
        matchStatus="completed"
        userHasRated={false}
        userRating={null}
      />
    );
    // 5 stars * 2 halves = 10 radios.
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(10);
    // The 4.5 button is the left half of the 5th star — its aria-label is "4.5 stars".
    const halfButton = screen.getByRole('radio', { name: '4.5 stars' });
    fireEvent.click(halfButton);
    await waitFor(() => expect(submitRatingMock).toHaveBeenCalledWith('m1', 4.5));
  });

  it('transitions to read-only "Thanks!" state on successful submit', async () => {
    submitRatingMock.mockResolvedValue({
      matchId: 'm1',
      userId: 'u1',
      rating: 3,
      matchAggregate: { ratingAverage: 3, starRating: 3, ratingsCount: 1 },
      rivalry: null,
    });
    const onRated = vi.fn();
    render(
      <RateMatchWidget
        matchId="m1"
        matchStatus="completed"
        userHasRated={false}
        userRating={null}
        onRated={onRated}
      />
    );
    const button = screen.getByRole('radio', { name: '3 stars' });
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByText('Thanks for rating!')).toBeInTheDocument());
    expect(screen.getByText('You rated this 3')).toBeInTheDocument();
    expect(onRated).toHaveBeenCalledWith(3);
  });

  it('locks the widget when the server returns "already rated"', async () => {
    submitRatingMock.mockRejectedValue(new Error('You have already rated this match.'));
    render(
      <RateMatchWidget
        matchId="m1"
        matchStatus="completed"
        userHasRated={false}
        userRating={2}
      />
    );
    const button = screen.getByRole('radio', { name: '5 stars' });
    fireEvent.click(button);
    // Widget transitions to read-only locked state showing the known prior rating.
    await waitFor(() => expect(screen.getByText('You rated this 2')).toBeInTheDocument());
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });

  it('shows an inline error and stays interactive on a generic failure', async () => {
    submitRatingMock.mockRejectedValue(new Error('Internal server boom'));
    render(
      <RateMatchWidget
        matchId="m1"
        matchStatus="completed"
        userHasRated={false}
        userRating={null}
      />
    );
    const button = screen.getByRole('radio', { name: '4 stars' });
    fireEvent.click(button);
    await waitFor(() =>
      expect(screen.getByText('Could not submit rating. Try again.')).toBeInTheDocument()
    );
    // Still interactive — radios remain in the DOM.
    expect(screen.getAllByRole('radio').length).toBe(10);
  });
});
