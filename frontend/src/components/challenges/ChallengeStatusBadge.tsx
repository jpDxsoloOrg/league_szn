import { useTranslation } from 'react-i18next';
import Badge from '../ui/Badge';
import type { Challenge } from '../../types/challenge';
import { CHALLENGE_STATUS_TONE, getDisplayStatus } from './challengeUtils';

interface ChallengeStatusBadgeProps {
  challenge: Pick<Challenge, 'status' | 'createdAt' | 'expiresAt'>;
}

export default function ChallengeStatusBadge({ challenge }: ChallengeStatusBadgeProps) {
  const { t } = useTranslation();
  const status = getDisplayStatus(challenge);
  return <Badge tone={CHALLENGE_STATUS_TONE[status]}>{t(`challenges.status.${status}`)}</Badge>;
}
