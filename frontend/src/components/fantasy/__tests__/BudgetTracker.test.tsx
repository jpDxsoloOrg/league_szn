import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import BudgetTracker from '../BudgetTracker';

describe('BudgetTracker', () => {
  it('shows remaining budget with correct amounts and percentage', () => {
    render(<BudgetTracker budget={500} spent={200} />);

    // Header
    expect(screen.getByText('fantasy.picks.budget')).toBeInTheDocument();

    // Spent and total amounts
    expect(screen.getByText('$200')).toBeInTheDocument();
    expect(screen.getByText('$500')).toBeInTheDocument();

    // Remaining
    expect(screen.getByText('$300')).toBeInTheDocument();

    // Percentage used (200/500 = 40%)
    expect(screen.getByText('40% fantasy.picks.used')).toBeInTheDocument();
  });

  it('applies warning class when budget usage is between 70% and 90%', () => {
    const { container } = render(<BudgetTracker budget={500} spent={400} />);

    // 400/500 = 80% -> warning class
    const bar = container.querySelector('.budget-bar');
    expect(bar).toHaveClass('warning');

    // Remaining = $100
    expect(screen.getByText('$100')).toBeInTheDocument();
    expect(screen.getByText('80% fantasy.picks.used')).toBeInTheDocument();
  });

  it('applies critical class and low remaining when budget usage is 90%+', () => {
    const { container } = render(<BudgetTracker budget={500} spent={475} />);

    // 475/500 = 95% -> critical class
    const bar = container.querySelector('.budget-bar');
    expect(bar).toHaveClass('critical');

    // Remaining = $25 (< $50 threshold for "low" class)
    const remaining = screen.getByText('$25');
    const remainingContainer = remaining.closest('.remaining');
    expect(remainingContainer).toHaveClass('low');
  });

  it('displays healthy status when under 70% usage', () => {
    const { container } = render(<BudgetTracker budget={1000} spent={100} />);

    // 100/1000 = 10% -> healthy class
    const bar = container.querySelector('.budget-bar');
    expect(bar).toHaveClass('healthy');

    expect(screen.getByText('$900')).toBeInTheDocument();
    expect(screen.getByText('10% fantasy.picks.used')).toBeInTheDocument();
  });
});
