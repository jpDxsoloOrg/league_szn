import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, EyeOff, Globe, LogOut } from 'lucide-react';
import Button from '../ui/Button';
import PageHeader from '../ui/PageHeader';
import LanguageSwitcher from '../LanguageSwitcher';
import { useAuth } from '../../contexts/AuthContext';
import { useNavContext } from '../../hooks/useNavContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { ADMIN_NAV_ICON, NAV_SECTIONS, getVisibleTabs } from '../../config/navConfig';
import { isNeedsWrestler } from '../../utils/needsWrestler';
import './MeHub.css';

const AdminIcon = ADMIN_NAV_ICON;

function HubRow({ to, icon, label, emphasis = false }: { to: string; icon: ReactNode; label: string; emphasis?: boolean }) {
  return (
    <Link to={to} className={emphasis ? 'me-hub__row me-hub__row--emphasis' : 'me-hub__row'}>
      <span className="me-hub__row-leading">
        {icon}
        {label}
      </span>
      <ChevronRight aria-hidden="true" size={18} className="me-hub__chevron" />
    </Link>
  );
}

/** Everything personal in one list. On phones this is also how Admin is reached. */
export default function MeHub() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { signOut, playerId, currentWrestler } = useAuth();
  const navContext = useNavContext();
  useDocumentTitle(t('nav.sections.me'));

  const meSection = NAV_SECTIONS.find((section) => section.key === 'me');
  const tabs = meSection ? getVisibleTabs(meSection, navContext) : [];
  const isHidden = Boolean(playerId) && isNeedsWrestler(currentWrestler);

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <div className="me-hub">
      <PageHeader title={t('nav.sections.me')} />

      {!navContext.isAuthenticated && (
        <div className="me-hub__auth">
          <Button to="/login" fullWidth>{t('common.signIn')}</Button>
          <Button to="/signup" variant="secondary" fullWidth>{t('common.signUp')}</Button>
        </div>
      )}

      {isHidden && (
        <section className="me-hub__notice" aria-label={t('me.setup.hiddenTitle')}>
          <EyeOff aria-hidden="true" size={22} className="me-hub__notice-icon" />
          <div className="me-hub__notice-text">
            <h2 className="me-hub__notice-title">{t('me.setup.hiddenTitle')}</h2>
            <p>{t('me.setup.hiddenNotice')}</p>
            <Button to="/profile">{t('me.setup.enterName')}</Button>
          </div>
        </section>
      )}

      {navContext.isAdminOrModerator && (
        <div className="me-hub__group">
          <HubRow to="/admin" emphasis icon={<AdminIcon aria-hidden="true" size={20} />} label={t('nav.admin')} />
        </div>
      )}

      <div className="me-hub__group">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <HubRow
              key={tab.path}
              to={tab.path}
              icon={Icon ? <Icon aria-hidden="true" size={20} /> : null}
              label={t(tab.labelKey)}
            />
          );
        })}
      </div>

      <div className="me-hub__group">
        <div className="me-hub__row me-hub__row--static">
          <span className="me-hub__row-leading">
            <Globe aria-hidden="true" size={20} />
            {t('languageSwitcher.label')}
          </span>
          <LanguageSwitcher />
        </div>
        {navContext.isAuthenticated && (
          <button type="button" className="me-hub__row me-hub__row--button" onClick={handleSignOut}>
            <span className="me-hub__row-leading">
              <LogOut aria-hidden="true" size={20} />
              {t('common.logout')}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
