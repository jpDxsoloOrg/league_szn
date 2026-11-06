import { useTranslation } from 'react-i18next';
import type { TagTeam } from '../../types/tagTeam';
import Avatar from '../ui/Avatar';
import Card from '../ui/Card';
import { formatRecord, formatWinRate } from '../factions/factionFormat';
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
  const unknown = t('tagTeams.unknownPlayer', 'Unknown');
  const firstName = tagTeam.player1Name || unknown;
  const secondName = tagTeam.player2Name || unknown;

  return (
    <Card to={`/tag-teams/${tagTeam.tagTeamId}`} className="tag-team-card">
      {tagTeam.imageUrl ? (
        <Avatar src={tagTeam.imageUrl} name={tagTeam.name} size="lg" />
      ) : (
        <span className="tag-team-card__pair">
          <Avatar src={tagTeam.player1ImageUrl} name={firstName} />
          <Avatar src={tagTeam.player2ImageUrl} name={secondName} />
        </span>
      )}
      <span className="tag-team-card__text">
        <span className="tag-team-card__name">{tagTeam.name}</span>
        <span className="tag-team-card__players">{firstName} &amp; {secondName}</span>
        <span className="tag-team-card__record">
          {formatRecord(tagTeam.wins, tagTeam.losses, tagTeam.draws)}
          {' · '}
          {formatWinRate(tagTeam.wins, tagTeam.losses, tagTeam.draws)}
        </span>
      </span>
    </Card>
  );
}
