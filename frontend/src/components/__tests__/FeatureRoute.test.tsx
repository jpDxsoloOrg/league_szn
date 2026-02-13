import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// --- Hoisted mocks ---
const { mockUseSiteConfig } = vi.hoisted(() => ({
  mockUseSiteConfig: vi.fn(),
}));

vi.mock('../../contexts/SiteConfigContext', () => ({
  useSiteConfig: mockUseSiteConfig,
}));

// Mock Navigate so we can assert redirect targets
const { mockNavigate } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    Navigate: (props: { to: string; replace?: boolean }) => {
      mockNavigate(props);
      return <div data-testid="navigate" data-to={props.to} />;
    },
  };
});

// Must import AFTER vi.mock calls are hoisted
import FeatureRoute from '../FeatureRoute';

const ALL_FEATURES_ENABLED = {
  fantasy: true,
  challenges: true,
  promos: true,
  contenders: true,
  statistics: true,
};

function renderFeatureRoute(feature: string) {
  return render(
    <MemoryRouter>
      <FeatureRoute feature={feature as any}>
        <div data-testid="feature-content">Feature Page</div>
      </FeatureRoute>
    </MemoryRouter>
  );
}

describe('FeatureRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders children when the feature is enabled', () => {
    mockUseSiteConfig.mockReturnValue({
      features: ALL_FEATURES_ENABLED,
      isLoading: false,
    });

    renderFeatureRoute('challenges');

    expect(screen.getByTestId('feature-content')).toBeInTheDocument();
    expect(screen.getByText('Feature Page')).toBeInTheDocument();
  });

  it('redirects to home when the feature is disabled', () => {
    mockUseSiteConfig.mockReturnValue({
      features: { ...ALL_FEATURES_ENABLED, fantasy: false },
      isLoading: false,
    });

    renderFeatureRoute('fantasy');

    expect(screen.getByTestId('navigate')).toHaveAttribute('data-to', '/');
    expect(screen.queryByTestId('feature-content')).not.toBeInTheDocument();
  });

  it('shows loading state while site config is being fetched', () => {
    mockUseSiteConfig.mockReturnValue({
      features: ALL_FEATURES_ENABLED,
      isLoading: true,
    });

    renderFeatureRoute('promos');

    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByTestId('feature-content')).not.toBeInTheDocument();
    expect(screen.queryByTestId('navigate')).not.toBeInTheDocument();
  });
});
