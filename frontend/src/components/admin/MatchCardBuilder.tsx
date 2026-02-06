import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MatchDesignation, MatchCardEntry } from '../../types/event';
import { mockAvailableMatches } from '../../mocks/eventMockData';
import './MatchCardBuilder.css';

const designationOptions: { value: MatchDesignation; labelKey: string }[] = [
  { value: 'pre-show', labelKey: 'events.designations.preShow' },
  { value: 'opener', labelKey: 'events.designations.opener' },
  { value: 'midcard', labelKey: 'events.designations.midcard' },
  { value: 'co-main', labelKey: 'events.designations.coMain' },
  { value: 'main-event', labelKey: 'events.designations.mainEvent' },
];

const designationColors: Record<MatchDesignation, string> = {
  'pre-show': '#6b7280',
  'opener': '#60a5fa',
  'midcard': '#a78bfa',
  'co-main': '#f59e0b',
  'main-event': '#d4af37',
};

interface CardMatch extends MatchCardEntry {
  label: string;
  isChampionship: boolean;
}

export default function MatchCardBuilder() {
  const { t } = useTranslation();

  const [cardMatches, setCardMatches] = useState<CardMatch[]>([
    {
      position: 1,
      matchId: 'avail-match-001',
      designation: 'opener',
      label: 'Stone Cold vs The Rock (Singles)',
      isChampionship: false,
    },
    {
      position: 2,
      matchId: 'avail-match-003',
      designation: 'midcard',
      label: 'Undertaker vs John Cena (Singles)',
      isChampionship: false,
    },
    {
      position: 3,
      matchId: 'avail-match-002',
      designation: 'co-main',
      label: 'Triple H vs CM Punk (Singles - IC Title)',
      isChampionship: true,
    },
    {
      position: 4,
      matchId: 'avail-match-005',
      designation: 'main-event',
      label: 'CM Punk vs John Cena vs Triple H (Triple Threat - WWE Title)',
      isChampionship: true,
    },
  ]);

  const [selectedMatchToAdd, setSelectedMatchToAdd] = useState('');

  const usedMatchIds = new Set(cardMatches.map((m) => m.matchId));
  const availableToAdd = mockAvailableMatches.filter(
    (m) => !usedMatchIds.has(m.matchId)
  );

  const handleDesignationChange = (index: number, designation: MatchDesignation) => {
    setCardMatches((prev) =>
      prev.map((m, i) => (i === index ? { ...m, designation } : m))
    );
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    setCardMatches((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
      return next.map((m, i) => ({ ...m, position: i + 1 }));
    });
  };

  const handleMoveDown = (index: number) => {
    if (index === cardMatches.length - 1) return;
    setCardMatches((prev) => {
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1]!, next[index]!];
      return next.map((m, i) => ({ ...m, position: i + 1 }));
    });
  };

  const handleRemove = (index: number) => {
    setCardMatches((prev) =>
      prev.filter((_, i) => i !== index).map((m, i) => ({ ...m, position: i + 1 }))
    );
  };

  const handleAddMatch = () => {
    if (!selectedMatchToAdd) return;
    const match = mockAvailableMatches.find((m) => m.matchId === selectedMatchToAdd);
    if (!match) return;

    setCardMatches((prev) => [
      ...prev,
      {
        position: prev.length + 1,
        matchId: match.matchId,
        designation: 'midcard' as MatchDesignation,
        label: match.label,
        isChampionship: match.isChampionship,
      },
    ]);
    setSelectedMatchToAdd('');
  };

  return (
    <div className="match-card-builder">
      <h3 className="builder-title">{t('events.admin.matchCardBuilder')}</h3>

      {cardMatches.length === 0 ? (
        <p className="builder-empty">{t('events.admin.noMatchesOnCard')}</p>
      ) : (
        <div className="builder-list">
          {cardMatches.map((match, index) => (
            <div
              key={match.matchId}
              className={`builder-match-item ${match.designation === 'main-event' ? 'main-event-item' : ''}`}
            >
              <div className="builder-match-position">#{match.position}</div>

              <div className="builder-match-content">
                <div className="builder-match-label">
                  {match.label}
                  {match.isChampionship && (
                    <span className="builder-championship-tag">
                      {t('events.admin.championshipMatch')}
                    </span>
                  )}
                </div>

                <div className="builder-match-controls">
                  <select
                    className="designation-select"
                    value={match.designation}
                    onChange={(e) =>
                      handleDesignationChange(index, e.target.value as MatchDesignation)
                    }
                  >
                    {designationOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {t(opt.labelKey)}
                      </option>
                    ))}
                  </select>

                  <span
                    className="designation-indicator"
                    style={{ backgroundColor: designationColors[match.designation] }}
                  >
                    {t(
                      designationOptions.find((d) => d.value === match.designation)
                        ?.labelKey || ''
                    )}
                  </span>
                </div>
              </div>

              <div className="builder-match-actions">
                <button
                  className="builder-action-btn"
                  onClick={() => handleMoveUp(index)}
                  disabled={index === 0}
                  title={t('events.admin.moveUp')}
                >
                  &#9650;
                </button>
                <button
                  className="builder-action-btn"
                  onClick={() => handleMoveDown(index)}
                  disabled={index === cardMatches.length - 1}
                  title={t('events.admin.moveDown')}
                >
                  &#9660;
                </button>
                <button
                  className="builder-action-btn remove-btn"
                  onClick={() => handleRemove(index)}
                  title={t('events.admin.removeMatch')}
                >
                  &#10005;
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Match */}
      {availableToAdd.length > 0 && (
        <div className="builder-add-section">
          <select
            className="add-match-select"
            value={selectedMatchToAdd}
            onChange={(e) => setSelectedMatchToAdd(e.target.value)}
          >
            <option value="">{t('events.admin.selectMatch')}</option>
            {availableToAdd.map((m) => (
              <option key={m.matchId} value={m.matchId}>
                {m.label}
              </option>
            ))}
          </select>
          <button
            className="add-match-btn"
            onClick={handleAddMatch}
            disabled={!selectedMatchToAdd}
          >
            {t('events.admin.addMatch')}
          </button>
        </div>
      )}
    </div>
  );
}
