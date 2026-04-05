import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { EventType, EventCalendarEntry } from '../../types/event';
import type { Show } from '../../types';
import { eventsApi, showsApi, companiesApi } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import Skeleton from '../ui/Skeleton';
import EmptyState from '../ui/EmptyState';
import EventCard from './EventCard';
import './EventsCalendar.css';

const eventTypeColors: Record<string, string> = {
  ppv: '#d4af37',
  weekly: '#60a5fa',
  special: '#a78bfa',
  house: '#9ca3af',
};

const showColor = '#60a5fa';

type FilterTab = 'all' | EventType;

/** Map DayOfWeek string to JS getDay() number (0=Sun..6=Sat) */
const dayOfWeekToNumber: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

interface ShowCalendarEntry {
  show: Show;
  companyName: string;
  date: string; // ISO date for this specific occurrence
}

export default function EventsCalendar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAdminOrModerator } = useAuth();
  useDocumentTitle(t('events.title'));
  const now = new Date();
  const [currentMonth, setCurrentMonth] = useState(now.getMonth());
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [calendarEntries, setCalendarEntries] = useState<EventCalendarEntry[]>([]);
  const [shows, setShows] = useState<Show[]>([]);
  const [companyNames, setCompanyNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creatingEvent, setCreatingEvent] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const loadData = async () => {
      try {
        setLoading(true);
        const [events, showsData, companiesData] = await Promise.all([
          eventsApi.getAll(undefined, controller.signal),
          showsApi.getAll(undefined, controller.signal),
          companiesApi.getAll(controller.signal),
        ]);
        const entries: EventCalendarEntry[] = events.map((e) => ({
          eventId: e.eventId,
          name: e.name,
          eventType: e.eventType,
          date: e.date,
          status: e.status,
          matchCount: e.matchCards?.length || 0,
          championshipMatchCount: 0,
          imageUrl: e.imageUrl,
          showId: e.showId,
        }));
        setCalendarEntries(entries);
        setShows(showsData.filter((s) => s.schedule === 'weekly' && s.dayOfWeek));
        const names: Record<string, string> = {};
        companiesData.forEach((c) => { names[c.companyId] = c.name; });
        setCompanyNames(names);
        setError(null);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setError(err instanceof Error ? err.message : 'Failed to load events');
        }
      } finally {
        setLoading(false);
      }
    };
    loadData();
    return () => controller.abort();
  }, []);

  const monthNames = [
    t('events.calendar.months.january'),
    t('events.calendar.months.february'),
    t('events.calendar.months.march'),
    t('events.calendar.months.april'),
    t('events.calendar.months.may'),
    t('events.calendar.months.june'),
    t('events.calendar.months.july'),
    t('events.calendar.months.august'),
    t('events.calendar.months.september'),
    t('events.calendar.months.october'),
    t('events.calendar.months.november'),
    t('events.calendar.months.december'),
  ];

  const dayNames = [
    t('events.calendar.days.sun'),
    t('events.calendar.days.mon'),
    t('events.calendar.days.tue'),
    t('events.calendar.days.wed'),
    t('events.calendar.days.thu'),
    t('events.calendar.days.fri'),
    t('events.calendar.days.sat'),
  ];

  const filteredEntries = useMemo(() => {
    if (activeFilter === 'all') return calendarEntries;
    return calendarEntries.filter((e) => e.eventType === activeFilter);
  }, [activeFilter, calendarEntries]);

  // Events for the current calendar month
  const monthEvents = useMemo(() => {
    return filteredEntries.filter((e) => {
      const d = new Date(e.date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });
  }, [filteredEntries, currentMonth, currentYear]);

  // Generate weekly show entries for the current month
  const showEntriesByDay = useMemo(() => {
    if (activeFilter !== 'all' && activeFilter !== 'weekly') return {};

    const map: Record<number, ShowCalendarEntry[]> = {};
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    shows.forEach((show) => {
      if (!show.dayOfWeek) return;
      const targetDay = dayOfWeekToNumber[show.dayOfWeek];
      if (targetDay === undefined) return;

      for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(currentYear, currentMonth, d);
        if (date.getDay() === targetDay) {
          const dateStr = date.toISOString();
          // Check if an event already exists for this show on this date
          const existingEvent = calendarEntries.find((e) => {
            if (e.showId !== show.showId) return false;
            const eDate = new Date(e.date);
            return eDate.getFullYear() === date.getFullYear() &&
              eDate.getMonth() === date.getMonth() &&
              eDate.getDate() === date.getDate();
          });

          if (!existingEvent) {
            const arr = map[d] ?? (map[d] = []);
            arr.push({
              show,
              companyName: companyNames[show.companyId] || '',
              date: dateStr,
            });
          }
        }
      }
    });
    return map;
  }, [shows, currentMonth, currentYear, activeFilter, calendarEntries, companyNames]);

  // Build calendar grid
  const calendarDays = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      days.push(d);
    }
    return days;
  }, [currentMonth, currentYear]);

  // Map day numbers to events
  const eventsByDay = useMemo(() => {
    const map: Record<number, typeof monthEvents> = {};
    monthEvents.forEach((e) => {
      const day = new Date(e.date).getDate();
      if (!map[day]) map[day] = [];
      map[day].push(e);
    });
    return map;
  }, [monthEvents]);

  // In-progress events (surfaced at top with live badge)
  const inProgressEvents = useMemo(() => {
    return filteredEntries
      .filter((e) => e.status === 'in-progress')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [filteredEntries]);

  // Upcoming events (from all entries, not just current month)
  const upcomingEvents = useMemo(() => {
    return filteredEntries
      .filter((e) => e.status === 'upcoming')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [filteredEntries]);

  // Recent completed events
  const recentResults = useMemo(() => {
    return filteredEntries
      .filter((e) => e.status === 'completed')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10);
  }, [filteredEntries]);

  const goToPreviousMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const goToNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const handleShowClick = useCallback(async (entry: ShowCalendarEntry) => {
    if (!isAdminOrModerator || creatingEvent) return;
    const key = `${entry.show.showId}-${entry.date}`;
    setCreatingEvent(key);
    try {
      const event = await eventsApi.create({
        name: entry.show.name,
        eventType: 'weekly',
        date: entry.date,
        showId: entry.show.showId,
        companyIds: [entry.show.companyId],
        imageUrl: entry.show.imageUrl,
      });
      navigate(`/events/${event.eventId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create event');
      setCreatingEvent(null);
    }
  }, [isAdminOrModerator, creatingEvent, navigate]);

  const filterTabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: t('events.filters.all') },
    { key: 'ppv', label: t('events.filters.ppv') },
    { key: 'weekly', label: t('events.filters.weekly') },
    { key: 'special', label: t('events.filters.special') },
    { key: 'house', label: t('events.filters.house') },
  ];

  if (loading) {
    return (
      <div className="events-calendar-page">
        <h2 className="events-title">{t('events.title')}</h2>
        <Skeleton variant="calendar" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="events-calendar-page">
        <h2 className="events-title">{t('events.title')}</h2>
        <div className="error-message">{error}</div>
      </div>
    );
  }

  const hasContent = calendarEntries.length > 0 || shows.length > 0;

  if (!hasContent) {
    return (
      <div className="events-calendar-page">
        <h2 className="events-title">{t('events.title')}</h2>
        <EmptyState
          title={t('events.title')}
          description={t('emptyState.checkBackSoon')}
        />
      </div>
    );
  }

  return (
    <div className="events-calendar-page">
      <div className="events-title-row">
        <h2 className="events-title">{t('events.title')}</h2>
        {isAdminOrModerator && (
          <button
            className="create-event-calendar-btn"
            onClick={() => navigate('/admin/events')}
          >
            + {t('events.calendar.createEvent', 'Create Event')}
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="events-filter-tabs">
        {filterTabs.map((tab) => (
          <button
            key={tab.key}
            className={`events-filter-tab ${activeFilter === tab.key ? 'active' : ''}`}
            onClick={() => setActiveFilter(tab.key)}
            style={
              activeFilter === tab.key && tab.key !== 'all'
                ? { borderBottomColor: eventTypeColors[tab.key] }
                : undefined
            }
          >
            {tab.key !== 'all' && (
              <span className="filter-dot" style={{ backgroundColor: eventTypeColors[tab.key] }} />
            )}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Calendar */}
      <div className="calendar-container">
        <div className="calendar-nav">
          <button className="calendar-nav-btn" onClick={goToPreviousMonth}>&lt;</button>
          <h3 className="calendar-month-label">{monthNames[currentMonth]} {currentYear}</h3>
          <button className="calendar-nav-btn" onClick={goToNextMonth}>&gt;</button>
        </div>

        <div className="calendar-grid">
          {dayNames.map((day) => (
            <div key={day} className="calendar-day-header">{day}</div>
          ))}

          {calendarDays.map((day, idx) => {
            const dayEvents = day !== null ? eventsByDay[day] : undefined;
            const dayShows = day !== null ? showEntriesByDay[day] : undefined;
            const hasItems = !!(dayEvents || dayShows);

            return (
              <div
                key={idx}
                className={`calendar-day-cell ${day === null ? 'empty' : ''} ${hasItems ? 'has-events' : ''}`}
              >
                {day !== null && (
                  <>
                    <span className="calendar-day-number">{day}</span>
                    <div className="calendar-day-items">
                      {dayEvents?.map((evt) => (
                        <Link
                          key={evt.eventId}
                          to={`/events/${evt.eventId}`}
                          className="calendar-item"
                          title={evt.name}
                          aria-label={evt.name}
                        >
                          {evt.imageUrl ? (
                            <img src={evt.imageUrl} alt={evt.name} className="calendar-item-img" />
                          ) : (
                            <div className="calendar-item-bar" style={{ backgroundColor: eventTypeColors[evt.eventType] }}>
                              <span className="calendar-item-label">{evt.name}</span>
                            </div>
                          )}
                        </Link>
                      ))}
                      {dayShows?.map((entry) =>
                        isAdminOrModerator ? (
                          <button
                            key={`show-${entry.show.showId}`}
                            className="calendar-item"
                            title={`${entry.show.name} (${entry.companyName})`}
                            aria-label={entry.show.name}
                            disabled={creatingEvent === `${entry.show.showId}-${entry.date}`}
                            onClick={() => handleShowClick(entry)}
                          >
                            {entry.show.imageUrl ? (
                              <img src={entry.show.imageUrl} alt={entry.show.name} className="calendar-item-img" />
                            ) : (
                              <div className="calendar-item-bar" style={{ backgroundColor: showColor }}>
                                <span className="calendar-item-label">{entry.show.name}</span>
                              </div>
                            )}
                          </button>
                        ) : (
                          <div
                            key={`show-${entry.show.showId}`}
                            className="calendar-item calendar-item-static"
                            title={entry.show.name}
                          >
                            {entry.show.imageUrl ? (
                              <img src={entry.show.imageUrl} alt={entry.show.name} className="calendar-item-img" />
                            ) : (
                              <div className="calendar-item-bar" style={{ backgroundColor: showColor }}>
                                <span className="calendar-item-label">{entry.show.name}</span>
                              </div>
                            )}
                          </div>
                        )
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="calendar-legend">
          <div className="legend-item">
            <span className="legend-dot" style={{ backgroundColor: '#d4af37' }} />
            <span>{t('events.types.ppv')}</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot" style={{ backgroundColor: '#60a5fa' }} />
            <span>{t('events.types.weekly')}</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot" style={{ backgroundColor: '#a78bfa' }} />
            <span>{t('events.types.special')}</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot" style={{ backgroundColor: '#9ca3af' }} />
            <span>{t('events.types.house')}</span>
          </div>
        </div>
      </div>

      {/* In-Progress Events */}
      {inProgressEvents.length > 0 && (
        <div className="in-progress-events-section">
          <h3 className="in-progress-events-title">
            <span className="in-progress-live-dot" aria-hidden="true" />
            {t('events.calendar.inProgress')}
          </h3>
          <div className="in-progress-events-list">
            {inProgressEvents.map((event) => (
              <EventCard key={event.eventId} event={event} />
            ))}
          </div>
        </div>
      )}

      {/* Upcoming Events */}
      <div className="upcoming-events-section">
        <h3 className="upcoming-events-title">{t('events.calendar.upcoming')}</h3>
        {upcomingEvents.length === 0 ? (
          <p className="no-events-message">{t('events.calendar.noUpcoming')}</p>
        ) : (
          <div className="upcoming-events-list">
            {upcomingEvents.map((event) => (
              <EventCard key={event.eventId} event={event} />
            ))}
          </div>
        )}
      </div>

      {/* Recent Results */}
      <div className="recent-results-section">
        <h3 className="recent-results-title">{t('events.calendar.recentResults', 'Recent Results')}</h3>
        {recentResults.length === 0 ? (
          <p className="no-events-message">{t('events.calendar.noResults', 'No completed events yet.')}</p>
        ) : (
          <div className="recent-results-list">
            {recentResults.map((event) => (
              <EventCard key={event.eventId} event={event} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
