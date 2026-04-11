import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MatchInvitation } from '../../types/matchmaking';

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

  useEffect(() => {
    setSecondsRemaining(computeSecondsRemaining(invitation.expiresAt));
  }, [invitation.expiresAt]);

  useEffect(() => {
    if (secondsRemaining <= 0) {
      onExpire?.(invitation.invitationId);
      return;
    }

    const intervalId = window.setInterval(() => {
      setSecondsRemaining((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          window.clearInterval(intervalId);
          onExpire?.(invitation.invitationId);
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
    // Re-run if a new invitation is passed in (different id or expiry)
  }, [invitation.invitationId, invitation.expiresAt, onExpire, secondsRemaining]);

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

  return (
    <div className="invitation-card">
      <div className="invitation-card-player">
        <div className="invitation-card-name">{otherPlayer.name}</div>
        <div className="invitation-card-wrestler">
          {otherPlayer.currentWrestler}
        </div>
      </div>

      <div className="invitation-card-meta">
        {secondsRemaining > 0 ? (
          <span className="invitation-card-timer">
            {t('findMatch.invitations.expiresIn', { seconds: secondsRemaining })}
          </span>
        ) : (
          <span className="invitation-card-timer expired">
            {t('findMatch.invitations.expired')}
          </span>
        )}
      </div>

      {direction === 'incoming' ? (
        <div className="invitation-card-actions">
          <button
            type="button"
            className="btn-accept"
            onClick={handleAccept}
            disabled={submitting || secondsRemaining <= 0}
          >
            {t('findMatch.invitations.accept')}
          </button>
          <button
            type="button"
            className="btn-decline"
            onClick={handleDecline}
            disabled={submitting || secondsRemaining <= 0}
          >
            {t('findMatch.invitations.decline')}
          </button>
        </div>
      ) : (
        <div className="invitation-card-waiting">
          {t('findMatch.online.alreadyInvited')}
        </div>
      )}
    </div>
  );
}
