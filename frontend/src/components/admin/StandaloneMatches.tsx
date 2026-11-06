import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { matchesApi, playersApi, eventsApi, tagTeamsApi, stipulationsApi } from '../../services/api';
import type { Match, Player, Stipulation } from '../../types';
import type { LeagueEvent } from '../../types/event';
import type { TagTeam } from '../../types/tagTeam';
import MatchResultForm from '../events/MatchResultForm';
import MatchEditForm from '../events/MatchEditForm';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import Skeleton from '../ui/Skeleton';
import AdminNotice from './AdminNotice';
import ConfirmModal from './ConfirmModal';
import './adminRoster.css';
import './StandaloneMatches.css';

type HydratedTagTeam = TagTeam & { player1Name?: string; player2Name?: string };

export default function StandaloneMatches() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [scheduledMatches, setScheduledMatches] = useState<Match[]>([]);
  const [events, setEvents] = useState<LeagueEvent[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [tagTeams, setTagTeams] = useState<HydratedTagTeam[]>([]);
  const [stipulations, setStipulations] = useState<Stipulation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recordingMatchId, setRecordingMatchId] = useState<string | null>(null);
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Match | null>(null);
  const [deletingMatchId, setDeletingMatchId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [matchesData, eventsData, playersData, tagTeamsData, stipulationsData] = await Promise.all([
        matchesApi.getAll({ status: 'scheduled' }),
        eventsApi.getAll(),
        playersApi.getAllIncludingHidden(),
        tagTeamsApi.getAll({ status: 'active' }).catch(() => [] as TagTeam[]),
        stipulationsApi.getAll().catch(() => [] as Stipulation[]),
      ]);
      setScheduledMatches(matchesData);
      setEvents(eventsData);
      setPlayers(playersData);
      setTagTeams(tagTeamsData as HydratedTagTeam[]);
      setStipulations(stipulationsData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('adminRoster.standalone.loadError', 'Failed to load matches'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Build set of matchIds that are assigned to any event
  const assignedMatchIds = useMemo(() => {
    const set = new Set<string>();
    for (const ev of events) {
      for (const card of ev.matchCards || []) {
        if (card.matchId) set.add(card.matchId);
      }
    }
    return set;
  }, [events]);

  const standaloneMatches = useMemo(
    () => scheduledMatches.filter(m => !assignedMatchIds.has(m.matchId)),
    [scheduledMatches, assignedMatchIds],
  );

  const stipulationMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of stipulations) {
      map.set(s.stipulationId, s.name);
    }
    return map;
  }, [stipulations]);

  const getPlayerName = (playerId: string): string => {
    const player = players.find(p => p.playerId === playerId);
    return player ? player.name : t('common.unknown');
  };

  const formatMatchPreview = (match: Match): string => {
    if (match.teams && match.teams.length >= 2) {
      return match.teams.map(team => team.map(getPlayerName).join(' & ')).join(' vs ');
    }
    return match.participants.map(getPlayerName).join(' vs ');
  };

  const handleRefresh = async () => {
    setRecordingMatchId(null);
    setEditingMatchId(null);
    setActionError(null);
    await loadData();
  };

  const deleteMessage = (match: Match): string => {
    const format = { format: match.matchFormat };
    if (match.isChampionship && match.championshipId) {
      return t('adminRoster.standalone.deleteChampionship', {
        defaultValue: 'Delete this {{format}} CHAMPIONSHIP match? This cannot be undone.',
        ...format,
      });
    }
    if (match.tournamentId) {
      return t('adminRoster.standalone.deleteTournament', {
        defaultValue: 'Delete this {{format}} TOURNAMENT match? This cannot be undone.',
        ...format,
      });
    }
    return t('adminRoster.standalone.deleteMatch', {
      defaultValue: 'Delete this {{format}} match? This cannot be undone.',
      ...format,
    });
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const matchId = pendingDelete.matchId;
    setDeletingMatchId(matchId);
    setActionError(null);
    try {
      await matchesApi.delete(matchId);
      await loadData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('adminRoster.standalone.deleteError', 'Failed to delete match'));
    } finally {
      setDeletingMatchId(null);
      setPendingDelete(null);
    }
  };

  return (
    <div className="ar-page standalone-matches">
      <PageHeader
        title={t('admin.standaloneMatches.title', 'Standalone Matches')}
        subtitle={t(
          'admin.standaloneMatches.description',
          'Scheduled matches not assigned to any event. You can record their results, edit them, or delete them here.',
        )}
      />

      {error && <AdminNotice tone="error">{error}</AdminNotice>}
      {actionError && <AdminNotice tone="error">{actionError}</AdminNotice>}

      {loading && <Skeleton variant="block" count={4} />}

      {!loading && standaloneMatches.length === 0 && (
        <EmptyState
          title={t(
            'admin.standaloneMatches.empty',
            'No standalone matches. All scheduled matches are assigned to events.',
          )}
          actionLabel={t('admin.standaloneMatches.scheduleLink', 'Schedule a new match')}
          onAction={() => navigate('/admin/schedule')}
        />
      )}

      {!loading && standaloneMatches.length > 0 && (
        <ul className="ar-list">
          {standaloneMatches.map((match) => {
            const stipulationName = match.stipulationId ? stipulationMap.get(match.stipulationId) : null;
            const busy = deletingMatchId === match.matchId;
            return (
              <li key={match.matchId} className="ar-list__row standalone-match">
                <div className="standalone-match__row">
                  <div className="ar-stack">
                    <span className="ar-strong">{formatMatchPreview(match)}</span>
                    <span className="ar-badges">
                      <Badge>{match.matchFormat}</Badge>
                      {stipulationName && <Badge>{stipulationName}</Badge>}
                      {match.isChampionship && <Badge tone="warning">{t('adminRoster.standalone.championship', 'Championship')}</Badge>}
                      {match.tournamentId && <Badge tone="violet">{t('adminRoster.standalone.tournament', 'Tournament')}</Badge>}
                    </span>
                  </div>
                  <div className="ar-row-actions">
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        setRecordingMatchId(match.matchId);
                        setEditingMatchId(null);
                        setActionError(null);
                      }}
                    >
                      {t('events.detail.recordResult', 'Record Result')}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        setEditingMatchId(match.matchId);
                        setRecordingMatchId(null);
                        setActionError(null);
                      }}
                    >
                      {t('events.detail.editMatch', 'Edit')}
                    </Button>
                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => setPendingDelete(match)}>
                      {t('events.detail.deleteMatch', 'Delete')}
                    </Button>
                  </div>
                </div>
                {recordingMatchId === match.matchId && (
                  <div className="standalone-match__form">
                    <MatchResultForm
                      match={match}
                      players={players}
                      tagTeams={tagTeams}
                      onSuccess={handleRefresh}
                      onCancel={() => setRecordingMatchId(null)}
                    />
                  </div>
                )}
                {editingMatchId === match.matchId && (
                  <div className="standalone-match__form">
                    <MatchEditForm
                      matchId={match.matchId}
                      onSuccess={handleRefresh}
                      onCancel={() => setEditingMatchId(null)}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmModal
        open={pendingDelete !== null}
        title={t('adminRoster.standalone.deleteTitle', 'Delete match')}
        message={pendingDelete ? deleteMessage(pendingDelete) : ''}
        confirmLabel={t('events.detail.deleteMatch', 'Delete')}
        busy={deletingMatchId !== null}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
