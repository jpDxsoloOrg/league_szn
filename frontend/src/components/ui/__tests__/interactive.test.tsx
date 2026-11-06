import { useState } from 'react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import DataTable from '../DataTable';
import type { DataTableColumn } from '../DataTable';
import Modal from '../Modal';
import Podium from '../Podium';
import SectionTabs from '../SectionTabs';
import Select from '../Select';
import SwipeRow from '../SwipeRow';
import Tabs from '../Tabs';
import { ToastProvider } from '../Toast';
import { useToast } from '../toastContext';

describe('Modal', () => {
  function Harness({ onClose = vi.fn() }: { onClose?: () => void }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>Open</button>
        <Modal open={open} onClose={() => { setOpen(false); onClose(); }} title="Edit" footer={<button>Done</button>}>
          <input aria-label="Name" />
        </Modal>
      </>
    );
  }

  it('is a labelled dialog that takes focus and returns it', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Open' });
    await user.click(trigger);

    const dialog = screen.getByRole('dialog', { name: 'Edit' });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('calls onClose from Escape and the close button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.click(screen.getByRole('button', { name: 'common.close' }));

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('keeps Tab inside the dialog', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    const dialog = screen.getByRole('dialog');

    for (let press = 0; press < 5; press += 1) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
  });

  it('hides the visible header but keeps the accessible name', () => {
    render(<Modal open onClose={vi.fn()} title="Search" hideTitle>Body</Modal>);
    expect(screen.getByRole('dialog', { name: 'Search' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'common.close' })).not.toBeInTheDocument();
  });
});

describe('Tabs', () => {
  const items = [
    { value: 'one', label: 'One', content: <p>First panel</p> },
    { value: 'two', label: 'Two', content: <p>Second panel</p> },
  ];

  it('shows the first panel and switches on click', async () => {
    render(<Tabs items={items} label="Views" />);
    expect(screen.getByRole('tablist', { name: 'Views' })).toBeInTheDocument();
    expect(screen.getByText('First panel')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Two' }));
    expect(screen.getByText('Second panel')).toBeInTheDocument();
    expect(screen.queryByText('First panel')).not.toBeInTheDocument();
  });

  it('moves with the arrow keys', async () => {
    const onValueChange = vi.fn();
    render(<Tabs items={items} label="Views" value="one" onValueChange={onValueChange} />);
    screen.getByRole('tab', { name: 'One' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onValueChange).toHaveBeenCalledWith('two');
  });
});

describe('SectionTabs', () => {
  const items = [{ to: '/events', label: 'Calendar' }, { to: '/matches', label: 'Matches' }];

  it('marks the current path by default', () => {
    render(<MemoryRouter initialEntries={['/matches']}><SectionTabs items={items} label="Events" /></MemoryRouter>);
    expect(screen.getByRole('navigation', { name: 'Events' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Matches' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Calendar' })).not.toHaveAttribute('aria-current');
  });

  it('accepts an explicit active item for drill-down pages', () => {
    render(<MemoryRouter initialEntries={['/events/e1']}><SectionTabs items={items} label="Events" activeTo="/events" /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Calendar' })).toHaveAttribute('aria-current', 'page');
  });
});

describe('Select', () => {
  const options = [{ value: '', label: 'All' }, { value: 's1', label: 'Season 1' }];

  it('shows the selected label, including an empty-value option', () => {
    render(<Select label="Season" value="" onValueChange={vi.fn()} options={options} />);
    expect(screen.getByRole('combobox', { name: 'Season' })).toHaveTextContent('All');
  });

  it('reports the chosen value', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Select label="Season" value="" onValueChange={onValueChange} options={options} />);

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Season 1' }));

    expect(onValueChange).toHaveBeenCalledWith('s1');
  });

  it('maps the empty option back to an empty string', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Select label="Season" value="s1" onValueChange={onValueChange} options={options} />);

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'All' }));

    expect(onValueChange).toHaveBeenCalledWith('');
  });

  it('shows the placeholder when nothing matches', () => {
    render(<Select label="Season" value="" placeholder="Pick one" onValueChange={vi.fn()} options={[{ value: 's1', label: 'Season 1' }]} />);
    expect(screen.getByRole('combobox')).toHaveTextContent('Pick one');
  });
});

describe('DataTable', () => {
  interface Row { id: string; name: string; wins: number }
  const rows: Row[] = [{ id: 'a', name: 'Edge', wins: 5 }, { id: 'b', name: 'Bandido', wins: 9 }];
  const columns: DataTableColumn<Row>[] = [
    { key: 'name', header: 'Name', render: (row) => row.name, sortValue: (row) => row.name },
    { key: 'wins', header: 'Wins', render: (row) => row.wins, align: 'end', sortValue: (row) => row.wins, hideOnMobile: true },
  ];
  const props = { columns, rowKey: (row: Row) => row.id, caption: 'Players' };

  function firstCells() {
    return within(screen.getByRole('table')).getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell')[0]?.textContent);
  }

  it('renders a captioned table in the given order', () => {
    render(<DataTable {...props} rows={rows} />);
    expect(screen.getByRole('table', { name: 'Players' })).toBeInTheDocument();
    expect(firstCells()).toEqual(['Edge', 'Bandido']);
  });

  it('sorts ascending, then descending, and reports aria-sort', async () => {
    const user = userEvent.setup();
    render(<DataTable {...props} rows={rows} />);

    await user.click(screen.getByRole('button', { name: 'Wins' }));
    expect(firstCells()).toEqual(['Edge', 'Bandido']);
    expect(screen.getByRole('columnheader', { name: 'Wins' })).toHaveAttribute('aria-sort', 'ascending');

    await user.click(screen.getByRole('button', { name: 'Wins' }));
    expect(firstCells()).toEqual(['Bandido', 'Edge']);
    expect(screen.getByRole('columnheader', { name: 'Wins' })).toHaveAttribute('aria-sort', 'descending');
  });

  describe('on a phone', () => {
    const realMatchMedia = window.matchMedia;

    beforeEach(() => {
      window.matchMedia = ((query: string) => ({
        ...realMatchMedia(query),
        matches: true,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      })) as typeof window.matchMedia;
    });

    afterEach(() => {
      window.matchMedia = realMatchMedia;
    });

    it('sorts from a Select, because the header row is hidden there', async () => {
      const user = userEvent.setup();
      render(<DataTable {...props} rows={rows} />);

      await user.click(screen.getByRole('combobox', { name: 'common.sortBy' }));
      // Options run Name then Wins; the test translator drops the column name.
      const descending = await screen.findAllByRole('option', { name: 'common.sortDescending' });
      await user.click(descending[1] as HTMLElement);

      await waitFor(() => expect(firstCells()).toEqual(['Bandido', 'Edge']));
    });

    it('offers no Select when nothing can be sorted', () => {
      render(<DataTable {...props} columns={[{ key: 'name', header: 'Name', render: (row) => row.name }]} rows={rows} />);
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    });
  });

  it('labels cells for the phone layout', () => {
    render(<DataTable {...props} rows={rows} />);
    const cell = screen.getByRole('cell', { name: '5' });
    expect(cell).toHaveAttribute('data-label', 'Wins');
    expect(cell).toHaveClass('ui-table__cell--desktop-only');
  });

  it('shows the empty node and the loading skeleton', () => {
    const { rerender } = render(<DataTable {...props} rows={[]} empty={<p>No players</p>} />);
    expect(screen.getByText('No players')).toBeInTheDocument();
    rerender(<DataTable {...props} rows={rows} loading />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('Podium', () => {
  const entries = ['Cody', 'Kenny', 'Edge', 'Hook'].map((name, index) => ({
    id: name,
    name,
    record: `${10 - index} - 0 - 0`,
    stats: [{ label: 'Win rate', value: '75%' }],
    to: `/player/${name}`,
  }));

  it('lists the top three in rank order', () => {
    render(<MemoryRouter><Podium entries={entries} label="Top three" /></MemoryRouter>);
    const items = within(screen.getByRole('list', { name: 'Top three' })).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Cody');
    expect(items[0]).toHaveClass('ui-podium__slot--first');
    expect(items[2]).toHaveTextContent('Edge');
    expect(screen.queryByText('Hook')).not.toBeInTheDocument();
  });

  it('handles fewer than three entries and custom labels', () => {
    render(<Podium entries={[{ id: 'a', name: 'Solo', record: '1 - 0 - 0', label: 'Champion' }]} label="Top" />);
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('Champion')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('SwipeRow', () => {
  it('renders every child as a slide in a labelled carousel', () => {
    const { container } = render(<SwipeRow label="Champions"><a href="/a">One</a><a href="/b">Two</a></SwipeRow>);
    expect(screen.getByRole('region', { name: 'Champions' })).toHaveAttribute('aria-roledescription', 'carousel');
    expect(container.querySelectorAll('.ui-swipe__slide')).toHaveLength(2);
  });
});

describe('Toast', () => {
  function Trigger() {
    const { showToast } = useToast();
    return <button onClick={() => showToast('Saved', 'success')}>Go</button>;
  }

  it('announces a message and can be dismissed', async () => {
    const user = userEvent.setup();
    render(<ToastProvider><Trigger /></ToastProvider>);

    await user.click(screen.getByRole('button', { name: 'Go' }));
    expect(within(screen.getByRole('status')).getByText('Saved')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'common.close' }));
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });

  it('expires on its own', () => {
    vi.useFakeTimers();
    render(<ToastProvider><Trigger /></ToastProvider>);

    act(() => screen.getByRole('button', { name: 'Go' }).click());
    expect(screen.getByText('Saved')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('is a no-op without a provider', () => {
    render(<Trigger />);
    expect(() => screen.getByRole('button', { name: 'Go' }).click()).not.toThrow();
  });
});
