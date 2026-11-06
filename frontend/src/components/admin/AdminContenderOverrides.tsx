import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SlidersHorizontal } from 'lucide-react';
import type { Championship, Player } from '../../types';
import type { ContenderOverride, OverrideType } from '../../types/contender';
import { championshipsApi, contendersApi, playersApi } from '../../services/api';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Card from '../ui/Card';
import DataTable from '../ui/DataTable';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import Skeleton from '../ui/Skeleton';
import AdminNotice from './AdminNotice';
import useAdminConfirm from './useAdminConfirm';
import './adminContent.css';

function playerLabel(player: Player): string {
  return player.currentWrestler ? `${player.name} (${player.currentWrestler})` : player.name;
}

export default function AdminContenderOverrides() {
  const { t } = useTranslation();
  const { confirm, confirmDialog } = useAdminConfirm();
  const [championships, setChampionships] = useState<Championship[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedChampionshipId, setSelectedChampionshipId] = useState('');
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [overrideType, setOverrideType] = useState<OverrideType>('bump_to_top');
  const [reason, setReason] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [overrides, setOverrides] = useState<ContenderOverride[]>([]);
  const [overridesReloadKey, setOverridesReloadKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingOverrides, setLoadingOverrides] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [championshipData, playerData] = await Promise.all([
          championshipsApi.getAll(controller.signal),
          playersApi.getAllIncludingHidden(controller.signal),
        ]);
        setChampionships(championshipData);
        setPlayers(playerData);
        setSelectedChampionshipId(championshipData[0]?.championshipId ?? '');
      } catch (err) {
        if (controller.signal.aborted) return;
        setLoadError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [reloadKey]);

  // Each championship change aborts the last load, so an older, slower response
  // cannot replace the overrides of the championship now selected.
  useEffect(() => {
    if (!selectedChampionshipId) return undefined;
    const controller = new AbortController();
    const load = async () => {
      setLoadingOverrides(true);
      try {
        const data = await contendersApi.getOverrides(selectedChampionshipId);
        if (!controller.signal.aborted) setOverrides(data.filter((override) => override.active));
      } catch (err) {
        if (controller.signal.aborted) return;
        setOverrides([]);
        setMessage({
          type: 'error',
          text: err instanceof Error ? err.message : String(err),
        });
      } finally {
        if (!controller.signal.aborted) setLoadingOverrides(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [selectedChampionshipId, overridesReloadKey]);

  const playersById = useMemo(() => new Map(players.map((player) => [player.playerId, player])), [players]);
  const selectedChampionship = championships.find((championship) => championship.championshipId === selectedChampionshipId);
  const filteredPlayers = selectedChampionship?.divisionId
    ? players.filter((player) => player.divisionId === selectedChampionship.divisionId)
    : players;

  const clearForm = () => {
    setSelectedPlayerId('');
    setOverrideType('bump_to_top');
    setReason('');
    setExpiresAt('');
  };

  const handleApply = async () => {
    if (!selectedChampionshipId || !selectedPlayerId || !reason.trim()) return;

    const player = playersById.get(selectedPlayerId);
    const confirmed = await confirm({
      title: t('contenders.admin.overrides.confirmApply', {
        player: player?.name ?? selectedPlayerId,
        championship: selectedChampionship?.name ?? selectedChampionshipId,
      }),
      confirmLabel: t('contenders.admin.overrides.apply'),
      danger: false,
    });
    if (!confirmed) return;

    setSubmitting(true);
    setMessage(null);
    try {
      await contendersApi.setOverride({
        championshipId: selectedChampionshipId,
        playerId: selectedPlayerId,
        overrideType,
        reason: reason.trim(),
        expiresAt: expiresAt || undefined,
      });
      setMessage({ type: 'success', text: t('contenders.admin.overrides.applySuccess', { player: player?.name }) });
      clearForm();
      setOverridesReloadKey((key) => key + 1);
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : t('adminContent.contenders.applyFailed', 'Failed to apply override'),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (override: ContenderOverride) => {
    const player = playersById.get(override.playerId);
    const confirmed = await confirm({
      title: t('contenders.admin.overrides.confirmRemove', { player: player?.name ?? override.playerId }),
      confirmLabel: t('contenders.admin.overrides.remove'),
    });
    if (!confirmed) return;

    setMessage(null);
    try {
      await contendersApi.removeOverride(override.championshipId, override.playerId);
      setMessage({ type: 'success', text: t('contenders.admin.overrides.removeSuccess', { player: player?.name }) });
      setOverridesReloadKey((key) => key + 1);
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : t('adminContent.contenders.removeFailed', 'Failed to remove override'),
      });
    }
  };

  const title = t('contenders.admin.overrides.title');

  if (loading) {
    return (
      <div className="ac-page">
        <PageHeader title={title} />
        <Skeleton variant="block" count={3} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="ac-page">
        <PageHeader title={title} />
        <AdminNotice
          tone="error"
          action={<Button variant="ghost" size="sm" onClick={() => setReloadKey((key) => key + 1)}>{t('common.retry', 'Retry')}</Button>}
        >
          {loadError}
        </AdminNotice>
      </div>
    );
  }

  if (championships.length === 0) {
    return (
      <div className="ac-page">
        <PageHeader title={title} />
        <EmptyState
          icon={<SlidersHorizontal aria-hidden="true" size={32} />}
          title={t('contenders.admin.noChampionships', 'No championships found. Create championships first.')}
        />
      </div>
    );
  }

  return (
    <div className="ac-page">
      <PageHeader title={title} subtitle={t('contenders.admin.overrides.subtitle')} />

      {message && <AdminNotice tone={message.type}>{message.text}</AdminNotice>}

      <Card className="ac-form">
        <div className="ac-form__row">
          <div className="ac-field">
            <label className="ac-field__label" htmlFor="override-championship-select">{t('contenders.admin.selectChampionship')}</label>
            <select
              id="override-championship-select"
              value={selectedChampionshipId}
              onChange={(event) => {
                setSelectedChampionshipId(event.target.value);
                setSelectedPlayerId('');
              }}
            >
              {championships.map((championship) => (
                <option key={championship.championshipId} value={championship.championshipId}>{championship.name}</option>
              ))}
            </select>
          </div>
          <div className="ac-field">
            <label className="ac-field__label" htmlFor="override-player-select">{t('contenders.admin.overrides.selectPlayer')}</label>
            <select id="override-player-select" value={selectedPlayerId} onChange={(event) => setSelectedPlayerId(event.target.value)}>
              <option value="">{t('contenders.admin.overrides.selectPlayer')}</option>
              {filteredPlayers.map((player) => (
                <option key={player.playerId} value={player.playerId}>{playerLabel(player)}</option>
              ))}
            </select>
          </div>
        </div>

        <fieldset className="ac-field ac-choice-group">
          <legend className="ac-field__label">{t('contenders.admin.overrides.overrideType')}</legend>
          <label className="ac-check">
            <input
              type="radio"
              name="overrideType"
              value="bump_to_top"
              checked={overrideType === 'bump_to_top'}
              onChange={() => setOverrideType('bump_to_top')}
            />
            {t('contenders.admin.overrides.bumpToTop')}
          </label>
          <label className="ac-check">
            <input
              type="radio"
              name="overrideType"
              value="send_to_bottom"
              checked={overrideType === 'send_to_bottom'}
              onChange={() => setOverrideType('send_to_bottom')}
            />
            {t('contenders.admin.overrides.sendToBottom')}
          </label>
        </fieldset>

        <div className="ac-form__row">
          <div className="ac-field">
            <label className="ac-field__label" htmlFor="override-reason">{t('contenders.admin.overrides.reason')}</label>
            <input
              id="override-reason"
              type="text"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t('contenders.admin.overrides.reasonPlaceholder')}
            />
          </div>
          <div className="ac-field">
            <label className="ac-field__label" htmlFor="override-expires">{t('contenders.admin.overrides.expiresAt')}</label>
            <input id="override-expires" type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
          </div>
        </div>

        <div className="ac-actions">
          <Button onClick={handleApply} loading={submitting} disabled={!selectedPlayerId || !reason.trim()}>
            {t('contenders.admin.overrides.apply')}
          </Button>
        </div>
      </Card>

      <section className="ac-section">
        <h2 className="ac-section__title">{t('contenders.admin.overrides.activeOverrides')}</h2>
        <DataTable
          caption={t('contenders.admin.overrides.activeOverrides')}
          density="dense"
          loading={loadingOverrides}
          rows={overrides}
          rowKey={(override) => `${override.championshipId}-${override.playerId}`}
          empty={(
            <EmptyState
              icon={<SlidersHorizontal aria-hidden="true" size={32} />}
              title={t('contenders.admin.overrides.noOverrides')}
            />
          )}
          columns={[
            {
              key: 'player',
              header: t('adminContent.contenders.player', 'Player'),
              render: (override) => {
                const player = playersById.get(override.playerId);
                return (
                  <span className="ac-cell__text">
                    <span className="ac-cell__title">{player?.name ?? override.playerId}</span>
                    {player?.currentWrestler && <span className="ac-cell__sub">{player.currentWrestler}</span>}
                  </span>
                );
              },
            },
            {
              key: 'type',
              header: t('contenders.admin.overrides.overrideType'),
              render: (override) => (
                <Badge tone={override.overrideType === 'bump_to_top' ? 'win' : 'loss'}>
                  {override.overrideType === 'bump_to_top'
                    ? t('contenders.admin.overrides.bumpToTop')
                    : t('contenders.admin.overrides.sendToBottom')}
                </Badge>
              ),
            },
            { key: 'reason', header: t('contenders.admin.overrides.reason'), render: (override) => override.reason },
            {
              key: 'expires',
              header: t('contenders.admin.overrides.expiresAt'),
              render: (override) => (override.expiresAt ? new Date(override.expiresAt).toLocaleDateString() : '—'),
            },
            {
              key: 'createdBy',
              header: t('adminContent.contenders.setBy', 'Set by'),
              render: (override) => (
                <span className="ac-cell__text">
                  <span>{override.createdBy}</span>
                  <span className="ac-cell__sub">{new Date(override.createdAt).toLocaleDateString()}</span>
                </span>
              ),
            },
            {
              key: 'actions',
              header: t('common.actions', 'Actions'),
              align: 'end',
              render: (override) => (
                <Button variant="ghost" size="sm" onClick={() => handleRemove(override)}>
                  {t('contenders.admin.overrides.remove')}
                </Button>
              ),
            },
          ]}
        />
      </section>

      {confirmDialog}
    </div>
  );
}
