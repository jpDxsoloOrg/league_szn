import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cognitoAuth } from '../../services/cognito';
import './Auth.css';

type Step = 'request' | 'confirm' | 'done';

export default function ForgotPassword() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRequestCode = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await cognitoAuth.forgotPassword(email);
      setStep('confirm');
    } catch (err) {
      const message = err instanceof Error ? err.message : t('auth.forgotPasswordFailed');
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError(t('auth.passwordsDoNotMatch'));
      return;
    }

    setLoading(true);

    try {
      await cognitoAuth.confirmForgotPassword(email, code, newPassword);
      setStep('done');
    } catch (err) {
      const message = err instanceof Error ? err.message : t('auth.resetPasswordFailed');
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (step === 'done') {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h2>{t('auth.passwordResetSuccess')}</h2>
          <p className="auth-subtitle">{t('auth.passwordResetSuccessMessage')}</p>
          <button
            className="btn-submit"
            onClick={() => navigate('/login')}
          >
            {t('auth.signInTitle')}
          </button>
        </div>
      </div>
    );
  }

  if (step === 'confirm') {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h2>{t('auth.resetPasswordTitle')}</h2>
          <p className="auth-subtitle">
            {t('auth.resetCodeSentTo')} <strong>{email}</strong>
          </p>

          <form onSubmit={handleResetPassword} aria-describedby={error ? 'reset-error' : undefined}>
            <div className="form-group">
              <label htmlFor="code">{t('auth.verificationCode')}</label>
              <input
                type="text"
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={t('auth.codePlaceholder')}
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label htmlFor="newPassword">{t('auth.newPassword')}</label>
              <input
                type="password"
                id="newPassword"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t('auth.passwordPlaceholder')}
                required
                minLength={8}
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
              />
            </div>

            {error && (
              <div id="reset-error" className="error-message" role="alert" aria-live="polite">
                {error}
              </div>
            )}

            <button type="submit" className="btn-submit" disabled={loading} aria-busy={loading}>
              {loading ? t('auth.resettingPassword') : t('auth.resetPassword')}
            </button>
          </form>

          <div className="auth-footer">
            <p>
              <button className="link-button" onClick={() => setStep('request')}>
                {t('auth.resendCode')}
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
        <h2>{t('auth.forgotPasswordTitle')}</h2>
        <p className="auth-subtitle">{t('auth.forgotPasswordSubtitle')}</p>

        <form onSubmit={handleRequestCode} aria-describedby={error ? 'forgot-error' : undefined}>
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
            />
          </div>

          {error && (
            <div id="forgot-error" className="error-message" role="alert" aria-live="polite">
              {error}
            </div>
          )}

          <button type="submit" className="btn-submit" disabled={loading} aria-busy={loading}>
            {loading ? t('auth.sendingCode') : t('auth.sendResetCode')}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            <Link to="/login">{t('auth.backToSignIn')}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
