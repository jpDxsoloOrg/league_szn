import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSiteConfig } from '../contexts/SiteConfigContext';
import './UserGuide.css';

export default function UserGuide() {
  const { t } = useTranslation();
  const { isAuthenticated, isWrestler, isFantasy } = useAuth();
  const { features } = useSiteConfig();

  const showChallenges = (isAuthenticated && isWrestler) || features.challenges;
  const showPromos = (isAuthenticated && isWrestler) || features.promos;

  const tocSections: { id: string; tocKey: string; show: boolean }[] = [
    { id: 'standings', tocKey: 'userGuide.toc.standings', show: true },
    { id: 'seasons', tocKey: 'userGuide.toc.seasons', show: true },
    { id: 'divisions', tocKey: 'userGuide.toc.divisions', show: true },
    { id: 'championships', tocKey: 'userGuide.toc.championships', show: true },
    { id: 'events', tocKey: 'userGuide.toc.events', show: true },
    { id: 'tournaments', tocKey: 'userGuide.toc.tournaments', show: true },
    { id: 'contenders', tocKey: 'userGuide.toc.contenders', show: true },
    { id: 'profile', tocKey: 'userGuide.toc.profile', show: isAuthenticated && isWrestler },
    { id: 'challenges', tocKey: 'userGuide.toc.challenges', show: showChallenges },
    { id: 'promos', tocKey: 'userGuide.toc.promos', show: showPromos },
    { id: 'fantasy', tocKey: 'userGuide.toc.fantasy', show: isAuthenticated && isFantasy },
    { id: 'tips', tocKey: 'userGuide.toc.tips', show: true },
  ].filter((s) => s.show);

  return (
    <div className="user-guide">
      <h2>{t('userGuide.title')}</h2>
      <p className="guide-intro">
        {t('userGuide.intro')}
      </p>

      <section className="user-guide-wiki-entry" aria-label={t('wiki.title')}>
        <Link to="/guide/wiki" className="user-guide-wiki-link">
          {t('userGuide.wikiLink')}
        </Link>
      </section>

      <nav className="user-guide-toc" aria-label={t('userGuide.toc.ariaLabel')}>
        <h3 className="user-guide-toc-title">{t('userGuide.toc.title')}</h3>
        <ul className="user-guide-toc-list">
          {tocSections.map(({ id, tocKey }) => (
            <li key={id}>
              <a href={`#${id}`}>{t(tocKey)}</a>
            </li>
          ))}
        </ul>
      </nav>

      {/* Public content */}
      <h2 id="public-content" className="guide-group-heading" tabIndex={-1}>
        {t('userGuide.sections.publicContent')}
      </h2>

      <section id="standings" className="guide-section" tabIndex={-1}>
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

      <section id="seasons" className="guide-section" tabIndex={-1}>
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

      <section id="divisions" className="guide-section" tabIndex={-1}>
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

      <section id="championships" className="guide-section" tabIndex={-1}>
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

      <section id="events" className="guide-section" tabIndex={-1}>
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

      <section id="tournaments" className="guide-section" tabIndex={-1}>
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

      <section id="contenders" className="guide-section" tabIndex={-1}>
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

      {/* Authenticated features */}
      {(isAuthenticated && (isWrestler || isFantasy)) || showChallenges || showPromos ? (
        <>
          <h2 id="authenticated" className="guide-group-heading" tabIndex={-1}>
            {t('userGuide.sections.authenticated')}
          </h2>

          {isAuthenticated && isWrestler && (
            <section id="profile" className="guide-section" tabIndex={-1}>
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

          {showChallenges && (
            <section id="challenges" className="guide-section" tabIndex={-1}>
              <h3>{t('userGuide.challengesSection.title')}</h3>
              <p>{t('userGuide.challengesSection.description')}</p>

              <div className="guide-subsection">
                <h4>{t('userGuide.challengesSection.boardTitle')}</h4>
                <p>{t('userGuide.challengesSection.boardExplain')}</p>
              </div>

              <div className="guide-subsection">
                <h4>{t('userGuide.challengesSection.issueTitle')}</h4>
                <p>{t('userGuide.challengesSection.issueFlow')}</p>
              </div>

              <div className="guide-subsection">
                <h4>{t('userGuide.challengesSection.respondTitle')}</h4>
                <p>{t('userGuide.challengesSection.respondFlow')}</p>
                <p>{t('userGuide.challengesSection.statusesExplain')}</p>
              </div>

              <div className="guide-subsection">
                <p>{t('userGuide.challengesSection.myChallengesLink')}</p>
              </div>
            </section>
          )}

          {showPromos && (
            <section id="promos" className="guide-section" tabIndex={-1}>
              <h3>{t('userGuide.promosSection.title')}</h3>
              <p>{t('userGuide.promosSection.description')}</p>

              <div className="guide-subsection">
                <h4>{t('userGuide.promosSection.feedTitle')}</h4>
                <p>{t('userGuide.promosSection.feedExplain')}</p>
              </div>

              <div className="guide-subsection">
                <h4>{t('userGuide.promosSection.creatingTitle')}</h4>
                <p>{t('userGuide.promosSection.creatingPromos')}</p>
                <p>{t('userGuide.promosSection.typesExplain')}</p>
              </div>

              <div className="guide-subsection">
                <h4>{t('userGuide.promosSection.reactionsTitle')}</h4>
                <p>{t('userGuide.promosSection.reactionsExplain')}</p>
              </div>

              <div className="guide-subsection">
                <p>{t('userGuide.promosSection.callOutsAndChallenges')}</p>
              </div>
            </section>
          )}

          {isAuthenticated && isFantasy && (
            <section id="fantasy" className="guide-section" tabIndex={-1}>
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
        </>
      ) : null}

      {/* Tips */}
      <section id="tips" className="guide-section tips-section" tabIndex={-1}>
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
