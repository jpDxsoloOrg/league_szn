import { useState } from 'react';
import { adminApi } from '../../services/api';
import './ClearAllData.css';

const SEED_MODULES: { id: string; label: string }[] = [
  { id: 'core', label: 'Core (Divisions, Players, Seasons)' },
  { id: 'championships', label: 'Championships' },
  { id: 'matches', label: 'Matches' },
  { id: 'standings', label: 'Standings' },
  { id: 'tournaments', label: 'Tournaments' },
  { id: 'events', label: 'Events' },
  { id: 'contenders', label: 'Contenders' },
  { id: 'fantasy', label: 'Fantasy' },
  { id: 'config', label: 'Config (Site, Stipulations, Match Types)' },
];

export default function ClearAllData() {
  const [clearLoading, setClearLoading] = useState(false);
  const [seedLoading, setSeedLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [resultCounts, setResultCounts] = useState<Record<string, number> | null>(null);
  const [resultType, setResultType] = useState<'deleted' | 'created' | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [selectedSeedModules, setSelectedSeedModules] = useState<string[]>([]);

  const CONFIRMATION_PHRASE = 'DELETE ALL DATA';

  const toggleSeedModule = (id: string) => {
    setSelectedSeedModules((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  };
  const selectAllSeedModules = () => setSelectedSeedModules(SEED_MODULES.map((m) => m.id));
  const selectNoneSeedModules = () => setSelectedSeedModules([]);

  const handleClearAll = async () => {
    if (confirmText !== CONFIRMATION_PHRASE) {
      setError(`Please type "${CONFIRMATION_PHRASE}" to confirm`);
      return;
    }

    if (!confirm('FINAL WARNING: This will permanently delete ALL data including players, matches, championships, tournaments, seasons, divisions, and all standings. This action CANNOT be undone. Are you absolutely sure?')) {
      return;
    }

    setClearLoading(true);
    setError(null);
    setSuccess(null);
    setResultCounts(null);

    try {
      const result = await adminApi.clearAll();
      setSuccess('All data has been cleared successfully!');
      setResultCounts(result.deletedCounts);
      setResultType('deleted');
      setConfirmText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear data');
    } finally {
      setClearLoading(false);
    }
  };

  const handleSeedData = async () => {
    if (!confirm('This will generate sample data including players, divisions, seasons, championships, matches, and tournaments. Any existing data will remain. Continue?')) {
      return;
    }

    setSeedLoading(true);
    setError(null);
    setSuccess(null);
    setResultCounts(null);

    try {
      const result =
        selectedSeedModules.length > 0
          ? await adminApi.seedData({ modules: selectedSeedModules })
          : await adminApi.seedData();
      setSuccess('Sample data has been generated successfully!');
      setResultCounts(result.createdCounts);
      setResultType('created');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to seed data');
    } finally {
      setSeedLoading(false);
    }
  };

  const isLoading = clearLoading || seedLoading;

  return (
    <div className="clear-all-data">
      <div className="clear-all-header">
        <h2>Data Management</h2>
      </div>

      {/* Seed Data Section */}
      <div className="seed-banner">
        <h3>Generate Sample Data</h3>
        <p>
          Quickly populate the league with sample data for testing or demonstration purposes.
        </p>
        <div className="seed-options">
          <h4>Seed options (optional)</h4>
          <p className="seed-options-note">
            No selection = seed everything. Dependencies are added automatically when needed.
          </p>
          <div className="seed-options-actions">
            <button type="button" onClick={selectAllSeedModules} className="seed-option-link">
              Select all
            </button>
            <span className="seed-options-sep">|</span>
            <button type="button" onClick={selectNoneSeedModules} className="seed-option-link">
              Select none
            </button>
          </div>
          <ul className="seed-options-list">
            {SEED_MODULES.map((mod) => (
              <li key={mod.id} className="seed-option">
                <label>
                  <input
                    type="checkbox"
                    checked={selectedSeedModules.includes(mod.id)}
                    onChange={() => toggleSeedModule(mod.id)}
                    disabled={isLoading}
                  />
                  <span>{mod.label}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
        <div className="seed-details">
          <h4>What gets created (full seed):</h4>
          <ul>
            <li><strong>12 Players</strong> - With random win/loss records and wrestler assignments</li>
            <li><strong>3 Divisions</strong> - Raw, SmackDown, and NXT</li>
            <li><strong>1 Active Season</strong> - With standings for all players</li>
            <li><strong>4 Championships</strong> - World, Intercontinental, Tag Team, and US titles</li>
            <li><strong>12 Matches</strong> - Mix of completed and scheduled matches</li>
            <li><strong>2 Tournaments</strong> - Single elimination and round robin</li>
          </ul>
        </div>
        <button
          onClick={handleSeedData}
          disabled={isLoading}
          className="seed-btn"
        >
          {seedLoading ? 'Generating Data...' : 'Generate Sample Data'}
        </button>
      </div>

      {/* Clear All Section */}
      <div className="warning-banner">
        <h3>Danger Zone - Clear All Data</h3>
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
          {resultCounts && (
            <div className="result-counts">
              <h4>{resultType === 'deleted' ? 'Deleted Items:' : 'Created Items:'}</h4>
              <ul>
                {resultType === 'deleted' ? (
                  <>
                    <li>Players: {resultCounts['players'] ?? 0}</li>
                    <li>Matches: {resultCounts['matches'] ?? 0}</li>
                    <li>Championships: {resultCounts['championships'] ?? 0}</li>
                    <li>Championship History: {resultCounts['championshipHistory'] ?? 0}</li>
                    <li>Tournaments: {resultCounts['tournaments'] ?? 0}</li>
                    <li>Seasons: {resultCounts['seasons'] ?? 0}</li>
                    <li>Season Standings: {resultCounts['seasonStandings'] ?? 0}</li>
                    <li>Divisions: {resultCounts['divisions'] ?? 0}</li>
                  </>
                ) : (
                  <>
                    <li>Divisions: {resultCounts['divisions'] ?? 0}</li>
                    <li>Players: {resultCounts['players'] ?? 0}</li>
                    <li>Seasons: {resultCounts['seasons'] ?? 0}</li>
                    <li>Season Standings: {resultCounts['seasonStandings'] ?? 0}</li>
                    <li>Championships: {resultCounts['championships'] ?? 0}</li>
                    <li>Championship History: {resultCounts['championshipHistory'] ?? 0}</li>
                    <li>Matches: {resultCounts['matches'] ?? 0}</li>
                    <li>Tournaments: {resultCounts['tournaments'] ?? 0}</li>
                  </>
                )}
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
          disabled={isLoading}
        />
        <button
          onClick={handleClearAll}
          disabled={isLoading || confirmText !== CONFIRMATION_PHRASE}
          className="clear-all-btn"
        >
          {clearLoading ? 'Clearing All Data...' : 'Clear All Data'}
        </button>
      </div>
    </div>
  );
}
