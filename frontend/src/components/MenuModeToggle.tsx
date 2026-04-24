import { useTranslation } from 'react-i18next';
import { useMenuMode } from '../contexts/menuModeContext';
import './MenuModeToggle.css';

export default function MenuModeToggle() {
  const { t } = useTranslation();
  const { mode, setMode } = useMenuMode();
  const isAdvanced = mode === 'advanced';

  return (
    <label className="menu-mode-row">
      <span className="menu-mode-row-label">{t('nav.advancedMenu')}</span>
      <span className="menu-mode-switch">
        <input
          type="checkbox"
          className="menu-mode-switch-input"
          checked={isAdvanced}
          onChange={(e) => setMode(e.target.checked ? 'advanced' : 'basic')}
          aria-label={t('nav.advancedMenu')}
        />
        <span className="menu-mode-switch-track">
          <span className="menu-mode-switch-thumb" />
        </span>
      </span>
    </label>
  );
}
