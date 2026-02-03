import { useState } from 'react';
import { adminApi } from '../../services/api';
import './ClearAllData.css';

export default function ClearAllData() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deletedCounts, setDeletedCounts] = useState<Record<string, number> | null>(null);
  const [confirmText, setConfirmText] = useState('');

  const CONFIRMATION_PHRASE = 'DELETE ALL DATA';

  const handleClearAll = async () => {
    if (confirmText !== CONFIRMATION_PHRASE) {
      setError(`Please type "${CONFIRMATION_PHRASE}" to confirm`);
      return;
    }

    if (!confirm('FINAL WARNING: This will permanently delete ALL data including players, matches, championships, tournaments, seasons, divisions, and all standings. This action CANNOT be undone. Are you absolutely sure?')) {
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);
    setDeletedCounts(null);

    try {
      const result = await adminApi.clearAll();
      setSuccess('All data has been cleared successfully!');
      setDeletedCounts(result.deletedCounts);
      setConfirmText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear data');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="clear-all-data">
      <div className="clear-all-header">
        <h2>Clear All Data</h2>
      </div>

      <div className="warning-banner">
        <h3>Danger Zone</h3>
        <p>
          This action will permanently delete <strong>ALL</strong> data from the system:
        </p>
        <ul>
          <li>All players (wrestlers) and their records</li>
          <li>All matches and results</li>
          <li>All championships and their history</li>
          <li>All tournaments</li>
          <li>All seasons and standings</li>
          <li>All divisions</li>
        </ul>
        <p className="warning-text">
          This action <strong>CANNOT</strong> be undone. Make sure you have exported any data you want to keep before proceeding.
        </p>
      </div>

      {error && <div className="error-message">{error}</div>}
      {success && (
        <div className="success-message">
          {success}
          {deletedCounts && (
            <div className="deleted-counts">
              <h4>Deleted Items:</h4>
              <ul>
                <li>Players: {deletedCounts.players || 0}</li>
                <li>Matches: {deletedCounts.matches || 0}</li>
                <li>Championships: {deletedCounts.championships || 0}</li>
                <li>Championship History: {deletedCounts.championshipHistory || 0}</li>
                <li>Tournaments: {deletedCounts.tournaments || 0}</li>
                <li>Seasons: {deletedCounts.seasons || 0}</li>
                <li>Season Standings: {deletedCounts.seasonStandings || 0}</li>
                <li>Divisions: {deletedCounts.divisions || 0}</li>
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="confirmation-section">
        <label htmlFor="confirm-input">
          Type <strong>{CONFIRMATION_PHRASE}</strong> to enable the delete button:
        </label>
        <input
          type="text"
          id="confirm-input"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={CONFIRMATION_PHRASE}
          className="confirm-input"
          disabled={loading}
        />
        <button
          onClick={handleClearAll}
          disabled={loading || confirmText !== CONFIRMATION_PHRASE}
          className="clear-all-btn"
        >
          {loading ? 'Clearing All Data...' : 'Clear All Data'}
        </button>
      </div>
    </div>
  );
}
