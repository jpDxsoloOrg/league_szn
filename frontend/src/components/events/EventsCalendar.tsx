import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { EventType } from '../../types/event';
import { mockCalendarEntries } from '../../mocks/eventMockData';
import EventCard from './EventCard';
import './EventsCalendar.css';

const eventTypeColors: Record<string, string> = {
  ppv: '#d4af37',
  weekly: '#60a5fa',
  special: '#a78bfa',
  house: '#9ca3af',
};

type FilterTab = 'all' | EventType;

export default function EventsCalendar() {
  const { t } = useTranslation();
  const [currentMonth, setCurrentMonth] = useState(3); // April = index 3
  const [currentYear, setCurrentYear] = useState(2026);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');

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
    if (activeFilter === 'all') return mockCalendarEntries;
    return mockCalendarEntries.filter((e) => e.eventType === activeFilter);
  }, [activeFilter]);

  // Events for the current calendar month
  const monthEvents = useMemo(() => {
    return filteredEntries.filter((e) => {
      const d = new Date(e.date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });
  }, [filteredEntries, currentMonth, currentYear]);

  // Build calendar grid
  const calendarDays = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const days: (number | null)[] = [];

    // Leading empty cells
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

  // Upcoming events (from all entries, not just current month)
  const upcomingEvents = useMemo(() => {
    return filteredEntries
      .filter((e) => e.status === 'upcoming' || e.status === 'in-progress')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
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

  const filterTabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: t('events.filters.all') },
    { key: 'ppv', label: t('events.filters.ppv') },
    { key: 'weekly', label: t('events.filters.weekly') },
    { key: 'special', label: t('events.filters.special') },
    { key: 'house', label: t('events.filters.house') },
  ];

  return (
    <div className="events-calendar-page">
      <h2 className="events-title">{t('events.title')}</h2>

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
              <span
                className="filter-dot"
                style={{ backgroundColor: eventTypeColors[tab.key] }}
              />
            )}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Calendar */}
      <div className="calendar-container">
        <div className="calendar-nav">
          <button className="calendar-nav-btn" onClick={goToPreviousMonth}>
            &lt;
          </button>
          <h3 className="calendar-month-label">
            {monthNames[currentMonth]} {currentYear}
          </h3>
          <button className="calendar-nav-btn" onClick={goToNextMonth}>
            &gt;
          </button>
        </div>

        <div className="calendar-grid">
          {dayNames.map((day) => (
            <div key={day} className="calendar-day-header">
              {day}
            </div>
          ))}

          {calendarDays.map((day, idx) => (
            <div
              key={idx}
              className={`calendar-day-cell ${day === null ? 'empty' : ''} ${
                eventsByDay[day ?? -1] ? 'has-events' : ''
              }`}
            >
              {day !== null && (
                <>
                  <span className="calendar-day-number">{day}</span>
                  {eventsByDay[day] && (
                    <div className="calendar-day-events">
                      {eventsByDay[day].map((evt) => (
                        <div
                          key={evt.eventId}
                          className="calendar-event-dot"
                          style={{ backgroundColor: eventTypeColors[evt.eventType] }}
                          title={evt.name}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
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
    </div>
  );
}
