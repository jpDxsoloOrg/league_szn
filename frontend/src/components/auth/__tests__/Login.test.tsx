import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';

// --- Hoisted mocks ---
const { mockSignIn, mockConfirmSignUp, mockResendConfirmationCode, mockNavigate } = vi.hoisted(() => ({
  mockSignIn: vi.fn(),
  mockConfirmSignUp: vi.fn(),
  mockResendConfirmationCode: vi.fn(),
  mockNavigate: vi.fn(),
}));

// Mock the cognito service so the test doesn't load aws-amplify; the
// component's `instanceof UnconfirmedUserError` check uses this same class.
vi.mock('../../../services/cognito', () => {
  class UnconfirmedUserError extends Error {
    constructor(message = 'Account not confirmed') {
      super(message);
      this.name = 'UnconfirmedUserError';
    }
  }
  return { UnconfirmedUserError };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'auth.signInTitle': 'Sign In',
        'auth.signInSubtitle': 'Sign in to access League SZN',
        'auth.email': 'Email',
        'auth.password': 'Password',
        'auth.enterEmail': 'Enter your email',
        'auth.enterPassword': 'Enter your password',
        'auth.signingIn': 'Signing in...',
        'auth.loginFailed': 'Login failed. Please try again.',
        'auth.noAccount': "Don't have an account?",
        'auth.signUpLink': 'Sign Up',
        'auth.devLoginTitle': 'Dev Login',
        'auth.devLoginSubtitle': 'Pick a role to sign in as (dev only)',
        'auth.signInAsAdmin': 'Sign in as Admin',
        'auth.loadingPlayers': 'Loading players...',
        'auth.noPlayersFound': 'No players found. Run seed data first.',
        'auth.verifyTitle': 'Verify Your Email',
        'auth.verifySubtitle': 'We sent a verification code to',
        'auth.verificationCode': 'Verification Code',
        'auth.codePlaceholder': 'Enter 6-digit code',
        'auth.verifyEmail': 'Verify Email',
        'auth.verifying': 'Verifying...',
        'auth.resendCode': "Didn't get a code? Send again",
        'auth.sendingCode': 'Sending...',
        'auth.backToSignIn': 'Back to Sign In',
        'auth.unconfirmedNotice': "Your account hasn't been verified yet.",
        'auth.codeResent': 'A new verification code has been sent to your email.',
        'auth.verificationFailed': 'Verification failed. Please try again.',
      };
      return map[key] ?? key;
    },
  }),
}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    signIn: mockSignIn,
    confirmSignUp: mockConfirmSignUp,
    resendConfirmationCode: mockResendConfirmationCode,
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
import { UnconfirmedUserError } from '../../../services/cognito';

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

  describe('unconfirmed account flow', () => {
    async function signInUnconfirmed(user: ReturnType<typeof userEvent.setup>) {
      mockSignIn.mockRejectedValueOnce(new UnconfirmedUserError());
      await user.type(screen.getByLabelText('Email'), 'new@league.com');
      await user.type(screen.getByLabelText('Password'), 'securePass1');
      await user.click(screen.getByRole('button', { name: 'Sign In' }));
      await waitFor(() => {
        expect(screen.getByText('Verify Your Email')).toBeInTheDocument();
      });
    }

    it('switches to the confirmation screen when sign-in reports an unconfirmed account', async () => {
      const user = userEvent.setup();
      renderLogin();

      await signInUnconfirmed(user);

      expect(screen.getByLabelText('Verification Code')).toBeInTheDocument();
      expect(screen.getByText("Your account hasn't been verified yet.")).toBeInTheDocument();
      // Not treated as a login failure
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('resends the confirmation code and shows a confirmation notice', async () => {
      const user = userEvent.setup();
      mockResendConfirmationCode.mockResolvedValue(undefined);
      renderLogin();

      await signInUnconfirmed(user);
      await user.click(screen.getByRole('button', { name: "Didn't get a code? Send again" }));

      await waitFor(() => {
        expect(mockResendConfirmationCode).toHaveBeenCalledWith('new@league.com');
        expect(
          screen.getByText('A new verification code has been sent to your email.')
        ).toBeInTheDocument();
      });
    });

    it('confirms the code, signs in with the original credentials, and navigates to welcome', async () => {
      const user = userEvent.setup();
      mockConfirmSignUp.mockResolvedValue(true);
      renderLogin();

      await signInUnconfirmed(user);

      mockSignIn.mockResolvedValueOnce(undefined);
      await user.type(screen.getByLabelText('Verification Code'), '123456');
      await user.click(screen.getByRole('button', { name: 'Verify Email' }));

      await waitFor(() => {
        expect(mockConfirmSignUp).toHaveBeenCalledWith('new@league.com', '123456');
        expect(mockSignIn).toHaveBeenLastCalledWith('new@league.com', 'securePass1');
        expect(mockNavigate).toHaveBeenCalledWith('/welcome');
      });
    });

    it('shows an error when the confirmation code is rejected', async () => {
      const user = userEvent.setup();
      mockConfirmSignUp.mockRejectedValue(new Error('Invalid verification code'));
      renderLogin();

      await signInUnconfirmed(user);

      await user.type(screen.getByLabelText('Verification Code'), '000000');
      await user.click(screen.getByRole('button', { name: 'Verify Email' }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Invalid verification code');
      });
    });

    it('returns to the login form via back to sign in', async () => {
      const user = userEvent.setup();
      renderLogin();

      await signInUnconfirmed(user);
      await user.click(screen.getByRole('button', { name: 'Back to Sign In' }));

      expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
    });
  });
});
