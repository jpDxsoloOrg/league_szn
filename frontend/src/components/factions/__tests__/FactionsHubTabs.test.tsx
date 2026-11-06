import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { mockUseAuth } = vi.hoisted(() => ({ mockUseAuth: vi.fn() }));

vi.mock('../../../contexts/AuthContext', () => ({ useAuth: mockUseAuth }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key }),
}));

import FactionsHubTabs from '../FactionsHubTabs';

function renderTabs(hasWrestlerRole: boolean) {
  mockUseAuth.mockReturnValue({ hasRole: (role: string) => role === 'Wrestler' && hasWrestlerRole });
  render(<MemoryRouter><FactionsHubTabs /></MemoryRouter>);
}

describe('FactionsHubTabs', () => {
  it('leaves the private tab out for anyone the route would turn away', () => {
    renderTabs(false);

    expect(screen.getByRole('link', { name: 'All Factions' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Standings' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'My Faction' })).not.toBeInTheDocument();
  });

  it('keeps the private tab for roles the route lets in', () => {
    renderTabs(true);

    expect(screen.getByRole('link', { name: 'My Faction' })).toHaveAttribute('href', '/my-faction');
  });
});
