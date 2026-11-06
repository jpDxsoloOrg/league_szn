import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import Button from '../ui/Button';
import AuthLayout from './AuthLayout';

const RULE_GROUPS = [
  { title: 'auth.rulesSectionMatchConduct', rules: ['auth.ruleFinToWin', 'auth.ruleRefBump', 'auth.ruleNoCheesing'] },
  { title: 'auth.rulesSectionWrestler', rules: ['auth.ruleOverallMatch', 'auth.ruleSeasonLock', 'auth.ruleAlternate'] },
  { title: 'auth.rulesSectionBooking', rules: ['auth.ruleClickAvailable', 'auth.rulePreShow', 'auth.ruleNoShow'] },
  { title: 'auth.rulesSectionBasics', rules: ['auth.ruleReportResults', 'auth.ruleRespect', 'auth.ruleAskAdmin'] },
];

/**
 * Landing page shown after a user confirms their email. Tells them the one
 * step left, entering a wrestler name, and lays out the house rules. Someone
 * who confirmed from the sign-in screen is already signed in, so they go
 * straight to the app, where the setup prompt opens.
 */
export default function PostSignupWelcome() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();

  return (
    <AuthLayout wide title={t('auth.welcomeTitle')} subtitle={t('auth.welcomeSubtitle')}>
      <div className="me-alert me-alert--warn welcome-next" role="status">
        <strong>{t('me.auth.welcomeNextTitle')}</strong>
        {t('me.auth.welcomeNextBody')}
      </div>

      <h2 className="welcome-section-title">{t('auth.welcomeRulesTitle')}</h2>

      {RULE_GROUPS.map((group) => (
        <section key={group.title}>
          <h3 className="welcome-rules-group">{t(group.title)}</h3>
          <ul className="welcome-rules">
            {group.rules.map((rule) => (
              <li key={rule}>{t(rule)}</li>
            ))}
          </ul>
        </section>
      ))}

      <p className="welcome-rules-link">
        {t('auth.welcomeRulesLink')}{' '}
        <Link to="/guide/wiki/getting-started">{t('auth.welcomeRulesLinkText')}</Link>
      </p>

      <Button fullWidth to={isAuthenticated ? '/' : '/login'}>
        {isAuthenticated ? t('me.auth.welcomeContinue') : t('auth.welcomeSignInCta')}
      </Button>
    </AuthLayout>
  );
}
