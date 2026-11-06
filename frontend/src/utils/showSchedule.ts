import type { Show } from '../types';
import { dateToCalendarDate, toCalendarDate } from './dateUtils';

/** How far ahead a weekly show counts as planned. */
const PLANNED_DAYS_AHEAD = 35;

/** Map DayOfWeek string to JS getDay() number (0=Sun..6=Sat) */
export const dayOfWeekToNumber: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

export interface PlannedShow {
  show: Show;
  /** Calendar date, YYYY-MM-DD. */
  date: string;
}

/** The next dates a show is due, soonest first. */
function getShowDates(show: Show, today: Date): string[] {
  if (show.schedule === 'ppv' && show.ppvDate) return [toCalendarDate(show.ppvDate)];
  const targetDay = show.dayOfWeek ? dayOfWeekToNumber[show.dayOfWeek] : undefined;
  if (show.schedule !== 'weekly' || targetDay === undefined) return [];
  const dates: string[] = [];
  for (let offset = 0; offset <= PLANNED_DAYS_AHEAD; offset++) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    if (date.getDay() === targetDay) dates.push(dateToCalendarDate(date));
  }
  return dates;
}

/**
 * The next date of each scheduled show with no event booked on it, soonest
 * first. A show's event in any status takes the date, so a cancelled show is
 * not offered as planned. Shared so the home page and Events always agree.
 */
export function getPlannedShows(
  shows: Show[],
  events: { showId?: string; date: string }[],
  today: Date,
): PlannedShow[] {
  const todayYmd = dateToCalendarDate(today);
  return shows
    .flatMap((show) => {
      const date = getShowDates(show, today).find((ymd) => (
        ymd >= todayYmd
        && !events.some((event) => event.showId === show.showId && toCalendarDate(event.date) === ymd)
      ));
      return date ? [{ show, date }] : [];
    })
    .sort((first, second) => first.date.localeCompare(second.date));
}
