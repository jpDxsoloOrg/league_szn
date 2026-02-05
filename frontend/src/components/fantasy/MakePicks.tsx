import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import {
  mockShows,
  mockDivisions,
  mockWrestlersWithCosts,
  mockUserPicks,
} from '../../mocks/fantasyMockData';
import type { WrestlerWithCost } from '../../types/fantasy';
import DivisionPicker from './DivisionPicker';
import BudgetTracker from './BudgetTracker';
import './MakePicks.css';

export default function MakePicks() {
  const { t } = useTranslation();
  const { showId } = useParams<{ showId: string }>();
  const navigate = useNavigate();

  const show = mockShows.find((s) => s.showId === showId);
  const existingPicks = mockUserPicks.find((p) => p.showId === showId);

  // Initialize picks from existing picks or empty
  const [picks, setPicks] = useState<Record<string, string[]>>(() => {
    if (existingPicks) {
      return { ...existingPicks.picks };
    }
    const initial: Record<string, string[]> = {};
    mockDivisions.forEach((d) => {
      initial[d.divisionId] = [];
    });
    return initial;
  });

  const [activeDivision, setActiveDivision] = useState<string>(mockDivisions[0]?.divisionId || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Calculate total spent
  const totalSpent = useMemo(() => {
    let total = 0;
    Object.values(picks).forEach((playerIds) => {
      playerIds.forEach((playerId) => {
        const wrestler = mockWrestlersWithCosts.find((w) => w.playerId === playerId);
        if (wrestler) {
          total += wrestler.currentCost;
        }
      });
    });
    return total;
  }, [picks]);

  const remainingBudget = (show?.budget || 0) - totalSpent;

  const getWrestlersForDivision = useCallback((divisionId: string): WrestlerWithCost[] => {
    return mockWrestlersWithCosts.filter((w) => w.divisionId === divisionId);
  }, []);

  const handleToggleWrestler = useCallback(
    (playerId: string, divisionId: string) => {
      if (!show) return;

      setPicks((prev) => {
        const divisionPicks = prev[divisionId] || [];
        const isSelected = divisionPicks.includes(playerId);

        if (isSelected) {
          // Remove wrestler
          return {
            ...prev,
            [divisionId]: divisionPicks.filter((id) => id !== playerId),
          };
        } else {
          // Add wrestler - check constraints
          if (divisionPicks.length >= show.picksPerDivision) {
            setError(t('fantasy.picks.maxPicksReached', { max: show.picksPerDivision }));
            return prev;
          }

          const wrestler = mockWrestlersWithCosts.find((w) => w.playerId === playerId);
          if (wrestler && wrestler.currentCost > remainingBudget) {
            setError(t('fantasy.picks.notEnoughBudget'));
            return prev;
          }

          setError(null);
          return {
            ...prev,
            [divisionId]: [...divisionPicks, playerId],
          };
        }
      });
    },
    [show, remainingBudget, t]
  );

  const handleClearAll = useCallback(() => {
    const cleared: Record<string, string[]> = {};
    mockDivisions.forEach((d) => {
      cleared[d.divisionId] = [];
    });
    setPicks(cleared);
    setError(null);
    setSuccess(null);
  }, []);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      // Mock API call
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Simulate success
      setSuccess(t('fantasy.picks.submitSuccess'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('fantasy.picks.submitError'));
    } finally {
      setSubmitting(false);
    }
  };

  const getTotalPicksCount = () => {
    return Object.values(picks).reduce((sum, arr) => sum + arr.length, 0);
  };

  if (!show) {
    return (
      <div className="error-state">
        <h2>{t('fantasy.picks.showNotFound')}</h2>
        <button onClick={() => navigate('/fantasy/dashboard')}>
          {t('fantasy.picks.backToDashboard')}
        </button>
      </div>
    );
  }

  if (show.status !== 'open') {
    return (
      <div className="error-state">
        <h2>{t('fantasy.picks.showNotOpen')}</h2>
        <p>
          {t('fantasy.picks.showStatus')}: {t(`fantasy.showStatus.${show.status}`)}
        </p>
        <button onClick={() => navigate('/fantasy/dashboard')}>
          {t('fantasy.picks.backToDashboard')}
        </button>
      </div>
    );
  }

  return (
    <div className="make-picks">
      <header className="picks-header">
        <div className="header-info">
          <h1>{t('fantasy.picks.title')}</h1>
          <h2>{show.name}</h2>
          <p className="deadline">
            {t('fantasy.picks.deadline')}: {new Date(show.date).toLocaleDateString()}{' '}
            {new Date(show.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <span className="show-status open">{t('fantasy.showStatus.open')}</span>
      </header>

      <BudgetTracker budget={show.budget} spent={totalSpent} />

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      {success && (
        <div className="alert alert-success" role="alert">
          {success}
        </div>
      )}

      <div className="division-tabs">
        {mockDivisions.map((division) => {
          const divisionPicks = picks[division.divisionId]?.length || 0;
          return (
            <button
              key={division.divisionId}
              className={`division-tab ${activeDivision === division.divisionId ? 'active' : ''}`}
              onClick={() => setActiveDivision(division.divisionId)}
            >
              <span className="division-name">{division.name}</span>
              <span className="picks-count">
                {divisionPicks}/{show.picksPerDivision}
              </span>
            </button>
          );
        })}
      </div>

      <div className="picks-content">
        {mockDivisions.map((division) => (
          <div
            key={division.divisionId}
            className={`division-panel ${activeDivision === division.divisionId ? 'active' : ''}`}
          >
            <DivisionPicker
              division={division}
              wrestlers={getWrestlersForDivision(division.divisionId)}
              selectedIds={picks[division.divisionId] || []}
              maxPicks={show.picksPerDivision}
              remainingBudget={remainingBudget}
              onToggle={(playerId) => handleToggleWrestler(playerId, division.divisionId)}
            />
          </div>
        ))}
      </div>

      <div className="picks-actions">
        <button className="btn-clear" onClick={handleClearAll} disabled={submitting}>
          {t('fantasy.picks.clearAll')}
        </button>
        <button
          className="btn-submit"
          onClick={handleSubmit}
          disabled={submitting || getTotalPicksCount() === 0}
        >
          {submitting ? t('fantasy.picks.submitting') : t('fantasy.picks.submitPicks')}
        </button>
      </div>
    </div>
  );
}
