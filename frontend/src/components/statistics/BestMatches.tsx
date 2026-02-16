import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { statisticsApi, seasonsApi, playersApi } from '../../services/api';
import type { TopRatedMatch } from '../../services/api/statistics.api';
import type { Season } from '../../types';
import SeasonSelector from './SeasonSelector';
import './BestMatches.css';

export default function BestMatches() {
  const { t } = useTranslation();
  const [topRated, setTopRated] = useState<TopRatedMatch[]>([]);
  const [playerAverages, setPlayerAverages] = useState<{ playerId: string; averageRating: number; matchCount: number }[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState('');
  const [loading, setLoading] = useState(true);
  const [playersMap, setPlayersMap] = useState<Map<string, { name: string; wrestlerName: string }>>(new Map());

  useEffect(() => {
    const ac = new AbortController();
    Promise.all([seasonsApi.getAll(ac.signal), playersApi.getAll(ac.signal)])
      .then(([seasonsList, playersList]) => {
        setSeasons(seasonsList);
        const map = new Map<string, { name: string; wrestlerName: string }>();
        for (const p of playersList) {
          map.set(p.playerId, { name: p.name, wrestlerName: p.currentWrestler });
        }
        setPlayersMap(map);
      })
      .catch(() => {});
    return () => ac.abort();
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    statisticsApi
      .getMatchRatings(selectedSeasonId || undefined, ac.signal)
      .then((res) => {
        setTopRated(res.topRatedMatches);
        setPlayerAverages(res.playerAverages);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, [selectedSeasonId]);

  const renderStars = (rating: number) => {
    const stars: string[] = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(i <= Math.floor(rating) || (i === Math.ceil(rating) && rating % 1 >= 0.5) ? '\u2605' : '\u2606');
    }
    return stars.join('');
  };

  return (
    <div className="best-matches-page">
      <div className="best-matches-header">
        <h2>{t('matchRatings.bestMatches')}</h2>
        <div className="best-matches-nav">
          <Link to="/stats">{t('nav.statistics')}</Link>
          <Link to="/stats/head-to-head">{t('statistics.nav.headToHead')}</Link>
          <Link to="/stats/leaderboards">{t('statistics.nav.leaderboards')}</Link>
          <Link to="/stats/records">{t('statistics.nav.records')}</Link>
          <Link to="/stats/achievements">{t('statistics.nav.achievements')}</Link>
        </div>
      </div>
      {seasons.length > 0 && (
        <div className="best-matches-season">
          <SeasonSelector
            seasons={seasons}
            selectedSeasonId={selectedSeasonId}
            onSeasonChange={setSelectedSeasonId}
          />
        </div>
      )}
      {loading ? (
        <p>{t('common.loading')}</p>
      ) : (
        <>
          <section className="best-matches-list">
            <h3>{t('matchRatings.bestMatches')}</h3>
            {topRated.length === 0 ? (
              <p className="best-matches-empty">No rated matches yet.</p>
            ) : (
              <ul className="best-matches-ul">
                {topRated.map((m) => (
                  <li key={m.matchId} className="best-matches-item">
                    <span className="best-matches-date">{new Date(m.date).toLocaleDateString()}</span>
                    <span className="best-matches-participants">
                      {(m.participants || [])
                        .map((pid) => playersMap.get(pid)?.wrestlerName ?? pid)
                        .join(' vs ')}
                    </span>
                    <span className="best-matches-stars">{m.starRating != null ? renderStars(m.starRating) : '—'}</span>
                    <span className="best-matches-value">{m.starRating != null ? `${m.starRating}/5` : '—'}</span>
                    {m.matchOfTheNight && <span className="best-matches-motn">{t('matchRatings.motnBadge')}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
          {playerAverages.length > 0 && (
            <section className="best-matches-averages">
              <h3>Average match rating (min 1 rated match)</h3>
              <ul className="best-matches-ul">
                {playerAverages
                  .sort((a, b) => b.averageRating - a.averageRating)
                  .slice(0, 15)
                  .map(({ playerId, averageRating, matchCount }) => (
                    <li key={playerId} className="best-matches-item">
                      <span className="best-matches-player">{playersMap.get(playerId)?.wrestlerName ?? playerId}</span>
                      <span className="best-matches-value">{averageRating.toFixed(1)}/5</span>
                      <span className="best-matches-count">({matchCount} matches)</span>
                    </li>
                  ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
