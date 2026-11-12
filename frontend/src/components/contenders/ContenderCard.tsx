import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { ContenderListEntry, ContenderWithTagTeam } from '../../types/contender';
import Avatar from '../ui/Avatar';
import Badge from '../ui/Badge';
import { MemberAvatars, MemberNames } from './ContenderMembers';
import type { MemberLookup } from './ContenderMembers';
import './ContenderCard.css';

interface ContenderCardProps {
  contender: ContenderListEntry;
  /** Player rows for the tag members' hover cards. Names render as plain text without it. */
  memberLookup?: MemberLookup;
}

function Movement({ contender }: { contender: ContenderListEntry }) {
  const { t } = useTranslation();

  if (contender.isNew) {
    return <span className="contender-row__move contender-row__move--new">{t('contenders.new')}</span>;
  }
  if (contender.movement > 0) {
    return (
      <span className="contender-row__move contender-row__move--up" title={t('contenders.movedUp', { places: contender.movement })}>
        <ArrowUp aria-hidden="true" size={14} />
        {contender.movement}
      </span>
    );
  }
  if (contender.movement < 0) {
    const places = Math.abs(contender.movement);
    return (
      <span className="contender-row__move contender-row__move--down" title={t('contenders.movedDown', { places })}>
        <ArrowDown aria-hidden="true" size={14} />
        {places}
      </span>
    );
  }
  return (
    <span className="contender-row__move" aria-label={t('contenders.noMovement')}>
      <Minus aria-hidden="true" size={14} />
    </span>
  );
}

function Streak({ streak }: { streak: number }) {
  if (streak > 0) return <span className="contender-row__streak--win">W{streak}</span>;
  if (streak < 0) return <span className="contender-row__streak--loss">L{Math.abs(streak)}</span>;
  return <span>-</span>;
}

function Badges({ contender }: { contender: ContenderListEntry }) {
  const { t } = useTranslation();
  const isTopContender = contender.rank === 1;
  const isDissolved = contender.entityType === 'tagTeam' && contender.tagTeamStatus === 'dissolved';
  if (!isTopContender && !contender.isOverridden && !isDissolved) return null;

  return (
    <div className="contender-row__badges">
      {isTopContender && <Badge tone="pink">{t('contenders.topContender')}</Badge>}
      {isDissolved && <Badge tone="neutral">{t('contenders.tagTeam.dissolved')}</Badge>}
      {contender.isOverridden && (
        <Badge tone="warning">
          {contender.overrideType === 'bump_to_top'
            ? t('contenders.overrides.bumpedToTop')
            : t('contenders.overrides.sentToBottom')}
        </Badge>
      )}
      {contender.isOverridden && contender.organicRank && (
        <span className="contender-row__organic">
          {t('contenders.overrides.organicRank', { rank: contender.organicRank })}
        </span>
      )}
    </div>
  );
}

function TagTeamWho({ contender, memberLookup }: { contender: ContenderWithTagTeam; memberLookup?: MemberLookup }) {
  return (
    <div className="contender-row__who">
      <h3 className="contender-row__wrestler">
        <Link to={`/tag-teams/${contender.tagTeamId}`} className="contender-row__team-link">
          {contender.tagTeamName}
        </Link>
      </h3>
      <p className="contender-row__player">
        <MemberNames members={contender.members} lookup={memberLookup} />
      </p>
      <Badges contender={contender} />
    </div>
  );
}

/** One ranked contender, a player or a tag team. A single grid row on desktop, two lines on phones. */
export default function ContenderCard({ contender, memberLookup }: ContenderCardProps) {
  const { t } = useTranslation();
  const isTopContender = contender.rank === 1;
  const ring = isTopContender ? 'pink' : 'none';
  const isTag = contender.entityType === 'tagTeam';

  return (
    <li className={`contender-row${isTopContender ? ' contender-row--top' : ''}${isTag ? ' contender-row--tag' : ''}`}>
      <div className="contender-row__rank">
        <span className="contender-row__number">{contender.rank}</span>
        <Movement contender={contender} />
      </div>

      {contender.entityType === 'tagTeam' ? (
        <>
          <MemberAvatars members={contender.members} size="md" ring={ring} />
          <TagTeamWho contender={contender} memberLookup={memberLookup} />
        </>
      ) : (
        <>
          <Avatar src={contender.imageUrl} name={contender.wrestlerName} size="md" ring={ring} />
          <div className="contender-row__who">
            <h3 className="contender-row__wrestler">{contender.wrestlerName}</h3>
            <p className="contender-row__player">{contender.playerName}</p>
            <Badges contender={contender} />
          </div>
        </>
      )}

      <dl className="contender-row__stats">
        <div>
          <dt>{t('contenders.score')}</dt>
          <dd>{contender.rankingScore.toFixed(1)}</dd>
        </div>
        <div>
          <dt>{t('contenders.winRate')}</dt>
          <dd>{contender.winPercentage.toFixed(1)}%</dd>
        </div>
        <div>
          <dt>{t('contenders.streak')}</dt>
          <dd><Streak streak={contender.currentStreak} /></dd>
        </div>
      </dl>
    </li>
  );
}
