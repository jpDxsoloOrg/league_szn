import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { eventsApi, seasonsApi } from '../../services/api';
import type { LeagueEvent } from '../../types/event';
import './ManageFantasyShows.css';

interface Season {
  seasonId: string;
  name: string;
  status: string;
}

export default function ManageFantasyShows() {
  const { t } = useTranslation();
  const [events, setEvents] = useState<LeagueEvent[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const fetchData = async () => {
      try {
        setLoading(true);
        const [eventsData, seasonsData] = await Promise.all([
          eventsApi.getAll({}, controller.signal),
          seasonsApi.getAll(controller.signal),
        ]);
        setEvents(eventsData as LeagueEvent[]);
        setSeasons(seasonsData as Season[]);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    return () => controller.abort();
  }, []);

  const handleUpdateFantasySettings = async (
    event: LeagueEvent,
    field: 'fantasyBudget' | 'fantasyPicksPerDivision',
    value: number
  ) => {
    setSaving(true);
    setError(null);

    try {
      const updated = await eventsApi.update(event.eventId, { [field]: value });
      setEvents((prev) =>
        prev.map((e) => (e.eventId === event.eventId ? (updated as LeagueEvent) : e))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t('fantasy.admin.shows.error'));
    } finally {
      setSaving(false);
    }
  };

  const getSeasonName = (seasonId?: string): string => {
    if (!seasonId) return '-';
    const season = seasons.find((s) => s.seasonId === seasonId);
    return season?.name || '-';
  };

  const getStatusBadgeClass = (status: string): string => {
    switch (status) {
      case 'upcoming':
        return 'status-open';
      case 'in-progress':
        return 'status-locked';
      case 'completed':
        return 'status-completed';
      case 'cancelled':
        return 'status-draft';
      default:
        return '';
    }
  };

  if (loading) {
    return (
      <div className="manage-fantasy-shows">
        <div className="loading-state">
          <div className="spinner" />
          <p>{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="manage-fantasy-shows">
      <header className="shows-header">
        <h2>{t('fantasy.admin.shows.title')}</h2>
        <p className="subtitle">{t('fantasy.admin.shows.subtitle')}</p>
      </header>

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      <div className="shows-table-wrapper">
        <table className="shows-table">
          <thead>
            <tr>
              <th>{t('fantasy.admin.shows.name')}</th>
              <th>{t('fantasy.admin.shows.season')}</th>
              <th>{t('fantasy.admin.shows.date')}</th>
              <th>{t('fantasy.admin.shows.status')}</th>
              <th>{t('fantasy.admin.shows.budget')}</th>
              <th>Picks/Div</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.eventId}>
                <td className="col-name">{event.name}</td>
                <td className="col-season">{getSeasonName(event.seasonId)}</td>
                <td className="col-date">
                  {new Date(event.date).toLocaleDateString()}
                </td>
                <td className="col-status">
                  <span className={`status-badge ${getStatusBadgeClass(event.status)}`}>
                    {event.status}
                  </span>
                </td>
                <td className="col-budget">
                  <input
                    type="number"
                    value={event.fantasyBudget || 500}
                    onChange={(e) =>
                      handleUpdateFantasySettings(
                        event,
                        'fantasyBudget',
                        parseInt(e.target.value) || 500
                      )
                    }
                    min="100"
                    className="inline-input"
                    disabled={saving || event.status === 'completed'}
                  />
                </td>
                <td className="col-picks">
                  <input
                    type="number"
                    value={event.fantasyPicksPerDivision || 2}
                    onChange={(e) =>
                      handleUpdateFantasySettings(
                        event,
                        'fantasyPicksPerDivision',
                        parseInt(e.target.value) || 2
                      )
                    }
                    min="1"
                    max="10"
                    className="inline-input"
                    disabled={saving || event.status === 'completed'}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {events.length === 0 && (
        <div className="no-shows">
          <p>{t('fantasy.admin.shows.noShows')}</p>
        </div>
      )}
    </div>
  );
}
