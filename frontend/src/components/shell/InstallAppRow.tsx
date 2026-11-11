import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Download, Share } from 'lucide-react';
import { useInstallPrompt } from '../../pwa/useInstallPrompt';
import './InstallAppRow.css';

export const INSTALL_GUIDE_PATH = '/guide/wiki/install-app';

/**
 * One quiet "Install app" row in the Me hub. Chrome and Edge get a button that
 * opens their install dialog; iPhone and iPad, which have no such dialog, get
 * the Share hint and a link to the guide. Hidden once installed, and in
 * browsers with nothing to offer.
 */
export default function InstallAppRow() {
  const { t } = useTranslation();
  const { status, promptInstall } = useInstallPrompt();

  if (status === 'available') {
    return (
      <button
        type="button"
        className="me-hub__row me-hub__row--button install-app-row"
        onClick={() => void promptInstall()}
      >
        <span className="me-hub__row-leading">
          <Download aria-hidden="true" size={20} className="install-app-row__icon" />
          <span className="install-app-row__text">
            <span>{t('pwa.install.action')}</span>
            <span className="install-app-row__hint">{t('pwa.install.description')}</span>
          </span>
        </span>
      </button>
    );
  }

  if (status === 'ios') {
    return (
      <Link to={INSTALL_GUIDE_PATH} className="me-hub__row install-app-row">
        <span className="me-hub__row-leading">
          <Share aria-hidden="true" size={20} className="install-app-row__icon" />
          <span className="install-app-row__text">
            <span>{t('pwa.install.action')}</span>
            <span className="install-app-row__hint">{t('pwa.install.iosHint')}</span>
          </span>
        </span>
        <ChevronRight aria-hidden="true" size={18} className="me-hub__chevron" />
      </Link>
    );
  }

  return null;
}
