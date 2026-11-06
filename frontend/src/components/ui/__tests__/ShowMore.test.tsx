import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ShowMore from '../ShowMore';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { shown?: number; total?: number }) => (
      options ? `${options.shown} of ${options.total}` : key
    ),
  }),
}));

function CappedList({ total, pageSize }: { total: number; pageSize: number }) {
  const [shown, setShown] = useState(Math.min(pageSize, total));
  return <ShowMore shown={shown} total={total} onShowMore={() => setShown(Math.min(shown + pageSize, total))} />;
}

describe('ShowMore', () => {
  it('renders nothing when every row already fits', () => {
    const { container } = render(<CappedList total={3} pageSize={5} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('keeps focus on the button while more rows remain', async () => {
    render(<CappedList total={9} pageSize={3} />);

    await userEvent.click(screen.getByRole('button', { name: 'common.showMore' }));

    expect(screen.getByRole('button', { name: 'common.showMore' })).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('6 of 9');
  });

  it('moves focus to the final count when the last rows load', async () => {
    render(<CappedList total={5} pageSize={3} />);

    await userEvent.click(screen.getByRole('button', { name: 'common.showMore' }));

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('5 of 5');
    expect(screen.getByRole('status')).toHaveFocus();
  });
});
