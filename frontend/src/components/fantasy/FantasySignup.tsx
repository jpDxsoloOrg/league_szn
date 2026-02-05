import { useState, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import './FantasyAuth.css';

export default function FantasySignup() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const validateForm = (): string | null => {
    if (username.length < 3) {
      return t('fantasy.auth.usernameTooShort');
    }
    if (password.length < 8) {
      return t('fantasy.auth.passwordTooShort');
    }
    if (password !== confirmPassword) {
      return t('fantasy.auth.passwordsMismatch');
    }
    if (!/[A-Z]/.test(password)) {
      return t('fantasy.auth.passwordNeedsUppercase');
    }
    if (!/[a-z]/.test(password)) {
      return t('fantasy.auth.passwordNeedsLowercase');
    }
    if (!/[0-9]/.test(password)) {
      return t('fantasy.auth.passwordNeedsNumber');
    }
    return null;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);

    try {
      // Mock signup - simulate API call delay
      await new Promise((resolve) => setTimeout(resolve, 500));

      // For mock: accept any valid form submission
      // In real implementation, this would call fantasyAuth.signUp()
      navigate('/fantasy/dashboard');
    } catch (err) {
      const message = err instanceof Error ? err.message : t('fantasy.auth.signupFailed');
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fantasy-auth-container">
      <div className="fantasy-auth-card">
        <h2>{t('fantasy.auth.signupTitle')}</h2>
        <p className="auth-subtitle">{t('fantasy.auth.signupSubtitle')}</p>

        <form onSubmit={handleSubmit} aria-describedby={error ? 'signup-error' : undefined}>
          <div className="form-group">
            <label htmlFor="username">{t('fantasy.auth.username')}</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t('fantasy.auth.usernamePlaceholder')}
              required
              minLength={3}
              maxLength={20}
              autoFocus
              aria-invalid={error ? 'true' : undefined}
            />
            <span className="input-hint">{t('fantasy.auth.usernameHint')}</span>
          </div>

          <div className="form-group">
            <label htmlFor="email">{t('fantasy.auth.email')}</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('fantasy.auth.emailPlaceholder')}
              required
              aria-invalid={error ? 'true' : undefined}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">{t('fantasy.auth.password')}</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('fantasy.auth.passwordPlaceholder')}
              required
              minLength={8}
              aria-invalid={error ? 'true' : undefined}
            />
            <span className="input-hint">{t('fantasy.auth.passwordHint')}</span>
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">{t('fantasy.auth.confirmPassword')}</label>
            <input
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t('fantasy.auth.confirmPasswordPlaceholder')}
              required
              aria-invalid={error ? 'true' : undefined}
            />
          </div>

          {error && (
            <div id="signup-error" className="error-message" role="alert" aria-live="polite">
              {error}
            </div>
          )}

          <button type="submit" className="btn-submit" disabled={loading} aria-busy={loading}>
            {loading ? t('fantasy.auth.creatingAccount') : t('fantasy.auth.createAccount')}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            {t('fantasy.auth.haveAccount')}{' '}
            <Link to="/fantasy/login">{t('fantasy.auth.loginLink')}</Link>
          </p>
          <Link to="/fantasy" className="back-link">
            {t('fantasy.auth.backToFantasy')}
          </Link>
        </div>
      </div>
    </div>
  );
}
