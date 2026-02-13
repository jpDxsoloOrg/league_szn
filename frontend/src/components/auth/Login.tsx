import { useState, useEffect, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { playersApi } from '../../services/api';
import type { Player } from '../../types';
import './Auth.css';

function DevLogin() {
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

  return (
    <div className="auth-card" style={{ marginTop: '1rem', border: '2px dashed #f59e0b' }}>
      <h3 style={{ color: '#f59e0b' }}>Dev Login</h3>
      <p className="auth-subtitle">Pick a player to sign in as (dev only)</p>
      {loadingPlayers ? (
        <p>Loading players...</p>
      ) : players.length === 0 ? (
        <p>No players found. Run seed data first.</p>
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
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await signIn(email, password);
      navigate('/');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>Sign In</h2>
        <p className="auth-subtitle">Sign in to access League SZN</p>

        <form onSubmit={handleSubmit} aria-describedby={error ? 'login-error' : undefined}>
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
              placeholder="Enter your password"
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
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            Don't have an account?{' '}
            <Link to="/signup">Sign Up</Link>
          </p>
        </div>
      </div>

      {import.meta.env.DEV && <DevLogin />}
    </div>
  );
}
