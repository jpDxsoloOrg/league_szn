import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import './Auth.css';

export default function Signup() {
  const navigate = useNavigate();
  const { signUp, confirmSignUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [wrestlerName, setWrestlerName] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [step, setStep] = useState<'signup' | 'verify'>('signup');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSignUp = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const result = await signUp(email, password, {
        wrestlerName: wrestlerName || undefined,
      });

      if (result.isConfirmed) {
        navigate('/login');
      } else {
        setStep('verify');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign up failed. Please try again.';
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
      const message = err instanceof Error ? err.message : 'Verification failed. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (step === 'verify') {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h2>Verify Your Email</h2>
          <p className="auth-subtitle">
            We sent a verification code to <strong>{email}</strong>
          </p>

          <form onSubmit={handleVerify} aria-describedby={error ? 'verify-error' : undefined}>
            <div className="form-group">
              <label htmlFor="code">Verification Code</label>
              <input
                type="text"
                id="code"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                placeholder="Enter 6-digit code"
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
              {loading ? 'Verifying...' : 'Verify Email'}
            </button>
          </form>

          <div className="auth-footer">
            <button
              className="link-button"
              onClick={() => setStep('signup')}
            >
              Back to sign up
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>Create Account</h2>
        <p className="auth-subtitle">Join League SZN</p>

        <form onSubmit={handleSignUp} aria-describedby={error ? 'signup-error' : undefined}>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
              autoFocus
              aria-invalid={error ? 'true' : undefined}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 8 chars, uppercase, lowercase, number"
              required
              minLength={8}
              aria-invalid={error ? 'true' : undefined}
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your password"
              required
              minLength={8}
              aria-invalid={error ? 'true' : undefined}
            />
          </div>

          <div className="form-group wrestler-name-group">
            <label htmlFor="wrestlerName">
              Wrestler Name <span className="optional-label">(optional)</span>
            </label>
            <input
              type="text"
              id="wrestlerName"
              value={wrestlerName}
              onChange={(e) => setWrestlerName(e.target.value)}
              placeholder="Enter your wrestler name to request wrestler access"
            />
            <p className="field-hint">
              If you're a wrestler, enter your in-game name. An admin will review and approve your wrestler access.
            </p>
          </div>

          {error && (
            <div id="signup-error" className="error-message" role="alert" aria-live="polite">
              {error}
            </div>
          )}

          <button type="submit" className="btn-submit" disabled={loading} aria-busy={loading}>
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            Already have an account?{' '}
            <Link to="/login">Sign In</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
