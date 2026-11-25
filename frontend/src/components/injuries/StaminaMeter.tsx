import { useTranslation } from 'react-i18next';
import type { PlayerCondition } from '../../types/injury';
import { activeInjury, formatInjuryDate, formatRecoveryTime, staminaTone } from './injuryDisplay';
import './StaminaMeter.css';

export interface StaminaMeterProps {
  condition: PlayerCondition;
}

/**
 * The stamina meter (INJ-12), for the player themselves and staff: stamina
 * out of the maximum, coloured by injury band, when the Sunday recovery
 * comes (in the viewer's local time) and what the next booked match takes.
 */
export default function StaminaMeter({ condition }: StaminaMeterProps) {
  const { t, i18n } = useTranslation();
  const { stamina, maxStamina, weeklyRecovery, nextMatch } = condition;
  const tone = staminaTone(condition.band, condition.bandCount);
  const recoveryTime = formatRecoveryTime(condition.nextRecoveryAt, i18n.language);
  const injury = activeInjury(condition.currentInjury);
  const isFull = stamina >= maxStamina;

  let recoveryText: string;
  if (isFull) recoveryText = t('injuries.stamina.full');
  else if (weeklyRecovery === 'full') recoveryText = t('injuries.stamina.recoversFull', { time: recoveryTime });
  else recoveryText = t('injuries.stamina.recoversBy', { amount: weeklyRecovery, time: recoveryTime });

  return (
    <div className={`stamina-meter stamina-meter--${tone}`} data-testid="stamina-meter">
      <div className="stamina-meter__head">
        <span className="stamina-meter__label">{t('injuries.stamina.label')}</span>
        <span className="stamina-meter__value">
          {t('injuries.stamina.value', { stamina, max: maxStamina })}
        </span>
      </div>
      <progress
        className="stamina-meter__bar"
        max={maxStamina}
        value={Math.min(Math.max(stamina, 0), maxStamina)}
        aria-label={t('injuries.stamina.meterLabel', { stamina, max: maxStamina })}
      />
      <p className="stamina-meter__line">{recoveryText}</p>
      {nextMatch && (
        <p className="stamina-meter__line">
          {t('injuries.stamina.nextMatch', {
            date: formatInjuryDate(nextMatch.date, i18n.language),
            drain: nextMatch.drain,
            after: nextMatch.staminaAfter,
          })}
        </p>
      )}
      {injury && (
        <p className="stamina-meter__line stamina-meter__line--injury">
          {t('injuries.stamina.outUntil', { date: formatInjuryDate(injury.returnsAt, i18n.language) })}
        </p>
      )}
    </div>
  );
}
