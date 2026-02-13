import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';

// --- Hoisted mocks ---
const { mockSignIn, mockNavigate } = vi.hoisted(() => ({
  mockSignIn: vi.fn(),
  mockNavigate: vi.fn(),
}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    signIn: mockSignIn,
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import Login from '../Login';

function renderLogin() {
  return render(
    <BrowserRouter>
      <Login />
    </BrowserRouter>
  );
}

describe('Login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders form with email and password fields and submit button', () => {
    renderLogin();

    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
    expect(screen.getByText('Sign in to access League SZN')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign Up' })).toHaveAttribute('href', '/signup');
  });

  it('shows loading state while sign-in is in progress', async () => {
    const user = userEvent.setup();
    // signIn never resolves during this test
    mockSignIn.mockReturnValue(new Promise(() => {}));

    renderLogin();

    await user.type(screen.getByLabelText('Email'), 'test@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));

    expect(screen.getByRole('button', { name: 'Signing in...' })).toBeDisabled();
  });

  it('displays error message when sign-in fails', async () => {
    const user = userEvent.setup();
    mockSignIn.mockRejectedValue(new Error('Invalid credentials'));

    renderLogin();

    await user.type(screen.getByLabelText('Email'), 'test@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrongpass');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid credentials');
    });
    // Button should be re-enabled after failure
    expect(screen.getByRole('button', { name: 'Sign In' })).not.toBeDisabled();
  });

  it('calls signIn with the entered email and password', async () => {
    const user = userEvent.setup();
    mockSignIn.mockResolvedValue(undefined);

    renderLogin();

    await user.type(screen.getByLabelText('Email'), 'user@league.com');
    await user.type(screen.getByLabelText('Password'), 'securePass1');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('user@league.com', 'securePass1');
    });
  });

  it('navigates to home on successful sign-in', async () => {
    const user = userEvent.setup();
    mockSignIn.mockResolvedValue(undefined);

    renderLogin();

    await user.type(screen.getByLabelText('Email'), 'user@league.com');
    await user.type(screen.getByLabelText('Password'), 'securePass1');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });
});
