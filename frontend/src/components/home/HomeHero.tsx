import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays } from 'lucide-react';
import { eventsApi } from '../../services/api';
import type { DashboardEvent } from '../../types';
import type { EventWithMatches } from '../../types/event';
import { formatCalendarDate } from '../../utils/dateUtils';
import { describeSides, groupMatchSides } from '../../utils/matchDisplay';
import Badge from '../ui/Badge';
import Button from '../ui/Button';

const COUNTDOWN_TICK_MS = 60_000;
const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

type Translate = (key: string) => string;

function formatCountdown(dateStr: string, currentTime: number, t: Translate): string | null {
  const remaining = new Date(dateStr).getTime() - currentTime;
  if (Number.isNaN(remaining) || remaining <= 0) return null;
  const days = Math.floor(remaining / MS_PER_DAY);
  const hours = Math.floor((remaining % MS_PER_DAY) / MS_PER_HOUR);
  const minutes = Math.floor((remaining % MS_PER_HOUR) / MS_PER_MINUTE);
  const parts = days > 0 ? [`${days}${t('dashboard.countdown.days')}`] : [];
  parts.push(`${hours}${t('dashboard.countdown.hours')}`, `${minutes}${t('dashboard.countdown.minutes')}`);
  return parts.join(' ');
}

interface MainEvent {
  matchup: string;
  detail: string;
}

/** The booked main event, or null when the card has none yet. */
function getMainEvent(event: EventWithMatches | null, versus: string): MainEvent | null {
  const match = event?.enrichedMatches?.find((entry) => entry.designation === 'main-event')?.matchData;
  if (!match?.participants?.length) return null;
  const sides = groupMatchSides(match.participants, (participant) => participant.playerId, match.teams, match.matchFormat)
    .map((side) => side.map((participant) => participant.wrestlerName || participant.playerName).filter(Boolean));
  return {
    matchup: describeSides(sides, versus),
    detail: [match.isChampionship ? match.championshipName : undefined, match.stipulationName].filter(Boolean).join(' · '),
  };
}

export interface HomeHeroProps {
  inProgressEvents: DashboardEvent[];
  upcomingEvents: DashboardEvent[];
}

/** Leads the home page with the live show, or the next one when nothing is live. */
export default function HomeHero({ inProgressEvents, upcomingEvents }: HomeHeroProps) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  const [detail, setDetail] = useState<EventWithMatches | null>(null);

  const [featured, ...otherLive] = inProgressEvents.length > 0 ? inProgressEvents : upcomingEvents;
  const isLive = inProgressEvents.length > 0;
  const laterEvents = isLive ? upcomingEvents : [];
  const moreEvents = isLive ? [...otherLive, ...laterEvents] : otherLive;
  const liveEventIds = new Set(inProgressEvents.map((event) => event.eventId));
  const featuredId = featured?.eventId;

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), COUNTDOWN_TICK_MS);
    return () => clearInterval(interval);
  }, []);

  // The card only adds to the hero, so the hero still shows if this fails.
  useEffect(() => {
    setDetail(null);
    if (!featuredId) return undefined;
    const controller = new AbortController();
    const loadCard = async () => {
      try {
        const event = await eventsApi.getById(featuredId, controller.signal);
        if (!controller.signal.aborted) setDetail(event);
      } catch {
        // Keep the summary from the dashboard response.
      }
    };
    void loadCard();
    return () => controller.abort();
  }, [featuredId]);

  if (!featured) {
    return (
      <section className="poster-hero home-hero home-hero--empty">
        <div className="home-hero__text">
          <h1 className="home-hero__title">{t('dashboard.title')}</h1>
          <p className="home-hero__description">{t('dashboard.noUpcomingEvents')}</p>
          <div className="home-hero__actions">
            <Button to="/events" variant="secondary" size="lg" icon={<CalendarDays aria-hidden="true" size={18} />}>
              {t('dashboard.emptyActions.viewEvents', 'View events')}
            </Button>
          </div>
        </div>
      </section>
    );
  }

  const mainEvent = getMainEvent(detail, t('dashboard.vs'));
  const countdown = isLive ? null : formatCountdown(featured.date, now, t);
  const imageUrl = detail?.imageUrl?.trim();
  const facts = [
    formatCalendarDate(featured.date, undefined, { dateStyle: 'medium' }),
    featured.venue,
    featured.matchCount ? t('rivalries.card.matchCount', { count: featured.matchCount }) : undefined,
  ].filter(Boolean);

  return (
    <>
      <section className={`poster-hero home-hero ${isLive ? 'home-hero--live' : ''}`.trim()}>
        <div className="home-hero__text">
          <div className="home-hero__status">
            {isLive ? <Badge tone="live">{t('dashboard.liveBadge')}</Badge> : <Badge tone="primary">{t('home.nextUp')}</Badge>}
            {countdown && <span className="home-hero__countdown">{t('home.startsIn', { time: countdown })}</span>}
          </div>
          <h1 className="home-hero__title">{featured.name}</h1>
          {mainEvent && <p className="home-hero__matchup">{mainEvent.matchup}</p>}
          {mainEvent?.detail && <p className="home-hero__match-detail">{mainEvent.detail}</p>}
          <p className="home-hero__facts">{facts.join(' · ')}</p>
          {detail?.description && <p className="home-hero__description">{detail.description}</p>}
          <div className="home-hero__actions">
            <Button to={`/events/${featured.eventId}`} variant="hero" size="lg" icon={<ArrowRight aria-hidden="true" size={18} />}>
              {t('home.seeTheCard')}
            </Button>
            <Button to="/events" variant="ghost" size="lg">{t('home.allEvents')}</Button>
          </div>
        </div>
        {imageUrl && (
          <div className="poster-hero__frame">
            <img src={imageUrl} alt="" className="poster-hero__image" />
          </div>
        )}
      </section>

      {moreEvents.length > 0 && (
        <ul className="home-more-events" aria-label={t('home.alsoComingUp')}>
          {moreEvents.map((event) => {
            const eventCountdown = liveEventIds.has(event.eventId) ? null : formatCountdown(event.date, now, t);
            return (
              <li key={event.eventId}>
                <Link to={`/events/${event.eventId}`} className="home-more-events__link">
                  <span className="home-more-events__name">{event.name}</span>
                  <span className="home-more-events__meta">
                    {liveEventIds.has(event.eventId) && <Badge tone="live">{t('dashboard.liveBadge')}</Badge>}
                    {formatCalendarDate(event.date, undefined, { dateStyle: 'medium' })}
                    {event.venue ? ` · ${event.venue}` : ''}
                    {eventCountdown ? ` · ${eventCountdown}` : ''}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
