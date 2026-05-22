import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, optsOrDefault?: unknown, maybeOpts?: Record<string, unknown>) => {
      // Mimic i18next's two call signatures used in StarRating.
      // t(key, defaultString) and t(key, { ...opts, defaultValue })
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

vi.mock('../StarRating.css', () => ({}));

import { StarRating } from '../StarRating';

describe('StarRating', () => {
  it('renders 4 full + 1 half star and count for starRating=4.5 ratingsCount=12', () => {
    const { container } = render(<StarRating starRating={4.5} ratingsCount={12} />);
    expect(container.querySelectorAll('.star-rating__star--full')).toHaveLength(4);
    expect(container.querySelectorAll('.star-rating__star--half')).toHaveLength(1);
    expect(container.querySelectorAll('.star-rating__star--empty')).toHaveLength(0);
    expect(screen.getByText('(12)')).toBeInTheDocument();
  });

  it('renders 5 full stars for starRating=5 ratingsCount=1', () => {
    const { container } = render(<StarRating starRating={5} ratingsCount={1} />);
    expect(container.querySelectorAll('.star-rating__star--full')).toHaveLength(5);
    expect(container.querySelectorAll('.star-rating__star--half')).toHaveLength(0);
    expect(screen.getByText('(1)')).toBeInTheDocument();
  });

  it('renders "Not yet rated" when ratingsCount=0 and starRating=0', () => {
    render(<StarRating starRating={0} ratingsCount={0} />);
    expect(screen.getByText('Not yet rated')).toBeInTheDocument();
  });

  it('renders "Not yet rated" defensively when ratingsCount=0 but starRating=4', () => {
    render(<StarRating starRating={4} ratingsCount={0} />);
    expect(screen.getByText('Not yet rated')).toBeInTheDocument();
  });

  it('hides count when showCount=false', () => {
    render(<StarRating starRating={3.5} ratingsCount={7} showCount={false} />);
    expect(screen.queryByText('(7)')).not.toBeInTheDocument();
  });

  it('renders "Not yet rated" when starRating is undefined', () => {
    render(<StarRating ratingsCount={3} />);
    expect(screen.getByText('Not yet rated')).toBeInTheDocument();
  });

  it('clamps a rating above 5 to a 5-star display', () => {
    const { container } = render(<StarRating starRating={7} ratingsCount={2} />);
    expect(container.querySelectorAll('.star-rating__star--full')).toHaveLength(5);
    expect(container.querySelectorAll('.star-rating__star--half')).toHaveLength(0);
  });

  it('snapshots the three size variants', () => {
    const sm = render(<StarRating starRating={3} ratingsCount={4} size="sm" />);
    expect(sm.container.firstChild).toMatchSnapshot('size-sm');
    sm.unmount();

    const md = render(<StarRating starRating={3} ratingsCount={4} size="md" />);
    expect(md.container.firstChild).toMatchSnapshot('size-md');
    md.unmount();

    const lg = render(<StarRating starRating={3} ratingsCount={4} size="lg" />);
    expect(lg.container.firstChild).toMatchSnapshot('size-lg');
    lg.unmount();
  });

  it('uses singular vote label when ratingsCount is 1', () => {
    const { container } = render(<StarRating starRating={4} ratingsCount={1} />);
    const countEl = container.querySelector('.star-rating__count');
    expect(countEl?.getAttribute('aria-label')).toBe('1 vote');
  });

  it('uses plural votes label when ratingsCount is >1', () => {
    const { container } = render(<StarRating starRating={4} ratingsCount={3} />);
    const countEl = container.querySelector('.star-rating__count');
    expect(countEl?.getAttribute('aria-label')).toBe('3 votes');
  });
});
