import { useState, useEffect, FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { Location } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { UnconfirmedUserError } from '../../services/cognito';
import { playersApi } from '../../services/api';
import type { Player } from '../../types';
import Button from '../ui/Button';
import Card from '../ui/Card';
import AuthLayout from './AuthLayout';

function DevLogin() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { devSignIn } = useAuth();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(true);

  useEffect(() => {
    playersApi.getAll()
      .then(setPlayers)
      .catch(() => setPlayers([]))
      .finally(() => setLoadingPlayers(false));
  }, []);

  if (!devSignIn) return null;

  const handleDevLogin = (player: Player) => {
    devSignIn(player);
    navigate('/profile');
  };

  const handleDevAdminLogin = () => {
    devSignIn({ playerId: 'dev-admin', name: 'Dev Admin' }, ['Admin']);
    navigate('/');
  };

  return (
    <Card padding="md" className="auth-dev">
      <h2 className="auth-dev__title">{t('auth.devLoginTitle')}</h2>
      <p className="me-hint">{t('auth.devLoginSubtitle')}</p>

      <div className="auth-dev__list">
        <Button variant="danger" fullWidth onClick={handleDevAdminLogin}>
          {t('auth.signInAsAdmin')}
        </Button>

        {loadingPlayers ? (
          <p className="me-hint">{t('auth.loadingPlayers')}</p>
        ) : players.length === 0 ? (
          <p className="me-hint">{t('auth.noPlayersFound')}</p>
        ) : (
          players.map((p) => (
            <Button key={p.playerId} variant="secondary" fullWidth onClick={() => handleDevLogin(p)}>
              {p.name} — {p.currentWrestler}
            </Button>
          ))
        )}
      </div>
    </Card>
  );
}

/** Where a guarded route sent the visitor from, as a path. Defaults to home. */
function getReturnPath(state: unknown): string {
  const from = (state as { from?: Partial<Location> } | null)?.from;
  if (!from?.pathname) return '/';
  return `${from.pathname}${from.search ?? ''}${from.hash ?? ''}`;
}

export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, confirmSignUp, resendConfirmationCode } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'login' | 'confirm'>('login');
  const [verificationCode, setVerificationCode] = useState('');
  const [info, setInfo] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await signIn(email, password);
      navigate(getReturnPath(location.state), { replace: true });
    } catch (err) {
      if (err instanceof UnconfirmedUserError) {
        // The account exists but the email was never verified — move the
        // user into the confirmation flow instead of dead-ending on an error.
        setStep('confirm');
        setInfo(t('auth.unconfirmedNotice'));
      } else {
        const message = err instanceof Error ? err.message : t('auth.loginFailed');
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    try {
      await confirmSignUp(email, verificationCode);
      // Email verified — complete the sign-in they originally asked for.
      await signIn(email, password);
      navigate('/welcome');
    } catch (err) {
      const message = err instanceof Error ? err.message : t('auth.verificationFailed');
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError(null);
    setInfo(null);
    setResending(true);

    try {
      await resendConfirmationCode(email);
      setInfo(t('auth.codeResent'));
    } catch (err) {
      const message = err instanceof Error ? err.message : t('auth.loginFailed');
      setError(message);
    } finally {
      setResending(false);
    }
  };

  if (step === 'confirm') {
    return (
      <AuthLayout
        title={t('auth.verifyTitle')}
        subtitle={<>{t('auth.verifySubtitle')} <strong>{email}</strong></>}
      >
        <form onSubmit={handleConfirm} aria-describedby={error ? 'confirm-error' : undefined}>
          <div className="me-field">
            <label htmlFor="code">{t('auth.verificationCode')}</label>
            <input
              type="text"
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
              placeholder={t('auth.codePlaceholder')}
              required
              autoFocus
              aria-invalid={error ? 'true' : undefined}
            />
          </div>

          {info && (
            <div className="me-alert me-alert--success" role="status" aria-live="polite">
              {info}
            </div>
          )}
          {error && (
            <div id="confirm-error" className="me-alert me-alert--error" role="alert" aria-live="polite">
              {error}
            </div>
          )}

          <Button type="submit" fullWidth loading={loading} disabled={resending}>
            {loading ? t('auth.verifying') : t('auth.verifyEmail')}
          </Button>
        </form>

        <div className="auth-footer">
          <button type="button" className="auth-link" onClick={handleResend} disabled={loading || resending}>
            {resending ? t('auth.sendingCode') : t('auth.resendCode')}
          </button>
          <button
            type="button"
            className="auth-link"
            onClick={() => {
              setStep('login');
              setVerificationCode('');
              setError(null);
              setInfo(null);
            }}
          >
            {t('auth.backToSignIn')}
          </button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={t('auth.signInTitle')}
      subtitle={t('auth.signInSubtitle')}
      after={import.meta.env.DEV ? <DevLogin /> : undefined}
    >
      <form onSubmit={handleSubmit} aria-describedby={error ? 'login-error' : undefined}>
        <div className="me-field">
          <label htmlFor="email">{t('auth.email')}</label>
          <input
            type="email"
            id="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('auth.enterEmail')}
            required
            autoFocus
            aria-invalid={error ? 'true' : undefined}
          />
        </div>

        <div className="me-field">
          <label htmlFor="password">{t('auth.password')}</label>
          <input
            type="password"
            id="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('auth.enterPassword')}
            required
            minLength={8}
            aria-invalid={error ? 'true' : undefined}
          />
        </div>

        {error && (
          <div id="login-error" className="me-alert me-alert--error" role="alert" aria-live="polite">
            {error}
          </div>
        )}

        <Button type="submit" fullWidth loading={loading}>
          {loading ? t('auth.signingIn') : t('auth.signInTitle')}
        </Button>
      </form>

      <div className="auth-footer">
        <p>
          <Link to="/forgot-password">{t('auth.forgotPasswordLink')}</Link>
        </p>
        <p>
          {t('auth.noAccount')}{' '}
          <Link to="/signup">{t('auth.signUpLink')}</Link>
        </p>
      </div>
    </AuthLayout>
  );
}
