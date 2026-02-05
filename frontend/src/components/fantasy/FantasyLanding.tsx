import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  mockFantasyLeaderboard,
  mockShowsWithDetails,
  getCurrentOpenShow,
} from '../../mocks/fantasyMockData';
import './FantasyLanding.css';

export default function FantasyLanding() {
  const { t } = useTranslation();
  const openShow = getCurrentOpenShow();
  const topPlayers = mockFantasyLeaderboard.slice(0, 5);
  const upcomingShow = mockShowsWithDetails.find((s) => s.status === 'open');

  return (
    <div className="fantasy-landing">
      <section className="fantasy-hero">
        <h1>{t('fantasy.landing.title')}</h1>
        <p className="fantasy-tagline">{t('fantasy.landing.tagline')}</p>
        <div className="hero-actions">
          <Link to="/fantasy/signup" className="btn btn-primary">
            {t('fantasy.landing.signUp')}
          </Link>
          <Link to="/fantasy/login" className="btn btn-secondary">
            {t('fantasy.landing.login')}
          </Link>
        </div>
      </section>

      <section className="fantasy-how-it-works">
        <h2>{t('fantasy.landing.howItWorks')}</h2>
        <div className="steps-grid">
          <div className="step-card">
            <div className="step-number">1</div>
            <h3>{t('fantasy.landing.step1Title')}</h3>
            <p>{t('fantasy.landing.step1Desc')}</p>
          </div>
          <div className="step-card">
            <div className="step-number">2</div>
            <h3>{t('fantasy.landing.step2Title')}</h3>
            <p>{t('fantasy.landing.step2Desc')}</p>
          </div>
          <div className="step-card">
            <div className="step-number">3</div>
            <h3>{t('fantasy.landing.step3Title')}</h3>
            <p>{t('fantasy.landing.step3Desc')}</p>
          </div>
          <div className="step-card">
            <div className="step-number">4</div>
            <h3>{t('fantasy.landing.step4Title')}</h3>
            <p>{t('fantasy.landing.step4Desc')}</p>
          </div>
        </div>
      </section>

      {openShow && (
        <section className="current-show-banner">
          <div className="show-info">
            <span className="show-status open">{t('fantasy.showStatus.open')}</span>
            <h3>{openShow.name}</h3>
            <p>
              {t('fantasy.landing.deadline')}: {new Date(openShow.date).toLocaleDateString()}
            </p>
          </div>
          <Link to="/fantasy/login" className="btn btn-primary">
            {t('fantasy.landing.makePicksCta')}
          </Link>
        </section>
      )}

      <section className="fantasy-preview-section">
        <div className="preview-leaderboard">
          <h2>{t('fantasy.landing.topPlayers')}</h2>
          <div className="mini-leaderboard">
            {topPlayers.map((player) => (
              <div key={player.fantasyUserId} className="mini-leaderboard-row">
                <span className="rank">#{player.rank}</span>
                <span className="username">{player.username}</span>
                <span className="points">{player.currentSeasonPoints} pts</span>
              </div>
            ))}
          </div>
          <Link to="/fantasy/leaderboard" className="view-all-link">
            {t('fantasy.landing.viewFullLeaderboard')}
          </Link>
        </div>

        <div className="preview-stats">
          <h2>{t('fantasy.landing.seasonStats')}</h2>
          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-value">{upcomingShow?.picksCount || 0}</span>
              <span className="stat-label">{t('fantasy.landing.activePickers')}</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{mockFantasyLeaderboard.length}</span>
              <span className="stat-label">{t('fantasy.landing.totalPlayers')}</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">
                {mockShowsWithDetails.filter((s) => s.status === 'completed').length}
              </span>
              <span className="stat-label">{t('fantasy.landing.showsCompleted')}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="points-preview">
        <h2>{t('fantasy.landing.pointsSystem')}</h2>
        <div className="points-grid">
          <div className="points-card">
            <span className="points-value">10</span>
            <span className="points-label">{t('fantasy.landing.singlesWin')}</span>
          </div>
          <div className="points-card">
            <span className="points-value">20</span>
            <span className="points-label">{t('fantasy.landing.tripleWin')}</span>
          </div>
          <div className="points-card">
            <span className="points-value">30</span>
            <span className="points-label">{t('fantasy.landing.fatalFourWin')}</span>
          </div>
          <div className="points-card">
            <span className="points-value">+5</span>
            <span className="points-label">{t('fantasy.landing.championshipBonus')}</span>
          </div>
        </div>
      </section>

      <section className="cta-section">
        <h2>{t('fantasy.landing.readyToPlay')}</h2>
        <p>{t('fantasy.landing.ctaDescription')}</p>
        <Link to="/fantasy/signup" className="btn btn-primary btn-large">
          {t('fantasy.landing.createAccount')}
        </Link>
      </section>
    </div>
  );
}
