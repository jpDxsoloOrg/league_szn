import { useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Target } from 'lucide-react';
import type { Championship } from '../../types';
import type { ContenderConfig } from '../../types/contender';
import { championshipsApi, contendersApi } from '../../services/api';
import Button from '../ui/Button';
import Card from '../ui/Card';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import Skeleton from '../ui/Skeleton';
import AdminNotice from './AdminNotice';
import useAdminConfirm from './useAdminConfirm';
import './adminContent.css';

const defaultConfig = (championshipId: string): ContenderConfig => ({
  championshipId,
  minimumMatches: 5,
  maxContenders: 8,
  includeDraws: false,
  divisionRestricted: true,
});

type NumberField = 'minimumMatches' | 'maxContenders';
type FlagField = 'includeDraws' | 'divisionRestricted';

export default function AdminContenderConfig() {
  const { t } = useTranslation();
  const { confirm, confirmDialog } = useAdminConfirm();
  const [championships, setChampionships] = useState<Championship[]>([]);
  const [selectedChampionshipId, setSelectedChampionshipId] = useState('');
  const [config, setConfig] = useState<ContenderConfig>(defaultConfig(''));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [recalculating, setRecalculating] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await championshipsApi.getAll(controller.signal);
        setChampionships(data);
        const firstId = data[0]?.championshipId ?? '';
        setSelectedChampionshipId(firstId);
        setConfig(defaultConfig(firstId));
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

  const handleChampionshipChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSelectedChampionshipId(event.target.value);
    setConfig(defaultConfig(event.target.value));
  };

  const handleNumberChange = (field: NumberField, value: string) => {
    const parsed = parseInt(value, 10);
    if (!Number.isNaN(parsed)) setConfig((previous) => ({ ...previous, [field]: parsed }));
  };

  const handleFlagChange = (field: FlagField) => {
    setConfig((previous) => ({ ...previous, [field]: !previous[field] }));
  };

  const handleRecalculate = async () => {
    const confirmed = await confirm({
      title: t('contenders.admin.recalculateTitle', 'Recalculate rankings?'),
      description: t(
        'contenders.admin.recalculateConfirm',
        'This replaces the current rankings with new ones built from match results and the settings on this page.',
      ),
      confirmLabel: t('contenders.admin.recalculate'),
      danger: false,
    });
    if (!confirmed) return;

    setRecalculating(true);
    setMessage(null);
    try {
      const result = await contendersApi.recalculate(selectedChampionshipId || undefined, {
        minimumMatches: config.minimumMatches,
        maxContenders: config.maxContenders,
        includeDraws: config.includeDraws,
        divisionRestricted: config.divisionRestricted,
      });
      setMessage({ type: 'success', text: result.message });
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : t('adminContent.contenders.recalculateFailed', 'Failed to recalculate rankings'),
      });
    } finally {
      setRecalculating(false);
    }
  };

  const title = t('contenders.admin.title');

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
          icon={<Target aria-hidden="true" size={32} />}
          title={t('contenders.admin.noChampionships', 'No championships found. Create championships first.')}
        />
      </div>
    );
  }

  return (
    <div className="ac-page">
      <PageHeader title={title} subtitle={t('contenders.admin.subtitle')} />

      {message && <AdminNotice tone={message.type}>{message.text}</AdminNotice>}

      <Card className="ac-form">
        <div className="ac-field">
          <label className="ac-field__label" htmlFor="championship-select">{t('contenders.admin.selectChampionship')}</label>
          <select id="championship-select" value={selectedChampionshipId} onChange={handleChampionshipChange}>
            {championships.map((championship) => (
              <option key={championship.championshipId} value={championship.championshipId}>{championship.name}</option>
            ))}
          </select>
          <p className="ac-field__hint">{t('contenders.admin.currentSeasonNote')}</p>
        </div>

        <div className="ac-form__row">
          <div className="ac-field">
            <label className="ac-field__label" htmlFor="minimum-matches">{t('contenders.admin.minimumMatches')}</label>
            <input
              id="minimum-matches"
              type="number"
              value={config.minimumMatches}
              onChange={(event) => handleNumberChange('minimumMatches', event.target.value)}
              min={1}
              max={50}
            />
            <p className="ac-field__hint">{t('contenders.admin.minimumMatchesHint')}</p>
          </div>
          <div className="ac-field">
            <label className="ac-field__label" htmlFor="max-contenders">{t('contenders.admin.maxContenders')}</label>
            <input
              id="max-contenders"
              type="number"
              value={config.maxContenders}
              onChange={(event) => handleNumberChange('maxContenders', event.target.value)}
              min={1}
              max={20}
            />
            <p className="ac-field__hint">{t('contenders.admin.maxContendersHint')}</p>
          </div>
        </div>

        <div className="ac-form__row">
          <div className="ac-field">
            <label className="ac-check">
              <input type="checkbox" checked={config.includeDraws} onChange={() => handleFlagChange('includeDraws')} />
              {t('contenders.admin.includeDraws')}
            </label>
            <p className="ac-field__hint">{t('contenders.admin.includeDrawsHint')}</p>
          </div>
          <div className="ac-field">
            <label className="ac-check">
              <input type="checkbox" checked={config.divisionRestricted} onChange={() => handleFlagChange('divisionRestricted')} />
              {t('contenders.admin.divisionRestricted')}
            </label>
            <p className="ac-field__hint">{t('contenders.admin.divisionRestrictedHint')}</p>
          </div>
        </div>

        <div className="ac-actions">
          <Button onClick={handleRecalculate} loading={recalculating}>
            {t('contenders.admin.recalculate')}
          </Button>
        </div>
      </Card>

      {confirmDialog}
    </div>
  );
}
