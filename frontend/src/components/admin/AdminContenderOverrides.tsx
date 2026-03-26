import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { Championship, Player } from '../../types';
import type { ContenderOverride, OverrideType } from '../../types/contender';
import { championshipsApi, contendersApi, playersApi } from '../../services/api';
import './AdminContenderOverrides.css';

interface PlayerOption {
  playerId: string;
  name: string;
  currentWrestler: string;
}

function ActiveOverrideCard({
  override,
  players,
  onRemove,
}: {
  override: ContenderOverride;
  players: PlayerOption[];
  onRemove: (override: ContenderOverride) => void;
}) {
  const { t } = useTranslation();
  const player = players.find((p) => p.playerId === override.playerId);
  const isBump = override.overrideType === 'bump_to_top';

  return (
    <div className="override-card">
      <div className="override-card-header">
        <div>
          <span className="override-player-name">{player?.name ?? override.playerId}</span>
          {player && <span className="override-wrestler-name">({player.currentWrestler})</span>}
        </div>
        <span className={`override-type-badge ${isBump ? 'bump' : 'bottom'}`}>
          {isBump
            ? t('contenders.admin.overrides.bumpToTop')
            : t('contenders.admin.overrides.sendToBottom')}
        </span>
      </div>
      <div className="override-card-details">
        <span>{override.reason}</span>
        {override.expiresAt && (
          <span>
            {t('contenders.overrides.expires', {
              date: new Date(override.expiresAt).toLocaleDateString(),
            })}
          </span>
        )}
      </div>
      <div className="override-card-footer">
        <span className="override-meta">
          {t('contenders.overrides.overriddenBy', { admin: override.createdBy })} &middot;{' '}
          {new Date(override.createdAt).toLocaleDateString()}
        </span>
        <button className="btn-remove-override" onClick={() => onRemove(override)}>
          {t('contenders.admin.overrides.remove')}
        </button>
      </div>
    </div>
  );
}

export default function AdminContenderOverrides() {
  const { t } = useTranslation();
  const [championships, setChampionships] = useState<Championship[]>([]);
  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [selectedChampionshipId, setSelectedChampionshipId] = useState('');
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [overrideType, setOverrideType] = useState<OverrideType>('bump_to_top');
  const [reason, setReason] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [overrides, setOverrides] = useState<ContenderOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    Promise.all([championshipsApi.getAll(), playersApi.getAll()])
      .then(([champData, playerData]) => {
        setChampionships(champData);
        setPlayers(
          playerData.map((p: Player) => ({
            playerId: p.playerId,
            name: p.name,
            currentWrestler: p.currentWrestler,
            divisionId: p.divisionId,
          }))
        );
        if (champData.length > 0 && champData[0]) {
          setSelectedChampionshipId(champData[0].championshipId);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const loadOverrides = useCallback(async (championshipId: string) => {
    if (!championshipId) return;
    try {
      const data = await contendersApi.getOverrides(championshipId);
      setOverrides(data.filter((o) => o.active));
    } catch {
      setOverrides([]);
    }
  }, []);

  useEffect(() => {
    if (selectedChampionshipId) {
      loadOverrides(selectedChampionshipId);
    }
  }, [selectedChampionshipId, loadOverrides]);

  const selectedChampionship = championships.find(
    (c) => c.championshipId === selectedChampionshipId
  );

  const filteredPlayers = selectedChampionship?.divisionId
    ? players.filter(
        (p) => (p as PlayerOption & { divisionId?: string }).divisionId === selectedChampionship.divisionId
      )
    : players;

  const clearForm = () => {
    setSelectedPlayerId('');
    setOverrideType('bump_to_top');
    setReason('');
    setExpiresAt('');
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const handleApply = async () => {
    if (!selectedChampionshipId || !selectedPlayerId || !reason.trim()) return;

    const player = players.find((p) => p.playerId === selectedPlayerId);
    const championship = championships.find((c) => c.championshipId === selectedChampionshipId);
    const confirmMsg = t('contenders.admin.overrides.confirmApply', {
      player: player?.name ?? selectedPlayerId,
      championship: championship?.name ?? selectedChampionshipId,
    });

    if (!confirm(confirmMsg)) return;

    try {
      setSubmitting(true);
      setMessage(null);
      await contendersApi.setOverride({
        championshipId: selectedChampionshipId,
        playerId: selectedPlayerId,
        overrideType,
        reason: reason.trim(),
        expiresAt: expiresAt || undefined,
      });
      showMessage('success', t('contenders.admin.overrides.applySuccess', { player: player?.name }));
      clearForm();
      await loadOverrides(selectedChampionshipId);
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'Failed to apply override');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (override: ContenderOverride) => {
    const player = players.find((p) => p.playerId === override.playerId);
    const confirmMsg = t('contenders.admin.overrides.confirmRemove', {
      player: player?.name ?? override.playerId,
    });

    if (!confirm(confirmMsg)) return;

    try {
      setMessage(null);
      await contendersApi.removeOverride(override.championshipId, override.playerId);
      showMessage(
        'success',
        t('contenders.admin.overrides.removeSuccess', { player: player?.name })
      );
      await loadOverrides(selectedChampionshipId);
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'Failed to remove override');
    }
  };

  if (loading) {
    return (
      <div className="admin-contender-overrides">
        <h3>{t('contenders.admin.overrides.title')}</h3>
        <p>{t('common.loading', 'Loading...')}</p>
      </div>
    );
  }

  if (championships.length === 0) {
    return (
      <div className="admin-contender-overrides">
        <h3>{t('contenders.admin.overrides.title')}</h3>
        <p>{t('contenders.admin.noChampionships', 'No championships found. Create championships first.')}</p>
      </div>
    );
  }

  const isFormValid = selectedChampionshipId && selectedPlayerId && reason.trim();

  return (
    <div className="admin-contender-overrides">
      <h3>{t('contenders.admin.overrides.title')}</h3>
      <p className="overrides-subtitle">{t('contenders.admin.overrides.subtitle')}</p>

      <div className="override-form">
        {/* Championship Selector */}
        <div className="override-field">
          <label className="override-label" htmlFor="override-championship-select">
            {t('contenders.admin.selectChampionship')}
          </label>
          <select
            id="override-championship-select"
            className="config-select"
            value={selectedChampionshipId}
            onChange={(e) => {
              setSelectedChampionshipId(e.target.value);
              setSelectedPlayerId('');
            }}
          >
            {championships.map((c) => (
              <option key={c.championshipId} value={c.championshipId}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Player Selector */}
        <div className="override-field">
          <label className="override-label" htmlFor="override-player-select">
            {t('contenders.admin.overrides.selectPlayer')}
          </label>
          <select
            id="override-player-select"
            className="config-select"
            value={selectedPlayerId}
            onChange={(e) => setSelectedPlayerId(e.target.value)}
          >
            <option value="">-- {t('contenders.admin.overrides.selectPlayer')} --</option>
            {filteredPlayers.map((p) => (
              <option key={p.playerId} value={p.playerId}>
                {p.name} ({p.currentWrestler})
              </option>
            ))}
          </select>
        </div>

        {/* Override Type */}
        <div className="override-field">
          <span className="override-label">{t('contenders.admin.overrides.overrideType')}</span>
          <div className="override-radio-group">
            <label
              className={`override-radio-label ${overrideType === 'bump_to_top' ? 'selected' : ''}`}
            >
              <input
                type="radio"
                name="overrideType"
                value="bump_to_top"
                checked={overrideType === 'bump_to_top'}
                onChange={() => setOverrideType('bump_to_top')}
              />
              {t('contenders.admin.overrides.bumpToTop')}
            </label>
            <label
              className={`override-radio-label ${overrideType === 'send_to_bottom' ? 'selected' : ''}`}
            >
              <input
                type="radio"
                name="overrideType"
                value="send_to_bottom"
                checked={overrideType === 'send_to_bottom'}
                onChange={() => setOverrideType('send_to_bottom')}
              />
              {t('contenders.admin.overrides.sendToBottom')}
            </label>
          </div>
        </div>

        {/* Reason */}
        <div className="override-field">
          <label className="override-label" htmlFor="override-reason">
            {t('contenders.admin.overrides.reason')}
          </label>
          <input
            id="override-reason"
            type="text"
            className="config-input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('contenders.admin.overrides.reasonPlaceholder')}
          />
        </div>

        {/* Expiry Date */}
        <div className="override-field">
          <label className="override-label" htmlFor="override-expires">
            {t('contenders.admin.overrides.expiresAt')}
          </label>
          <input
            id="override-expires"
            type="date"
            className="config-input"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </div>
      </div>

      {/* Apply Button */}
      <div className="override-actions">
        <button
          className="btn-apply-override"
          onClick={handleApply}
          disabled={!isFormValid || submitting}
        >
          {submitting
            ? t('common.processing', 'Processing...')
            : t('contenders.admin.overrides.apply')}
        </button>
      </div>

      {message && (
        <div className={message.type === 'success' ? 'override-success-msg' : 'override-error-msg'}>
          {message.text}
        </div>
      )}

      {/* Active Overrides List */}
      <div className="active-overrides-section">
        <h4>{t('contenders.admin.overrides.activeOverrides')}</h4>
        {overrides.length === 0 ? (
          <p className="no-overrides-msg">{t('contenders.admin.overrides.noOverrides')}</p>
        ) : (
          overrides.map((override) => (
            <ActiveOverrideCard
              key={`${override.championshipId}-${override.playerId}`}
              override={override}
              players={players}
              onRemove={handleRemove}
            />
          ))
        )}
      </div>
    </div>
  );
}
