import { useTranslation } from 'react-i18next';
import { useMenuMode } from '../contexts/menuModeContext';
import './MenuModeToggle.css';

export default function MenuModeToggle() {
  const { t } = useTranslation();
  const { mode, setMode } = useMenuMode();

  return (
    <div
      className="menu-mode-toggle"
      role="group"
      aria-label={t('nav.menuModeToggleLabel')}
    >
      <button
        type="button"
        className={`menu-mode-option ${mode === 'basic' ? 'active' : ''}`}
        onClick={() => setMode('basic')}
        aria-pressed={mode === 'basic'}
        title={t('nav.basicMenu')}
      >
        {t('nav.basicMenuShort')}
      </button>
      <button
        type="button"
        className={`menu-mode-option ${mode === 'advanced' ? 'active' : ''}`}
        onClick={() => setMode('advanced')}
        aria-pressed={mode === 'advanced'}
        title={t('nav.advancedMenu')}
      >
        {t('nav.advancedMenuShort')}
      </button>
    </div>
  );
}
