import { useTranslation } from 'react-i18next';
import './injuryBooking.css';

interface AllowInjuredToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/** INJ-11: the staff override that makes injured players pickable and sends `allowInjured: true`. */
export default function AllowInjuredToggle({ checked, onChange, disabled = false }: AllowInjuredToggleProps) {
  const { t } = useTranslation();
  return (
    <label className="allow-injured-toggle">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        {t('injuryReport.booking.allowInjured')}
        <span className="allow-injured-toggle__hint">{t('injuryReport.booking.allowInjuredHint')}</span>
      </span>
    </label>
  );
}
