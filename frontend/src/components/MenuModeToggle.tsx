import { useTranslation } from 'react-i18next';
import { useMenuMode } from '../contexts/menuModeContext';
import './MenuModeToggle.css';

export default function MenuModeToggle() {
  const { t } = useTranslation();
  const { mode, setMode } = useMenuMode();
  const isAdvanced = mode === 'advanced';
  const labelId = 'menu-mode-toggle-label';

  return (
    <div className="menu-mode-row">
      <span id={labelId} className="menu-mode-row-label">
        {t('nav.advancedMenu')}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={isAdvanced}
        aria-labelledby={labelId}
        className={`menu-mode-switch ${isAdvanced ? 'on' : 'off'}`}
        onClick={() => setMode(isAdvanced ? 'basic' : 'advanced')}
      >
        <span className="menu-mode-switch-thumb" />
      </button>
    </div>
  );
}
