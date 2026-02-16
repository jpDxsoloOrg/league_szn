import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { statisticsApi, playersApi } from '../../services/api';
import type { RatedMatchSummary } from '../../services/api';
import type { Player } from '../../types';
import './BestMatches.css';

export default function BestMatches() {
  const { t } = useTranslation();
  const [matches, setMatches] = useState<RatedMatchSummary[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        setLoading(true);
        const [ratingsRes, playersRes] = await Promise.all([
          statisticsApi.getMatchRatings(controller.signal),
          playersApi.getAll(controller.signal),
        ]);
        setMatches(ratingsRes.highestRatedMatches);
        setPlayers(playersRes);
        setError(null);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setError(err instanceof Error ? err.message : 'Failed to load');
        }
      } finally {
        setLoading(false);
      }
    };
    load();
    return () => controller.abort();
  }, []);

  const getPlayerName = (playerId: string): string => {
    const p = players.find((x) => x.playerId === playerId);
    return p ? p.currentWrestler : playerId;
  };

  if (loading) {
    return (
      <div className="best-matches">
        <h2>{t('statistics.bestMatches.title')}</h2>
        <p>{t('common.loading')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="best-matches">
        <h2>{t('statistics.bestMatches.title')}</h2>
        <p className="best-matches-error">{error}</p>
      </div>
    );
  }

  return (
    <div className="best-matches">
      <div className="best-matches-header">
        <h2>{t('statistics.bestMatches.title')}</h2>
        <div className="best-matches-nav">
          <Link to="/stats">{t('statistics.nav.playerStats')}</Link>
          <Link to="/stats/head-to-head">{t('statistics.nav.headToHead')}</Link>
          <Link to="/stats/leaderboards">{t('statistics.nav.leaderboards')}</Link>
          <Link to="/stats/records">{t('statistics.nav.records')}</Link>
          <Link to="/stats/achievements">{t('statistics.nav.achievements')}</Link>
        </div>
      </div>

      {matches.length === 0 ? (
        <p className="best-matches-empty">{t('statistics.bestMatches.noData')}</p>
      ) : (
        <ul className="best-matches-list">
          {matches.map((m) => (
            <li key={m.matchId} className="best-match-item">
              <span className="best-match-stars">★ {m.starRating}</span>
              {m.matchOfTheNight && (
                <span className="best-match-motn">{t('match.matchOfTheNightBadge')}</span>
              )}
              <span className="best-match-date">
                {new Date(m.date).toLocaleDateString()}
              </span>
              <span className="best-match-participants">
                {m.participants.map((pid) => getPlayerName(pid)).join(' vs ')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
