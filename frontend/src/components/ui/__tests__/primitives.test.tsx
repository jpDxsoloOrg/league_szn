import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import Avatar from '../Avatar';
import Badge from '../Badge';
import Button from '../Button';
import Card from '../Card';
import EmptyState from '../EmptyState';
import FormDots from '../FormDots';
import PageHeader from '../PageHeader';
import PhotoTile from '../PhotoTile';

describe('Button', () => {
  it('defaults to type button and handles clicks', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveAttribute('type', 'button');
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('is disabled and busy while loading', () => {
    render(<Button loading>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('renders a router link when given to', () => {
    render(<MemoryRouter><Button to="/events" variant="secondary">Events</Button></MemoryRouter>);
    const link = screen.getByRole('link', { name: 'Events' });
    expect(link).toHaveAttribute('href', '/events');
    expect(link).toHaveClass('ui-btn--secondary');
  });

  it('does not render a live link when disabled', () => {
    render(<MemoryRouter><Button to="/events" disabled>Events</Button></MemoryRouter>);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();
  });
});

describe('Card', () => {
  it('renders children with its variant', () => {
    render(<Card variant="raised" data-testid="card">Body</Card>);
    expect(screen.getByTestId('card')).toHaveClass('ui-card--raised');
  });

  it('becomes a link with to', () => {
    render(<MemoryRouter><Card to="/standings">Body</Card></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Body' })).toHaveAttribute('href', '/standings');
  });
});

describe('Badge', () => {
  it('applies the tone', () => {
    render(<Badge tone="win">Won</Badge>);
    expect(screen.getByText('Won')).toHaveClass('ui-badge--win');
  });

  it('adds a dot only for live', () => {
    const { container, rerender } = render(<Badge tone="live">Live</Badge>);
    expect(container.querySelector('.ui-badge__dot')).toBeInTheDocument();
    rerender(<Badge>Plain</Badge>);
    expect(container.querySelector('.ui-badge__dot')).not.toBeInTheDocument();
  });
});

describe('Avatar', () => {
  it('shows the image with alt text', () => {
    render(<Avatar src="/a.png" name="Cody Rhodes" />);
    expect(screen.getByRole('img', { name: 'Cody Rhodes' })).toHaveAttribute('src', '/a.png');
  });

  it('falls back to initials without an image', () => {
    render(<Avatar name="Cody Rhodes" />);
    expect(screen.getByText('CR')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Cody Rhodes' })).toBeInTheDocument();
  });

  it('falls back to initials when the image fails', () => {
    render(<Avatar src="/broken.png" name="Edge" />);
    fireEvent.error(screen.getByRole('img', { name: 'Edge' }));
    expect(screen.getByText('E')).toBeInTheDocument();
  });
});

describe('PageHeader', () => {
  it('renders an h1 with eyebrow, subtitle and actions', () => {
    render(<PageHeader title="Standings" eyebrow="Season 1" subtitle="All players" actions={<button>Filter</button>} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Standings' })).toBeInTheDocument();
    expect(screen.getByText('Season 1')).toBeInTheDocument();
    expect(screen.getByText('All players')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filter' })).toBeInTheDocument();
  });
});

describe('EmptyState', () => {
  it('works without a description', () => {
    render(<EmptyState title="Nothing here" />);
    expect(screen.getByRole('status', { name: 'Nothing here' })).toBeInTheDocument();
  });

  it('runs its action', async () => {
    const onAction = vi.fn();
    render(<EmptyState title="Nothing" description="Try again" actionLabel="Retry" onAction={onAction} />);
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onAction).toHaveBeenCalledOnce();
  });
});

describe('FormDots', () => {
  it('renders a dot per result with a text alternative', () => {
    const { container } = render(<FormDots results={['W', 'L', 'D']} />);
    expect(container.querySelectorAll('.ui-form-dots__dot')).toHaveLength(3);
    expect(screen.getByRole('img')).toHaveAccessibleName('ui.formDots.label: ui.formDots.win, ui.formDots.loss, ui.formDots.draw');
  });
});

describe('PhotoTile', () => {
  it('renders text, accent and link', () => {
    render(<MemoryRouter><PhotoTile title="Edge" eyebrow="World" meta="214 days" accent="world" to="/championships" /></MemoryRouter>);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/championships');
    expect(link).toHaveClass('ui-tile--world');
    expect(link).toHaveTextContent('World');
    expect(link).toHaveTextContent('214 days');
  });

  it('drops a broken image and keeps the text', () => {
    const { container } = render(<PhotoTile title="Edge" imageUrl="/broken.png" />);
    const image = container.querySelector('img');
    expect(image).toBeInTheDocument();
    fireEvent.error(image as HTMLImageElement);
    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(screen.getByText('Edge')).toBeInTheDocument();
  });
});
