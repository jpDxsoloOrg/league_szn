import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// --- Hoisted mocks ---
const { mockUseAuth } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
}));
const { mockUseSiteConfig } = vi.hoisted(() => ({
  mockUseSiteConfig: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: mockUseAuth,
}));

vi.mock('../../contexts/SiteConfigContext', () => ({
  useSiteConfig: () => mockUseSiteConfig(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import UserGuide from '../UserGuide';

describe('UserGuide', () => {
  beforeEach(() => {
    mockUseSiteConfig.mockReturnValue({
      features: {
        challenges: true,
        promos: true,
        fantasy: true,
        contenders: true,
        statistics: true,
      },
    });
  });

  it('renders guide content with all public sections and translation keys', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isWrestler: false,
      isFantasy: false,
    });

    render(
      <MemoryRouter>
        <UserGuide />
      </MemoryRouter>
    );

    // Title
    expect(screen.getByText('userGuide.title')).toBeInTheDocument();
    // Intro
    expect(screen.getByText('userGuide.intro')).toBeInTheDocument();

    // Wiki entry point
    const wikiLink = screen.getByRole('link', { name: 'userGuide.wikiLink' });
    expect(wikiLink).toBeInTheDocument();
    expect(wikiLink).toHaveAttribute('href', '/guide/wiki');

    // TOC
    expect(screen.getByText('userGuide.toc.title')).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'userGuide.toc.ariaLabel' });
    expect(nav).toBeInTheDocument();
    expect(nav.querySelectorAll('a[href^="#"]').length).toBeGreaterThan(0);

    // Public sections
    expect(screen.getByText('userGuide.standingsSection.title')).toBeInTheDocument();
    expect(screen.getByText('userGuide.seasonsSection.title')).toBeInTheDocument();
    expect(screen.getByText('userGuide.divisionsSection.title')).toBeInTheDocument();
    expect(screen.getByText('userGuide.championshipsSection.title')).toBeInTheDocument();
    expect(screen.getByText('userGuide.eventsSection.title')).toBeInTheDocument();
    expect(screen.getByText('userGuide.tournamentsSection.title')).toBeInTheDocument();
    expect(screen.getByText('userGuide.contendersSection.title')).toBeInTheDocument();
    expect(screen.getByText('userGuide.tipsSection.title')).toBeInTheDocument();

    // Wrestler/Fantasy sections should NOT be visible when not authenticated
    expect(screen.queryByText('userGuide.profileSection.title')).not.toBeInTheDocument();
    expect(screen.queryByText('userGuide.fantasySection.title')).not.toBeInTheDocument();

    // Challenges and Promos visible when features are enabled (even when not wrestler)
    expect(screen.getByText('userGuide.challengesSection.title')).toBeInTheDocument();
    expect(screen.getByText('userGuide.promosSection.title')).toBeInTheDocument();
  });

  it('shows wrestler profile section when authenticated as wrestler', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isWrestler: true,
      isFantasy: false,
    });

    render(
      <MemoryRouter>
        <UserGuide />
      </MemoryRouter>
    );

    expect(screen.getByText('userGuide.profileSection.title')).toBeInTheDocument();
    expect(screen.getByText('userGuide.challengesSection.title')).toBeInTheDocument();
    expect(screen.getByText('userGuide.promosSection.title')).toBeInTheDocument();
    expect(screen.queryByText('userGuide.fantasySection.title')).not.toBeInTheDocument();
  });

  it('shows fantasy section when authenticated with fantasy role', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isWrestler: false,
      isFantasy: true,
    });

    render(
      <MemoryRouter>
        <UserGuide />
      </MemoryRouter>
    );

    expect(screen.getByText('userGuide.fantasySection.title')).toBeInTheDocument();
    expect(screen.queryByText('userGuide.profileSection.title')).not.toBeInTheDocument();
  });

  it('hides Challenges and Promos sections when features are disabled', () => {
    mockUseSiteConfig.mockReturnValue({
      features: {
        challenges: false,
        promos: false,
        fantasy: true,
        contenders: true,
        statistics: true,
      },
    });
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isWrestler: false,
      isFantasy: false,
    });

    render(
      <MemoryRouter>
        <UserGuide />
      </MemoryRouter>
    );

    expect(screen.queryByText('userGuide.challengesSection.title')).not.toBeInTheDocument();
    expect(screen.queryByText('userGuide.promosSection.title')).not.toBeInTheDocument();
  });
});
