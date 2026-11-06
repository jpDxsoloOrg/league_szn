import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Mic } from 'lucide-react';
import type { PromoType, PromoWithContext } from '../../types/promo';
import { promosApi } from '../../services/api/promos.api';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import DataTable from '../ui/DataTable';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import Select from '../ui/Select';
import Tabs from '../ui/Tabs';
import { useToast } from '../ui/toastContext';
import { isNeedsWrestler } from '../../utils/needsWrestler';
import HiddenBadge from './HiddenBadge';
import AdminChallenges from './AdminChallenges';
import AdminNotice from './AdminNotice';
import useAdminConfirm from './useAdminConfirm';
import './adminContent.css';

/** Staff responses carry `isArchived`, which public responses leave out. */
type AdminPromo = PromoWithContext & { isArchived?: boolean };

type PromoStatusFilter = '' | 'pinned' | 'hidden' | 'archived';

const PROMOS_VIEW = 'promos';
const CALL_OUTS_VIEW = 'call-outs';

const PROMO_TYPE_OPTIONS: { value: '' | PromoType; labelKey: string; fallback: string }[] = [
  { value: '', labelKey: 'adminContent.promos.allTypes', fallback: 'All types' },
  { value: 'open-mic', labelKey: 'promos.types.open-mic', fallback: 'Open Mic' },
  { value: 'call-out', labelKey: 'promos.types.call-out', fallback: 'Call-Out' },
  { value: 'response', labelKey: 'promos.types.response', fallback: 'Response' },
  { value: 'pre-match', labelKey: 'promos.types.pre-match', fallback: 'Pre-Match' },
  { value: 'post-match', labelKey: 'promos.types.post-match', fallback: 'Post-Match' },
  { value: 'championship', labelKey: 'promos.types.championship', fallback: 'Championship' },
  { value: 'return', labelKey: 'promos.types.return', fallback: 'Return' },
  { value: 'rivalry', labelKey: 'promos.types.rivalry', fallback: 'Rivalry' },
];

function getTotalReactions(promo: PromoWithContext): number {
  return Object.values(promo.reactionCounts).reduce((sum, count) => sum + count, 0);
}

function truncateContent(content: string, maxLength: number = 80): string {
  return content.length <= maxLength ? content : `${content.slice(0, maxLength)}...`;
}

function matchesStatus(promo: AdminPromo, status: PromoStatusFilter): boolean {
  if (status === 'pinned') return promo.isPinned;
  if (status === 'hidden') return promo.isHidden;
  if (status === 'archived') return promo.isArchived === true;
  return true;
}

function PromoModeration() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { confirm, confirmDialog } = useAdminConfirm();
  const [promos, setPromos] = useState<AdminPromo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'' | PromoType>('');
  const [filterStatus, setFilterStatus] = useState<PromoStatusFilter>('');
  const [submitting, setSubmitting] = useState<string | null>(null);

  const loadPromos = useCallback(async (signal?: AbortSignal) => {
    try {
      setError(null);
      const data = await promosApi.getAll({ includeHidden: true, includeArchived: true }, signal);
      setPromos(data);
    } catch (err) {
      if (signal?.aborted) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadPromos(controller.signal);
    return () => controller.abort();
  }, [loadPromos]);

  const filteredPromos = useMemo(
    () => promos.filter((promo) => (!filterType || promo.promoType === filterType) && matchesStatus(promo, filterStatus)),
    [promos, filterType, filterStatus],
  );

  const handleTogglePin = async (promo: AdminPromo) => {
    setSubmitting(promo.promoId);
    try {
      const updated = await promosApi.adminUpdate(promo.promoId, { isPinned: !promo.isPinned });
      setPromos((previous) => previous.map((item) => (item.promoId === promo.promoId ? { ...item, isPinned: updated.isPinned } : item)));
      showToast(
        updated.isPinned
          ? t('adminContent.promos.pinned', 'Pinned {{name}}\'s promo', { name: promo.wrestlerName })
          : t('adminContent.promos.unpinned', 'Unpinned {{name}}\'s promo', { name: promo.wrestlerName }),
        'success',
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('adminContent.promos.updateFailed', 'Failed to update promo'), 'error');
    } finally {
      setSubmitting(null);
    }
  };

  const handleToggleHide = async (promo: AdminPromo) => {
    setSubmitting(promo.promoId);
    try {
      const updated = await promosApi.adminUpdate(promo.promoId, { isHidden: !promo.isHidden });
      setPromos((previous) => previous.map((item) => (item.promoId === promo.promoId ? { ...item, isHidden: updated.isHidden } : item)));
      showToast(
        updated.isHidden
          ? t('adminContent.promos.hidden', 'Hid {{name}}\'s promo', { name: promo.wrestlerName })
          : t('adminContent.promos.unhidden', 'Unhid {{name}}\'s promo', { name: promo.wrestlerName }),
        'success',
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('adminContent.promos.updateFailed', 'Failed to update promo'), 'error');
    } finally {
      setSubmitting(null);
    }
  };

  const handleDelete = async (promo: AdminPromo) => {
    const confirmed = await confirm({
      title: t('promos.admin.confirmDelete', 'Are you sure you want to delete this promo?'),
      confirmLabel: t('promos.admin.delete', 'Delete'),
    });
    if (!confirmed) return;

    setSubmitting(promo.promoId);
    try {
      await promosApi.delete(promo.promoId);
      showToast(`${t('promos.admin.deleted', 'Deleted')}: ${promo.wrestlerName}`, 'success');
      await loadPromos();
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('adminContent.promos.deleteFailed', 'Failed to delete promo'), 'error');
    } finally {
      setSubmitting(null);
    }
  };

  const handleBulkClearHidden = async () => {
    const confirmed = await confirm({
      title: t('promos.admin.clearHidden', 'Clear hidden promos'),
      description: t('promos.admin.clearHiddenConfirm', 'Are you sure you want to permanently delete all hidden promos?'),
      confirmLabel: t('promos.admin.clearHidden', 'Clear hidden promos'),
    });
    if (!confirmed) return;

    try {
      const result = await promosApi.bulkDelete({ isHidden: true });
      showToast(result.message, 'success');
      await loadPromos();
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('adminContent.promos.clearFailed', 'Failed to clear hidden promos'), 'error');
    }
  };

  if (error) {
    return (
      <AdminNotice
        tone="error"
        action={<Button variant="ghost" size="sm" onClick={() => loadPromos()}>{t('common.retry', 'Retry')}</Button>}
      >
        {error}
      </AdminNotice>
    );
  }

  return (
    <section className="ac-section">
      <div className="ac-toolbar">
        <Select
          label={t('promos.admin.filterByType', 'Filter by Type')}
          value={filterType}
          onValueChange={(value) => setFilterType(value as '' | PromoType)}
          options={PROMO_TYPE_OPTIONS.map((option) => ({ value: option.value, label: t(option.labelKey, option.fallback) }))}
        />
        <Select
          label={t('adminContent.promos.filterByStatus', 'Filter by Status')}
          value={filterStatus}
          onValueChange={(value) => setFilterStatus(value as PromoStatusFilter)}
          options={[
            { value: '', label: t('adminContent.promos.anyStatus', 'Any status') },
            { value: 'pinned', label: t('adminContent.promos.statusPinned', 'Pinned') },
            { value: 'hidden', label: t('adminContent.promos.statusHidden', 'Hidden') },
            { value: 'archived', label: t('adminContent.promos.statusArchived', 'Archived') },
          ]}
        />
        <span className="ac-toolbar__spacer" />
        <Button variant="secondary" onClick={handleBulkClearHidden}>
          {t('promos.admin.clearHidden', 'Clear hidden promos')}
        </Button>
      </div>

      <DataTable
        caption={t('promos.admin.title', 'Manage Promos')}
        density="dense"
        loading={loading}
        rows={filteredPromos}
        rowKey={(promo) => promo.promoId}
        empty={(
          <EmptyState
            icon={<Mic aria-hidden="true" size={32} />}
            title={t('adminContent.promos.emptyTitle', 'No promos to show')}
            description={t('adminContent.promos.emptyText', 'Promos that match these filters will appear here.')}
          />
        )}
        columns={[
          {
            key: 'player',
            header: t('promos.admin.player', 'Player'),
            render: (promo) => (
              <span className="ac-cell__text">
                {isNeedsWrestler(promo.wrestlerName)
                  ? <HiddenBadge />
                  : <span className="ac-cell__title">{promo.wrestlerName}</span>}
                <span className="ac-cell__sub">{promo.playerName}</span>
              </span>
            ),
            sortValue: (promo) => promo.wrestlerName,
          },
          {
            key: 'type',
            header: t('promos.admin.type', 'Type'),
            render: (promo) => <Badge tone="violet">{t(`promos.types.${promo.promoType}`, promo.promoType)}</Badge>,
          },
          {
            key: 'content',
            header: t('promos.admin.content', 'Content'),
            render: (promo) => (
              <span className="ac-cell__text">
                <span>{truncateContent(promo.title ? `${promo.title} - ${promo.content}` : promo.content)}</span>
                {(promo.isPinned || promo.isHidden || promo.isArchived) && (
                  <span className="ac-badges">
                    {promo.isPinned && <Badge tone="primary">{t('adminContent.promos.statusPinned', 'Pinned')}</Badge>}
                    {promo.isHidden && <Badge tone="warning">{t('adminContent.promos.statusHidden', 'Hidden')}</Badge>}
                    {promo.isArchived && <Badge tone="neutral">{t('adminContent.promos.statusArchived', 'Archived')}</Badge>}
                  </span>
                )}
              </span>
            ),
          },
          {
            key: 'reactions',
            header: t('promos.admin.reactions', 'Reactions'),
            align: 'end',
            render: getTotalReactions,
            sortValue: getTotalReactions,
          },
          {
            key: 'date',
            header: t('promos.admin.date', 'Date'),
            render: (promo) => new Date(promo.createdAt).toLocaleDateString(),
            sortValue: (promo) => promo.createdAt,
          },
          {
            key: 'actions',
            header: t('promos.admin.actions', 'Actions'),
            align: 'end',
            render: (promo) => (
              <div className="ac-actions ac-actions--end">
                {promo.promoType === 'call-out' && promo.targetPlayerId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate('/admin/schedule', { state: { fromPromo: promo } })}
                  >
                    {t('promos.admin.scheduleMatch', 'Schedule Match')}
                  </Button>
                )}
                <Button variant="ghost" size="sm" disabled={submitting === promo.promoId} onClick={() => handleTogglePin(promo)}>
                  {promo.isPinned ? t('promos.admin.unpin', 'Unpin') : t('promos.admin.pin', 'Pin')}
                </Button>
                <Button variant="ghost" size="sm" disabled={submitting === promo.promoId} onClick={() => handleToggleHide(promo)}>
                  {promo.isHidden ? t('promos.admin.unhide', 'Unhide') : t('promos.admin.hide', 'Hide')}
                </Button>
                <Button variant="ghost" size="sm" disabled={submitting === promo.promoId} onClick={() => handleDelete(promo)}>
                  {t('promos.admin.delete', 'Delete')}
                </Button>
              </div>
            ),
          },
        ]}
      />

      {confirmDialog}
    </section>
  );
}

export default function AdminPromos() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get('view') === CALL_OUTS_VIEW ? CALL_OUTS_VIEW : PROMOS_VIEW;

  const handleViewChange = (nextView: string) => {
    setSearchParams(nextView === CALL_OUTS_VIEW ? { view: CALL_OUTS_VIEW } : {}, { replace: true });
  };

  return (
    <div className="ac-page">
      <PageHeader title={t('promos.admin.title', 'Manage Promos')} />
      <Tabs
        label={t('promos.admin.title', 'Manage Promos')}
        value={view}
        onValueChange={handleViewChange}
        items={[
          { value: PROMOS_VIEW, label: t('nav.promos', 'Promos'), content: <PromoModeration /> },
          { value: CALL_OUTS_VIEW, label: t('nav.tabs.callOuts', 'Call-outs'), content: <AdminChallenges /> },
        ]}
      />
    </div>
  );
}
