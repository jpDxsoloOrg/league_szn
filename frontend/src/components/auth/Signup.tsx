import { useState, useEffect, useMemo, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { wrestlersApi } from '../../services/api';
import type { Wrestler, WrestlerPromotion } from '../../types';
import './Auth.css';

type WrestlerSlotOptions = ReadonlyArray<{
  promotion: WrestlerPromotion;
  wrestlers: Wrestler[];
}>;

/**
 * Group the available (not in-use) wrestlers by promotion for an optgroup
 * dropdown. Mirrors the helper used in ManagePlayers / WrestlerProfile so
 * that "available" has the same definition everywhere a roster pick is made.
 */
function buildAvailableOptionGroups(all: Wrestler[]): WrestlerSlotOptions {
  const available = all.filter((w) => !w.isInUse);
  const byPromotion = new Map<WrestlerPromotion, Wrestler[]>();
  for (const w of available) {
    const bucket = byPromotion.get(w.promotion) ?? [];
    bucket.push(w);
    byPromotion.set(w.promotion, bucket);
  }
  return Array.from(byPromotion.entries())
    .map(([promotion, wrestlers]) => ({
      promotion,
      wrestlers: wrestlers.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.promotion.localeCompare(b.promotion));
}

export default function Signup() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { signUp, confirmSignUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [psnId, setPsnId] = useState('');
  const [wrestlerId, setWrestlerId] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [step, setStep] = useState<'signup' | 'verify'>('signup');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [wrestlers, setWrestlers] = useState<Wrestler[]>([]);
  const [loadingWrestlers, setLoadingWrestlers] = useState(true);

  useEffect(() => {
    let cancelled = false;
    wrestlersApi
      .getAll()
      .then((data) => {
        if (!cancelled) setWrestlers(data);
      })
      .catch(() => {
        // Roster unreachable — dropdown will just be empty and show the hint.
      })
      .finally(() => {
        if (!cancelled) setLoadingWrestlers(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const wrestlerOptions = useMemo(
    () => buildAvailableOptionGroups(wrestlers),
    [wrestlers],
  );

  const pickedWrestler = useMemo(
    () => wrestlers.find((w) => w.wrestlerId === wrestlerId),
    [wrestlers, wrestlerId],
  );

  const handleSignUp = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError(t('auth.passwordsDoNotMatch'));
      return;
    }
    if (!pickedWrestler) {
      setError(t('auth.wrestlerRequired'));
      return;
    }

    setLoading(true);

    try {
      const result = await signUp(email, password, {
        playerName,
        psnId,
        // Pass the wrestler's display name so the existing Cognito schema /
        // postConfirmation path keeps working. postConfirmation will look
        // the name back up against the roster and set the FK on the Player.
        wrestlerName: pickedWrestler.name,
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

  const rosterEmpty = !loadingWrestlers && wrestlerOptions.length === 0;

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
            <select
              id="wrestlerName"
              value={wrestlerId}
              onChange={(e) => setWrestlerId(e.target.value)}
              required
              disabled={loadingWrestlers || rosterEmpty}
            >
              <option value="">
                {loadingWrestlers
                  ? t('auth.loadingRoster')
                  : rosterEmpty
                    ? t('auth.rosterEmpty')
                    : t('auth.pickFromRoster')}
              </option>
              {wrestlerOptions.map((group) => (
                <optgroup key={group.promotion} label={group.promotion}>
                  {group.wrestlers.map((w) => (
                    <option key={w.wrestlerId} value={w.wrestlerId}>
                      {w.name} — OVR {w.overallCap}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
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

          <button type="submit" className="btn-submit" disabled={loading || loadingWrestlers || rosterEmpty} aria-busy={loading}>
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
