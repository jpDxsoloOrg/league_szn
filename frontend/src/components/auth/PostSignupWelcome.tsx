import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './Auth.css';

/**
 * Landing page shown after a user confirms their email. Lays out the
 * house rules and makes it clear the account is pending a manager's
 * approval before they can participate.
 */
export default function PostSignupWelcome() {
  const { t } = useTranslation();

  return (
    <div className="auth-container">
      <div className="auth-card post-signup-welcome">
        <h2>{t('auth.welcomeTitle')}</h2>
        <p className="auth-subtitle">{t('auth.welcomeSubtitle')}</p>

        <div className="welcome-pending" role="status">
          <strong>{t('auth.welcomePendingTitle')}</strong>
          <p>{t('auth.welcomePendingBody')}</p>
        </div>

        <h3>{t('auth.welcomeRulesTitle')}</h3>

        <h4>{t('auth.rulesSectionMatchConduct')}</h4>
        <ul className="welcome-rules">
          <li>{t('auth.ruleFinToWin')}</li>
          <li>{t('auth.ruleRefBump')}</li>
          <li>{t('auth.ruleNoCheesing')}</li>
        </ul>

        <h4>{t('auth.rulesSectionWrestler')}</h4>
        <ul className="welcome-rules">
          <li>{t('auth.ruleOverallMatch')}</li>
          <li>{t('auth.ruleSeasonLock')}</li>
          <li>{t('auth.ruleAlternate')}</li>
        </ul>

        <h4>{t('auth.rulesSectionBooking')}</h4>
        <ul className="welcome-rules">
          <li>{t('auth.ruleClickAvailable')}</li>
          <li>{t('auth.rulePreShow')}</li>
          <li>{t('auth.ruleNoShow')}</li>
        </ul>

        <h4>{t('auth.rulesSectionBasics')}</h4>
        <ul className="welcome-rules">
          <li>{t('auth.ruleReportResults')}</li>
          <li>{t('auth.ruleRespect')}</li>
          <li>{t('auth.ruleAskAdmin')}</li>
        </ul>

        <p className="welcome-rules-link">
          {t('auth.welcomeRulesLink')}{' '}
          <Link to="/guide/wiki/getting-started">{t('auth.welcomeRulesLinkText')}</Link>
        </p>

        <div className="auth-footer welcome-footer">
          <Link to="/login" className="btn-submit welcome-cta">
            {t('auth.welcomeSignInCta')}
          </Link>
        </div>
      </div>
    </div>
  );
}
