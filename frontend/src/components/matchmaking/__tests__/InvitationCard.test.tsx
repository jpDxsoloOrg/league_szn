import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type { MatchInvitation } from '../../../types/matchmaking';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { seconds?: number }) =>
      options?.seconds != null ? `${key}:${options.seconds}` : key,
  }),
}));

import InvitationCard from '../InvitationCard';

const NOW = new Date('2026-01-01T12:00:00Z').getTime();

const invitation = (secondsLeft: number): MatchInvitation => ({
  invitationId: 'i1',
  fromPlayerId: 'them',
  toPlayerId: 'me',
  status: 'pending',
  createdAt: new Date(NOW).toISOString(),
  expiresAt: new Date(NOW + secondsLeft * 1000).toISOString(),
  from: { playerId: 'them', name: 'Them', currentWrestler: 'Them-W' },
  to: { playerId: 'me', name: 'Me', currentWrestler: 'Me-W' },
});

function renderList(secondsLeft: number, onExpire = vi.fn()) {
  render(
    <ul>
      <InvitationCard invitation={invitation(secondsLeft)} direction="incoming" onExpire={onExpire} />
    </ul>,
  );
  return onExpire;
}

describe('InvitationCard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts down from the expiry time', () => {
    renderList(10);
    expect(screen.getByText('findMatch.invitations.expiresIn:10')).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.getByText('findMatch.invitations.expiresIn:7')).toBeInTheDocument();
  });

  it('stays correct when timers were throttled in a hidden tab', () => {
    renderList(30);

    // The clock moves on while no interval callback runs.
    vi.setSystemTime(NOW + 20_000);
    act(() => { vi.advanceTimersByTime(1000); });

    expect(screen.getByText('findMatch.invitations.expiresIn:9')).toBeInTheDocument();
  });

  it('expires once and disables the actions', () => {
    const onExpire = renderList(2);

    act(() => { vi.advanceTimersByTime(5000); });

    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(screen.getByText('findMatch.invitations.expired')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'findMatch.invitations.accept' })).toBeDisabled();
  });
});
