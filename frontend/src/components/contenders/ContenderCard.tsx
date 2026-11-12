import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ContenderListEntry } from '../../types/contender';
import Avatar from '../ui/Avatar';
import Badge from '../ui/Badge';
import './ContenderCard.css';

interface ContenderCardProps {
  contender: ContenderListEntry;
}

function Movement({ contender }: ContenderCardProps) {
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

/** One ranked contender. A single grid row on desktop, two lines on phones. */
export default function ContenderCard({ contender }: ContenderCardProps) {
  const { t } = useTranslation();
  const isTopContender = contender.rank === 1;

  return (
    <li className={`contender-row${isTopContender ? ' contender-row--top' : ''}`}>
      <div className="contender-row__rank">
        <span className="contender-row__number">{contender.rank}</span>
        <Movement contender={contender} />
      </div>

      <Avatar src={contender.imageUrl} name={contender.wrestlerName} size="md" ring={isTopContender ? 'pink' : 'none'} />

      <div className="contender-row__who">
        <h3 className="contender-row__wrestler">{contender.wrestlerName}</h3>
        <p className="contender-row__player">{contender.playerName}</p>
        {(isTopContender || contender.isOverridden) && (
          <div className="contender-row__badges">
            {isTopContender && <Badge tone="pink">{t('contenders.topContender')}</Badge>}
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
        )}
      </div>

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
