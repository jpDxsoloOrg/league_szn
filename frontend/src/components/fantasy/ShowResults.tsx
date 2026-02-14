import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, Link } from 'react-router-dom';
import { eventsApi, fantasyApi, divisionsApi } from '../../services/api';
import type { EventWithMatches } from '../../types/event';
import type { FantasyPicks, WrestlerWithCost } from '../../types/fantasy';
import type { Division } from '../../types';
import './ShowResults.css';

export default function ShowResults() {
  const { t } = useTranslation();
  const { eventId } = useParams<{ eventId: string }>();

  const [event, setEvent] = useState<EventWithMatches | null>(null);
  const [userPicks, setUserPicks] = useState<FantasyPicks | null>(null);
  const [wrestlers, setWrestlers] = useState<WrestlerWithCost[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!eventId) return;

    const controller = new AbortController();

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const [eventData, wrestlersData, divisionsData] = await Promise.all([
          eventsApi.getById(eventId, controller.signal),
          fantasyApi.getWrestlerCosts(controller.signal),
          divisionsApi.getAll(controller.signal),
        ]);

        setEvent(eventData);
        setWrestlers(wrestlersData);
        setDivisions(divisionsData);

        // Fetch user picks separately (may 404 if user didn't pick)
        try {
          const picksData = await fantasyApi.getUserPicks(eventId, controller.signal);
          setUserPicks(picksData);
        } catch {
          // User may not have picks for this event
          setUserPicks(null);
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        console.error('Failed to load show results:', err);
        setError('show-not-found');
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    return () => controller.abort();
  }, [eventId]);

  const getWrestlerName = (playerId: string): string => {
    const wrestler = wrestlers.find((w) => w.playerId === playerId);
    return wrestler?.currentWrestler || 'Unknown';
  };

  const getDivisionName = (divisionId: string): string => {
    const division = divisions.find((d) => d.divisionId === divisionId);
    return division?.name || 'Unknown';
  };

  if (loading) {
    return (
      <div className="show-results">
        <div className="loading-state">
          <div className="spinner" />
          <p>{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="error-state">
        <h2>{t('fantasy.results.showNotFound')}</h2>
        <Link to="/fantasy/dashboard">{t('fantasy.results.backToDashboard')}</Link>
      </div>
    );
  }

  if (event.status !== 'completed') {
    return (
      <div className="error-state">
        <h2>{t('fantasy.results.showNotComplete')}</h2>
        <p>{t('fantasy.results.checkBackLater')}</p>
        <Link to="/fantasy/dashboard">{t('fantasy.results.backToDashboard')}</Link>
      </div>
    );
  }

  // Get all picked player IDs
  const pickedPlayerIds = userPicks
    ? Object.values(userPicks.picks).flat()
    : [];

  // Get enriched matches from the event
  const matches = event.enrichedMatches || [];

  return (
    <div className="show-results">
      <header className="results-header">
        <div className="header-info">
          <Link to="/fantasy/dashboard" className="back-link">
            {t('fantasy.results.backToDashboard')}
          </Link>
          <h1>{event.name}</h1>
          <p className="show-date">
            {new Date(event.date).toLocaleDateString(undefined, {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
        <div className="total-points">
          <span className="points-label">{t('fantasy.results.yourPoints')}</span>
          <span className="points-value">+{userPicks?.pointsEarned || 0}</span>
        </div>
      </header>

      {/* Your Picks Summary */}
      <section className="picks-summary">
        <h2>{t('fantasy.results.yourPicks')}</h2>
        {userPicks ? (
          <div className="picks-grid">
            {Object.entries(userPicks.picks).map(([divisionId, playerIds]) => (
              <div key={divisionId} className="division-results">
                <h3>{getDivisionName(divisionId)}</h3>
                {playerIds.length > 0 ? (
                  <div className="picks-list">
                    {playerIds.map((playerId) => {
                      const breakdown = userPicks.breakdown?.[playerId];
                      const isWinner = breakdown && breakdown.points > 0;
                      return (
                        <div
                          key={playerId}
                          className={`pick-result ${isWinner ? 'winner' : 'loser'}`}
                        >
                          <div className="pick-info">
                            <span className="wrestler-name">{getWrestlerName(playerId)}</span>
                            <span className="result-status">
                              {breakdown?.reason || t('fantasy.results.didNotCompete')}
                            </span>
                          </div>
                          <div className="pick-points">
                            {breakdown && breakdown.points > 0 ? (
                              <span className="points-earned">+{breakdown.points}</span>
                            ) : (
                              <span className="no-points">0</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="no-picks">{t('fantasy.results.noPicks')}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="no-picks-message">
            <p>{t('fantasy.results.didNotParticipate')}</p>
          </div>
        )}
      </section>

      {/* Match Results */}
      <section className="match-results">
        <h2>{t('fantasy.results.matchResults')}</h2>
        <div className="matches-list">
          {matches.map((matchEntry) => {
            const match = matchEntry.matchData;
            if (!match) return null;

            const hasPickedWinner = match.winners?.some((id) => pickedPlayerIds.includes(id));
            const hasPickedLoser = match.losers?.some((id) => pickedPlayerIds.includes(id));
            const participantCount = match.participants?.length || 0;

            return (
              <div
                key={match.matchId}
                className={`match-card ${hasPickedWinner ? 'picked-winner' : ''} ${hasPickedLoser ? 'picked-loser' : ''}`}
              >
                <div className="match-header">
                  <span className="match-type">{match.matchFormat}</span>
                  {match.isChampionship && (
                    <span className="championship-badge">
                      {match.championshipName || t('fantasy.results.championship')}
                    </span>
                  )}
                </div>

                <div className="match-participants">
                  <div className="winners">
                    <span className="label">{t('fantasy.results.winners')}</span>
                    {match.winners?.map((playerId) => (
                      <span
                        key={playerId}
                        className={`participant ${pickedPlayerIds.includes(playerId) ? 'picked' : ''}`}
                      >
                        {getWrestlerName(playerId)}
                        {pickedPlayerIds.includes(playerId) && (
                          <span className="your-pick">{t('fantasy.results.yourPick')}</span>
                        )}
                      </span>
                    ))}
                  </div>
                  <div className="losers">
                    <span className="label">{t('fantasy.results.losers')}</span>
                    {match.losers?.map((playerId) => (
                      <span
                        key={playerId}
                        className={`participant ${pickedPlayerIds.includes(playerId) ? 'picked lost' : ''}`}
                      >
                        {getWrestlerName(playerId)}
                        {pickedPlayerIds.includes(playerId) && (
                          <span className="your-pick">{t('fantasy.results.yourPick')}</span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="match-points">
                  <span className="points-info">
                    {t('fantasy.results.pointsAwarded', {
                      points: participantCount > 1 ? (participantCount - 1) * 10 : 0,
                    })}
                    {match.isChampionship && ` (+5 ${t('fantasy.results.titleBonus')})`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Points Breakdown */}
      {userPicks?.breakdown && Object.keys(userPicks.breakdown).length > 0 && (
        <section className="points-breakdown">
          <h2>{t('fantasy.results.pointsBreakdown')}</h2>
          <div className="breakdown-table">
            <div className="breakdown-header">
              <span className="col-wrestler">{t('fantasy.results.wrestler')}</span>
              <span className="col-base">{t('fantasy.results.base')}</span>
              <span className="col-bonuses">{t('fantasy.results.bonuses')}</span>
              <span className="col-total">{t('fantasy.results.total')}</span>
            </div>
            {Object.entries(userPicks.breakdown)
              .filter(([_, b]) => b.points > 0)
              .map(([playerId, breakdown]) => (
                <div key={playerId} className="breakdown-row">
                  <span className="col-wrestler">{getWrestlerName(playerId)}</span>
                  <span className="col-base">{breakdown.basePoints}</span>
                  <span className="col-bonuses">
                    {breakdown.multipliers.slice(1).join(', ') || '-'}
                  </span>
                  <span className="col-total">{breakdown.points}</span>
                </div>
              ))}
            <div className="breakdown-total">
              <span className="col-wrestler">{t('fantasy.results.total')}</span>
              <span className="col-total-value">{userPicks.pointsEarned}</span>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
