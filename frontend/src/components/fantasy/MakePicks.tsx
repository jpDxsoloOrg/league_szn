import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { fantasyApi, eventsApi, divisionsApi } from '../../services/api';
import type { LeagueEvent } from '../../types/event';
import type { WrestlerWithCost, FantasyConfig } from '../../types/fantasy';
import type { Division } from '../../types';
import DivisionPicker from './DivisionPicker';
import BudgetTracker from './BudgetTracker';
import './MakePicks.css';

export default function MakePicks() {
  const { t } = useTranslation();
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();

  const [event, setEvent] = useState<LeagueEvent | null>(null);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [wrestlers, setWrestlers] = useState<WrestlerWithCost[]>([]);
  const [config, setConfig] = useState<FantasyConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [picks, setPicks] = useState<Record<string, string[]>>({});
  const [activeDivision, setActiveDivision] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!eventId) return;
    const controller = new AbortController();

    const fetchData = async () => {
      try {
        setLoading(true);
        setFetchError(null);

        const [eventData, divisionsData, wrestlersData, configData] = await Promise.all([
          eventsApi.getById(eventId, controller.signal),
          divisionsApi.getAll(controller.signal),
          fantasyApi.getWrestlerCosts(controller.signal),
          fantasyApi.getConfig(controller.signal),
        ]);

        // Try to load existing picks (may not exist yet)
        let existingPicks = null;
        try {
          existingPicks = await fantasyApi.getUserPicks(eventId, controller.signal);
        } catch {
          // No existing picks - that's fine
        }

        setEvent(eventData);
        setDivisions(divisionsData);
        setWrestlers(wrestlersData);
        setConfig(configData);

        // Initialize picks from existing or empty
        if (existingPicks) {
          setPicks({ ...existingPicks.picks });
        } else {
          const initial: Record<string, string[]> = {};
          divisionsData.forEach((d) => {
            initial[d.divisionId] = [];
          });
          setPicks(initial);
        }

        setActiveDivision(divisionsData[0]?.divisionId || '');
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setFetchError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    return () => controller.abort();
  }, [eventId]);

  // Derive budget and picksPerDivision from event overrides or config defaults
  const budget = event?.fantasyBudget || config?.defaultBudget || 500;
  const picksPerDivision = event?.fantasyPicksPerDivision || config?.defaultPicksPerDivision || 2;

  // Calculate total spent
  const totalSpent = useMemo(() => {
    let total = 0;
    Object.values(picks).forEach((playerIds) => {
      playerIds.forEach((playerId) => {
        const wrestler = wrestlers.find((w) => w.playerId === playerId);
        if (wrestler) {
          total += wrestler.currentCost;
        }
      });
    });
    return total;
  }, [picks, wrestlers]);

  const remainingBudget = budget - totalSpent;

  const getWrestlersForDivision = useCallback((divisionId: string): WrestlerWithCost[] => {
    return wrestlers.filter((w) => w.divisionId === divisionId);
  }, [wrestlers]);

  const handleToggleWrestler = useCallback(
    (playerId: string, divisionId: string) => {
      if (!event) return;

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
          if (divisionPicks.length >= picksPerDivision) {
            setError(t('fantasy.picks.maxPicksReached', { max: picksPerDivision }));
            return prev;
          }

          const wrestler = wrestlers.find((w) => w.playerId === playerId);
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
    [event, wrestlers, remainingBudget, picksPerDivision, t]
  );

  const handleClearAll = useCallback(async () => {
    if (!eventId) return;

    try {
      await fantasyApi.clearPicks(eventId);
    } catch {
      // If clearing on server fails, still clear locally
    }

    const cleared: Record<string, string[]> = {};
    divisions.forEach((d) => {
      cleared[d.divisionId] = [];
    });
    setPicks(cleared);
    setError(null);
    setSuccess(null);
  }, [eventId, divisions]);

  const handleSubmit = async () => {
    if (!eventId) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      await fantasyApi.submitPicks(eventId, picks);
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

  if (loading) {
    return (
      <div className="make-picks">
        <div className="loading-state">
          <div className="spinner" />
          <p>{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="error-state">
        <h2>{fetchError}</h2>
        <button onClick={() => navigate('/fantasy/dashboard')}>
          {t('fantasy.picks.backToDashboard')}
        </button>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="error-state">
        <h2>{t('fantasy.picks.showNotFound')}</h2>
        <button onClick={() => navigate('/fantasy/dashboard')}>
          {t('fantasy.picks.backToDashboard')}
        </button>
      </div>
    );
  }

  if (event.status === 'completed' || event.status === 'cancelled') {
    return (
      <div className="error-state">
        <h2>{t('fantasy.picks.showNotOpen')}</h2>
        <p>
          {t('fantasy.picks.showStatus')}: {event.status}
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
          <h2>{event.name}</h2>
          <p className="deadline">
            {t('fantasy.picks.deadline')}: {new Date(event.date).toLocaleDateString()}{' '}
            {new Date(event.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <span className="show-status open">{t('fantasy.showStatus.open')}</span>
      </header>

      <BudgetTracker budget={budget} spent={totalSpent} />

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
        {divisions.map((division) => {
          const divisionPicks = picks[division.divisionId]?.length || 0;
          return (
            <button
              key={division.divisionId}
              className={`division-tab ${activeDivision === division.divisionId ? 'active' : ''}`}
              onClick={() => setActiveDivision(division.divisionId)}
            >
              <span className="division-name">{division.name}</span>
              <span className="picks-count">
                {divisionPicks}/{picksPerDivision}
              </span>
            </button>
          );
        })}
      </div>

      <div className="picks-content">
        {divisions.map((division) => (
          <div
            key={division.divisionId}
            className={`division-panel ${activeDivision === division.divisionId ? 'active' : ''}`}
          >
            <DivisionPicker
              division={division}
              wrestlers={getWrestlersForDivision(division.divisionId)}
              selectedIds={picks[division.divisionId] || []}
              maxPicks={picksPerDivision}
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
