import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// --- Hoisted mocks ---
const { mockUseAuth } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: mockUseAuth,
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

import ProtectedRoute from '../ProtectedRoute';

function renderProtectedRoute(
  props: { requiredRole?: string; fallback?: string } = {}
) {
  return render(
    <MemoryRouter>
      <ProtectedRoute {...(props as any)}>
        <div data-testid="protected-content">Secret Content</div>
      </ProtectedRoute>
    </MemoryRouter>
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders children when authenticated with the correct role', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      hasRole: () => true,
    });

    renderProtectedRoute({ requiredRole: 'Admin' });

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    expect(screen.getByText('Secret Content')).toBeInTheDocument();
  });

  it('redirects to login when not authenticated', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      hasRole: () => false,
    });

    renderProtectedRoute();

    expect(screen.getByTestId('navigate')).toHaveAttribute('data-to', '/login');
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  it('shows access denied when authenticated but lacking the required role', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      hasRole: (role: string) => role !== 'Admin',
    });

    renderProtectedRoute({ requiredRole: 'Admin' });

    expect(screen.getByText('Access Denied')).toBeInTheDocument();
    expect(screen.getByText("You don't have permission to view this page.")).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  it('shows loading state while auth check is in progress', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
      hasRole: () => false,
    });

    renderProtectedRoute();

    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    expect(screen.queryByTestId('navigate')).not.toBeInTheDocument();
  });
});
