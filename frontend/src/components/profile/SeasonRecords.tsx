import { useTranslation } from 'react-i18next';
import Badge from '../ui/Badge';
import Card from '../ui/Card';
import { formatRecord, getWinPercentage, getWinTone } from './profileRecord';
import type { SeasonRecord } from './profileRecord';

export default function SeasonRecords({ seasons }: { seasons: SeasonRecord[] }) {
  const { t } = useTranslation();
  if (seasons.length === 0) return null;

  return (
    <section className="profile-section" aria-labelledby="profile-seasons-title">
      <h2 className="profile-section__title" id="profile-seasons-title">{t('publicProfile.seasonRecords')}</h2>
      <Card padding="none">
        <ul className="profile-rows">
          {seasons.map((season) => {
            const tone = getWinTone(season);
            return (
              <li key={season.seasonId} className="profile-row">
                <span className="profile-row__main">
                  {season.seasonName}
                  {season.seasonStatus === 'active' && <Badge tone="win">{t('publicProfile.active')}</Badge>}
                </span>
                <span className="profile-row__figure">{formatRecord(season)}</span>
                <span className={`profile-row__figure ${tone ? `profile-win--${tone}` : ''}`.trim()}>
                  {getWinPercentage(season)}%
                </span>
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}
