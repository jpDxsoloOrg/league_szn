import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import GroupFormCell from '../GroupFormCell';

describe('GroupFormCell', () => {
  it('turns the newest-first API form into the oldest-to-newest order FormDots draws', () => {
    const { container } = render(<GroupFormCell recentForm={['W', 'L', 'D']} />);
    const dots = [...container.querySelectorAll('.ui-form-dots__dot')].map((dot) => dot.className);

    expect(dots).toEqual([
      expect.stringContaining('--d'),
      expect.stringContaining('--l'),
      expect.stringContaining('--w'),
    ]);
  });

  it('keeps the five newest results when the API sends more', () => {
    const { container } = render(<GroupFormCell recentForm={['W', 'W', 'W', 'W', 'W', 'L', 'L']} />);

    expect(container.querySelectorAll('.ui-form-dots__dot--l')).toHaveLength(0);
    expect(container.querySelectorAll('.ui-form-dots__dot')).toHaveLength(5);
  });
});
