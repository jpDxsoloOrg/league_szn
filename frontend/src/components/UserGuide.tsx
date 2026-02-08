import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import './UserGuide.css';

export default function UserGuide() {
  const { t } = useTranslation();
  const { isAuthenticated, isWrestler, isFantasy } = useAuth();

  return (
    <div className="user-guide">
      <h2>{t('userGuide.title')}</h2>
      <p className="guide-intro">
        {t('userGuide.intro')}
      </p>

      <section className="guide-section">
        <h3>{t('userGuide.standingsSection.title')}</h3>
        <p>{t('userGuide.standingsSection.description')}</p>

        <div className="guide-subsection">
          <h4>{t('userGuide.standingsSection.whatYouCanSee')}</h4>
          <table className="info-table">
            <thead>
              <tr>
                <th>{t('userGuide.standingsSection.column')}</th>
                <th>{t('userGuide.standingsSection.columnDescription')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{t('standings.table.rank')}</td>
                <td>{t('userGuide.standingsSection.rankDesc')}</td>
              </tr>
              <tr>
                <td>{t('standings.table.player')}</td>
                <td>{t('userGuide.standingsSection.playerDesc')}</td>
              </tr>
              <tr>
                <td>{t('standings.table.wrestler')}</td>
                <td>{t('userGuide.standingsSection.wrestlerDesc')}</td>
              </tr>
              <tr>
                <td>{t('standings.table.division')}</td>
                <td>{t('userGuide.standingsSection.divisionDesc')}</td>
              </tr>
              <tr>
                <td>W / L / D</td>
                <td>{t('userGuide.standingsSection.wldDesc')}</td>
              </tr>
              <tr>
                <td>{t('standings.table.winPercent')}</td>
                <td>{t('userGuide.standingsSection.winPercentDesc')}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="guide-subsection">
          <h4>{t('userGuide.standingsSection.howRankingsWork')}</h4>
          <p>
            {t('userGuide.standingsSection.rankingsExplain')}
          </p>
          <div className="formula-box">
            {t('userGuide.standingsSection.formula')}
          </div>
        </div>
      </section>

      <section className="guide-section">
        <h3>{t('userGuide.seasonsSection.title')}</h3>
        <p>{t('userGuide.seasonsSection.description')}</p>

        <div className="guide-subsection">
          <h4>{t('userGuide.seasonsSection.whatAreSeasons')}</h4>
          <p>
            {t('userGuide.seasonsSection.seasonsExplain')}
          </p>
        </div>

        <div className="guide-subsection">
          <h4>{t('userGuide.seasonsSection.viewingSeasonStandings')}</h4>
          <ul className="feature-list">
            <li><strong>{t('userGuide.seasonsSection.allTimeStandings')}</strong> - {t('userGuide.seasonsSection.allTimeDesc')}</li>
            <li><strong>{t('userGuide.seasonsSection.seasonStandings')}</strong> - {t('userGuide.seasonsSection.seasonDesc')}</li>
          </ul>
          <p>
            {t('userGuide.seasonsSection.seasonEndNote')}
          </p>
        </div>
      </section>

      <section className="guide-section">
        <h3>{t('userGuide.divisionsSection.title')}</h3>
        <p>{t('userGuide.divisionsSection.description')}</p>

        <div className="guide-subsection">
          <h4>{t('userGuide.divisionsSection.whatAreDivisions')}</h4>
          <p>
            {t('userGuide.divisionsSection.divisionsExplain')}
          </p>
        </div>

        <div className="guide-subsection">
          <h4>{t('userGuide.divisionsSection.viewingPlayerDivisions')}</h4>
          <p>
            {t('userGuide.divisionsSection.viewingExplain')}
          </p>
        </div>
      </section>

      <section className="guide-section">
        <h3>{t('userGuide.championshipsSection.title')}</h3>
        <p>{t('userGuide.championshipsSection.description')}</p>

        <div className="guide-subsection">
          <h4>{t('userGuide.championshipsSection.viewingChampionships')}</h4>
          <ol className="steps-list">
            <li>{t('userGuide.championshipsSection.step1')}</li>
            <li>{t('userGuide.championshipsSection.step2')}</li>
            <li>{t('userGuide.championshipsSection.step3')}
              <ul>
                <li>{t('userGuide.championshipsSection.cardItem1')}</li>
                <li>{t('userGuide.championshipsSection.cardItem2')}</li>
                <li>{t('userGuide.championshipsSection.cardItem3')}</li>
              </ul>
            </li>
          </ol>
        </div>

        <div className="guide-subsection">
          <h4>{t('userGuide.championshipsSection.viewingHistory')}</h4>
          <ol className="steps-list">
            <li>{t('userGuide.championshipsSection.historyStep1')}</li>
            <li>{t('userGuide.championshipsSection.historyStep2')}</li>
            <li>{t('userGuide.championshipsSection.historyStep3')}</li>
          </ol>
        </div>
      </section>

      <section className="guide-section">
        <h3>{t('userGuide.matchesSection.title')}</h3>
        <p>{t('userGuide.matchesSection.description')}</p>

        <div className="guide-subsection">
          <h4>{t('userGuide.matchesSection.filteringMatches')}</h4>
          <p>{t('userGuide.matchesSection.filterIntro')}</p>
          <ul className="feature-list">
            <li><strong>{t('userGuide.matchesSection.filterAll')}</strong> - {t('userGuide.matchesSection.filterAllDesc')}</li>
            <li><strong>{t('userGuide.matchesSection.filterScheduled')}</strong> - {t('userGuide.matchesSection.filterScheduledDesc')}</li>
            <li><strong>{t('userGuide.matchesSection.filterCompleted')}</strong> - {t('userGuide.matchesSection.filterCompletedDesc')}</li>
          </ul>
        </div>

        <div className="guide-subsection">
          <h4>{t('userGuide.matchesSection.matchInformation')}</h4>
          <p>{t('userGuide.matchesSection.matchInfoIntro')}</p>
          <ul className="feature-list">
            <li><strong>{t('userGuide.matchesSection.matchDate')}</strong> - {t('userGuide.matchesSection.matchDateDesc')}</li>
            <li><strong>{t('userGuide.matchesSection.matchType')}</strong> - {t('userGuide.matchesSection.matchTypeDesc')}</li>
            <li><strong>{t('userGuide.matchesSection.matchStipulation')}</strong> - {t('userGuide.matchesSection.matchStipulationDesc')}</li>
            <li><strong>{t('userGuide.matchesSection.matchParticipants')}</strong> - {t('userGuide.matchesSection.matchParticipantsDesc')}</li>
            <li><strong>{t('userGuide.matchesSection.matchChampionship')}</strong> - {t('userGuide.matchesSection.matchChampionshipDesc')}</li>
          </ul>
        </div>

        <div className="guide-subsection">
          <h4>{t('userGuide.matchesSection.matchResults')}</h4>
          <p>{t('userGuide.matchesSection.matchResultsIntro')}</p>
          <ul className="feature-list">
            <li><span className="winner-text">{t('userGuide.matchesSection.winners')}</span> - {t('userGuide.matchesSection.winnersDesc')}</li>
            <li><span className="loser-text">{t('userGuide.matchesSection.losers')}</span> - {t('userGuide.matchesSection.losersDesc')}</li>
            <li><span className="draw-text">{t('userGuide.matchesSection.draw')}</span> - {t('userGuide.matchesSection.drawDesc')}</li>
          </ul>
        </div>
      </section>

      <section className="guide-section">
        <h3>{t('userGuide.eventsSection.title')}</h3>
        <p>{t('userGuide.eventsSection.description')}</p>

        <div className="guide-subsection">
          <h4>{t('userGuide.eventsSection.browsingEvents')}</h4>
          <p>{t('userGuide.eventsSection.browsingIntro')}</p>
          <ul className="feature-list">
            <li><strong>{t('userGuide.eventsSection.typePPV')}</strong> - {t('userGuide.eventsSection.typePPVDesc')}</li>
            <li><strong>{t('userGuide.eventsSection.typeWeekly')}</strong> - {t('userGuide.eventsSection.typeWeeklyDesc')}</li>
            <li><strong>{t('userGuide.eventsSection.typeSpecial')}</strong> - {t('userGuide.eventsSection.typeSpecialDesc')}</li>
            <li><strong>{t('userGuide.eventsSection.typeHouse')}</strong> - {t('userGuide.eventsSection.typeHouseDesc')}</li>
          </ul>
        </div>

        <div className="guide-subsection">
          <h4>{t('userGuide.eventsSection.eventDetails')}</h4>
          <p>{t('userGuide.eventsSection.eventDetailsIntro')}</p>
          <ul className="feature-list">
            <li>{t('userGuide.eventsSection.detailItem1')}</li>
            <li>{t('userGuide.eventsSection.detailItem2')}</li>
            <li>{t('userGuide.eventsSection.detailItem3')}</li>
            <li>{t('userGuide.eventsSection.detailItem4')}</li>
          </ul>
        </div>
      </section>

      <section className="guide-section">
        <h3>{t('userGuide.tournamentsSection.title')}</h3>
        <p>{t('userGuide.tournamentsSection.description')}</p>

        <div className="guide-subsection">
          <h4>{t('userGuide.tournamentsSection.tournamentTypes')}</h4>
          <p>{t('userGuide.tournamentsSection.typesIntro')}</p>

          <div className="tournament-type-box">
            <h5>{t('userGuide.tournamentsSection.singleElimination')}</h5>
            <ul>
              <li>{t('userGuide.tournamentsSection.singleElimItem1')}</li>
              <li>{t('userGuide.tournamentsSection.singleElimItem2')}</li>
              <li>{t('userGuide.tournamentsSection.singleElimItem3')}</li>
              <li>{t('userGuide.tournamentsSection.singleElimItem4')}</li>
            </ul>
          </div>

          <div className="tournament-type-box">
            <h5>{t('userGuide.tournamentsSection.roundRobin')}</h5>
            <ul>
              <li>{t('userGuide.tournamentsSection.roundRobinItem1')}</li>
              <li>{t('userGuide.tournamentsSection.roundRobinItem2')}</li>
              <li>{t('userGuide.tournamentsSection.roundRobinItem3')}</li>
            </ul>
          </div>
        </div>

        <div className="guide-subsection">
          <h4>{t('userGuide.tournamentsSection.tournamentInformation')}</h4>
          <p>{t('userGuide.tournamentsSection.tournamentInfoIntro')}</p>
          <ul className="feature-list">
            <li>{t('userGuide.tournamentsSection.infoItem1')}</li>
            <li>{t('userGuide.tournamentsSection.infoItem2')}</li>
            <li>{t('userGuide.tournamentsSection.infoItem3')}</li>
            <li>{t('userGuide.tournamentsSection.infoItem4')}</li>
          </ul>
        </div>
      </section>

      <section className="guide-section">
        <h3>{t('userGuide.contendersSection.title')}</h3>
        <p>{t('userGuide.contendersSection.description')}</p>

        <div className="guide-subsection">
          <h4>{t('userGuide.contendersSection.whatAreContenders')}</h4>
          <p>{t('userGuide.contendersSection.contendersExplain')}</p>
        </div>

        <div className="guide-subsection">
          <h4>{t('userGuide.contendersSection.readingRankings')}</h4>
          <ul className="feature-list">
            <li><strong>{t('userGuide.contendersSection.rankLabel')}</strong> - {t('userGuide.contendersSection.rankLabelDesc')}</li>
            <li><strong>{t('userGuide.contendersSection.scoreLabel')}</strong> - {t('userGuide.contendersSection.scoreLabelDesc')}</li>
            <li><strong>{t('userGuide.contendersSection.winRateLabel')}</strong> - {t('userGuide.contendersSection.winRateLabelDesc')}</li>
            <li><strong>{t('userGuide.contendersSection.streakLabel')}</strong> - {t('userGuide.contendersSection.streakLabelDesc')}</li>
          </ul>
        </div>
      </section>

      {isAuthenticated && isWrestler && (
        <section className="guide-section">
          <h3>{t('userGuide.profileSection.title')}</h3>
          <p>{t('userGuide.profileSection.description')}</p>

          <div className="guide-subsection">
            <h4>{t('userGuide.profileSection.whatYouCanSee')}</h4>
            <ul className="feature-list">
              <li>{t('userGuide.profileSection.item1')}</li>
              <li>{t('userGuide.profileSection.item2')}</li>
              <li>{t('userGuide.profileSection.item3')}</li>
              <li>{t('userGuide.profileSection.item4')}</li>
            </ul>
          </div>
        </section>
      )}

      {isAuthenticated && isFantasy && (
        <section className="guide-section">
          <h3>{t('userGuide.fantasySection.title')}</h3>
          <p>{t('userGuide.fantasySection.description')}</p>

          <div className="guide-subsection">
            <h4>{t('userGuide.fantasySection.howItWorks')}</h4>
            <ol className="steps-list">
              <li>{t('userGuide.fantasySection.step1')}</li>
              <li>{t('userGuide.fantasySection.step2')}</li>
              <li>{t('userGuide.fantasySection.step3')}</li>
              <li>{t('userGuide.fantasySection.step4')}</li>
            </ol>
          </div>

          <div className="guide-subsection">
            <h4>{t('userGuide.fantasySection.featuresTitle')}</h4>
            <ul className="feature-list">
              <li><strong>{t('userGuide.fantasySection.featurePicks')}</strong> - {t('userGuide.fantasySection.featurePicksDesc')}</li>
              <li><strong>{t('userGuide.fantasySection.featureLeaderboard')}</strong> - {t('userGuide.fantasySection.featureLeaderboardDesc')}</li>
              <li><strong>{t('userGuide.fantasySection.featureCosts')}</strong> - {t('userGuide.fantasySection.featureCostsDesc')}</li>
              <li><strong>{t('userGuide.fantasySection.featureResults')}</strong> - {t('userGuide.fantasySection.featureResultsDesc')}</li>
            </ul>
          </div>
        </section>
      )}

      <section className="guide-section tips-section">
        <h3>{t('userGuide.tipsSection.title')}</h3>
        <div className="tips-grid">
          <div className="tip-card">
            <span className="tip-icon">1</span>
            <p><strong>{t('userGuide.tipsSection.tip1Title')}</strong> - {t('userGuide.tipsSection.tip1Desc')}</p>
          </div>
          <div className="tip-card">
            <span className="tip-icon">2</span>
            <p><strong>{t('userGuide.tipsSection.tip2Title')}</strong> - {t('userGuide.tipsSection.tip2Desc')}</p>
          </div>
          <div className="tip-card">
            <span className="tip-icon">3</span>
            <p><strong>{t('userGuide.tipsSection.tip3Title')}</strong> - {t('userGuide.tipsSection.tip3Desc')}</p>
          </div>
          <div className="tip-card">
            <span className="tip-icon">4</span>
            <p><strong>{t('userGuide.tipsSection.tip4Title')}</strong> - {t('userGuide.tipsSection.tip4Desc')}</p>
          </div>
          <div className="tip-card">
            <span className="tip-icon">5</span>
            <p><strong>{t('userGuide.tipsSection.tip5Title')}</strong> - {t('userGuide.tipsSection.tip5Desc')}</p>
          </div>
          <div className="tip-card">
            <span className="tip-icon">6</span>
            <p><strong>{t('userGuide.tipsSection.tip6Title')}</strong> - {t('userGuide.tipsSection.tip6Desc')}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
