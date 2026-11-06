import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { HydratedMatchSlot, Player } from '../../../types';
import SlotEditDialog from '../SlotEditDialog';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: string | { defaultValue?: string }) => (
      typeof options === 'string' ? options : (options?.defaultValue ?? key)
    ),
  }),
}));

function player(playerId: string, name: string, currentWrestler: string): Player {
  return { playerId, name, currentWrestler, wins: 0, losses: 0, draws: 0, createdAt: '', updatedAt: '' };
}

const roster = [
  player('p1', 'Alice', 'The Rock'),
  player('p2', 'Booked Ghost', 'Needs Wrestler'),
  player('p3', 'Other Ghost', ''),
];

function renderDialog(playerId?: string) {
  const slot = { slotId: 's1', position: 1, playerId } as HydratedMatchSlot;
  render(<SlotEditDialog slot={slot} players={roster} onSave={vi.fn()} onClose={vi.fn()} />);
}

describe('SlotEditDialog', () => {
  it('keeps hidden players out of the picker for an open slot', async () => {
    renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Player' }));

    expect(screen.getByRole('option', { name: /Alice/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Ghost/ })).not.toBeInTheDocument();
  });

  it('keeps the hidden player already in the slot, and no other', async () => {
    renderDialog('p2');

    await userEvent.click(screen.getByRole('button', { name: 'Player' }));

    expect(screen.getByRole('option', { name: /Booked Ghost/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Other Ghost/ })).not.toBeInTheDocument();
  });

  it('closes only the picker on the first Escape, and the dialog on the second', async () => {
    const onClose = vi.fn();
    const slot = { slotId: 's1', position: 1 } as HydratedMatchSlot;
    render(<SlotEditDialog slot={slot} players={roster} onSave={vi.fn()} onClose={onClose} />);
    const picker = screen.getByRole('button', { name: 'Player' });

    await userEvent.click(picker);
    expect(picker).toHaveAttribute('aria-expanded', 'true');

    await userEvent.keyboard('{Escape}');
    expect(picker).toHaveAttribute('aria-expanded', 'false');
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
