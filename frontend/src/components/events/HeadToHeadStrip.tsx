import { useTranslation } from 'react-i18next';
import type { CommentaryHeadToHead, CommentaryParticipant } from '../../types/event';
import { formatDate } from '../../utils/dateUtils';
import { formatRecord, recordBetween } from '../../utils/commentary';
import './HeadToHeadStrip.css';

export interface HeadToHeadStripProps {
  participants: CommentaryParticipant[];
  headToHead: CommentaryHeadToHead[];
  /** Render the pairwise grid as a list of pairs (phones). */
  asList?: boolean;
}

function lastMetText(
  t: (key: string, opts?: Record<string, unknown>) => string,
  entry: CommentaryHeadToHead,
  nameOf: (id: string) => string,
): string {
  if (!entry.lastMatchDate) return t('events.commentary.firstMeeting');
  const date = formatDate(entry.lastMatchDate);
  if (entry.lastWinnerId) {
    return t('events.commentary.lastMetWinner', { date, winner: nameOf(entry.lastWinnerId) });
  }
  return t('events.commentary.lastMetDraw', { date });
}

export default function HeadToHeadStrip({ participants, headToHead, asList = false }: HeadToHeadStripProps) {
  const { t } = useTranslation();
  const nameOf = (id: string) => participants.find((p) => p.playerId === id)?.wrestlerName ?? '?';

  if (participants.length < 2) return null;

  // Two wrestlers: one readable sentence.
  if (participants.length === 2) {
    const a = participants[0];
    const b = participants[1];
    if (!a || !b) return null;
    const rec = recordBetween(headToHead, a.playerId, b.playerId);
    if (!rec) return null;
    const total = rec.wins + rec.losses + rec.draws;
    return (
      <section className="h2h-strip" aria-label={t('events.commentary.headToHead')}>
        <h3 className="h2h-title">{t('events.commentary.headToHead')}</h3>
        <p className="h2h-line">
          <span className="h2h-name">{a.wrestlerName}</span>
          <span className="h2h-score">
            {rec.wins} — {rec.losses}
            {rec.draws > 0 && <span className="h2h-draws"> ({rec.draws} D)</span>}
          </span>
          <span className="h2h-name">{b.wrestlerName}</span>
        </p>
        <p className="h2h-meta">
          {total === 0 ? t('events.commentary.firstMeeting') : lastMetText(t, rec.entry, nameOf)}
        </p>
      </section>
    );
  }

  const multiManRow = (
    <ul className="h2h-multi-row">
      {participants.map((p) => (
        <li key={p.playerId} className="h2h-multi-chip">
          <span className="h2h-multi-name">{p.wrestlerName}</span>
          <span className="h2h-multi-record">{formatRecord(p.multiManRecord)}</span>
        </li>
      ))}
    </ul>
  );

  if (asList) {
    return (
      <section className="h2h-strip" aria-label={t('events.commentary.headToHead')}>
        <h3 className="h2h-title">{t('events.commentary.headToHead')}</h3>
        <p className="h2h-multi-label">{t('events.commentary.multiMan')}</p>
        {multiManRow}
        <ul className="h2h-pair-list">
          {headToHead.map((h) => (
            <li key={`${h.player1Id}-${h.player2Id}`} className="h2h-pair">
              <span className="h2h-pair-names">
                {nameOf(h.player1Id)} <span className="h2h-vs">{t('events.commentary.vs')}</span> {nameOf(h.player2Id)}
              </span>
              <span className="h2h-pair-score">{h.player1Wins}–{h.player2Wins}{h.draws > 0 ? `–${h.draws}` : ''}</span>
              <span className="h2h-pair-meta">{lastMetText(t, h, nameOf)}</span>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section className="h2h-strip" aria-label={t('events.commentary.headToHead')}>
      <h3 className="h2h-title">{t('events.commentary.headToHead')}</h3>
      <p className="h2h-multi-label">{t('events.commentary.multiMan')}</p>
      {multiManRow}
      <div className="h2h-grid-wrap">
        <table className="h2h-grid">
          <caption className="h2h-caption">{t('events.commentary.gridCaption')}</caption>
          <thead>
            <tr>
              <th scope="col">
                <span className="visually-hidden">{t('events.commentary.gridCorner')}</span>
              </th>
              {participants.map((p) => (
                <th key={p.playerId} scope="col">{p.wrestlerName}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {participants.map((row) => (
              <tr key={row.playerId}>
                <th scope="row">{row.wrestlerName}</th>
                {participants.map((col) => {
                  if (row.playerId === col.playerId) {
                    return (
                      <td key={col.playerId} className="h2h-cell h2h-cell--self">
                        <span aria-hidden="true">—</span>
                        <span className="visually-hidden">{t('events.commentary.gridSelf')}</span>
                      </td>
                    );
                  }
                  const rec = recordBetween(headToHead, row.playerId, col.playerId);
                  const empty = !rec || rec.wins + rec.losses + rec.draws === 0;
                  const meta = rec ? lastMetText(t, rec.entry, nameOf) : t('events.commentary.firstMeeting');
                  return (
                    <td
                      key={col.playerId}
                      className={`h2h-cell${empty ? ' h2h-cell--empty' : ''}`}
                      title={meta}
                    >
                      {rec ? `${rec.wins}–${rec.losses}` : '0–0'}
                      {rec && rec.draws > 0 && <span className="h2h-draws">–{rec.draws}</span>}
                      <span className="visually-hidden">, {meta}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
