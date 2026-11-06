import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { statisticsApi } from '../../services/api';
import Card from '../ui/Card';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import Skeleton from '../ui/Skeleton';
import Tabs from '../ui/Tabs';
import { useStatsResource } from './useStatsResource';
import './stats-common.css';
import './RecordBook.css';

type RecordCategory = 'overall' | 'championships' | 'streaks' | 'matchTypes';

/** The API sends "N/A" as the holder when nobody qualifies for a record yet. */
function isUnclaimed(record: { holderName?: string }): boolean {
  return !record.holderName || record.holderName === 'N/A';
}

function RecordBook() {
  const { t } = useTranslation();
  const [activeCategory, setActiveCategory] = useState<RecordCategory>('overall');

  const loadRecords = useCallback((signal: AbortSignal) => statisticsApi.getRecords(signal), []);
  const { data, loading, failed, reload } = useStatsResource(loadRecords);

  const categories: { key: RecordCategory; label: string }[] = [
    { key: 'overall', label: t('statistics.recordBook.categories.overall') },
    { key: 'championships', label: t('statistics.recordBook.categories.championships') },
    { key: 'streaks', label: t('statistics.recordBook.categories.streaks') },
    { key: 'matchTypes', label: t('statistics.recordBook.categories.matchTypes') },
  ];

  const title = t('statistics.recordBook.title');
  const currentRecords = data?.records[activeCategory] ?? [];
  const activeThreats = data?.activeThreats ?? [];

  const header = <PageHeader eyebrow={t('nav.statistics')} title={title} />;

  if (loading) {
    return (
      <div className="stats-page">
        {header}
        <Skeleton variant="cards" count={4} />
      </div>
    );
  }

  if (failed) {
    return (
      <div className="stats-page">
        {header}
        <EmptyState title={t('statistics.loadFailed')} actionLabel={t('common.retry')} onAction={reload} />
      </div>
    );
  }

  return (
    <div className="stats-page">
      {header}

      <Tabs
        label={title}
        value={activeCategory}
        onValueChange={(value) => setActiveCategory(value as RecordCategory)}
        items={categories.map((category) => ({ value: category.key, label: category.label }))}
      />

      {currentRecords.length === 0 ? (
        <EmptyState title={title} description={t('statistics.recordBook.noRecords')} />
      ) : (
        <div className="rb-records">
          {currentRecords.map((record) => (
            <Card key={record.recordName} className="rb-record-card">
              <h2 className="rb-record-name">{record.recordName}</h2>
              {isUnclaimed(record) ? (
                <p className="rb-record-empty">{t('statistics.recordBook.unclaimed')}</p>
              ) : (
                <>
                  <p className="rb-record-value">{record.value}</p>
                  <p className="rb-record-holder">
                    {record.holderName} <span className="rb-holder-wrestler">({record.wrestlerName})</span>
                  </p>
                </>
              )}
              <p className="rb-record-desc">{record.description}</p>
            </Card>
          ))}
        </div>
      )}

      {activeThreats.length > 0 && (
        <section className="stats-section">
          <h2 className="stats-section__title">{t('statistics.recordBook.activeThreats')}</h2>
          <p className="stats-section__note">{t('statistics.recordBook.activeThreatsDesc')}</p>
          <ul className="stats-rows">
            {activeThreats.map((threat) => (
              <li key={threat.recordName} className="rb-threat">
                <div className="stats-row__main">
                  <span className="stats-row__title">{threat.recordName}</span>
                  <span className="stats-row__detail">{threat.gapDescription}</span>
                </div>
                <dl className="rb-threat-sides">
                  <div>
                    <dt>{t('statistics.recordBook.currentHolder')}</dt>
                    <dd>{threat.currentHolder} <strong>{threat.currentValue}</strong></dd>
                  </div>
                  <div>
                    <dt>{t('statistics.recordBook.challenger')}</dt>
                    <dd>{threat.threatPlayer} <strong>{threat.threatValue}</strong></dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export default RecordBook;
