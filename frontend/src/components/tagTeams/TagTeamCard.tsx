import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TagTeam } from '../../types/tagTeam';
import {
  DEFAULT_WRESTLER_IMAGE,
  applyImageFallback,
  resolveImageSrc,
} from '../../constants/imageFallbacks';
import './TagTeamCard.css';

interface TagTeamCardProps {
  tagTeam: TagTeam & {
    player1Name?: string;
    player2Name?: string;
    player1ImageUrl?: string;
    player2ImageUrl?: string;
  };
}

export default function TagTeamCard({ tagTeam }: TagTeamCardProps) {
  const { t } = useTranslation();

  const totalMatches = tagTeam.wins + tagTeam.losses + tagTeam.draws;
  const winPercentage = totalMatches > 0
    ? ((tagTeam.wins / totalMatches) * 100).toFixed(1)
    : '0.0';

  return (
    <Link to={`/tag-teams/${tagTeam.tagTeamId}`} className="tag-team-card">
      {tagTeam.imageUrl && (
        <div className="tag-team-card__image-wrapper">
          <img
            src={resolveImageSrc(tagTeam.imageUrl, DEFAULT_WRESTLER_IMAGE)}
            onError={(event) => applyImageFallback(event, DEFAULT_WRESTLER_IMAGE)}
            alt={tagTeam.name}
            className="tag-team-card__image"
          />
        </div>
      )}

      <div className="tag-team-card__body">
        <h3 className="tag-team-card__name">{tagTeam.name}</h3>

        <div className="tag-team-card__players">
          <div className="tag-team-card__player">
            <img
              src={resolveImageSrc(tagTeam.player1ImageUrl, DEFAULT_WRESTLER_IMAGE)}
              onError={(event) => applyImageFallback(event, DEFAULT_WRESTLER_IMAGE)}
              alt={tagTeam.player1Name || t('tagTeams.player', 'Player')}
              className="tag-team-card__player-img"
            />
            <span className="tag-team-card__player-name">
              {tagTeam.player1Name || t('tagTeams.unknownPlayer', 'Unknown')}
            </span>
          </div>
          <span className="tag-team-card__ampersand">&amp;</span>
          <div className="tag-team-card__player">
            <img
              src={resolveImageSrc(tagTeam.player2ImageUrl, DEFAULT_WRESTLER_IMAGE)}
              onError={(event) => applyImageFallback(event, DEFAULT_WRESTLER_IMAGE)}
              alt={tagTeam.player2Name || t('tagTeams.player', 'Player')}
              className="tag-team-card__player-img"
            />
            <span className="tag-team-card__player-name">
              {tagTeam.player2Name || t('tagTeams.unknownPlayer', 'Unknown')}
            </span>
          </div>
        </div>

        <div className="tag-team-card__stats">
          <span className="tag-team-card__stat tag-team-card__stat--wins">
            {tagTeam.wins}{t('tagTeams.winsShort', 'W')}
          </span>
          <span className="tag-team-card__stat tag-team-card__stat--losses">
            {tagTeam.losses}{t('tagTeams.lossesShort', 'L')}
          </span>
          <span className="tag-team-card__stat tag-team-card__stat--draws">
            {tagTeam.draws}{t('tagTeams.drawsShort', 'D')}
          </span>
          <span className="tag-team-card__stat tag-team-card__stat--winpct">
            {winPercentage}%
          </span>
        </div>
      </div>
    </Link>
  );
}
