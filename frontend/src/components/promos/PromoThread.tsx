import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getPromoById, getResponsesForPromo } from '../../mocks/promoMockData';
import PromoCard from './PromoCard';
import './PromoThread.css';

export default function PromoThread() {
  const { t } = useTranslation();
  const { promoId } = useParams<{ promoId: string }>();

  const originalPromo = useMemo(() => {
    if (!promoId) return null;
    return getPromoById(promoId);
  }, [promoId]);

  const responses = useMemo(() => {
    if (!promoId) return [];
    return getResponsesForPromo(promoId).sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }, [promoId]);

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
        <PromoCard promo={originalPromo} />
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
              <PromoCard promo={response} compact />
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
