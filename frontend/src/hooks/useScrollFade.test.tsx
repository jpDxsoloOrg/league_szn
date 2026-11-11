import { useRef } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useScrollFade } from './useScrollFade';

function Row() {
  const rowRef = useRef<HTMLDivElement>(null);
  useScrollFade(rowRef);
  return <div ref={rowRef} data-testid="row" />;
}

function layOut(row: HTMLElement, sizes: { scrollWidth: number; clientWidth: number; scrollLeft: number }) {
  Object.entries(sizes).forEach(([key, value]) => {
    Object.defineProperty(row, key, { configurable: true, writable: true, value });
  });
  fireEvent.scroll(row);
}

describe('useScrollFade', () => {
  it('leaves a row that fits alone', () => {
    render(<Row />);
    const row = screen.getByTestId('row');
    layOut(row, { scrollWidth: 300, clientWidth: 300, scrollLeft: 0 });
    expect(row).not.toHaveAttribute('data-fade');
  });

  it('names the edges with more to see as the row scrolls', () => {
    render(<Row />);
    const row = screen.getByTestId('row');

    layOut(row, { scrollWidth: 500, clientWidth: 300, scrollLeft: 0 });
    expect(row).toHaveAttribute('data-fade', 'end');

    layOut(row, { scrollWidth: 500, clientWidth: 300, scrollLeft: 100 });
    expect(row).toHaveAttribute('data-fade', 'both');

    layOut(row, { scrollWidth: 500, clientWidth: 300, scrollLeft: 200 });
    expect(row).toHaveAttribute('data-fade', 'start');
  });

  it('clears the fade when the row stops overflowing', () => {
    render(<Row />);
    const row = screen.getByTestId('row');
    layOut(row, { scrollWidth: 500, clientWidth: 300, scrollLeft: 0 });
    layOut(row, { scrollWidth: 300, clientWidth: 300, scrollLeft: 0 });
    expect(row).not.toHaveAttribute('data-fade');
  });
});
