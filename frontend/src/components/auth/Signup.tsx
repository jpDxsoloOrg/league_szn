import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import Button from '../ui/Button';
import AuthLayout from './AuthLayout';

export default function Signup() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { signUp, confirmSignUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [psnId, setPsnId] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [step, setStep] = useState<'signup' | 'verify'>('signup');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSignUp = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError(t('auth.passwordsDoNotMatch'));
      return;
    }

    setLoading(true);

    try {
      // No wrestler is entered at sign-up. The account starts on the "Needs
      // Wrestler" placeholder, and the player types a name after signing in.
      const result = await signUp(email, password, {
        playerName,
        psnId,
      });

      if (result.isConfirmed) {
        navigate('/welcome');
      } else {
        setStep('verify');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t('auth.signUpFailed');
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await confirmSignUp(email, verificationCode);
      navigate('/welcome');
    } catch (err) {
      const message = err instanceof Error ? err.message : t('auth.verificationFailed');
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (step === 'verify') {
    return (
      <AuthLayout
        title={t('auth.verifyTitle')}
        subtitle={<>{t('auth.verifySubtitle')} <strong>{email}</strong></>}
      >
        <form onSubmit={handleVerify} aria-describedby={error ? 'verify-error' : undefined}>
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

          {error && (
            <div id="verify-error" className="me-alert me-alert--error" role="alert" aria-live="polite">
              {error}
            </div>
          )}

          <Button type="submit" fullWidth loading={loading}>
            {loading ? t('auth.verifying') : t('auth.verifyEmail')}
          </Button>
        </form>

        <div className="auth-footer">
          <button type="button" className="auth-link" onClick={() => setStep('signup')}>
            {t('auth.backToSignUp')}
          </button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t('auth.createAccount')} subtitle={t('auth.joinSubtitle')}>
      <form onSubmit={handleSignUp} aria-describedby={error ? 'signup-error' : undefined}>
        <div className="me-field">
          <label htmlFor="email">{t('auth.email')}</label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('auth.enterEmail')}
            required
            autoFocus
            autoComplete="email"
            aria-invalid={error ? 'true' : undefined}
          />
        </div>

        <div className="me-field">
          <label htmlFor="playerName">{t('auth.playerName')}</label>
          <input
            type="text"
            id="playerName"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder={t('auth.playerNamePlaceholder')}
            required
          />
          <p className="me-hint">{t('auth.playerNameHint')}</p>
        </div>

        <div className="me-field">
          <label htmlFor="psnId">{t('auth.psnId')}</label>
          <input
            type="text"
            id="psnId"
            value={psnId}
            onChange={(e) => setPsnId(e.target.value)}
            placeholder={t('auth.psnIdPlaceholder')}
            required
          />
        </div>

        <div className="me-field">
          <label htmlFor="password">{t('auth.password')}</label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('auth.passwordPlaceholder')}
            required
            autoComplete="new-password"
            minLength={8}
            aria-invalid={error ? 'true' : undefined}
          />
        </div>

        <div className="me-field">
          <label htmlFor="confirmPassword">{t('auth.confirmPassword')}</label>
          <input
            type="password"
            id="confirmPassword"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder={t('auth.enterConfirmPassword')}
            required
            autoComplete="new-password"
            minLength={8}
            aria-invalid={error ? 'true' : undefined}
          />
        </div>

        <p className="me-alert">{t('me.auth.wrestlerAfterSignup')}</p>

        {error && (
          <div id="signup-error" className="me-alert me-alert--error" role="alert" aria-live="polite">
            {error}
          </div>
        )}

        <Button type="submit" fullWidth loading={loading}>
          {loading ? t('auth.creatingAccount') : t('auth.createAccountBtn')}
        </Button>
      </form>

      <div className="auth-footer">
        <p>
          {t('auth.alreadyHaveAccount')}{' '}
          <Link to="/login">{t('auth.signInLink')}</Link>
        </p>
      </div>
    </AuthLayout>
  );
}
