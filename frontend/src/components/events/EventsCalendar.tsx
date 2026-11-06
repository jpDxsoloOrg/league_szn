import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarPlus, ChevronLeft, ChevronRight } from 'lucide-react';
import type { EventType, EventCalendarEntry } from '../../types/event';
import type { Company, Show } from '../../types';
import { eventsApi, showsApi, companiesApi } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useIsMobile } from '../../hooks/useIsMobile';
import { toCalendarDate, dateToCalendarDate, formatCalendarDate } from '../../utils/dateUtils';
import { dayOfWeekToNumber, getPlannedShows } from '../../utils/showSchedule';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import Select from '../ui/Select';
import Skeleton from '../ui/Skeleton';
import Tabs from '../ui/Tabs';
import CreateEventModal from './CreateEventModal';
import type { CreateEventPreset } from './CreateEventModal';
import EventCard from './EventCard';
import { EVENT_STATUS_TONES, EVENT_TYPE_TONES } from './eventDisplay';
import '../posterHero.css';
import './EventsCalendar.css';

const EVENT_TYPES: EventType[] = ['ppv', 'weekly', 'special', 'house'];
const PAST_PAGE_SIZE = 10;
const PLANNED_SHOWN = 5;

type FilterTab = 'all' | EventType;
type EventsView = 'upcoming' | 'past';

interface ShowCalendarEntry {
  show: Show;
  companyName: string;
  date: string; // calendar date YYYY-MM-DD for this specific occurrence
  eventType: 'weekly' | 'ppv';
}

export default function EventsCalendar() {
  const { t } = useTranslation();
  const { isAdminOrModerator } = useAuth();
  useDocumentTitle(t('events.title'));
  const [searchParams, setSearchParams] = useSearchParams();
  const now = new Date();
  const [currentMonth, setCurrentMonth] = useState(now.getMonth());
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [calendarEntries, setCalendarEntries] = useState<EventCalendarEntry[]>([]);
  const [allShows, setAllShows] = useState<Show[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [createPreset, setCreatePreset] = useState<CreateEventPreset | null>(null);
  const [pastLimit, setPastLimit] = useState(PAST_PAGE_SIZE);
  const isMobile = useIsMobile();
  const [mobileEventsView, setMobileEventsView] = useState<EventsView>('upcoming');

  // Other pages link here with ?create=1 to open the form directly.
  const createRequested = searchParams.get('create') === '1';

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
        setAllShows(showsData);
        setCompanies(companiesData);
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
  }, [reloadKey]);

  const shows = useMemo(
    () => allShows.filter((show) =>
      (show.schedule === 'weekly' && show.dayOfWeek) ||
      (show.schedule === 'ppv' && show.ppvDate)
    ),
    [allShows],
  );

  const companyNames = useMemo(() => {
    const names: Record<string, string> = {};
    companies.forEach((company) => { names[company.companyId] = company.name; });
    return names;
  }, [companies]);

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

  // Events for the current calendar month. Compare against the YYYY-MM-DD
  // calendar day so the placement is identical for every viewer's timezone.
  const monthEvents = useMemo(() => {
    return filteredEntries.filter((e) => {
      const ymd = toCalendarDate(e.date);
      const m = /^(\d{4})-(\d{2})-/.exec(ymd);
      if (!m) return false;
      return Number(m[1]) === currentYear && Number(m[2]) - 1 === currentMonth;
    });
  }, [filteredEntries, currentMonth, currentYear]);

  // Generate weekly + PPV show entries for the current month
  const showEntriesByDay = useMemo(() => {
    const map: Record<number, ShowCalendarEntry[]> = {};
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    const eventExistsForShowOnYmd = (showId: string, ymd: string) =>
      calendarEntries.some((e) => e.showId === showId && toCalendarDate(e.date) === ymd);

    shows.forEach((show) => {
      // Weekly recurring shows
      if (show.schedule === 'weekly' && show.dayOfWeek) {
        if (activeFilter !== 'all' && activeFilter !== 'weekly') return;
        const targetDay = dayOfWeekToNumber[show.dayOfWeek];
        if (targetDay === undefined) return;

        for (let d = 1; d <= daysInMonth; d++) {
          const date = new Date(currentYear, currentMonth, d);
          if (date.getDay() !== targetDay) continue;
          const ymd = dateToCalendarDate(date);
          if (eventExistsForShowOnYmd(show.showId, ymd)) continue;
          const arr = map[d] ?? (map[d] = []);
          arr.push({
            show,
            companyName: companyNames[show.companyId] || '',
            date: ymd,
            eventType: 'weekly',
          });
        }
        return;
      }

      // PPV shows pinned to a specific date. Parse YMD directly so the
      // pinned day is the same in every viewer's timezone.
      if (show.schedule === 'ppv' && show.ppvDate) {
        if (activeFilter !== 'all' && activeFilter !== 'ppv') return;
        const ymd = toCalendarDate(show.ppvDate);
        const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
        if (!parts) return;
        const ppvYear = Number(parts[1]);
        const ppvMonth = Number(parts[2]) - 1;
        const ppvDay = Number(parts[3]);
        if (ppvYear !== currentYear || ppvMonth !== currentMonth) return;
        if (eventExistsForShowOnYmd(show.showId, ymd)) return;
        const arr = map[ppvDay] ?? (map[ppvDay] = []);
        arr.push({
          show,
          companyName: companyNames[show.companyId] || '',
          date: ymd,
          eventType: 'ppv',
        });
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
      const parts = /^\d{4}-\d{2}-(\d{2})$/.exec(toCalendarDate(e.date));
      if (!parts) return;
      const day = Number(parts[1]);
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

  // The next open date of each scheduled show, matching the planned chips on the calendar.
  const plannedShows = useMemo(() => {
    const filteredShows = shows.filter((show) => activeFilter === 'all' || activeFilter === show.schedule);
    return getPlannedShows(filteredShows, calendarEntries, new Date()).slice(0, PLANNED_SHOWN);
  }, [shows, activeFilter, calendarEntries]);

  // Recent completed events
  const recentResults = useMemo(() => {
    return filteredEntries
      .filter((e) => e.status === 'completed')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [filteredEntries]);

  // The one event the page leads with: whatever is live, otherwise the next show.
  const heroEvent = useMemo(() => {
    const byDate = (first: EventCalendarEntry, second: EventCalendarEntry) =>
      new Date(first.date).getTime() - new Date(second.date).getTime();
    const live = calendarEntries.filter((entry) => entry.status === 'in-progress').sort(byDate);
    const upcoming = calendarEntries.filter((entry) => entry.status === 'upcoming').sort(byDate);
    return live[0] ?? upcoming[0] ?? null;
  }, [calendarEntries]);

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

  const openCreate = useCallback((preset: CreateEventPreset | null) => {
    setCreatePreset(preset);
    setCreateOpen(true);
  }, []);

  const closeCreate = useCallback(() => {
    setCreateOpen(false);
    if (searchParams.has('create')) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('create');
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleShowClick = useCallback((entry: ShowCalendarEntry) => {
    openCreate({
      name: entry.show.name,
      eventType: entry.eventType,
      date: entry.date,
      showId: entry.show.showId,
      companyId: entry.show.companyId,
    });
  }, [openCreate]);

  const filterTabs: { value: FilterTab; label: string }[] = [
    { value: 'all', label: t('events.filters.all') },
    ...EVENT_TYPES.map((eventType) => ({ value: eventType, label: t(`events.filters.${eventType}`) })),
  ];

  const createButton = isAdminOrModerator ? (
    <Button icon={<CalendarPlus aria-hidden="true" size={18} />} onClick={() => openCreate(null)}>
      {t('events.calendar.createEvent', 'Create Event')}
    </Button>
  ) : undefined;

  const createModal = isAdminOrModerator ? (
    <CreateEventModal
      open={createOpen || createRequested}
      onClose={closeCreate}
      shows={allShows}
      companies={companies}
      preset={createPreset}
    />
  ) : null;

  const pageHeader = (
    <PageHeader
      title={t('events.title')}
      actions={createButton}
      className={heroEvent ? 'page-header--plain' : undefined}
    />
  );

  if (loading) {
    return (
      <div className="events-page">
        {pageHeader}
        <Skeleton variant={isMobile ? 'cards' : 'calendar'} count={3} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="events-page">
        {pageHeader}
        <EmptyState
          title={t('common.error')}
          description={error}
          actionLabel={t('common.retry')}
          onAction={() => setReloadKey((key) => key + 1)}
        />
      </div>
    );
  }

  const hasContent = calendarEntries.length > 0 || shows.length > 0;

  if (!hasContent) {
    return (
      <div className="events-page">
        {pageHeader}
        <EmptyState
          title={t('events.emptyTitle', 'No events yet')}
          description={t('emptyState.checkBackSoon')}
          actionLabel={isAdminOrModerator ? t('events.calendar.createEvent', 'Create Event') : undefined}
          onAction={isAdminOrModerator ? () => openCreate(null) : undefined}
        />
        {createModal}
      </div>
    );
  }

  const showUpcoming = !isMobile || mobileEventsView === 'upcoming';
  const showPast = !isMobile || mobileEventsView === 'past';
  const otherLiveEvents = inProgressEvents.filter((event) => event.eventId !== heroEvent?.eventId);
  const otherUpcomingEvents = upcomingEvents.filter((event) => event.eventId !== heroEvent?.eventId);
  const heroCoversUpcoming = upcomingEvents.length > 0;

  return (
    <div className="events-page">
      {pageHeader}

      {heroEvent && (
        <section className="poster-hero events-hero" aria-label={t(`events.status.${heroEvent.status}`)}>
          <div className="events-hero__content">
            <div className="events-hero__badges">
              <Badge tone={EVENT_STATUS_TONES[heroEvent.status]}>{t(`events.status.${heroEvent.status}`)}</Badge>
              <Badge tone={EVENT_TYPE_TONES[heroEvent.eventType]}>{t(`events.types.${heroEvent.eventType}`)}</Badge>
            </div>
            <h2 className="events-hero__name">{heroEvent.name}</h2>
            <p className="events-hero__date">
              {formatCalendarDate(heroEvent.date, undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
            <Button variant="hero" to={`/events/${heroEvent.eventId}`}>{t('events.calendar.viewCard', 'View the card')}</Button>
          </div>
          {heroEvent.imageUrl && (
            <div className="poster-hero__frame">
              <img src={heroEvent.imageUrl} alt="" className="poster-hero__image" />
            </div>
          )}
        </section>
      )}

      {isMobile ? (
        <div className="events-toolbar">
          <Tabs
            label={t('events.title')}
            value={mobileEventsView}
            onValueChange={(value) => setMobileEventsView(value as EventsView)}
            items={[
              { value: 'upcoming', label: t('events.status.upcoming') },
              { value: 'past', label: t('events.calendar.past', 'Past') },
            ]}
          />
          <Select
            className="events-toolbar__select"
            label={t('events.calendar.typeFilter', 'Event type')}
            value={activeFilter}
            onValueChange={(value) => setActiveFilter(value as FilterTab)}
            options={filterTabs}
          />
        </div>
      ) : (
        <>
          <Tabs
            className="events-filter-tabs"
            label={t('events.calendar.typeFilter', 'Event type')}
            value={activeFilter}
            onValueChange={(value) => setActiveFilter(value as FilterTab)}
            items={filterTabs}
          />
        </>
      )}

      <div className="events-layout">
        <div className="events-layout__lists">
          {showUpcoming && otherLiveEvents.length > 0 && (
            <section className="events-section">
              <h2 className="events-section__title">{t('events.calendar.inProgress')}</h2>
              <div className="events-list">
                {otherLiveEvents.map((event) => (
                  <EventCard key={event.eventId} event={event} showStatus={false} />
                ))}
              </div>
            </section>
          )}

          {showUpcoming && (otherUpcomingEvents.length > 0 || plannedShows.length > 0 || !heroCoversUpcoming) && (
            <section className="events-section">
              <h2 className="events-section__title">{t('events.calendar.upcoming')}</h2>
              {otherUpcomingEvents.length === 0 && plannedShows.length === 0 ? (
                <p className="events-section__empty">{t('events.calendar.noUpcoming')}</p>
              ) : (
                <div className="events-list">
                  {otherUpcomingEvents.map((event) => (
                    <EventCard key={event.eventId} event={event} showStatus={false} />
                  ))}
                  {plannedShows.map(({ show, date }) => (
                    <div key={`${show.showId}-${date}`} className="event-card event-card--planned">
                      <span className="event-card__date" aria-hidden="true">
                        <span className="event-card__month">{formatCalendarDate(date, undefined, { month: 'short' })}</span>
                        <span className="event-card__day">{formatCalendarDate(date, undefined, { day: '2-digit' })}</span>
                      </span>
                      <span className="event-card__body">
                        <span className="event-card__name">{show.name}</span>
                        <span className="event-card__meta">
                          <span className="sr-only">{formatCalendarDate(date)}</span>
                          {t('events.calendar.plannedShow', 'Planned show, card to come')}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>

        {!isMobile && (
          <section className="calendar" aria-label={`${monthNames[currentMonth]} ${currentYear}`}>
            <div className="calendar-nav">
              <button
                type="button"
                className="calendar-nav-btn"
                onClick={goToPreviousMonth}
                aria-label={t('events.calendar.previousMonth', 'Previous month')}
              >
                <ChevronLeft aria-hidden="true" size={20} />
              </button>
              <h2 className="calendar-month-label">{monthNames[currentMonth]} {currentYear}</h2>
              <button
                type="button"
                className="calendar-nav-btn"
                onClick={goToNextMonth}
                aria-label={t('events.calendar.nextMonth', 'Next month')}
              >
                <ChevronRight aria-hidden="true" size={20} />
              </button>
            </div>

            <div className="calendar-grid">
              {dayNames.map((day) => (
                <div key={day} className="calendar-day-header">{day}</div>
              ))}

              {calendarDays.map((day, idx) => {
                const dayEvents = day !== null ? eventsByDay[day] : undefined;
                const dayShows = day !== null ? showEntriesByDay[day] : undefined;

                return (
                  <div key={idx} className={`calendar-day-cell${day === null ? ' calendar-day-cell--empty' : ''}`}>
                    {day !== null && (
                      <>
                        <span className="calendar-day-number">{day}</span>
                        {dayEvents?.map((evt) => {
                          const itemLabel = `${evt.name} (${t(`events.status.${evt.status}`)})`;
                          const cancelled = evt.status === 'cancelled' ? ' calendar-item--cancelled' : '';
                          return (
                            <Link
                              key={evt.eventId}
                              to={`/events/${evt.eventId}`}
                              className={`calendar-item calendar-item--${evt.eventType}${cancelled}`}
                              title={itemLabel}
                              aria-label={itemLabel}
                            >
                              {evt.name}
                            </Link>
                          );
                        })}
                        {dayShows?.map((entry) => {
                          const itemKey = `show-${entry.show.showId}-${entry.date}`;
                          const itemClass = `calendar-item calendar-item--planned calendar-item--${entry.eventType}`;
                          return isAdminOrModerator ? (
                            <button
                              key={itemKey}
                              type="button"
                              className={itemClass}
                              title={`${entry.show.name} (${entry.companyName})`}
                              onClick={() => handleShowClick(entry)}
                            >
                              {entry.show.name}
                            </button>
                          ) : (
                            <span key={itemKey} className={itemClass} title={entry.show.name}>
                              {entry.show.name}
                            </span>
                          );
                        })}
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="calendar-legend">
              {EVENT_TYPES.map((eventType) => (
                <div key={eventType} className="legend-item">
                  <span className={`legend-dot legend-dot--${eventType}`} aria-hidden="true" />
                  <span>{t(`events.types.${eventType}`)}</span>
                </div>
              ))}
              <div className="legend-item">
                <span className="legend-dot legend-dot--planned" aria-hidden="true" />
                <span>{t('events.calendar.plannedLegend', 'Planned')}</span>
              </div>
              <div className="legend-item">
                <span className="legend-dot legend-dot--cancelled" aria-hidden="true" />
                <span>{t('events.status.cancelled')}</span>
              </div>
            </div>
          </section>
        )}

        {showPast && (
          <section className="events-section">
            <h2 className="events-section__title">{t('events.calendar.recentResults', 'Recent Results')}</h2>
            {recentResults.length === 0 ? (
              <p className="events-section__empty">{t('events.calendar.noResults', 'No completed events yet.')}</p>
            ) : (
              <div className="events-list">
                {recentResults.slice(0, pastLimit).map((event) => (
                  <EventCard key={event.eventId} event={event} showStatus={false} />
                ))}
              </div>
            )}
            {recentResults.length > pastLimit && (
              <Button
                className="events-section__more"
                variant="secondary"
                onClick={() => setPastLimit((limit) => limit + PAST_PAGE_SIZE)}
              >
                {t('events.calendar.showMore', 'Show more')}
              </Button>
            )}
          </section>
        )}
      </div>

      {createModal}
    </div>
  );
}
