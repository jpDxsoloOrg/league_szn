import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { mockRecords, mockActiveThreats } from '../../mocks/statisticsMockData';
import './RecordBook.css';

type RecordCategory = 'overall' | 'championships' | 'streaks' | 'matchTypes';

function RecordBook() {
  const { t } = useTranslation();
  const [activeCategory, setActiveCategory] = useState<RecordCategory>('overall');

  const categories: { key: RecordCategory; label: string }[] = [
    { key: 'overall', label: t('statistics.recordBook.categories.overall') },
    { key: 'championships', label: t('statistics.recordBook.categories.championships') },
    { key: 'streaks', label: t('statistics.recordBook.categories.streaks') },
    { key: 'matchTypes', label: t('statistics.recordBook.categories.matchTypes') },
  ];

  const records = mockRecords[activeCategory] || [];

  return (
    <div className="record-book">
      <div className="rb-header">
        <h2>{t('statistics.recordBook.title')}</h2>
        <div className="rb-nav-links">
          <Link to="/stats">{t('statistics.nav.playerStats')}</Link>
          <Link to="/stats/leaderboards">{t('statistics.nav.leaderboards')}</Link>
          <Link to="/stats/achievements">{t('statistics.nav.achievements')}</Link>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="rb-tabs">
        {categories.map((cat) => (
          <button
            key={cat.key}
            className={`rb-tab ${activeCategory === cat.key ? 'rb-tab-active' : ''}`}
            onClick={() => setActiveCategory(cat.key)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Record Cards */}
      <div className="rb-records">
        {records.map((record) => (
          <div key={record.recordName} className="rb-record-card">
            <div className="rb-record-header">
              <h3 className="rb-record-name">{record.recordName}</h3>
              <span className="rb-record-value">{record.value}</span>
            </div>
            <div className="rb-record-holder">
              <span className="rb-holder-name">{record.holderName}</span>
              <span className="rb-holder-wrestler">({record.wrestlerName})</span>
            </div>
            <p className="rb-record-desc">{record.description}</p>
            <div className="rb-record-date">
              {t('statistics.recordBook.setOn')} {record.date}
            </div>
          </div>
        ))}
      </div>

      {/* Active Threats */}
      <div className="rb-threats-section">
        <h3>{t('statistics.recordBook.activeThreats')}</h3>
        <p className="rb-threats-desc">{t('statistics.recordBook.activeThreatsDesc')}</p>
        <div className="rb-threats-list">
          {mockActiveThreats.map((threat) => (
            <div key={threat.recordName} className="rb-threat-card">
              <div className="rb-threat-record">{threat.recordName}</div>
              <div className="rb-threat-details">
                <div className="rb-threat-current">
                  <span className="rb-threat-label">{t('statistics.recordBook.currentHolder')}</span>
                  <span className="rb-threat-holder">{threat.currentHolder}</span>
                  <span className="rb-threat-value">{threat.currentValue}</span>
                </div>
                <div className="rb-threat-arrow">vs</div>
                <div className="rb-threat-challenger">
                  <span className="rb-threat-label">{t('statistics.recordBook.challenger')}</span>
                  <span className="rb-threat-holder">{threat.threatPlayer}</span>
                  <span className="rb-threat-value">{threat.threatValue}</span>
                </div>
              </div>
              <div className="rb-threat-gap">{threat.gapDescription}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default RecordBook;
