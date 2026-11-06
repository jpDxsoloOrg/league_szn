import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import { transfersApi } from '../../services/api';
import type { TransferRequestWithDetails } from '../../types';
import Badge from '../ui/Badge';
import type { BadgeTone } from '../ui/Badge';
import Button from '../ui/Button';
import DataTable from '../ui/DataTable';
import type { DataTableColumn } from '../ui/DataTable';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import Skeleton from '../ui/Skeleton';
import Tabs from '../ui/Tabs';
import AdminNotice from './AdminNotice';
import './adminRoster.css';
import './ManageTransfers.css';

type TransferTab = 'pending' | 'history';

const STATUS_TONES: Record<string, BadgeTone> = {
  approved: 'win',
  rejected: 'loss',
  pending: 'warning',
};

export default function ManageTransfers() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TransferTab>('pending');
  const [pendingRequests, setPendingRequests] = useState<TransferRequestWithDetails[]>([]);
  const [historyRequests, setHistoryRequests] = useState<TransferRequestWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  const loadAll = async () => {
    try {
      setLoading(true);
      setError(null);
      const all = await transfersApi.getAllRequests();
      setPendingRequests(all.filter((request) => request.status === 'pending'));
      setHistoryRequests(all.filter((request) => request.status !== 'pending'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('adminRoster.transfers.loadError', 'Failed to load transfer requests'));
    } finally {
      setLoading(false);
    }
  };

  const handleReview = async (requestId: string, status: 'approved' | 'rejected') => {
    try {
      setSubmitting(requestId);
      setError(null);
      await transfersApi.reviewRequest(requestId, {
        status,
        reviewNote: reviewNote[requestId] || undefined,
      });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('adminRoster.transfers.reviewError', 'Failed to review request'));
    } finally {
      setSubmitting(null);
    }
  };

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString();

  const renderMove = (request: TransferRequestWithDetails) => (
    <span className="transfer-move">
      {request.fromDivisionName}
      <ArrowRight aria-label={t('adminRoster.transfers.to', 'to')} size={16} />
      {request.toDivisionName}
    </span>
  );

  const historyColumns: DataTableColumn<TransferRequestWithDetails>[] = [
    {
      key: 'player',
      header: t('adminRoster.transfers.player', 'Player'),
      render: (request) => <span className="ar-strong">{request.playerName}</span>,
      sortValue: (request) => request.playerName,
    },
    { key: 'move', header: t('adminRoster.transfers.move', 'Move'), render: renderMove },
    {
      key: 'status',
      header: t('adminRoster.transfers.status', 'Status'),
      render: (request) => (
        <Badge tone={STATUS_TONES[request.status] ?? 'neutral'}>
          {t(`adminRoster.transfers.statuses.${request.status}`, request.status)}
        </Badge>
      ),
      sortValue: (request) => request.status,
    },
    { key: 'reviewer', header: t('adminRoster.transfers.reviewedBy', 'Reviewed By'), render: (request) => request.reviewedBy ?? '—' },
    { key: 'note', header: t('adminRoster.transfers.note', 'Note'), render: (request) => request.reviewNote ?? '—' },
    {
      key: 'date',
      header: t('adminRoster.transfers.date', 'Date'),
      render: (request) => formatDate(request.updatedAt),
      sortValue: (request) => request.updatedAt,
    },
  ];

  const pendingPanel = pendingRequests.length === 0 ? (
    <EmptyState title={t('adminRoster.transfers.noPending', 'No pending transfer requests.')} />
  ) : (
    <ul className="ar-list">
      {pendingRequests.map((request) => {
        const noteId = `transfer-note-${request.requestId}`;
        const busy = submitting === request.requestId;
        return (
          <li key={request.requestId} className="ar-list__row transfer-row">
            <div className="transfer-row__summary">
              <span className="ar-strong">{request.playerName}</span>
              {renderMove(request)}
              <span className="ar-sub">{formatDate(request.createdAt)}</span>
            </div>
            <p className="transfer-row__reason">{request.reason}</p>
            <div className="transfer-row__review">
              <label className="sr-only" htmlFor={noteId}>
                {t('adminRoster.transfers.noteFor', { defaultValue: 'Review note for {{name}}', name: request.playerName })}
              </label>
              <input
                id={noteId}
                className="ar-input"
                type="text"
                placeholder={t('adminRoster.transfers.notePlaceholder', 'Optional note...')}
                value={reviewNote[request.requestId] || ''}
                onChange={(event) =>
                  setReviewNote((previous) => ({ ...previous, [request.requestId]: event.target.value }))
                }
              />
              <Button size="sm" loading={busy} onClick={() => handleReview(request.requestId, 'approved')}>
                {t('adminRoster.transfers.approve', 'Approve')}
              </Button>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => handleReview(request.requestId, 'rejected')}>
                {t('adminRoster.transfers.reject', 'Reject')}
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="ar-page manage-transfers">
      <PageHeader title={t('adminRoster.transfers.title', 'Division Transfer Requests')} />

      {error && <AdminNotice tone="error">{error}</AdminNotice>}

      {loading ? <Skeleton variant="table" /> : (
        <Tabs
          label={t('adminRoster.transfers.title', 'Division Transfer Requests')}
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as TransferTab)}
          items={[
            {
              value: 'pending',
              label: `${t('adminRoster.transfers.pending', 'Pending')} (${pendingRequests.length})`,
              content: pendingPanel,
            },
            {
              value: 'history',
              label: `${t('adminRoster.transfers.history', 'History')} (${historyRequests.length})`,
              content: (
                <DataTable
                  caption={t('adminRoster.transfers.history', 'History')}
                  density="dense"
                  columns={historyColumns}
                  rows={historyRequests}
                  rowKey={(request) => request.requestId}
                  empty={<EmptyState title={t('adminRoster.transfers.noHistory', 'No processed transfer requests yet.')} />}
                />
              ),
            },
          ]}
        />
      )}
    </div>
  );
}
