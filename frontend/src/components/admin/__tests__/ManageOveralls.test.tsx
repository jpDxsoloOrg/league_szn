import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const { mockGetAllOveralls } = vi.hoisted(() => ({ mockGetAllOveralls: vi.fn() }));

vi.mock('react-i18next', async () => (await import('./i18nMock')).i18nMock);
vi.mock('../../../services/api', () => ({ overallsApi: { getAllOveralls: mockGetAllOveralls } }));

import ManageOveralls from '../ManageOveralls';

const entry = (playerId: string, playerName: string, wrestlerName: string) => ({
  playerId, playerName, wrestlerName, mainOverall: 80, updatedAt: '2026-01-01T00:00:00.000Z', submittedAt: '2026-01-01T00:00:00.000Z',
});

describe('ManageOveralls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks a player with no wrestler instead of showing the placeholder or a blank cell', async () => {
    mockGetAllOveralls.mockResolvedValue([
      entry('p1', 'Alex', 'The Rock'),
      entry('p2', 'Waiting', 'Needs Wrestler'),
      entry('p3', 'Blank', ''),
    ]);
    render(<ManageOveralls />);

    expect(await screen.findByText('The Rock')).toBeInTheDocument();
    expect(screen.getAllByText('Hidden')).toHaveLength(2);
    expect(screen.queryByText('Needs Wrestler')).not.toBeInTheDocument();
  });
});
