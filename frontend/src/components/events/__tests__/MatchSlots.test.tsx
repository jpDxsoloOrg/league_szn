import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { HydratedMatchSlot } from '../../../types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown> | string) => {
      const opts = typeof options === 'object' ? options : undefined;
      const fallback = typeof options === 'string'
        ? options
        : (opts?.defaultValue as string | undefined);
      const dict: Record<string, string> = {
        'matches.slots.claim': 'Claim spot',
        'matches.slots.claiming': 'Claiming…',
        'matches.slots.release': 'Release',
        'matches.slots.releasing': 'Releasing…',
        'matches.slots.locked': 'Locked',
        'matches.slots.open': 'Open spot',
        'matches.slots.adminEdit': 'Edit',
      };
      if (key === 'matches.slots.openCountBadge' && opts) {
        return `${opts.open} of ${opts.total} spots open`;
      }
      return dict[key] ?? fallback ?? key;
    },
  }),
}));

vi.mock('../MatchSlots.css', () => ({}));

import MatchSlots from '../MatchSlots';

function renderSlots(props: Partial<React.ComponentProps<typeof MatchSlots>> & {
  slots: HydratedMatchSlot[];
}) {
  const defaults: React.ComponentProps<typeof MatchSlots> = {
    matchId: 'm1',
    slots: props.slots,
    matchStatus: 'open-signups',
    onClaim: vi.fn().mockResolvedValue(undefined),
    onRelease: vi.fn().mockResolvedValue(undefined),
  };
  return render(
    <MemoryRouter>
      <MatchSlots {...defaults} {...props} />
    </MemoryRouter>,
  );
}

const filled = (over: Partial<HydratedMatchSlot> = {}): HydratedMatchSlot => ({
  slotId: 's1',
  position: 1,
  playerId: 'p-other',
  playerName: 'Bob',
  wrestlerName: 'The Bob',
  ...over,
});
const open = (over: Partial<HydratedMatchSlot> = {}): HydratedMatchSlot => ({
  slotId: 's2',
  position: 2,
  ...over,
});

describe('MatchSlots', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders filled slot with wrestler + player name', () => {
    renderSlots({ slots: [filled()] });
    expect(screen.getByText('The Bob')).toBeInTheDocument();
    expect(screen.getByText('(Bob)')).toBeInTheDocument();
  });

  it('renders psnId in its own span when present, alongside the player name', () => {
    const { container } = renderSlots({ slots: [filled({ psnId: 'StoneCold_316' })] });
    // PSN gets its own span so it can be styled (.match-slot-psn).
    const psn = container.querySelector('.match-slot-psn');
    expect(psn).not.toBeNull();
    expect(psn?.textContent).toBe('StoneCold_316');
    // The parenthetical still contains the player name + a separator.
    const player = container.querySelector('.match-slot-player');
    expect(player?.textContent).toBe(' (Bob · StoneCold_316)');
  });

  it('omits the psn span entirely when the player has no psnId', () => {
    const { container } = renderSlots({ slots: [filled({ psnId: undefined })] });
    expect(container.querySelector('.match-slot-psn')).toBeNull();
  });

  it('renders open slot with Claim button when authenticated', () => {
    renderSlots({ slots: [open()], isAuthenticated: true });
    expect(screen.getByRole('button', { name: 'Claim spot' })).toBeInTheDocument();
  });

  it('renders locked open slot without a Claim button', () => {
    renderSlots({ slots: [open({ lockedByAdmin: true })], isAuthenticated: true });
    expect(screen.queryByRole('button', { name: 'Claim spot' })).not.toBeInTheDocument();
    expect(screen.getByText('Locked')).toBeInTheDocument();
  });

  it('clicking Claim calls onClaim with the slotId', async () => {
    const onClaim = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderSlots({ slots: [open()], isAuthenticated: true, onClaim });
    await user.click(screen.getByRole('button', { name: 'Claim spot' }));
    await waitFor(() => expect(onClaim).toHaveBeenCalledWith('s2'));
  });

  it('guest clicking Claim triggers onLoginRequired (not onClaim)', async () => {
    const onClaim = vi.fn();
    const onLoginRequired = vi.fn();
    const user = userEvent.setup();
    renderSlots({
      slots: [open()],
      isAuthenticated: false,
      onClaim,
      onLoginRequired,
    });
    await user.click(screen.getByRole('button', { name: 'Claim spot' }));
    expect(onLoginRequired).toHaveBeenCalledTimes(1);
    expect(onClaim).not.toHaveBeenCalled();
  });

  it('shows Release button on the current player\'s slot', () => {
    renderSlots({
      slots: [filled({ playerId: 'me', playerName: 'Me', wrestlerName: 'My Gimmick' })],
      currentPlayerId: 'me',
    });
    expect(screen.getByRole('button', { name: 'Release' })).toBeInTheDocument();
  });

  it('clicking Release calls onRelease with the slotId', async () => {
    const onRelease = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderSlots({
      slots: [filled({ slotId: 'sX', playerId: 'me', playerName: 'Me', wrestlerName: 'X' })],
      currentPlayerId: 'me',
      onRelease,
    });
    await user.click(screen.getByRole('button', { name: 'Release' }));
    await waitFor(() => expect(onRelease).toHaveBeenCalledWith('sX'));
  });

  it('admin sees an Edit button per slot when onAdminEdit is provided', () => {
    const onAdminEdit = vi.fn();
    renderSlots({
      slots: [filled(), open()],
      isAdmin: true,
      onAdminEdit,
    });
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(2);
  });

  it('renders the open-count badge only when status is open-signups', () => {
    const { rerender } = renderSlots({
      slots: [filled(), open()],
      matchStatus: 'open-signups',
    });
    expect(screen.getByText('1 of 2 spots open')).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <MatchSlots
          matchId="m1"
          slots={[filled(), open()]}
          matchStatus="scheduled"
          onClaim={vi.fn()}
          onRelease={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByText('1 of 2 spots open')).not.toBeInTheDocument();
  });

  it('renders skeleton rows when loading', () => {
    renderSlots({ slots: [], loading: true, loadingCount: 3 });
    const list = document.querySelectorAll('.match-slot-skeleton');
    expect(list).toHaveLength(3);
  });

  it('sorts slots by position regardless of input order', () => {
    renderSlots({
      slots: [
        open({ slotId: 's-third', position: 3 }),
        open({ slotId: 's-first', position: 1 }),
        open({ slotId: 's-second', position: 2 }),
      ],
      isAuthenticated: true,
    });
    const rendered = document.querySelectorAll('.match-slot[data-slot-id]');
    expect(Array.from(rendered).map((el) => el.getAttribute('data-slot-id'))).toEqual([
      's-first',
      's-second',
      's-third',
    ]);
  });

  // ── MSL-04: one slot per event card ────────────────────────────────────

  it('disables Claim and exposes the reason as a tooltip when claimDisabled is true', async () => {
    const onClaim = vi.fn();
    const user = userEvent.setup();
    renderSlots({
      slots: [open()],
      isAuthenticated: true,
      onClaim,
      claimDisabled: true,
      disableClaimReason: 'You already have a slot in another match on this event',
    });
    const btn = screen.getByRole('button', { name: 'Claim spot' });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute(
      'title',
      'You already have a slot in another match on this event',
    );
    await user.click(btn);
    expect(onClaim).not.toHaveBeenCalled();
  });

  it('still allows Release on the user\'s own slot even when claimDisabled is true', () => {
    renderSlots({
      slots: [
        filled({ slotId: 's-mine', playerId: 'me', playerName: 'Me', wrestlerName: 'X' }),
      ],
      currentPlayerId: 'me',
      isAuthenticated: true,
      claimDisabled: true,
      disableClaimReason: 'unused',
    });
    expect(screen.getByRole('button', { name: 'Release' })).not.toBeDisabled();
  });

  // ── MSL-03: wrestler chooser ────────────────────────────────────────────

  it('claims directly without a chooser when the player has no alternate', async () => {
    const onClaim = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderSlots({
      slots: [open()],
      isAuthenticated: true,
      onClaim,
      currentPlayerCurrentWrestler: 'Stone Cold',
      currentPlayerAlternateWrestler: null,
    });
    await user.click(screen.getByRole('button', { name: 'Claim spot' }));
    await waitFor(() => expect(onClaim).toHaveBeenCalled());
    // Called with just the slotId (no chooser, so no options arg).
    expect(onClaim.mock.calls[0][0]).toBe('s2');
    expect(onClaim.mock.calls[0][1]).toBeUndefined();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the chooser when the player has both wrestlers and submits the choice', async () => {
    const onClaim = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderSlots({
      slots: [open()],
      isAuthenticated: true,
      onClaim,
      currentPlayerCurrentWrestler: 'Stone Cold',
      currentPlayerAlternateWrestler: 'The Rock',
    });
    await user.click(screen.getByRole('button', { name: 'Claim spot' }));

    // Chooser is open, default selection is 'main'
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onClaim).not.toHaveBeenCalled();

    // Pick alternate, confirm
    await user.click(screen.getByRole('radio', { name: /Use alternate/i }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() =>
      expect(onClaim).toHaveBeenCalledWith('s2', { wrestlerChoice: 'alternate' }),
    );
  });

  it('cancel on the chooser does not call onClaim', async () => {
    const onClaim = vi.fn();
    const user = userEvent.setup();
    renderSlots({
      slots: [open()],
      isAuthenticated: true,
      onClaim,
      currentPlayerCurrentWrestler: 'Stone Cold',
      currentPlayerAlternateWrestler: 'The Rock',
    });
    await user.click(screen.getByRole('button', { name: 'Claim spot' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClaim).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // ── Winner / loser highlight on the slot rows ───────────────────────────

  it('marks the winner\'s slot with the winner class + W badge', () => {
    renderSlots({
      slots: [
        filled({ slotId: 's-loser', position: 1, playerId: 'p-loser', wrestlerName: 'Loser' }),
        filled({ slotId: 's-winner', position: 2, playerId: 'p-winner', wrestlerName: 'Winner' }),
      ],
      matchStatus: 'completed',
      winnerPlayerIds: ['p-winner'],
      loserPlayerIds: ['p-loser'],
    });

    const winnerRow = document.querySelector('.match-slot[data-slot-id="s-winner"]');
    const loserRow = document.querySelector('.match-slot[data-slot-id="s-loser"]');
    expect(winnerRow?.classList.contains('winner')).toBe(true);
    expect(winnerRow?.classList.contains('loser')).toBe(false);
    expect(loserRow?.classList.contains('loser')).toBe(true);
    expect(winnerRow?.querySelector('.match-slot-winner-badge')).not.toBeNull();
    expect(loserRow?.querySelector('.match-slot-winner-badge')).toBeNull();
  });

  it('does not mark a winner when winnerPlayerIds is omitted', () => {
    renderSlots({
      slots: [
        filled({ slotId: 's-a', playerId: 'pa' }),
        filled({ slotId: 's-b', position: 2, playerId: 'pb' }),
      ],
      matchStatus: 'scheduled',
    });
    const rows = document.querySelectorAll('.match-slot');
    rows.forEach((row) => {
      expect(row.classList.contains('winner')).toBe(false);
      expect(row.classList.contains('loser')).toBe(false);
    });
  });
});
