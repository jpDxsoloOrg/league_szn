import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { rivalriesApi } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import type { Rivalry } from '../../types/rivalry';

/**
 * Dashboard surface card for the logged-in wrestler's active
 * rivalries. Self-gates: returns null for non-wrestlers, anonymous
 * visitors, or wrestlers with zero active rivalries — never blocks
 * the rest of the dashboard on a fetch failure.
 */
export default function DashboardRivalries() {
  const { t } = useTranslation();
  const { isAuthenticated, playerId, isWrestler } = useAuth();
  const [rivalries, setRivalries] = useState<Rivalry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !playerId || !isWrestler) {
      setLoaded(true);
      return;
    }
    const controller = new AbortController();
    let mounted = true;
    rivalriesApi
      .list({ participantId: playerId, status: 'active', limit: 3 }, controller.signal)
      .then((res) => {
        if (!mounted) return;
        setRivalries(res.rivalries.slice(0, 3));
      })
      .catch(() => undefined)
      .finally(() => {
        if (mounted) setLoaded(true);
      });
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [isAuthenticated, playerId, isWrestler]);

  if (!loaded || !isAuthenticated || !isWrestler || rivalries.length === 0) return null;

  return (
    <section className="db-rivalries">
      <header className="db-section-header">
        <h3 className="db-section-title">{t('rivalries.hub.tabs.mine')}</h3>
        <Link to="/rivalries?tab=mine" className="db-section-link">
          {t('rivalries.hub.viewRivalry')} →
        </Link>
      </header>
      <ul className="db-rivalries__list">
        {rivalries.map((r) => (
          <li key={r.rivalryId}>
            <Link to={`/rivalries/${r.rivalryId}`} className="db-rivalries__item">
              <span className="db-rivalries__title">{r.title}</span>
              <span className="db-rivalries__heat">heat: {r.heat}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
