import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Player } from '../../../types';
import type { HydratedRivalry } from '../../../types/rivalry';

interface TabProps {
  hydrated: HydratedRivalry;
  players: Player[];
}

/**
 * Two-column overview tab. The hydrated payload already drops booker-
 * only and gm-only items the caller shouldn't see (the backend's
 * `getRivalry` handler applies role-based filtering before returning),
 * so this tab can just render what it gets.
 */
export default function OverviewTab({ hydrated, players }: TabProps) {
  const { t } = useTranslation();
  const playerLookup = new Map(players.map((p) => [p.playerId, p] as const));

  const storylineNotes = hydrated.notes.filter((n) => n.noteType === 'storyline').slice(0, 3);
  const planNotes = hydrated.notes.filter((n) => n.noteType === 'plan').slice(0, 3);

  return (
    <div className="rivalry-tab rivalry-tab__grid">
      {/* ── Left column ─────────────────────────────────────────── */}
      <div className="rivalry-tab">
        <section className="rivalry-tab__card">
          <h3 className="rivalry-tab__heading">{t('rivalries.notes.heading')}</h3>
          {storylineNotes.length === 0 ? (
            <p className="rivalry-tab__empty">{t('rivalries.notes.empty')}</p>
          ) : (
            <ul className="rivalry-detail-notes">
              {storylineNotes.map((n) => (
                <li key={n.noteId}>
                  <strong>{new Date(n.updatedAt).toLocaleDateString()}</strong>
                  <p>{n.body}</p>
                </li>
              ))}
            </ul>
          )}
          <Link to="notes" className="rivalry-detail-link">
            {t('rivalries.detail.notesTab')} →
          </Link>
        </section>

        <section className="rivalry-tab__card">
          <h3 className="rivalry-tab__heading">{t('rivalries.notes.noteTypePlan')}</h3>
          {planNotes.length === 0 ? (
            <p className="rivalry-tab__empty">{t('rivalries.notes.empty')}</p>
          ) : (
            <ol className="rivalry-detail-plans">
              {planNotes.map((n) => (
                <li key={n.noteId}>
                  {n.scheduledFor && (
                    <span className="rivalry-detail-plans__when">
                      {new Date(n.scheduledFor).toLocaleDateString()}
                    </span>
                  )}
                  <p>{n.body}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {/* ── Right column ────────────────────────────────────────── */}
      <div className="rivalry-tab">
        <section className="rivalry-tab__card">
          <h3 className="rivalry-tab__heading">{t('rivalries.detail.nextEvent')}</h3>
          {hydrated.nextEvent ? (
            <>
              <p><strong>{hydrated.nextEvent.name}</strong></p>
              <p>{new Date(hydrated.nextEvent.date).toLocaleString()}</p>
              {hydrated.nextEvent.venue && <p>{hydrated.nextEvent.venue}</p>}
            </>
          ) : (
            <p className="rivalry-tab__empty">{t('rivalries.detail.noNextEvent')}</p>
          )}
        </section>

        <section className="rivalry-tab__card">
          <h3 className="rivalry-tab__heading">{t('rivalries.detail.recentPromos')}</h3>
          {hydrated.recentPromos.length === 0 ? (
            <p className="rivalry-tab__empty">{t('rivalries.detail.noRecentPromos')}</p>
          ) : (
            <ul className="rivalry-detail-promos">
              {hydrated.recentPromos.map((p) => {
                const author = playerLookup.get(p.playerId);
                return (
                  <li key={p.promoId}>
                    <strong>{author?.currentWrestler ?? author?.name ?? p.playerId}</strong>
                    <p>{p.title ?? p.content.slice(0, 80)}</p>
                  </li>
                );
              })}
            </ul>
          )}
          <Link to="promos" className="rivalry-detail-link">
            {t('rivalries.detail.promosTab')} →
          </Link>
        </section>

        <section className="rivalry-tab__card">
          <h3 className="rivalry-tab__heading">{t('rivalries.detail.matchesTab')}</h3>
          <p>
            {t('rivalries.detail.totalMatches', { count: hydrated.headToHead.totalMatches })}
          </p>
          <p>
            {t('rivalries.detail.draws', { count: hydrated.headToHead.draws })}
          </p>
          {hydrated.headToHead.championshipMatches > 0 && (
            <p>
              {t('rivalries.detail.championships')}: {hydrated.headToHead.championshipMatches}
            </p>
          )}
          <Link to="matches" className="rivalry-detail-link">
            {t('rivalries.detail.matchesTab')} →
          </Link>
        </section>
      </div>
    </div>
  );
}
