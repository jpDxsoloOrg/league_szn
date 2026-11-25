import { useTranslation } from 'react-i18next';
import type { MatchConditionEntry } from '../../types/injuryReport';
import { formatReturnDate } from '../../utils/injuryBooking';
import './injuryBooking.css';

interface ConditionReportTableProps {
  report: readonly MatchConditionEntry[] | undefined;
  nameOf: (playerId: string) => string;
}

const percent = (value: number): string => `${(value * 100).toFixed(1)}%`;

/**
 * INJ-11: what a completed match did to each participant (staff only):
 * stamina before and after, the injury chance, the seeded roll and any injury.
 */
export default function ConditionReportTable({ report, nameOf }: ConditionReportTableProps) {
  const { t, i18n } = useTranslation();
  if (!report || report.length === 0) return null;

  const outcome = (entry: MatchConditionEntry): string => {
    if (entry.severity && entry.returnsAt) {
      return t('injuryReport.condition.injured', {
        severity: t(`injuryReport.severity.${entry.severity}`),
        date: formatReturnDate(entry.returnsAt, i18n.language),
      });
    }
    if (entry.alreadyInjured) return t('injuryReport.condition.alreadyInjured');
    return t('injuryReport.condition.noInjury');
  };

  return (
    <details className="condition-report">
      <summary>{t('injuryReport.condition.title')}</summary>
      <div className="condition-report__scroll">
        <table className="condition-report__table">
          <caption className="sr-only">{t('injuryReport.condition.title')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('injuryReport.condition.player')}</th>
              <th scope="col">{t('injuryReport.condition.stamina')}</th>
              <th scope="col">{t('injuryReport.condition.chance')}</th>
              <th scope="col">{t('injuryReport.condition.roll')}</th>
              <th scope="col">{t('injuryReport.condition.result')}</th>
            </tr>
          </thead>
          <tbody>
            {report.map((entry) => (
              <tr key={entry.playerId}>
                <th scope="row">{nameOf(entry.playerId)}</th>
                <td>{t('injuryReport.condition.staminaChange', { before: entry.staminaBefore, after: entry.staminaAfter })}</td>
                <td>{percent(entry.chance)}</td>
                <td>{entry.roll.toFixed(3)}</td>
                <td>{outcome(entry)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
