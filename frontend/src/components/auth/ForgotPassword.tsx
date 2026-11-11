import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cognitoAuth } from '../../services/cognito';
import Button from '../ui/Button';
import AuthLayout from './AuthLayout';

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
      <AuthLayout title={t('auth.passwordResetSuccess')} subtitle={t('auth.passwordResetSuccessMessage')}>
        <Button fullWidth onClick={() => navigate('/login')}>
          {t('auth.signInTitle')}
        </Button>
      </AuthLayout>
    );
  }

  if (step === 'confirm') {
    return (
      <AuthLayout
        title={t('auth.resetPasswordTitle')}
        subtitle={<>{t('auth.resetCodeSentTo')} <strong>{email}</strong></>}
      >
        <form onSubmit={handleResetPassword} aria-describedby={error ? 'reset-error' : undefined}>
          <div className="me-field">
            <label htmlFor="code">{t('auth.verificationCode')}</label>
            <input
              type="text"
              id="code"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t('auth.codePlaceholder')}
              required
              autoFocus
            />
          </div>

          <div className="me-field">
            <label htmlFor="newPassword">{t('auth.newPassword')}</label>
            <input
              type="password"
              id="newPassword"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t('auth.passwordPlaceholder')}
              required
              minLength={8}
            />
          </div>

          <div className="me-field">
            <label htmlFor="confirmPassword">{t('auth.confirmPassword')}</label>
            <input
              type="password"
              id="confirmPassword"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t('auth.enterConfirmPassword')}
              required
              minLength={8}
            />
          </div>

          {error && (
            <div id="reset-error" className="me-alert me-alert--error" role="alert" aria-live="polite">
              {error}
            </div>
          )}

          <Button type="submit" fullWidth loading={loading}>
            {loading ? t('auth.resettingPassword') : t('auth.resetPassword')}
          </Button>
        </form>

        <div className="auth-footer">
          <button type="button" className="auth-link" onClick={() => setStep('request')}>
            {t('auth.resendCode')}
          </button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t('auth.forgotPasswordTitle')} subtitle={t('auth.forgotPasswordSubtitle')}>
      <form onSubmit={handleRequestCode} aria-describedby={error ? 'forgot-error' : undefined}>
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
          />
        </div>

        {error && (
          <div id="forgot-error" className="me-alert me-alert--error" role="alert" aria-live="polite">
            {error}
          </div>
        )}

        <Button type="submit" fullWidth loading={loading}>
          {loading ? t('auth.sendingCode') : t('auth.sendResetCode')}
        </Button>
      </form>

      <div className="auth-footer">
        <p>
          <Link to="/login">{t('auth.backToSignIn')}</Link>
        </p>
      </div>
    </AuthLayout>
  );
}
