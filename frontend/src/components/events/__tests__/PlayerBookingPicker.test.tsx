import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Player, PlayerBookingInfo } from '../../../types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string; count?: number }) => {
      const value = options?.defaultValue ?? key;
      return typeof options?.count === 'number'
        ? value.replace('{{count}}', String(options.count))
        : value;
    },
  }),
}));

vi.mock('../PlayerBookingPicker.css', () => ({}));

import PlayerBookingPicker, {
  type PickerCheckInStatus,
} from '../PlayerBookingPicker';

function player(id: string, name: string, wrestler: string): Player {
  return {
    playerId: id,
    name,
    currentWrestler: wrestler,
    wins: 0,
    losses: 0,
    draws: 0,
  } as Player;
}

const players: Player[] = [
  player('p1', 'Alice', 'Alpha'),
  player('p2', 'Bob', 'Bravo'),
  player('p3', 'Carol', 'Charlie'),
  player('p4', 'Dave', 'Delta'),
];

const statuses = new Map<string, PickerCheckInStatus>([
  ['p1', 'available'],
  ['p2', 'tentative'],
  ['p3', 'unavailable'],
  ['p4', 'noResponse'],
]);

function renderPicker(overrides: Partial<React.ComponentProps<typeof PlayerBookingPicker>> = {}) {
  const onChange = vi.fn();
  render(
    <PlayerBookingPicker
      players={players}
      value=""
      onChange={onChange}
      checkInStatusByPlayerId={statuses}
      {...overrides}
    />,
  );
  return { onChange };
}

async function openMenu() {
  await userEvent.click(screen.getByRole('button', { name: /Open spot/ }));
}

describe('PlayerBookingPicker', () => {
  it('lists only available and tentative players by default', async () => {
    renderPicker();
    await openMenu();

    expect(screen.getByText('Alpha (Alice)')).toBeInTheDocument();
    expect(screen.getByText('Bravo (Bob)')).toBeInTheDocument();
    expect(screen.queryByText('Charlie (Carol)')).not.toBeInTheDocument();
    expect(screen.queryByText('Delta (Dave)')).not.toBeInTheDocument();
  });

  it('groups available and tentative under separate headings', async () => {
    renderPicker();
    await openMenu();

    expect(screen.getByText('Available (1)')).toBeInTheDocument();
    expect(screen.getByText('Tentative (1)')).toBeInTheDocument();
  });

  it('colour-codes each option by check-in status', async () => {
    const { container } = render(
      <PlayerBookingPicker
        players={players}
        value=""
        onChange={vi.fn()}
        checkInStatusByPlayerId={statuses}
      />,
    );
    await openMenu();

    expect(container.querySelector('.booking-picker-dot--available')).toBeTruthy();
    expect(container.querySelector('.booking-picker-dot--tentative')).toBeTruthy();
    expect(container.querySelector('.booking-picker-dot--unavailable')).toBeFalsy();
  });

  it('reveals the filtered-out players behind the show-all toggle', async () => {
    renderPicker();
    await openMenu();

    await userEvent.click(
      screen.getByRole('button', { name: /Show 2 who didn't check in available/ }),
    );

    expect(screen.getByText('Charlie (Carol)')).toBeInTheDocument();
    expect(screen.getByText('Delta (Dave)')).toBeInTheDocument();
    expect(screen.getByText('Unavailable (1)')).toBeInTheDocument();
    expect(screen.getByText('No Response (1)')).toBeInTheDocument();
  });

  it('filters by name or wrestler as you type', async () => {
    renderPicker();
    await openMenu();

    await userEvent.type(screen.getByRole('searchbox'), 'brav');

    expect(screen.getByText('Bravo (Bob)')).toBeInTheDocument();
    expect(screen.queryByText('Alpha (Alice)')).not.toBeInTheDocument();
  });

  it('flags players already booked elsewhere on the card', async () => {
    renderPicker({ bookedPlayerIds: new Set(['p1']) });
    await openMenu();

    expect(screen.getByText('On card')).toBeInTheDocument();
  });

  it('keeps the selected player visible even when filtered out', async () => {
    render(
      <PlayerBookingPicker
        players={players}
        value="p3"
        onChange={vi.fn()}
        checkInStatusByPlayerId={statuses}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Charlie \(Carol\)/ }));

    expect(screen.getAllByText('Charlie (Carol)').length).toBeGreaterThan(1);
  });

  it('reports the picked player and the open-spot clear', async () => {
    const { onChange } = renderPicker();
    await openMenu();

    await userEvent.click(screen.getByText('Alpha (Alice)'));
    expect(onChange).toHaveBeenCalledWith('p1');

    await openMenu();
    await userEvent.click(screen.getAllByText('— Open spot —')[1]);
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('falls back to listing everyone when no check-in data is available', async () => {
    render(
      <PlayerBookingPicker players={players} value="" onChange={vi.fn()} />,
    );
    await openMenu();

    expect(screen.getByText('Alpha (Alice)')).toBeInTheDocument();
    expect(screen.getByText('Charlie (Carol)')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Show \d+ who didn't check in/ }),
    ).not.toBeInTheDocument();
  });

  describe('multi mode', () => {
    function renderMulti(selected: string[] = []) {
      const onToggle = vi.fn();
      const view = render(
        <PlayerBookingPicker
          mode="multi"
          players={players}
          selectedPlayerIds={new Set(selected)}
          onToggle={onToggle}
          checkInStatusByPlayerId={statuses}
        />,
      );
      return { onToggle, ...view };
    }

    async function openMulti(selected = 0) {
      const name = selected === 0 ? /Add participants…/ : new RegExp(`${selected} selected`);
      await userEvent.click(screen.getByRole('button', { name }));
    }

    it('has no open-spot row', async () => {
      renderMulti();
      await openMulti();

      expect(screen.queryByText('— Open spot —')).not.toBeInTheDocument();
    });

    it('toggles a player without closing the menu', async () => {
      const { onToggle } = renderMulti();
      await openMulti();

      await userEvent.click(screen.getByText('Alpha (Alice)'));
      expect(onToggle).toHaveBeenCalledWith('p1');
      // Still open, so a second pick needs no re-open.
      expect(screen.getByText('Bravo (Bob)')).toBeInTheDocument();
    });

    it('counts the selection on the trigger and ticks the chosen rows', async () => {
      renderMulti(['p1']);

      expect(screen.getByRole('button', { name: /1 selected/ })).toBeInTheDocument();
      await openMulti(1);
      expect(screen.getByText('✓')).toBeInTheDocument();
    });

    it('keeps a selected player visible even when filtered out', async () => {
      renderMulti(['p3']);
      await openMulti(1);

      expect(screen.getByText('Charlie (Carol)')).toBeInTheDocument();
    });

    it('closes from the visible Done button', async () => {
      renderMulti(['p1']);
      await openMulti(1);
      expect(screen.getByText('Alpha (Alice)')).toBeInTheDocument();

      // The count rides along so it is clear what is being confirmed.
      await userEvent.click(screen.getByRole('button', { name: 'Done (1)' }));
      expect(screen.queryByText('Alpha (Alice)')).not.toBeInTheDocument();
    });

    it('shows a bare Done when nothing is picked yet', async () => {
      renderMulti();
      await openMulti();

      expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
    });

    it('closes on Escape', async () => {
      renderMulti();
      await openMulti();
      expect(screen.getByText('Alpha (Alice)')).toBeInTheDocument();

      await userEvent.keyboard('{Escape}');
      expect(screen.queryByText('Alpha (Alice)')).not.toBeInTheDocument();
    });
  });

  describe('last booked + streak', () => {
    const info = (lastBookedAt: string | null, streak: PlayerBookingInfo['currentStreak'] = { type: 'W', count: 0 }): PlayerBookingInfo => ({
      lastBookedAt,
      currentStreak: streak,
    });
    // p1 and p2 are both "available" in the shared statuses map; put both in
    // the same bucket to test ordering within it.
    const sameBucket = new Map<string, PickerCheckInStatus>([
      ['p1', 'available'],
      ['p2', 'available'],
      ['p3', 'available'],
      ['p4', 'tentative'],
    ]);

    it('sorts never-booked first, then oldest, most recent last, within a bucket', async () => {
      const booking = new Map<string, PlayerBookingInfo>([
        ['p1', info('2026-09-07T20:00:00.000Z')], // Alice, most recent
        ['p2', info(null)],                        // Bob, never
        ['p3', info('2026-08-01T20:00:00.000Z')], // Carol, oldest
      ]);
      renderPicker({ checkInStatusByPlayerId: sameBucket, bookingInfoByPlayerId: booking });
      await userEvent.click(screen.getByRole('button'));

      const names = screen.getAllByRole('option').map((o) => o.textContent ?? '');
      const idx = (w: string) => names.findIndex((n) => n.includes(w));
      expect(idx('Bravo')).toBeLessThan(idx('Charlie'));
      expect(idx('Charlie')).toBeLessThan(idx('Alpha'));
      // p4 is tentative → still after every available player, whatever the recency.
      expect(idx('Delta')).toBeGreaterThan(idx('Alpha'));
    });

    it('shows a meta column: never booked, last booked date, and a streak chip only at 2+', async () => {
      const booking = new Map<string, PlayerBookingInfo>([
        ['p1', info('2026-08-29T20:00:00.000Z', { type: 'W', count: 3 })],
        ['p2', info(null, { type: 'L', count: 1 })],
        ['p3', info('2026-09-01T20:00:00.000Z', { type: 'L', count: 2 })],
      ]);
      renderPicker({ checkInStatusByPlayerId: sameBucket, bookingInfoByPlayerId: booking });
      await userEvent.click(screen.getByRole('button'));

      expect(screen.getByText('Never booked')).toBeInTheDocument();
      expect(screen.getByText(/Last booked Aug 29/)).toBeInTheDocument();
      expect(screen.getByText('W3')).toBeInTheDocument();
      expect(screen.getByText('L2')).toBeInTheDocument();
      expect(screen.queryByText('L1')).not.toBeInTheDocument();
    });

    it('marks never-booked and 14+ day rows as fresh', async () => {
      const recent = new Date(Date.now() - 2 * 86400000).toISOString();
      const stale = new Date(Date.now() - 20 * 86400000).toISOString();
      const booking = new Map<string, PlayerBookingInfo>([
        ['p1', info(recent)],
        ['p2', info(null)],
        ['p3', info(stale)],
      ]);
      renderPicker({ checkInStatusByPlayerId: sameBucket, bookingInfoByPlayerId: booking });
      await userEvent.click(screen.getByRole('button'));

      const byName = (w: string) => screen.getAllByRole('option').find((o) => o.textContent?.includes(w))!;
      expect(byName('Alpha').className).not.toContain('booking-picker-option--fresh');
      expect(byName('Bravo').className).toContain('booking-picker-option--fresh');
      expect(byName('Charlie').className).toContain('booking-picker-option--fresh');
    });

    it('falls back to name order and no meta when booking info is omitted', async () => {
      renderPicker({ checkInStatusByPlayerId: sameBucket });
      await userEvent.click(screen.getByRole('button'));

      const names = screen.getAllByRole('option').map((o) => o.textContent ?? '');
      expect(names.findIndex((n) => n.includes('Alpha'))).toBeLessThan(names.findIndex((n) => n.includes('Bravo')));
      expect(screen.queryByText('Never booked')).not.toBeInTheDocument();
    });
  });
});
