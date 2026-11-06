import { useTranslation } from 'react-i18next';
import Avatar from '../ui/Avatar';
import type { ChallengeWithPlayers } from '../../types/challenge';
import { getChallengeSides } from './challengeUtils';
import './ChallengeVersus.css';

interface ChallengeVersusProps {
  challenge: ChallengeWithPlayers;
  size?: 'md' | 'lg';
  /** Labels each side as challenger and challenged. */
  showRoles?: boolean;
}

export default function ChallengeVersus({ challenge, size = 'md', showRoles = false }: ChallengeVersusProps) {
  const { t } = useTranslation();
  const [challenger, challenged] = getChallengeSides(challenge);
  const isTagTeam = challenge.challengeMode === 'tag_team';
  const sides = [
    { side: challenger, role: t(isTagTeam ? 'challenges.detail.challengerTeam' : 'challenges.detail.challenger') },
    { side: challenged, role: t(isTagTeam ? 'challenges.detail.challengedTeam' : 'challenges.detail.challenged') },
  ];

  return (
    <div className={`challenge-versus challenge-versus--${size}`}>
      {sides.map(({ side, role }, index) => (
        <div key={role} className={`challenge-versus__side challenge-versus__side--${index === 0 ? 'start' : 'end'}`}>
          <Avatar src={side.imageUrl} name={side.name} size={size === 'lg' ? 'xl' : 'md'} />
          <div className="challenge-versus__text">
            <span className="challenge-versus__name">{side.name}</span>
            <span className="challenge-versus__detail">{side.detail}</span>
            {showRoles && <span className="challenge-versus__role">{role}</span>}
          </div>
        </div>
      ))}
      <span className="challenge-versus__vs">{t('common.vs').toUpperCase()}</span>
    </div>
  );
}
