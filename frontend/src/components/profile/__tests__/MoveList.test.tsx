import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { name?: string }) => (opts?.name ? `${key}:${opts.name}` : key),
  }),
}));

vi.mock('../MoveList.css', () => ({}));

import MoveList from '../MoveList';

describe('MoveList', () => {
  it('renders nothing for an empty list without emptyText', () => {
    const { container } = render(<MoveList title="Finishers" moves={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders emptyText for an empty list when given', () => {
    render(<MoveList title="Finishers" moves={undefined} emptyText="Nothing yet" />);
    expect(screen.getByText('Nothing yet')).toBeInTheDocument();
  });

  it('shows the custom name with the in-game name beneath when they differ', () => {
    render(
      <MoveList
        title="Signatures"
        moves={[
          { gameName: 'Cody Cutter', customName: 'The Cutter' },
          { gameName: 'Disaster Kick', customName: '' },
        ]}
      />,
    );
    expect(screen.getByText('The Cutter')).toBeInTheDocument();
    expect(screen.getByText('profile.moves.inGame:Cody Cutter')).toBeInTheDocument();
    expect(screen.getByText('Disaster Kick')).toBeInTheDocument();
    expect(screen.queryByText('profile.moves.inGame:Disaster Kick')).not.toBeInTheDocument();
  });
});
