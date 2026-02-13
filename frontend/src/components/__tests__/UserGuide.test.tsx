import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// --- Hoisted mocks ---
const { mockUseAuth } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: mockUseAuth,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import UserGuide from '../UserGuide';

describe('UserGuide', () => {
  it('renders guide content with all public sections and translation keys', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isWrestler: false,
      isFantasy: false,
    });

    render(<UserGuide />);

    // Title
    expect(screen.getByText('userGuide.title')).toBeInTheDocument();
    // Intro
    expect(screen.getByText('userGuide.intro')).toBeInTheDocument();

    // Public sections
    expect(screen.getByText('userGuide.standingsSection.title')).toBeInTheDocument();
    expect(screen.getByText('userGuide.seasonsSection.title')).toBeInTheDocument();
    expect(screen.getByText('userGuide.divisionsSection.title')).toBeInTheDocument();
    expect(screen.getByText('userGuide.championshipsSection.title')).toBeInTheDocument();
    expect(screen.getByText('userGuide.matchesSection.title')).toBeInTheDocument();
    expect(screen.getByText('userGuide.eventsSection.title')).toBeInTheDocument();
    expect(screen.getByText('userGuide.tournamentsSection.title')).toBeInTheDocument();
    expect(screen.getByText('userGuide.contendersSection.title')).toBeInTheDocument();
    expect(screen.getByText('userGuide.tipsSection.title')).toBeInTheDocument();

    // Wrestler/Fantasy sections should NOT be visible when not authenticated
    expect(screen.queryByText('userGuide.profileSection.title')).not.toBeInTheDocument();
    expect(screen.queryByText('userGuide.fantasySection.title')).not.toBeInTheDocument();
  });

  it('shows wrestler profile section when authenticated as wrestler', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isWrestler: true,
      isFantasy: false,
    });

    render(<UserGuide />);

    expect(screen.getByText('userGuide.profileSection.title')).toBeInTheDocument();
    expect(screen.queryByText('userGuide.fantasySection.title')).not.toBeInTheDocument();
  });

  it('shows fantasy section when authenticated with fantasy role', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isWrestler: false,
      isFantasy: true,
    });

    render(<UserGuide />);

    expect(screen.getByText('userGuide.fantasySection.title')).toBeInTheDocument();
    expect(screen.queryByText('userGuide.profileSection.title')).not.toBeInTheDocument();
  });
});
