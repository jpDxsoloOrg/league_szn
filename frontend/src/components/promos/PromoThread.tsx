import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { isApiError, promosApi } from '../../services/api';
import type { PromoWithContext, ReactionType } from '../../types/promo';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import Skeleton from '../ui/Skeleton';
import PromoCard from './PromoCard';
import './PromoThread.css';

export default function PromoThread() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  // Reacting needs the Wrestler role; everyone else sees the counts read-only.
  const canReact = hasRole('Wrestler');
  const { promoId } = useParams<{ promoId: string }>();
  const [originalPromo, setOriginalPromo] = useState<PromoWithContext | null>(null);
  const [responses, setResponses] = useState<PromoWithContext[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!promoId) return;
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setLoadFailed(false);
      try {
        const data = await promosApi.getById(promoId, controller.signal);
        if (controller.signal.aborted) return;
        setOriginalPromo(data.promo);
        setResponses(
          [...data.responses].sort(
            (a: PromoWithContext, b: PromoWithContext) =>
              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          )
        );
      } catch (err) {
        if (controller.signal.aborted) return;
        setOriginalPromo(null);
        setLoadFailed(!isApiError(err, 404));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [promoId, reloadKey]);

  const handleReact = useCallback(async (pid: string, reaction: ReactionType) => {
    try {
      const result = await promosApi.react(pid, reaction);
      if (pid === originalPromo?.promoId) {
        setOriginalPromo((prev) => prev ? { ...prev, reactionCounts: result.reactionCounts } : prev);
      } else {
        setResponses((prev) =>
          prev.map((p) => p.promoId === pid ? { ...p, reactionCounts: result.reactionCounts } : p)
        );
      }
    } catch { /* silent */ }
  }, [originalPromo?.promoId]);

  if (loading) {
    return (
      <div className="promo-thread">
        <Skeleton variant="block" count={3} />
      </div>
    );
  }

  if (!originalPromo) {
    return (
      <div className="promo-thread">
        {loadFailed ? (
          <EmptyState
            title={t('promos.thread.loadError', 'Could not load this promo')}
            actionLabel={t('common.retry', 'Retry')}
            onAction={() => setReloadKey((key) => key + 1)}
          />
        ) : (
          <EmptyState
            title={t('promos.thread.notFound', 'Promo not found.')}
            actionLabel={t('promos.thread.backToFeed', 'Back to Promos')}
            onAction={() => navigate('/promos')}
          />
        )}
      </div>
    );
  }

  return (
    <div className="promo-thread">
      <Button variant="ghost" size="sm" to="/promos" icon={<ArrowLeft aria-hidden="true" size={18} />}>
        {t('promos.thread.backToFeed', 'Back to Promos')}
      </Button>

      <PageHeader title={t('promos.thread.title', 'Promo Thread')} />

      <PromoCard promo={originalPromo} onReact={canReact ? handleReact : undefined} />

      {responses.length > 0 && (
        <section className="promo-thread__responses">
          <h2 className="promo-thread__heading">
            {responses.length}{' '}
            {responses.length === 1
              ? t('promos.card.response', 'Response')
              : t('promos.card.responses', 'Responses')}
          </h2>
          <ol className="promo-thread__list">
            {responses.map((response) => (
              <li key={response.promoId}>
                <PromoCard promo={response} compact onReact={canReact ? handleReact : undefined} />
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="promo-thread__footer">
        <Button to="/promos/new">{t('promos.thread.writeResponse', 'Write a Response')}</Button>
      </div>
    </div>
  );
}
