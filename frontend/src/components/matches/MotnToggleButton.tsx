import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { matchesApi } from '../../services/api/matches.api';
import './MotnToggleButton.css';

export interface MotnToggleButtonProps {
  matchId: string;
  matchOfTheNight: boolean;
  onToggled?: (value: boolean) => void;
}

/**
 * GM-only toggle (RIV-30) for flipping the "Match of the Night" status
 * on a completed match. The role gate lives at the parent integration
 * site; this component renders for whoever invokes it.
 */
export const MotnToggleButton = ({
  matchId,
  matchOfTheNight,
  onToggled,
}: MotnToggleButtonProps) => {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState(matchOfTheNight);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    if (busy) return;
    const next = !current;
    setBusy(true);
    setError(null);
    try {
      await matchesApi.setMatchOfTheNight(matchId, next);
      setCurrent(next);
      onToggled?.(next);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="motn-toggle-button-wrapper">
      <button
        type="button"
        className={`motn-toggle-button${current ? ' motn-toggle-button--on' : ''}`}
        onClick={handleClick}
        disabled={busy}
        aria-pressed={current}
      >
        {current
          ? t('match.motn.unmark', '★ Match of the Night — Remove')
          : t('match.motn.markAs', '☆ Mark as Match of the Night')}
      </button>
      {error && (
        <span className="motn-toggle-button__error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
};
