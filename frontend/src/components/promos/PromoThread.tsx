import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { promosApi } from '../../services/api';
import type { PromoWithContext } from '../../types/promo';
import PromoCard from './PromoCard';
import './PromoThread.css';

export default function PromoThread() {
  const { t } = useTranslation();
  const { promoId } = useParams<{ promoId: string }>();
  const [originalPromo, setOriginalPromo] = useState<PromoWithContext | null>(null);
  const [responses, setResponses] = useState<PromoWithContext[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!promoId) return;
    const controller = new AbortController();
    setLoading(true);
    promosApi
      .getById(promoId, controller.signal)
      .then((data) => {
        setOriginalPromo(data.promo);
        setResponses(
          data.responses.sort(
            (a: PromoWithContext, b: PromoWithContext) =>
              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          )
        );
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [promoId]);

  const handleReact = useCallback(async (pid: string, reaction: import('../../types/promo').ReactionType) => {
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
        <div style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>Loading...</div>
      </div>
    );
  }

  if (!originalPromo) {
    return (
      <div className="promo-thread">
        <div className="promo-thread-not-found">
          <p>{t('promos.thread.notFound', 'Promo not found.')}</p>
          <Link to="/promos" className="back-link">
            {t('promos.thread.backToFeed', 'Back to Promos')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="promo-thread">
      <div className="promo-thread-header">
        <Link to="/promos" className="back-btn">
          {'\u2190'} {t('promos.thread.backToFeed', 'Back to Promos')}
        </Link>
        <h2>{t('promos.thread.title', 'Promo Thread')}</h2>
      </div>

      <div className="promo-thread-original">
        <PromoCard promo={originalPromo} onReact={handleReact} />
      </div>

      {responses.length > 0 && (
        <div className="promo-thread-responses">
          <h3 className="responses-header">
            {responses.length}{' '}
            {responses.length === 1
              ? t('promos.card.response', 'Response')
              : t('promos.card.responses', 'Responses')}
          </h3>
          {responses.map((response) => (
            <div key={response.promoId} className="promo-thread-response-item">
              <div className="thread-line" />
              <PromoCard promo={response} compact onReact={handleReact} />
            </div>
          ))}
        </div>
      )}

      <div className="promo-thread-footer">
        <Link to="/promos/new" className="write-response-btn">
          {t('promos.thread.writeResponse', 'Write a Response')}
        </Link>
      </div>
    </div>
  );
}
