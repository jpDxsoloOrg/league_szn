import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  mockPlayers,
  getPlayerStats,
  getHeadToHead,
  getPlayerById,
} from '../../mocks/statisticsMockData';
import './HeadToHeadComparison.css';

function HeadToHeadComparison() {
  const { t } = useTranslation();
  const [player1Id, setPlayer1Id] = useState('p1');
  const [player2Id, setPlayer2Id] = useState('p2');

  const player1 = useMemo(() => getPlayerById(player1Id), [player1Id]);
  const player2 = useMemo(() => getPlayerById(player2Id), [player2Id]);

  const p1Stats = useMemo(
    () => getPlayerStats(player1Id, 'overall')[0],
    [player1Id]
  );
  const p2Stats = useMemo(
    () => getPlayerStats(player2Id, 'overall')[0],
    [player2Id]
  );

  const h2h = useMemo(
    () => getHeadToHead(player1Id, player2Id),
    [player1Id, player2Id]
  );

  // Determine if h2h data has player order swapped
  const isSwapped = h2h ? h2h.player1Id !== player1Id : false;
  const p1H2HWins = h2h ? (isSwapped ? h2h.player2Wins : h2h.player1Wins) : 0;
  const p2H2HWins = h2h ? (isSwapped ? h2h.player1Wins : h2h.player2Wins) : 0;
  const h2hDraws = h2h ? h2h.draws : 0;

  function renderStatBar(label: string, val1: number, val2: number, suffix: string = '') {
    const max = Math.max(val1, val2, 1);
    const p1Width = (val1 / max) * 100;
    const p2Width = (val2 / max) * 100;
    const p1Better = val1 > val2;
    const p2Better = val2 > val1;

    return (
      <div className="h2h-stat-row" key={label}>
        <div className="h2h-stat-p1">
          <span className={`h2h-stat-val ${p1Better ? 'h2h-better' : ''}`}>
            {val1}{suffix}
          </span>
          <div className="h2h-bar-track h2h-bar-left">
            <div
              className={`h2h-bar-fill h2h-bar-fill-left ${p1Better ? 'h2h-bar-winner' : ''}`}
              style={{ width: `${p1Width}%` }}
            />
          </div>
        </div>
        <div className="h2h-stat-label">{label}</div>
        <div className="h2h-stat-p2">
          <div className="h2h-bar-track h2h-bar-right">
            <div
              className={`h2h-bar-fill h2h-bar-fill-right ${p2Better ? 'h2h-bar-winner' : ''}`}
              style={{ width: `${p2Width}%` }}
            />
          </div>
          <span className={`h2h-stat-val ${p2Better ? 'h2h-better' : ''}`}>
            {val2}{suffix}
          </span>
        </div>
      </div>
    );
  }

  // Calculate statistical edge
  const edgeCategories = p1Stats && p2Stats ? [
    { label: t('statistics.labels.wins'), p1: p1Stats.wins, p2: p2Stats.wins },
    { label: t('statistics.labels.winPercentage'), p1: p1Stats.winPercentage, p2: p2Stats.winPercentage },
    { label: t('statistics.labels.longestWinStreak'), p1: p1Stats.longestWinStreak, p2: p2Stats.longestWinStreak },
    { label: t('statistics.labels.titleWins'), p1: p1Stats.championshipWins, p2: p2Stats.championshipWins },
    { label: t('statistics.headToHead.headToHeadRecord'), p1: p1H2HWins, p2: p2H2HWins },
  ] : [];

  const p1Advantages = edgeCategories.filter((c) => c.p1 > c.p2).length;
  const p2Advantages = edgeCategories.filter((c) => c.p2 > c.p1).length;

  return (
    <div className="h2h-comparison">
      <div className="h2h-header">
        <h2>{t('statistics.headToHead.title')}</h2>
        <div className="h2h-nav-links">
          <Link to="/stats">{t('statistics.nav.playerStats')}</Link>
          <Link to="/stats/leaderboards">{t('statistics.nav.leaderboards')}</Link>
          <Link to="/stats/tale-of-tape">{t('statistics.nav.taleOfTape')}</Link>
        </div>
      </div>

      <div className="h2h-selectors">
        <div className="h2h-selector">
          <label>{t('statistics.headToHead.player1')}</label>
          <select
            value={player1Id}
            onChange={(e) => setPlayer1Id(e.target.value)}
          >
            {mockPlayers.map((p) => (
              <option key={p.playerId} value={p.playerId}>
                {p.name} ({p.wrestlerName})
              </option>
            ))}
          </select>
        </div>
        <div className="h2h-vs">{t('common.vs')}</div>
        <div className="h2h-selector">
          <label>{t('statistics.headToHead.player2')}</label>
          <select
            value={player2Id}
            onChange={(e) => setPlayer2Id(e.target.value)}
          >
            {mockPlayers.map((p) => (
              <option key={p.playerId} value={p.playerId}>
                {p.name} ({p.wrestlerName})
              </option>
            ))}
          </select>
        </div>
      </div>

      {player1Id === player2Id ? (
        <div className="h2h-same-player">{t('statistics.headToHead.selectDifferent')}</div>
      ) : (
        <>
          {/* Stat Bars */}
          {p1Stats && p2Stats && (
            <div className="h2h-card h2h-stats-card">
              <h3>{t('statistics.headToHead.statComparison')}</h3>
              <div className="h2h-player-names">
                <span className="h2h-p1-name">{player1?.name} ({player1?.wrestlerName})</span>
                <span className="h2h-p2-name">{player2?.name} ({player2?.wrestlerName})</span>
              </div>
              {renderStatBar(t('statistics.labels.wins'), p1Stats.wins, p2Stats.wins)}
              {renderStatBar(t('statistics.labels.losses'), p1Stats.losses, p2Stats.losses)}
              {renderStatBar(t('statistics.labels.winPercentage'), p1Stats.winPercentage, p2Stats.winPercentage, '%')}
              {renderStatBar(t('statistics.labels.matchesPlayed'), p1Stats.matchesPlayed, p2Stats.matchesPlayed)}
              {renderStatBar(t('statistics.labels.longestWinStreak'), p1Stats.longestWinStreak, p2Stats.longestWinStreak)}
              {renderStatBar(t('statistics.labels.titleWins'), p1Stats.championshipWins, p2Stats.championshipWins)}
              {renderStatBar(t('statistics.labels.currentStreak'), p1Stats.currentWinStreak, p2Stats.currentWinStreak)}
            </div>
          )}

          {/* Head-to-Head Record */}
          <div className="h2h-card h2h-record-card">
            <h3>{t('statistics.headToHead.headToHeadRecord')}</h3>
            {h2h ? (
              <>
                <div className="h2h-record-summary">
                  <div className="h2h-record-player">
                    <span className="h2h-record-name">{player1?.name}</span>
                    <span className="h2h-record-wins">{p1H2HWins}</span>
                  </div>
                  <div className="h2h-record-draws">
                    <span className="h2h-record-draws-num">{h2hDraws}</span>
                    <span className="h2h-record-draws-label">{t('statistics.labels.draws')}</span>
                  </div>
                  <div className="h2h-record-player">
                    <span className="h2h-record-wins">{p2H2HWins}</span>
                    <span className="h2h-record-name">{player2?.name}</span>
                  </div>
                </div>
                <div className="h2h-record-meta">
                  <span>{h2h.totalMatches} {t('statistics.labels.totalMatches')}</span>
                  <span>{h2h.championshipMatches} {t('statistics.labels.championshipMatches')}</span>
                </div>
              </>
            ) : (
              <p className="h2h-no-data">{t('statistics.headToHead.noHistory')}</p>
            )}
          </div>

          {/* Recent Results */}
          {h2h && h2h.recentResults.length > 0 && (
            <div className="h2h-card h2h-recent-card">
              <h3>{t('statistics.headToHead.recentResults')}</h3>
              <div className="h2h-recent-list">
                {h2h.recentResults.map((result) => {
                  const winnerId = result.winnerId;
                  const winner = getPlayerById(winnerId);
                  const isP1Win = winnerId === player1Id;
                  return (
                    <div
                      key={result.matchId}
                      className={`h2h-recent-item ${isP1Win ? 'h2h-recent-p1-win' : 'h2h-recent-p2-win'}`}
                    >
                      <span className="h2h-recent-date">{result.date}</span>
                      <span className="h2h-recent-winner">
                        {winner?.name} ({winner?.wrestlerName})
                      </span>
                      <span className="h2h-recent-badge">
                        {isP1Win ? t('statistics.headToHead.player1Win') : t('statistics.headToHead.player2Win')}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Statistical Edge Summary */}
          {p1Stats && p2Stats && (
            <div className="h2h-card h2h-edge-card">
              <h3>{t('statistics.headToHead.statisticalEdge')}</h3>
              <div className="h2h-edge-summary">
                <div className={`h2h-edge-player ${p1Advantages > p2Advantages ? 'h2h-edge-leader' : ''}`}>
                  <span className="h2h-edge-name">{player1?.name}</span>
                  <span className="h2h-edge-count">{p1Advantages}</span>
                  <span className="h2h-edge-label">{t('statistics.headToHead.advantages')}</span>
                </div>
                <div className="h2h-edge-vs">{t('common.vs')}</div>
                <div className={`h2h-edge-player ${p2Advantages > p1Advantages ? 'h2h-edge-leader' : ''}`}>
                  <span className="h2h-edge-name">{player2?.name}</span>
                  <span className="h2h-edge-count">{p2Advantages}</span>
                  <span className="h2h-edge-label">{t('statistics.headToHead.advantages')}</span>
                </div>
              </div>
              <div className="h2h-edge-detail">
                {edgeCategories.map((cat) => (
                  <div key={cat.label} className="h2h-edge-cat">
                    <span className={cat.p1 > cat.p2 ? 'h2h-edge-winner' : ''}>{cat.label}</span>
                    <span className="h2h-edge-arrow">
                      {cat.p1 > cat.p2 ? '<-' : cat.p2 > cat.p1 ? '->' : '='}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default HeadToHeadComparison;
