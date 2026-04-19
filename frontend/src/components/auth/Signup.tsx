import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import './Auth.css';

export default function Signup() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { signUp, confirmSignUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [psnId, setPsnId] = useState('');
  const [wrestlerName, setWrestlerName] = useState('');
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
      const result = await signUp(email, password, {
        playerName,
        psnId,
        wrestlerName,
      });

      if (result.isConfirmed) {
        navigate('/login');
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
      navigate('/login');
    } catch (err) {
      const message = err instanceof Error ? err.message : t('auth.verificationFailed');
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (step === 'verify') {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h2>{t('auth.verifyTitle')}</h2>
          <p className="auth-subtitle">
            {t('auth.verifySubtitle')} <strong>{email}</strong>
          </p>

          <form onSubmit={handleVerify} aria-describedby={error ? 'verify-error' : undefined}>
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

            {error && (
              <div id="verify-error" className="error-message" role="alert" aria-live="polite">
                {error}
              </div>
            )}

            <button type="submit" className="btn-submit" disabled={loading} aria-busy={loading}>
              {loading ? t('auth.verifying') : t('auth.verifyEmail')}
            </button>
          </form>

          <div className="auth-footer">
            <button
              className="link-button"
              onClick={() => setStep('signup')}
            >
              {t('auth.backToSignUp')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>{t('auth.createAccount')}</h2>
        <p className="auth-subtitle">{t('auth.joinSubtitle')}</p>

        <form onSubmit={handleSignUp} aria-describedby={error ? 'signup-error' : undefined}>
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
            <label htmlFor="playerName">{t('auth.playerName')}</label>
            <input
              type="text"
              id="playerName"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder={t('auth.playerNamePlaceholder')}
              required
            />
            <p className="field-hint">{t('auth.playerNameHint')}</p>
          </div>

          <div className="form-group">
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

          <div className="form-group">
            <label htmlFor="wrestlerName">{t('auth.wrestlerName')}</label>
            <input
              type="text"
              id="wrestlerName"
              value={wrestlerName}
              onChange={(e) => setWrestlerName(e.target.value)}
              placeholder={t('auth.wrestlerPlaceholder')}
              required
            />
            <p className="field-hint">{t('auth.wrestlerHintRequired')}</p>
          </div>

          <div className="form-group">
            <label htmlFor="password">{t('auth.password')}</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('auth.passwordPlaceholder')}
              required
              minLength={8}
              aria-invalid={error ? 'true' : undefined}
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">{t('auth.confirmPassword')}</label>
            <input
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t('auth.enterConfirmPassword')}
              required
              minLength={8}
              aria-invalid={error ? 'true' : undefined}
            />
          </div>

          {error && (
            <div id="signup-error" className="error-message" role="alert" aria-live="polite">
              {error}
            </div>
          )}

          <button type="submit" className="btn-submit" disabled={loading} aria-busy={loading}>
            {loading ? t('auth.creatingAccount') : t('auth.createAccountBtn')}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            {t('auth.alreadyHaveAccount')}{' '}
            <Link to="/login">{t('auth.signInLink')}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
