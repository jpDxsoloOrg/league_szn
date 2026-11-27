import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Crown, Trophy } from 'lucide-react';
import type { EventWithMatches } from '../../types/event';
import { describeSide, formatMatchType, groupMatchSides, sideTagTeamFor } from '../../utils/matchDisplay';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Card from '../ui/Card';
import { DESIGNATION_LABEL_KEYS, EVENT_STATUS_TONES, EVENT_TYPE_TONES } from '../events/eventDisplay';
import './EpisodeEventCard.css';

export interface EpisodeEventCardProps {
  event: EventWithMatches;
}

/** "On the card": the linked event's matches and results, read-only. */
export default function EpisodeEventCard({ event }: EpisodeEventCardProps) {
  const { t } = useTranslation();
  const matches = [...event.enrichedMatches].sort((first, second) => first.position - second.position);
  const hasCompletedMatch = matches.some((card) => card.matchData?.status === 'completed');

  return (
    <section className="episode-event" aria-labelledby="episode-event-title">
      <div className="episode-event__head">
        <h2 id="episode-event-title" className="episode-event__title">{t('episodes.detail.onTheCard')}</h2>
        <Link className="episode-event__name" to={`/events/${event.eventId}`}>{event.name}</Link>
        <div className="episode-event__badges">
          <Badge tone={EVENT_TYPE_TONES[event.eventType]}>{t(`events.types.${event.eventType}`)}</Badge>
          <Badge tone={EVENT_STATUS_TONES[event.status]}>{t(`events.status.${event.status}`)}</Badge>
        </div>
      </div>

      {matches.length > 0 && (
        <ol className="episode-event__matches">
          {matches.map((card) => {
            const match = card.matchData;
            const winners = match?.winners ?? [];
            const sides = match
              ? groupMatchSides(match.participants, (participant) => participant.playerId, match.teams, match.matchFormat)
              : [];
            return (
              <li key={card.matchId}>
                <Card variant="raised" padding="sm" className="episode-event__match">
                  <div className="episode-event__match-meta">
                    <span className="episode-event__designation">{t(DESIGNATION_LABEL_KEYS[card.designation])}</span>
                    {match && <span>{formatMatchType(match.matchFormat, t)}</span>}
                    {match?.stipulationName && <span>{match.stipulationName}</span>}
                    {match?.isChampionship && (
                      <Badge tone="warning" icon={<Crown aria-hidden="true" size={14} />}>
                        {match.championshipName ?? t('events.detail.championshipMatch')}
                      </Badge>
                    )}
                  </div>
                  {match ? (
                    <p className="episode-event__sides">
                      {sides.map((side, index) => {
                        const memberIds = side.map((participant) => participant.playerId);
                        const won = match.status === 'completed' && memberIds.some((playerId) => winners.includes(playerId));
                        const teamName = sideTagTeamFor(memberIds, match.teams, match.sideTagTeams)?.name;
                        return (
                          <Fragment key={memberIds.join('-')}>
                            {index > 0 && (
                              <span className="episode-event__versus">{sides.length === 2 ? ` ${t('common.vs')} ` : ', '}</span>
                            )}
                            <span className={won ? 'episode-event__side episode-event__side--winner' : 'episode-event__side'}>
                              {describeSide(side.map((participant) => participant.wrestlerName || participant.playerName), teamName)}
                              {won && <Badge tone="win">{t('events.detail.winner')}</Badge>}
                            </span>
                          </Fragment>
                        );
                      })}
                    </p>
                  ) : (
                    <p className="episode-event__sides">{t('events.detail.matchTBA')}</p>
                  )}
                </Card>
              </li>
            );
          })}
        </ol>
      )}

      {hasCompletedMatch && (
        <Button
          variant="secondary"
          className="episode-event__results"
          to={`/events/${event.eventId}/results`}
          icon={<Trophy aria-hidden="true" size={18} />}
        >
          {t('episodes.detail.viewResults')}
        </Button>
      )}
    </section>
  );
}
