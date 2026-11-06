import { useTranslation } from 'react-i18next';
import Card from '../ui/Card';
import FormDots from '../ui/FormDots';
import type { FormResult } from '../ui/FormDots';
import { formatRecord, getWinPercentage, getWinTone } from './profileRecord';
import type { WinLossRecord } from './profileRecord';

interface RecordSummaryProps {
  record: WinLossRecord;
  recentForm?: FormResult[];
  streak?: { type: FormResult; count: number };
  /** Current championships. Left out where titles are not shown. */
  titlesHeld?: number;
}

/** All-time record as one row of figures. */
export default function RecordSummary({ record, recentForm, streak, titlesHeld }: RecordSummaryProps) {
  const { t } = useTranslation();
  const tone = getWinTone(record);

  return (
    <section className="profile-section" aria-labelledby="profile-record-title">
      <h2 className="profile-section__title" id="profile-record-title">{t('publicProfile.allTimeRecord')}</h2>
      <Card>
        <dl className="profile-figures">
          <div>
            <dt>{t('publicProfile.record')}</dt>
            <dd>{formatRecord(record)}</dd>
          </div>
          <div>
            <dt>{t('publicProfile.winPercent')}</dt>
            <dd className={tone ? `profile-win--${tone}` : undefined}>{getWinPercentage(record)}%</dd>
          </div>
          {titlesHeld !== undefined && (
            <div>
              <dt>{t('publicProfile.titlesHeld')}</dt>
              <dd>{titlesHeld}</dd>
            </div>
          )}
          {recentForm && recentForm.length > 0 && (
            <div>
              <dt>{t('publicProfile.form')}</dt>
              <dd><FormDots results={recentForm} /></dd>
            </div>
          )}
          {streak && (
            <div>
              <dt>{t('publicProfile.streak')}</dt>
              <dd>{streak.count}{streak.type}</dd>
            </div>
          )}
        </dl>
      </Card>
    </section>
  );
}
