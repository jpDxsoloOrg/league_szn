import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { RivalryHeat } from '../../../types/rivalry';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      // Honour defaultValue + interpolate {{score}}; otherwise echo the key.
      if (opts && typeof opts === 'object') {
        const defaultValue =
          'defaultValue' in opts && typeof opts.defaultValue === 'string'
            ? opts.defaultValue
            : key;
        if ('score' in opts) {
          return defaultValue.replace('{{score}}', String(opts.score));
        }
        return defaultValue;
      }
      return key;
    },
  }),
}));

vi.mock('../HeatBadge.css', () => ({}));

import HeatBadge from '../HeatBadge';

describe('HeatBadge', () => {
  const tiers: Array<{ heat: RivalryHeat; label: string }> = [
    { heat: 'frozen', label: 'Frozen' },
    { heat: 'cold', label: 'Cold' },
    { heat: 'warm', label: 'Warm' },
    { heat: 'hot', label: 'Hot' },
    { heat: 'scorching', label: 'Scorching' },
  ];

  tiers.forEach(({ heat, label }) => {
    it(`renders the ${heat} tier with its label`, () => {
      render(<HeatBadge heat={heat} />);
      expect(screen.getByText(label)).toBeInTheDocument();
      const badge = screen.getByTestId('heat-badge');
      expect(badge.className).toContain(`heat-badge--${heat}`);
    });
  });

  it('exposes the heatScore via the title tooltip when provided', () => {
    render(<HeatBadge heat="hot" heatScore={47} />);
    const badge = screen.getByTestId('heat-badge');
    expect(badge).toHaveAttribute('title', 'Heat score: 47');
  });

  it('omits the title attribute when heatScore is not provided', () => {
    render(<HeatBadge heat="warm" />);
    const badge = screen.getByTestId('heat-badge');
    expect(badge.getAttribute('title')).toBeNull();
  });

  it('applies the requested size variant class', () => {
    const { rerender } = render(<HeatBadge heat="warm" size="sm" />);
    expect(screen.getByTestId('heat-badge').className).toContain('heat-badge--sm');

    rerender(<HeatBadge heat="warm" size="md" />);
    expect(screen.getByTestId('heat-badge').className).toContain('heat-badge--md');

    rerender(<HeatBadge heat="warm" size="lg" />);
    expect(screen.getByTestId('heat-badge').className).toContain('heat-badge--lg');
  });

  it('defaults to medium size when no size prop is supplied', () => {
    render(<HeatBadge heat="cold" />);
    expect(screen.getByTestId('heat-badge').className).toContain('heat-badge--md');
  });

  it('hides the label when showLabel is false but keeps the icon', () => {
    render(<HeatBadge heat="scorching" showLabel={false} />);
    expect(screen.queryByText('Scorching')).not.toBeInTheDocument();
    // Icon should still be rendered.
    const badge = screen.getByTestId('heat-badge');
    expect(badge.textContent ?? '').not.toBe('');
  });
});
