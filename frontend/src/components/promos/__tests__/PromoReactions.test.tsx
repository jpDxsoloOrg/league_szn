import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => {
      const t: Record<string, string> = {
        'promos.reactions.fire': 'Fire',
        'promos.reactions.mic': 'Mic Drop',
        'promos.reactions.trash': 'Trash',
        'promos.reactions.mind-blown': 'Mind Blown',
        'promos.reactions.clap': 'Clap',
      };
      return t[key] || (typeof fallback === 'string' ? fallback : key);
    },
  }),
}));

vi.mock('../PromoReactions.css', () => ({}));

import PromoReactions from '../PromoReactions';
import type { ReactionType } from '../../../types/promo';

const defaultCounts: Record<ReactionType, number> = {
  fire: 3,
  mic: 1,
  trash: 0,
  'mind-blown': 2,
  clap: 5,
};

describe('PromoReactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all 5 reaction buttons with correct labels and counts', () => {
    render(<PromoReactions reactionCounts={defaultCounts} />);

    expect(screen.getByLabelText('Fire')).toBeInTheDocument();
    expect(screen.getByLabelText('Mic Drop')).toBeInTheDocument();
    expect(screen.getByLabelText('Trash')).toBeInTheDocument();
    expect(screen.getByLabelText('Mind Blown')).toBeInTheDocument();
    expect(screen.getByLabelText('Clap')).toBeInTheDocument();

    expect(screen.getByText('3')).toBeInTheDocument();  // fire
    expect(screen.getByText('5')).toBeInTheDocument();  // clap
  });

  it('highlights active reaction and increments count on click', async () => {
    const user = userEvent.setup();

    render(<PromoReactions reactionCounts={defaultCounts} />);

    const fireButton = screen.getByLabelText('Fire');
    expect(fireButton).not.toHaveClass('active');

    await user.click(fireButton);

    // Button should become active
    expect(fireButton).toHaveClass('active');
    // Count should increment from 3 to 4
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('calls onReact callback and toggles off on second click', async () => {
    const user = userEvent.setup();
    const mockOnReact = vi.fn();

    render(<PromoReactions reactionCounts={defaultCounts} onReact={mockOnReact} />);

    const clapButton = screen.getByLabelText('Clap');

    // First click - activate
    await user.click(clapButton);
    expect(mockOnReact).toHaveBeenCalledWith('clap');
    expect(clapButton).toHaveClass('active');

    // Second click - deactivate (toggle off)
    await user.click(clapButton);
    expect(mockOnReact).toHaveBeenCalledTimes(2);
    expect(clapButton).not.toHaveClass('active');
  });
});
