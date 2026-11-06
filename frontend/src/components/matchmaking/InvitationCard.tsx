import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MatchInvitation } from '../../types/matchmaking';
import Avatar from '../ui/Avatar';
import Badge from '../ui/Badge';
import Button from '../ui/Button';

interface InvitationCardProps {
  invitation: MatchInvitation;
  direction: 'incoming' | 'outgoing';
  onAccept?: (invitationId: string) => Promise<void>;
  onDecline?: (invitationId: string) => Promise<void>;
  onExpire?: (invitationId: string) => void;
}

const computeSecondsRemaining = (expiresAt: string): number => {
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.floor(diffMs / 1000));
};

export default function InvitationCard({
  invitation,
  direction,
  onAccept,
  onDecline,
  onExpire,
}: InvitationCardProps) {
  const { t } = useTranslation();
  const [secondsRemaining, setSecondsRemaining] = useState<number>(() =>
    computeSecondsRemaining(invitation.expiresAt)
  );
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Read the clock on every tick: browsers throttle timers in hidden tabs,
  // so counting down from the last value would drift.
  useEffect(() => {
    const update = (): boolean => {
      const remaining = computeSecondsRemaining(invitation.expiresAt);
      setSecondsRemaining(remaining);
      if (remaining <= 0) onExpire?.(invitation.invitationId);
      return remaining > 0;
    };

    if (!update()) return undefined;

    const intervalId = window.setInterval(() => {
      if (!update()) window.clearInterval(intervalId);
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [invitation.invitationId, invitation.expiresAt, onExpire]);

  const otherPlayer =
    direction === 'incoming' ? invitation.from : invitation.to;

  const handleAccept = async (): Promise<void> => {
    if (!onAccept || submitting) return;
    setSubmitting(true);
    try {
      await onAccept(invitation.invitationId);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecline = async (): Promise<void> => {
    if (!onDecline || submitting) return;
    setSubmitting(true);
    try {
      await onDecline(invitation.invitationId);
    } finally {
      setSubmitting(false);
    }
  };

  const expired = secondsRemaining <= 0;

  return (
    <li className="match-row">
      <Avatar src={otherPlayer.imageUrl} name={otherPlayer.currentWrestler || otherPlayer.name} size="md" />
      <div className="match-row__text">
        <p className="match-row__name">{otherPlayer.currentWrestler}</p>
        <p className="match-row__meta">{otherPlayer.name}</p>
        <p className={expired ? 'match-row__timer match-row__timer--expired' : 'match-row__timer'}>
          {expired
            ? t('findMatch.invitations.expired')
            : t('findMatch.invitations.expiresIn', { seconds: secondsRemaining })}
        </p>
      </div>
      {direction === 'incoming' ? (
        <div className="match-row__actions">
          <Button size="sm" onClick={handleAccept} disabled={submitting || expired}>
            {t('findMatch.invitations.accept')}
          </Button>
          <Button size="sm" variant="secondary" onClick={handleDecline} disabled={submitting || expired}>
            {t('findMatch.invitations.decline')}
          </Button>
        </div>
      ) : (
        <Badge tone="neutral">{t('findMatch.online.alreadyInvited')}</Badge>
      )}
    </li>
  );
}
