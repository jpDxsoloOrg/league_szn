import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { playersApi, standingsApi, divisionsApi, stablesApi, tagTeamsApi } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useSiteConfig } from '../../contexts/SiteConfigContext';
import {
  DEFAULT_WRESTLER_IMAGE,
  applyImageFallback,
  resolveImageSrc,
} from '../../constants/imageFallbacks';
import type { Player, Division } from '../../types';
import type { Stable } from '../../types/stable';
import type { TagTeam } from '../../types/tagTeam';
import './PublicProfile.css';

interface SeasonRecord {
  seasonId: string;
  seasonName: string;
  seasonStatus: string;
  wins: number;
  losses: number;
  draws: number;
}

interface PlayerProfile extends Player {
  seasonRecords?: SeasonRecord[];
}

interface StandingsEntry {
  playerId: string;
  recentForm?: ('W' | 'L' | 'D')[];
  currentStreak?: { type: 'W' | 'L' | 'D'; count: number };
}

function getWinPercentage(wins: number, losses: number, draws: number): string {
  const total = wins + losses + draws;
  if (total === 0) return '0';
  return ((wins / total) * 100).toFixed(1);
}

function getWinPercentageClass(wins: number, losses: number, draws: number): string {
  const total = wins + losses + draws;
  if (total === 0) return '';
  const pct = (wins / total) * 100;
  if (pct >= 60) return 'win-high';
  if (pct >= 40) return 'win-medium';
  return 'win-low';
}

export default function PublicProfile() {
  const { playerId } = useParams<{ playerId: string }>();
  const { t } = useTranslation();
  const { isAuthenticated, isWrestler, playerId: currentPlayerId } = useAuth();
  const { features } = useSiteConfig();

  const [player, setPlayer] = useState<PlayerProfile | null>(null);
  const [standingsEntry, setStandingsEntry] = useState<StandingsEntry | null>(null);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [stables, setStables] = useState<Stable[]>([]);
  const [tagTeams, setTagTeams] = useState<TagTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!playerId) return;

    const controller = new AbortController();
    const { signal } = controller;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const [playerData, standingsData, divisionsData, stablesData, tagTeamsData] = await Promise.all([
          playersApi.getById(playerId, signal),
          standingsApi.get(undefined, signal),
          divisionsApi.getAll(signal),
          stablesApi.getAll(undefined, signal).catch(() => [] as Stable[]),
          tagTeamsApi.getAll(undefined, signal).catch(() => [] as TagTeam[]),
        ]);

        if (signal.aborted) return;

        setPlayer(playerData as PlayerProfile);
        setDivisions(divisionsData);
        setStables(stablesData);
        setTagTeams(tagTeamsData);

        // Find this player's entry in standings for form/streak data
        const entry = standingsData.players.find((p) => p.playerId === playerId);
        if (entry) {
          setStandingsEntry({
            playerId: entry.playerId,
            recentForm: entry.recentForm,
            currentStreak: entry.currentStreak,
          });
        }
      } catch (err) {
        if (signal.aborted) return;
        if (err instanceof Error && err.message.includes('404')) {
          setError(t('publicProfile.notFound'));
        } else {
          setError(err instanceof Error ? err.message : t('publicProfile.loadError'));
        }
      } finally {
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      controller.abort();
    };
  }, [playerId, t]);

  // Resolve division name
  const divisionName = player?.divisionId
    ? divisions.find((d) => d.divisionId === player.divisionId)?.name
    : null;

  // Resolve stable name
  const stableName = player?.stableId
    ? stables.find((s) => s.stableId === player.stableId)?.name
    : null;

  // Resolve tag team name
  const tagTeamName = player?.tagTeamId
    ? tagTeams.find((tt) => tt.tagTeamId === player.tagTeamId)?.name
    : null;

  if (loading) {
    return (
      <div className="public-profile">
        <div className="loading-state">
          <div className="loading-spinner" role="status" aria-label={t('publicProfile.loading')}></div>
          <p className="loading-text">{t('publicProfile.loading')}</p>
        </div>
      </div>
    );
  }

  if (error || !player) {
    return (
      <div className="public-profile">
        {error && <div className="error-message">{error}</div>}
        <div className="empty-state">
          <h3>{t('publicProfile.notFoundTitle')}</h3>
          <p>{t('publicProfile.notFoundMessage')}</p>
        </div>
      </div>
    );
  }

  const seasonRecords = (player as PlayerProfile).seasonRecords;

  return (
    <div className="public-profile">
      {/* Profile Header */}
      <div className="profile-header">
        <div className="profile-image-wrapper">
          <img
            src={resolveImageSrc(player.imageUrl, DEFAULT_WRESTLER_IMAGE)}
            onError={(event) => applyImageFallback(event, DEFAULT_WRESTLER_IMAGE)}
            alt={player.name}
            className="profile-image"
          />
        </div>
        <div className="profile-header-info">
          <h1 className="profile-name">{player.name}</h1>
          {player.currentWrestler && (
            <p className="profile-wrestler-name">
              {t('publicProfile.playingAs')} {player.currentWrestler}
            </p>
          )}
          {player.alternateWrestler && (
            <p className="profile-alternate-wrestler">
              {t('publicProfile.alternateWrestler')}: {player.alternateWrestler}
            </p>
          )}
          {player.psnId && (
            <p className="profile-psn-id">
              {t('publicProfile.psnId')}: {player.psnId}
            </p>
          )}
          {divisionName && (
            <p className="profile-division">
              {t('publicProfile.division')}: {divisionName}
            </p>
          )}
          {stableName && (
            <p className="profile-stable">
              {t('publicProfile.stable')}: {stableName}
            </p>
          )}
          {tagTeamName && (
            <p className="profile-tag-team">
              {t('publicProfile.tagTeam')}: {tagTeamName}
            </p>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="profile-actions">
        <Link to={`/stats/head-to-head?player1=${playerId}`} className="action-btn h2h-btn">
          {t('publicProfile.viewHeadToHead')}
        </Link>
        {features.statistics && (
          <Link to={`/stats/player/${playerId}`} className="action-btn stats-btn">
            {t('publicProfile.fullStats')}
          </Link>
        )}
        {features.challenges && isAuthenticated && isWrestler && currentPlayerId && currentPlayerId !== playerId && (
          <Link to={`/promos/new?promoType=call-out&targetPlayerId=${playerId}`} className="action-btn challenge-btn">
            {t('publicProfile.challenge')}
          </Link>
        )}
      </div>

      {/* All-Time Record */}
      <div className="stats-section">
        <h3 className="stats-section-title">{t('publicProfile.allTimeRecord')}</h3>
        <div className="profile-stats">
          <div className="stat-card">
            <span className="stat-label">{t('publicProfile.record')}</span>
            <span className="stat-value record">
              {player.wins}-{player.losses}-{player.draws}
            </span>
          </div>
          <div className="stat-card">
            <span className="stat-label">{t('publicProfile.winPercent')}</span>
            <span className={`stat-value percentage ${getWinPercentageClass(player.wins, player.losses, player.draws)}`}>
              {getWinPercentage(player.wins, player.losses, player.draws)}%
            </span>
          </div>
        </div>
      </div>

      {/* Form & Streak */}
      {standingsEntry && (
        <div className="stats-section">
          <div className="profile-stats">
            {standingsEntry.recentForm && standingsEntry.recentForm.length > 0 && (
              <div className="stat-card">
                <span className="stat-label">{t('publicProfile.form')}</span>
                <div className="form-dots">
                  {standingsEntry.recentForm.map((result, i) => (
                    <span
                      key={i}
                      className={`form-dot ${result === 'W' ? 'win' : result === 'L' ? 'loss' : 'draw'}`}
                    >
                      {result}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {standingsEntry.currentStreak && (
              <div className="stat-card">
                <span className="stat-label">{t('publicProfile.streak')}</span>
                <span className="stat-value streak">
                  {standingsEntry.currentStreak.count}{standingsEntry.currentStreak.type}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Season Records */}
      {seasonRecords && seasonRecords.length > 0 && (
        <div className="stats-section">
          <h3 className="stats-section-title">{t('publicProfile.seasonRecords')}</h3>
          <div className="season-records">
            {seasonRecords.map((season) => (
              <div key={season.seasonId} className="season-record-card">
                <div className="season-record-header">
                  <span className="season-record-name">{season.seasonName}</span>
                  {season.seasonStatus === 'active' && (
                    <span className="season-active-badge">{t('publicProfile.active')}</span>
                  )}
                </div>
                <div className="season-record-stats">
                  <span className="season-record-value">
                    {season.wins}-{season.losses}-{season.draws}
                  </span>
                  <span className={`season-record-pct ${getWinPercentageClass(season.wins, season.losses, season.draws)}`}>
                    {getWinPercentage(season.wins, season.losses, season.draws)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
