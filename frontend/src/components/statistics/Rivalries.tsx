import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { rivalriesApi, seasonsApi } from '../../services/api';
import type { Rivalry } from '../../services/api/rivalries.api';
import type { Season } from '../../types';
import SeasonSelector from './SeasonSelector';
import './Rivalries.css';

function Rivalries() {
  const { t } = useTranslation();
  const [rivalries, setRivalries] = useState<Rivalry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState('');

  useEffect(() => {
    const abortController = new AbortController();
    seasonsApi.getAll(abortController.signal)
      .then(setSeasons)
      .catch(() => {});
    return () => abortController.abort();
  }, []);

  useEffect(() => {
    const abortController = new AbortController();
    const fetchRivalries = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await rivalriesApi.getRivalries(
          selectedSeasonId || undefined,
          abortController.signal
        );
        setRivalries(result.rivalries);
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setError(err.message);
        }
      } finally {
        setLoading(false);
      }
    };
    fetchRivalries();
    return () => abortController.abort();
  }, [selectedSeasonId]);

  function seriesRecordText(r: Rivalry): string {
    const p1W = r.player1Wins;
    const p2W = r.player2Wins;
    const d = r.draws;
    const p1 = r.player1?.wrestlerName ?? r.player1Id;
    const p2 = r.player2?.wrestlerName ?? r.player2Id;
    if (p1W > p2W) return t('rivalries.leads', { name: p1, wins: p1W, losses: p2W });
    if (p2W > p1W) return t('rivalries.leads', { name: p2, wins: p2W, losses: p1W });
    return t('rivalries.tied', { count: p1W });
  }

  function intensityLabel(badge: 'heatingUp' | 'intense' | 'historic'): string {
    switch (badge) {
      case 'heatingUp': return t('rivalries.intensity.heatingUp');
      case 'intense': return t('rivalries.intensity.intense');
      case 'historic': return t('rivalries.intensity.historic');
      default: return '';
    }
  }

  if (loading) {
    return (
      <div className="rivalries">
        <h2>{t('rivalries.title')}</h2>
        <p>{t('common.loading', 'Loading...')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rivalries">
        <h2>{t('rivalries.title')}</h2>
        <p className="rivalries-error">{error}</p>
      </div>
    );
  }

  return (
    <div className="rivalries">
      <div className="rivalries-header">
        <h2>{t('rivalries.title')}</h2>
        <div className="rivalries-nav-links">
          <Link to="/stats">{t('statistics.nav.playerStats')}</Link>
          <Link to="/stats/head-to-head">{t('statistics.nav.headToHead')}</Link>
          <Link to="/stats/leaderboards">{t('statistics.nav.leaderboards')}</Link>
          <Link to="/stats/tale-of-tape">{t('statistics.nav.taleOfTape')}</Link>
          <Link to="/stats/records">{t('statistics.nav.records')}</Link>
          <Link to="/stats/achievements">{t('statistics.nav.achievements')}</Link>
        </div>
      </div>

      <SeasonSelector
        seasons={seasons}
        selectedSeasonId={selectedSeasonId}
        onSeasonChange={setSelectedSeasonId}
      />

      {rivalries.length === 0 ? (
        <p className="rivalries-empty">{t('rivalries.noRivalries')}</p>
      ) : (
        <div className="rivalries-grid">
          {rivalries.map((r) => (
            <div key={`${r.player1Id}-${r.player2Id}`} className="rivalry-card">
              <div className="rivalry-card-players">
                <div className="rivalry-player">
                  {r.player1?.imageUrl ? (
                    <img src={r.player1.imageUrl} alt="" className="rivalry-player-img" />
                  ) : (
                    <div className="rivalry-player-placeholder" />
                  )}
                  <span className="rivalry-player-name">{r.player1?.wrestlerName ?? r.player1Id}</span>
                </div>
                <span className="rivalry-vs">vs</span>
                <div className="rivalry-player">
                  {r.player2?.imageUrl ? (
                    <img src={r.player2.imageUrl} alt="" className="rivalry-player-img" />
                  ) : (
                    <div className="rivalry-player-placeholder" />
                  )}
                  <span className="rivalry-player-name">{r.player2?.wrestlerName ?? r.player2Id}</span>
                </div>
              </div>
              <p className="rivalry-series">{seriesRecordText(r)}</p>
              <p className="rivalry-meta">
                {t('rivalries.recentMatches')}: {r.matchCount}
                {r.championshipMatches > 0 && ` · ${t('rivalries.championshipAtStake')}`}
              </p>
              <span className={`rivalry-badge rivalry-badge-${r.intensityBadge}`}>
                {intensityLabel(r.intensityBadge)}
              </span>
              <Link
                to={`/stats/head-to-head?player1Id=${r.player1Id}&player2Id=${r.player2Id}`}
                className="rivalry-link"
              >
                {t('rivalries.viewHeadToHead')}
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Rivalries;
