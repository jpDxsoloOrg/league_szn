import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';

// --- Hoisted mocks ---
const { mockSignUp, mockConfirmSignUp, mockNavigate } = vi.hoisted(() => ({
  mockSignUp: vi.fn(),
  mockConfirmSignUp: vi.fn(),
  mockNavigate: vi.fn(),
}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    signUp: mockSignUp,
    confirmSignUp: mockConfirmSignUp,
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import Signup from '../Signup';

function renderSignup() {
  return render(
    <BrowserRouter>
      <Signup />
    </BrowserRouter>
  );
}

/** Fill the signup form with valid data and submit */
async function fillAndSubmitSignupForm(
  user: ReturnType<typeof userEvent.setup>,
  overrides: { email?: string; password?: string; confirm?: string; wrestlerName?: string } = {}
) {
  const email = overrides.email ?? 'new@league.com';
  const password = overrides.password ?? 'Password1';
  const confirm = overrides.confirm ?? password;

  await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), password);
  await user.type(screen.getByLabelText('Confirm Password'), confirm);
  if (overrides.wrestlerName) {
    await user.type(screen.getByLabelText(/Wrestler Name/), overrides.wrestlerName);
  }
  await user.click(screen.getByRole('button', { name: 'Create Account' }));
}

describe('Signup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders signup form with all required fields', () => {
    renderSignup();

    expect(screen.getByRole('heading', { name: 'Create Account' })).toBeInTheDocument();
    expect(screen.getByText('Join League SZN')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument();
    expect(screen.getByLabelText(/Wrestler Name/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Account' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign In' })).toHaveAttribute('href', '/login');
  });

  it('shows validation error when passwords do not match', async () => {
    const user = userEvent.setup();

    renderSignup();

    await fillAndSubmitSignupForm(user, {
      password: 'Password1',
      confirm: 'DifferentPw2',
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Passwords do not match');
    });
    // signUp should NOT have been called
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('calls signUp with correct args including optional wrestler name', async () => {
    const user = userEvent.setup();
    mockSignUp.mockResolvedValue({ isConfirmed: true });

    renderSignup();

    await fillAndSubmitSignupForm(user, {
      email: 'wrestler@league.com',
      password: 'StrongPw1',
      wrestlerName: 'The Undertaker',
    });

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith(
        'wrestler@league.com',
        'StrongPw1',
        { wrestlerName: 'The Undertaker' }
      );
    });
  });

  it('transitions to verification code step when signup requires confirmation', async () => {
    const user = userEvent.setup();
    mockSignUp.mockResolvedValue({ isConfirmed: false });

    renderSignup();

    await fillAndSubmitSignupForm(user, { email: 'verify@league.com' });

    // Should now show the verification form
    await waitFor(() => {
      expect(screen.getByText('Verify Your Email')).toBeInTheDocument();
    });
    expect(screen.getByText(/verify@league.com/)).toBeInTheDocument();
    expect(screen.getByLabelText('Verification Code')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verify Email' })).toBeInTheDocument();

    // Submit the verification code
    mockConfirmSignUp.mockResolvedValue(true);
    await user.type(screen.getByLabelText('Verification Code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify Email' }));

    await waitFor(() => {
      expect(mockConfirmSignUp).toHaveBeenCalledWith('verify@league.com', '123456');
      expect(mockNavigate).toHaveBeenCalledWith('/login');
    });
  });

  it('shows error message when signUp fails', async () => {
    const user = userEvent.setup();
    mockSignUp.mockRejectedValue(new Error('Email already exists'));

    renderSignup();

    await fillAndSubmitSignupForm(user);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Email already exists');
    });
    // Button should be re-enabled
    expect(screen.getByRole('button', { name: 'Create Account' })).not.toBeDisabled();
  });
});
