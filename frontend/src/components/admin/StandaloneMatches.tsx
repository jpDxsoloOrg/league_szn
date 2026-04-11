import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { matchesApi, playersApi, eventsApi, tagTeamsApi, stipulationsApi } from '../../services/api';
import type { Match, Player, Stipulation } from '../../types';
import type { LeagueEvent } from '../../types/event';
import type { TagTeam } from '../../types/tagTeam';
import MatchResultForm from '../events/MatchResultForm';
import MatchEditForm from '../events/MatchEditForm';
import Skeleton from '../ui/Skeleton';
import './StandaloneMatches.css';

type HydratedTagTeam = TagTeam & { player1Name?: string; player2Name?: string };

export default function StandaloneMatches() {
  const { t } = useTranslation();
  const [scheduledMatches, setScheduledMatches] = useState<Match[]>([]);
  const [events, setEvents] = useState<LeagueEvent[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [tagTeams, setTagTeams] = useState<HydratedTagTeam[]>([]);
  const [stipulations, setStipulations] = useState<Stipulation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recordingMatchId, setRecordingMatchId] = useState<string | null>(null);
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [deletingMatchId, setDeletingMatchId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [matchesData, eventsData, playersData, tagTeamsData, stipulationsData] = await Promise.all([
        matchesApi.getAll({ status: 'scheduled' }),
        eventsApi.getAll(),
        playersApi.getAll(),
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
      setError(err instanceof Error ? err.message : 'Failed to load matches');
    } finally {
      setLoading(false);
    }
  }, []);

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

  const handleDelete = async (match: Match) => {
    const isChampionship = match.isChampionship && match.championshipId;
    const isTournament = !!match.tournamentId;
    let confirmMsg: string;
    if (isChampionship) {
      confirmMsg = `Delete this ${match.matchFormat} CHAMPIONSHIP match? This cannot be undone.`;
    } else if (isTournament) {
      confirmMsg = `Delete this ${match.matchFormat} TOURNAMENT match? This cannot be undone.`;
    } else {
      confirmMsg = `Delete this ${match.matchFormat} match? This cannot be undone.`;
    }
    if (!window.confirm(confirmMsg)) return;

    setDeletingMatchId(match.matchId);
    setActionError(null);
    try {
      await matchesApi.delete(match.matchId);
      await loadData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete match');
    } finally {
      setDeletingMatchId(null);
    }
  };

  if (loading) {
    return (
      <div className="standalone-matches">
        <Skeleton variant="block" count={4} />
      </div>
    );
  }

  return (
    <div className="standalone-matches">
      <h2>{t('admin.standaloneMatches.title', 'Standalone Matches')}</h2>
      <p className="standalone-matches-description">
        {t(
          'admin.standaloneMatches.description',
          'Scheduled matches not assigned to any event. You can record their results, edit them, or delete them here.',
        )}
      </p>

      {error && <div className="error-message">{error}</div>}
      {actionError && <div className="error-message">{actionError}</div>}

      {standaloneMatches.length === 0 ? (
        <div className="standalone-matches-empty">
          <p>
            {t(
              'admin.standaloneMatches.empty',
              'No standalone matches. All scheduled matches are assigned to events.',
            )}
          </p>
          <Link to="/admin/schedule" className="standalone-matches-empty-link">
            {t('admin.standaloneMatches.scheduleLink', 'Schedule a new match')}
          </Link>
        </div>
      ) : (
        <div className="standalone-matches-list">
          {standaloneMatches.map(match => {
            const isRecording = recordingMatchId === match.matchId;
            const isEditing = editingMatchId === match.matchId;
            const stipName = match.stipulationId ? stipulationMap.get(match.stipulationId) : null;
            return (
              <div key={match.matchId} className="standalone-match-item">
                <div className="standalone-match-header">
                  <span className="standalone-match-format">{match.matchFormat}</span>
                  {match.isChampionship && (
                    <span className="standalone-match-championship">Championship</span>
                  )}
                  {match.tournamentId && (
                    <span className="standalone-match-tournament">Tournament</span>
                  )}
                </div>
                <div className="standalone-match-participants">
                  {formatMatchPreview(match)}
                </div>
                {stipName && <div className="standalone-match-stipulation">{stipName}</div>}
                <div className="standalone-match-actions">
                  <button
                    type="button"
                    className="standalone-match-btn standalone-match-btn-primary"
                    onClick={() => {
                      setRecordingMatchId(match.matchId);
                      setEditingMatchId(null);
                      setActionError(null);
                    }}
                    disabled={deletingMatchId === match.matchId}
                  >
                    {t('events.detail.recordResult', 'Record Result')}
                  </button>
                  <button
                    type="button"
                    className="standalone-match-btn standalone-match-btn-secondary"
                    onClick={() => {
                      setEditingMatchId(match.matchId);
                      setRecordingMatchId(null);
                      setActionError(null);
                    }}
                    disabled={deletingMatchId === match.matchId}
                  >
                    {t('events.detail.editMatch', 'Edit')}
                  </button>
                  <button
                    type="button"
                    className="standalone-match-btn standalone-match-btn-destructive"
                    onClick={() => handleDelete(match)}
                    disabled={deletingMatchId === match.matchId}
                  >
                    {deletingMatchId === match.matchId
                      ? t('common.saving')
                      : t('events.detail.deleteMatch', 'Delete')}
                  </button>
                </div>
                {isRecording && (
                  <div className="standalone-match-inline-form">
                    <MatchResultForm
                      match={match}
                      players={players}
                      tagTeams={tagTeams}
                      onSuccess={handleRefresh}
                      onCancel={() => setRecordingMatchId(null)}
                    />
                  </div>
                )}
                {isEditing && (
                  <div className="standalone-match-inline-form">
                    <MatchEditForm
                      matchId={match.matchId}
                      onSuccess={handleRefresh}
                      onCancel={() => setEditingMatchId(null)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
