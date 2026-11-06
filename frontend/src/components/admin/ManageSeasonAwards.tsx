import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Award, Plus } from 'lucide-react';
import { seasonAwardsApi, seasonsApi, playersApi } from '../../services/api';
import type { SeasonAwardsResponse } from '../../services/api';
import type { Season, Player, SeasonAward } from '../../types';
import { pickablePlayers } from '../../utils/pickablePlayers';
import Button from '../ui/Button';
import DataTable from '../ui/DataTable';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import Select from '../ui/Select';
import Skeleton from '../ui/Skeleton';
import AdminFormModal from './AdminFormModal';
import AdminNotice from './AdminNotice';
import useAdminConfirm from './useAdminConfirm';
import './adminContent.css';

const EMPTY_FORM = { name: '', playerId: '', description: '' };

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

export default function ManageSeasonAwards() {
  const { t } = useTranslation();
  const { confirm, confirmDialog } = useAdminConfirm();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState('');
  const [awardsData, setAwardsData] = useState<SeasonAwardsResponse | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingAwards, setLoadingAwards] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);

  useEffect(() => {
    const controller = new AbortController();
    const loadInitialData = async () => {
      try {
        const [seasonsData, playersData] = await Promise.all([
          seasonsApi.getAll(controller.signal),
          playersApi.getAllIncludingHidden(controller.signal),
        ]);
        setSeasons(seasonsData);
        setPlayers(pickablePlayers(playersData));
        setSelectedSeasonId(seasonsData[0]?.seasonId ?? '');
      } catch (err) {
        if (isAbort(err)) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void loadInitialData();
    return () => controller.abort();
  }, []);

  // One controller per selection, so a slow response for the previous season
  // cannot replace the awards of the season now on screen.
  useEffect(() => {
    if (!selectedSeasonId) {
      setAwardsData(null);
      return undefined;
    }
    const controller = new AbortController();
    const loadAwards = async () => {
      setLoadingAwards(true);
      try {
        const data = await seasonAwardsApi.getAll(selectedSeasonId, controller.signal);
        if (!controller.signal.aborted) setAwardsData(data);
      } catch (err) {
        if (isAbort(err) || controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!controller.signal.aborted) setLoadingAwards(false);
      }
    };
    void loadAwards();
    return () => controller.abort();
  }, [selectedSeasonId, reloadKey]);

  const seasonOptions = useMemo(
    () => seasons.map((season) => ({ value: season.seasonId, label: `${season.name} (${season.status})` })),
    [seasons],
  );

  const closeForm = () => {
    setShowForm(false);
    setFormData(EMPTY_FORM);
    setFormError(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedSeasonId || !formData.name || !formData.playerId) return;

    setSaving(true);
    setFormError(null);
    setError(null);
    try {
      await seasonAwardsApi.create(selectedSeasonId, {
        name: formData.name,
        playerId: formData.playerId,
        description: formData.description || undefined,
      });
      setSuccessMsg(t('seasonAwards.admin.createSuccess'));
      closeForm();
      setReloadKey((key) => key + 1);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('adminContent.awards.createFailed', 'Failed to create award'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (award: SeasonAward) => {
    const confirmed = await confirm({
      title: t('seasonAwards.admin.confirmDelete', { name: award.name }),
      confirmLabel: t('common.delete'),
    });
    if (!confirmed) return;

    setError(null);
    try {
      await seasonAwardsApi.delete(award.seasonId, award.awardId);
      setSuccessMsg(t('seasonAwards.admin.deleteSuccess'));
      setReloadKey((key) => key + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('adminContent.awards.deleteFailed', 'Failed to delete award'));
    }
  };

  const title = t('seasonAwards.admin.title');

  if (loading) {
    return (
      <div className="ac-page">
        <PageHeader title={title} />
        <Skeleton variant="table" />
      </div>
    );
  }

  const hasAwards = Boolean(awardsData && (awardsData.autoAwards.length > 0 || awardsData.customAwards.length > 0));

  return (
    <div className="ac-page">
      <PageHeader
        title={title}
        actions={selectedSeasonId ? (
          <Button icon={<Plus aria-hidden="true" size={18} />} onClick={() => setShowForm(true)}>
            {t('seasonAwards.admin.createAward')}
          </Button>
        ) : undefined}
      />

      {error && <AdminNotice tone="error">{error}</AdminNotice>}
      {successMsg && <AdminNotice tone="success">{successMsg}</AdminNotice>}

      <div className="ac-toolbar">
        <Select
          label={t('seasonAwards.admin.selectSeason')}
          placeholder={t('seasonAwards.admin.chooseSeason')}
          value={selectedSeasonId}
          onValueChange={setSelectedSeasonId}
          options={seasonOptions}
        />
      </div>

      {!selectedSeasonId && (
        <EmptyState
          icon={<Award aria-hidden="true" size={32} />}
          title={t('adminContent.awards.noSeasonTitle', 'No season selected')}
          description={t('adminContent.awards.noSeasonText', 'Awards belong to a season. Create a season first, then come back here.')}
        />
      )}

      {selectedSeasonId && loadingAwards && <Skeleton variant="table" count={3} />}

      {selectedSeasonId && !loadingAwards && awardsData && !hasAwards && (
        <EmptyState icon={<Award aria-hidden="true" size={32} />} title={t('seasonAwards.noAwards')} />
      )}

      {!loadingAwards && awardsData && awardsData.autoAwards.length > 0 && (
        <section className="ac-section">
          <h2 className="ac-section__title">{t('seasonAwards.autoAwards')}</h2>
          <DataTable
            caption={t('seasonAwards.autoAwards')}
            density="dense"
            rows={awardsData.autoAwards}
            rowKey={(award) => award.awardId}
            columns={[
              { key: 'name', header: t('seasonAwards.admin.awardName'), render: (award) => <span className="ac-cell__title">{award.name}</span> },
              { key: 'player', header: t('seasonAwards.admin.awardPlayer'), render: (award) => award.playerName },
              { key: 'value', header: t('seasonAwards.admin.value'), render: (award) => award.value || '—' },
            ]}
          />
        </section>
      )}

      {!loadingAwards && awardsData && awardsData.customAwards.length > 0 && (
        <section className="ac-section">
          <h2 className="ac-section__title">{t('seasonAwards.customAwards')}</h2>
          <DataTable
            caption={t('seasonAwards.customAwards')}
            density="dense"
            rows={awardsData.customAwards}
            rowKey={(award) => award.awardId}
            columns={[
              { key: 'name', header: t('seasonAwards.admin.awardName'), render: (award) => <span className="ac-cell__title">{award.name}</span> },
              { key: 'player', header: t('seasonAwards.admin.awardPlayer'), render: (award) => award.playerName },
              { key: 'description', header: t('seasonAwards.admin.description'), render: (award) => award.description || '—' },
              {
                key: 'actions',
                header: t('common.actions'),
                align: 'end',
                render: (award) => (
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(award)}>
                    {t('common.delete')}
                  </Button>
                ),
              },
            ]}
          />
        </section>
      )}

      <AdminFormModal
        open={showForm}
        onClose={closeForm}
        title={t('seasonAwards.admin.createAward')}
        submitLabel={t('seasonAwards.admin.createAward')}
        onSubmit={handleSubmit}
        busy={saving}
        error={formError}
      >
        <div className="ac-field">
          <label className="ac-field__label" htmlFor="award-name">{t('seasonAwards.admin.awardName')}</label>
          <input
            id="award-name"
            type="text"
            value={formData.name}
            onChange={(event) => setFormData({ ...formData, name: event.target.value })}
            required
          />
        </div>
        <div className="ac-field">
          <label className="ac-field__label" htmlFor="award-player">{t('seasonAwards.admin.awardPlayer')}</label>
          <select
            id="award-player"
            value={formData.playerId}
            onChange={(event) => setFormData({ ...formData, playerId: event.target.value })}
            required
          >
            <option value="">{t('seasonAwards.admin.choosePlayer')}</option>
            {players.map((player) => (
              <option key={player.playerId} value={player.playerId}>{player.name}</option>
            ))}
          </select>
        </div>
        <div className="ac-field">
          <label className="ac-field__label" htmlFor="award-description">{t('seasonAwards.admin.description')}</label>
          <input
            id="award-description"
            type="text"
            value={formData.description}
            onChange={(event) => setFormData({ ...formData, description: event.target.value })}
          />
        </div>
      </AdminFormModal>

      {confirmDialog}
    </div>
  );
}
