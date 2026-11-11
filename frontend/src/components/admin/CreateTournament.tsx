import { useState, useEffect, useMemo, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { tournamentsApi, playersApi } from '../../services/api';
import { sanitizeName } from '../../utils/sanitize';
import type { Player } from '../../types';
import { pickablePlayers } from '../../utils/pickablePlayers';
import Button from '../ui/Button';
import PageHeader from '../ui/PageHeader';
import Skeleton from '../ui/Skeleton';
import AdminNotice from './AdminNotice';
import './adminRoster.css';
import './CreateTournament.css';

function isPowerOfTwo(value: number): boolean {
  return value > 0 && (value & (value - 1)) === 0;
}

function isValidSingleEliminationParticipantCount(count: number): boolean {
  return count >= 4 && isPowerOfTwo(count);
}

export default function CreateTournament() {
  const { t } = useTranslation();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    type: 'single-elimination' as 'single-elimination' | 'round-robin',
    participants: [] as string[],
  });

  useEffect(() => {
    loadPlayers();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  const loadPlayers = async () => {
    try {
      setLoading(true);
      setPlayers(pickablePlayers(await playersApi.getAllIncludingHidden()));
    } catch (_err) {
      setError(t('adminRoster.tournament.loadError', 'Failed to load players'));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return; // Prevent double submission

    setError(null);
    setSuccess(null);

    if (formData.participants.length < 2) {
      setError(t('adminRoster.tournament.minParticipants', 'Please select at least 2 participants'));
      return;
    }

    if (formData.type === 'single-elimination') {
      if (formData.participants.length < 4) {
        setError(t('adminRoster.tournament.minFour', 'Single elimination tournaments require at least 4 participants'));
        return;
      }
      if (!isPowerOfTwo(formData.participants.length)) {
        setError(t('adminRoster.tournament.powerOfTwo', 'Single elimination tournaments require a power-of-two participant count (4, 8, 16, ...)'));
        return;
      }
    }

    setSubmitting(true);

    try {
      // Sanitize tournament name input
      const sanitizedName = sanitizeName(formData.name, 100);

      if (!sanitizedName) {
        setError(t('adminRoster.tournament.nameRequired', 'Tournament name cannot be empty'));
        setSubmitting(false);
        return;
      }

      await tournamentsApi.create({
        name: sanitizedName,
        type: formData.type,
        participants: formData.participants,
        status: 'upcoming',
      });

      setSuccess(t('adminRoster.tournament.created', 'Tournament created successfully!'));
      setFormData({
        name: '',
        type: 'single-elimination',
        participants: [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('adminRoster.tournament.createError', 'Failed to create tournament'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleParticipantToggle = (playerId: string) => {
    setFormData(prev => ({
      ...prev,
      participants: prev.participants.includes(playerId)
        ? prev.participants.filter(id => id !== playerId)
        : [...prev.participants, playerId],
    }));
  };

  const moveParticipantById = (playerId: string, direction: -1 | 1) => {
    setFormData((prev) => {
      const fromIndex = prev.participants.indexOf(playerId);
      if (fromIndex < 0) return prev;
      const toIndex = fromIndex + direction;
      if (toIndex < 0 || toIndex >= prev.participants.length) return prev;
      const reordered = [...prev.participants];
      const [moved] = reordered.splice(fromIndex, 1);
      if (!moved) return prev;
      reordered.splice(toIndex, 0, moved);
      return { ...prev, participants: reordered };
    });
  };

  const selectedPlayers = formData.participants
    .map((playerId) => players.find((player) => player.playerId === playerId))
    .filter((player): player is Player => !!player);

  const visiblePlayers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return players;
    return players.filter((player) =>
      `${player.name} ${player.currentWrestler ?? ''}`.toLowerCase().includes(term));
  }, [players, search]);

  if (loading) {
    return <Skeleton variant="block" count={4} />;
  }

  return (
    <div className="ar-page ar-page--narrow create-tournament">
      <PageHeader title={t('adminRoster.tournament.title', 'Create Tournament')} />

      {error && <AdminNotice tone="error">{error}</AdminNotice>}
      {success && <AdminNotice tone="success">{success}</AdminNotice>}

      <form onSubmit={handleSubmit} className="ar-form tournament-form">
        <div className="ar-form__grid">
          <div className="ar-field">
            <label className="ar-field__label" htmlFor="name">{t('adminRoster.tournament.name', 'Tournament Name')}</label>
            <input
              className="ar-input"
              type="text"
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              placeholder={t('adminRoster.tournament.namePlaceholder', 'King of the Ring 2024')}
            />
          </div>

          <div className="ar-field">
            <label className="ar-field__label" htmlFor="type">{t('adminRoster.tournament.type', 'Tournament Type')}</label>
            <select
              className="ar-input"
              id="type"
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as 'single-elimination' | 'round-robin' })}
              required
            >
              <option value="single-elimination">{t('adminRoster.tournament.singleElimination', 'Single Elimination')}</option>
              <option value="round-robin">{t('adminRoster.tournament.roundRobin', 'Round Robin (G1 Climax Style)')}</option>
            </select>
          </div>
        </div>
        <p className="ar-hint">
          {formData.type === 'single-elimination'
            ? t('adminRoster.tournament.singleEliminationHint', 'Bracket-style tournament. Requires at least 4 participants.')
            : t('adminRoster.tournament.roundRobinHint', 'Every participant faces every other participant. 2 points for win, 1 for draw.')}
        </p>

        <fieldset className="ar-field">
          <legend className="ar-field__label">
            {t('adminRoster.tournament.participants', 'Participants')} ({t('adminRoster.tournament.selected', 'Selected')}: {formData.participants.length})
          </legend>
          <input
            className="ar-input"
            type="search"
            aria-label={t('adminRoster.players.search', 'Search players')}
            placeholder={t('adminRoster.players.search', 'Search players')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <ul className="ar-pick-grid">
            {visiblePlayers.map((player) => (
              <li key={player.playerId}>
                <button
                  type="button"
                  className="ar-pick"
                  aria-pressed={formData.participants.includes(player.playerId)}
                  onClick={() => handleParticipantToggle(player.playerId)}
                >
                  <span className="ar-strong">{player.name}</span>
                  <span className="ar-sub">{player.currentWrestler}</span>
                  <span className="ar-sub participant-record">
                    {player.wins}W-{player.losses}L-{player.draws}D
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </fieldset>

        {formData.type === 'single-elimination' &&
          isValidSingleEliminationParticipantCount(formData.participants.length) && (
          <div className="ar-field">
            <h2 className="ar-section-title">{t('adminRoster.tournament.seedTitle', 'Seed / Matchup Order')}</h2>
            <p className="ar-hint">
              {t('adminRoster.tournament.seedHint', 'This order controls first-round matchups (1 vs 2, 3 vs 4, etc.).')}
            </p>
            <ol className="ar-list seed-list">
              {selectedPlayers.map((player, index) => (
                <li key={player.playerId} className="ar-list__row seed-item">
                  <span className="ar-identity">
                    <span className="ar-sub ar-numeric">{t('adminRoster.tournament.seed', 'Seed')} {index + 1}</span>
                    <span className="ar-strong">{player.name}</span>
                  </span>
                  <span className="ar-row-actions">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => moveParticipantById(player.playerId, -1)}
                      disabled={index === 0}
                      aria-label={t('adminRoster.tournament.moveUp', { defaultValue: 'Move {{name}} up', name: player.name })}
                      icon={<ArrowUp aria-hidden="true" size={16} />}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => moveParticipantById(player.playerId, 1)}
                      disabled={index === selectedPlayers.length - 1}
                      aria-label={t('adminRoster.tournament.moveDown', { defaultValue: 'Move {{name}} down', name: player.name })}
                      icon={<ArrowDown aria-hidden="true" size={16} />}
                    />
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}

        <div>
          <Button type="submit" loading={submitting}>
            {submitting ? t('adminRoster.tournament.creating', 'Creating...') : t('adminRoster.tournament.title', 'Create Tournament')}
          </Button>
        </div>
      </form>
    </div>
  );
}
