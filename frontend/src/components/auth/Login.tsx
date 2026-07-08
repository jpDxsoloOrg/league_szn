import { useState, useEffect, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { UnconfirmedUserError } from '../../services/cognito';
import { playersApi } from '../../services/api';
import type { Player } from '../../types';
import './Auth.css';

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
    <div className="auth-card" style={{ marginTop: '1rem', border: '2px dashed #f59e0b' }}>
      <h3 style={{ color: '#f59e0b' }}>{t('auth.devLoginTitle')}</h3>
      <p className="auth-subtitle">{t('auth.devLoginSubtitle')}</p>

      <button
        onClick={handleDevAdminLogin}
        className="btn-submit"
        style={{ textAlign: 'left', marginBottom: '1rem', backgroundColor: '#dc2626' }}
      >
        {t('auth.signInAsAdmin')}
      </button>

      {loadingPlayers ? (
        <p>{t('auth.loadingPlayers')}</p>
      ) : players.length === 0 ? (
        <p>{t('auth.noPlayersFound')}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {players.map((p) => (
            <button
              key={p.playerId}
              onClick={() => handleDevLogin(p)}
              className="btn-submit"
              style={{ textAlign: 'left' }}
            >
              {p.name} — {p.currentWrestler}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
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
      navigate('/');
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
      <div className="auth-container">
        <div className="auth-card">
          <h2>{t('auth.verifyTitle')}</h2>
          <p className="auth-subtitle">
            {t('auth.verifySubtitle')} <strong>{email}</strong>
          </p>

          <form onSubmit={handleConfirm} aria-describedby={error ? 'confirm-error' : undefined}>
            <div className="form-group">
              <label htmlFor="code">{t('auth.verificationCode')}</label>
              <input
                type="text"
                id="code"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                placeholder={t('auth.codePlaceholder')}
                required
                autoFocus
                aria-invalid={error ? 'true' : undefined}
              />
            </div>

            {info && (
              <div className="success-message" role="status" aria-live="polite">
                {info}
              </div>
            )}
            {error && (
              <div id="confirm-error" className="error-message" role="alert" aria-live="polite">
                {error}
              </div>
            )}

            <button type="submit" className="btn-submit" disabled={loading || resending} aria-busy={loading}>
              {loading ? t('auth.verifying') : t('auth.verifyEmail')}
            </button>
          </form>

          <div className="auth-footer">
            <p>
              <button
                className="link-button"
                onClick={handleResend}
                disabled={loading || resending}
              >
                {resending ? t('auth.sendingCode') : t('auth.resendCode')}
              </button>
            </p>
            <p>
              <button
                className="link-button"
                onClick={() => {
                  setStep('login');
                  setVerificationCode('');
                  setError(null);
                  setInfo(null);
                }}
              >
                {t('auth.backToSignIn')}
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>{t('auth.signInTitle')}</h2>
        <p className="auth-subtitle">{t('auth.signInSubtitle')}</p>

        <form onSubmit={handleSubmit} aria-describedby={error ? 'login-error' : undefined}>
          <div className="form-group">
            <label htmlFor="email">{t('auth.email')}</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('auth.enterEmail')}
              required
              autoFocus
              aria-invalid={error ? 'true' : undefined}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">{t('auth.password')}</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('auth.enterPassword')}
              required
              minLength={8}
              aria-invalid={error ? 'true' : undefined}
            />
          </div>

          {error && (
            <div id="login-error" className="error-message" role="alert" aria-live="polite">
              {error}
            </div>
          )}

          <button type="submit" className="btn-submit" disabled={loading} aria-busy={loading}>
            {loading ? t('auth.signingIn') : t('auth.signInTitle')}
          </button>
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
      </div>

      {import.meta.env.DEV && <DevLogin />}
    </div>
  );
}
