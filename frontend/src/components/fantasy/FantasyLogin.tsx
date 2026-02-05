import { useState, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import './FantasyAuth.css';

export default function FantasyLogin() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Mock login - simulate API call delay
      await new Promise((resolve) => setTimeout(resolve, 500));

      // For mock: accept any valid-looking credentials
      if (email && password.length >= 8) {
        // In real implementation, this would call fantasyAuth.signIn()
        navigate('/fantasy/dashboard');
      } else {
        throw new Error(t('fantasy.auth.invalidCredentials'));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t('fantasy.auth.loginFailed');
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fantasy-auth-container">
      <div className="fantasy-auth-card">
        <h2>{t('fantasy.auth.loginTitle')}</h2>
        <p className="auth-subtitle">{t('fantasy.auth.loginSubtitle')}</p>

        <form onSubmit={handleSubmit} aria-describedby={error ? 'login-error' : undefined}>
          <div className="form-group">
            <label htmlFor="email">{t('fantasy.auth.email')}</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('fantasy.auth.emailPlaceholder')}
              required
              autoFocus
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
          </div>

          {error && (
            <div id="login-error" className="error-message" role="alert" aria-live="polite">
              {error}
            </div>
          )}

          <button type="submit" className="btn-submit" disabled={loading} aria-busy={loading}>
            {loading ? t('fantasy.auth.loggingIn') : t('fantasy.auth.login')}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            {t('fantasy.auth.noAccount')}{' '}
            <Link to="/fantasy/signup">{t('fantasy.auth.signUpLink')}</Link>
          </p>
          <Link to="/fantasy" className="back-link">
            {t('fantasy.auth.backToFantasy')}
          </Link>
        </div>
      </div>
    </div>
  );
}
