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

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'auth.createAccount': 'Create Account',
        'auth.joinSubtitle': 'Join League SZN',
        'auth.email': 'Email',
        'auth.password': 'Password',
        'auth.confirmPassword': 'Confirm Password',
        'auth.enterEmail': 'Enter your email',
        'auth.passwordPlaceholder': 'Min 8 chars, uppercase, lowercase, number',
        'auth.enterConfirmPassword': 'Confirm your password',
        'auth.wrestlerName': 'Wrestler Name',
        'auth.wrestlerPlaceholder': 'Enter your in-game wrestler name',
        'auth.wrestlerHintRequired': 'The wrestler you\'ll be using in the league.',
        'auth.playerName': 'Player Name',
        'auth.playerNamePlaceholder': 'Enter your Discord name',
        'auth.playerNameHint': 'Your Discord username so other players can find you.',
        'auth.psnId': 'PSN ID',
        'auth.psnIdPlaceholder': 'Enter your PlayStation Network ID',
        'auth.createAccountBtn': 'Create Account',
        'auth.creatingAccount': 'Creating Account...',
        'auth.alreadyHaveAccount': 'Already have an account?',
        'auth.signInLink': 'Sign In',
        'auth.passwordsDoNotMatch': 'Passwords do not match',
        'auth.signUpFailed': 'Sign up failed. Please try again.',
        'auth.verifyTitle': 'Verify Your Email',
        'auth.verifySubtitle': 'We sent a verification code to',
        'auth.verificationCode': 'Verification Code',
        'auth.codePlaceholder': 'Enter 6-digit code',
        'auth.verifyEmail': 'Verify Email',
        'auth.verifying': 'Verifying...',
        'auth.backToSignUp': 'Back to sign up',
        'auth.verificationFailed': 'Verification failed. Please try again.',
      };
      return map[key] ?? key;
    },
  }),
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
  overrides: { email?: string; password?: string; confirm?: string; playerName?: string; psnId?: string; wrestlerName?: string } = {}
) {
  const email = overrides.email ?? 'new@league.com';
  const password = overrides.password ?? 'Password1';
  const confirm = overrides.confirm ?? password;
  const playerName = overrides.playerName ?? 'TestPlayer';
  const psnId = overrides.psnId ?? 'TestPSN123';
  const wrestlerName = overrides.wrestlerName ?? 'Stone Cold';

  await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Player Name'), playerName);
  await user.type(screen.getByLabelText('PSN ID'), psnId);
  await user.type(screen.getByLabelText('Wrestler Name'), wrestlerName);
  await user.type(screen.getByLabelText('Password'), password);
  await user.type(screen.getByLabelText('Confirm Password'), confirm);
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
    expect(screen.getByLabelText('Player Name')).toBeInTheDocument();
    expect(screen.getByLabelText('PSN ID')).toBeInTheDocument();
    expect(screen.getByLabelText('Wrestler Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument();
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

  it('calls signUp with correct args including required fields', async () => {
    const user = userEvent.setup();
    mockSignUp.mockResolvedValue({ isConfirmed: true });

    renderSignup();

    await fillAndSubmitSignupForm(user, {
      email: 'wrestler@league.com',
      password: 'StrongPw1',
      playerName: 'DiscordGuy',
      psnId: 'PSN_Player1',
      wrestlerName: 'The Undertaker',
    });

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith(
        'wrestler@league.com',
        'StrongPw1',
        { playerName: 'DiscordGuy', psnId: 'PSN_Player1', wrestlerName: 'The Undertaker' }
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
