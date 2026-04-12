import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePresence } from '../../contexts/PresenceContext';
import { matchmakingApi } from '../../services/api/matchmaking.api';
import './FindMatchWidget.css';

const POLL_INTERVAL_MS = 60_000;

const FindMatchWidget: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isWrestler, playerId } = useAuth();
  const { presenceEnabled, enablePresence, disablePresence } = usePresence();

  const [incomingCount, setIncomingCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<boolean>(false);

  const fetchInvitations = useCallback(async (): Promise<void> => {
    try {
      const data = await matchmakingApi.getInvitations();
      const pending = data.incoming.filter((inv) => inv.status === 'pending').length;
      setIncomingCount(pending);
      setError(null);
    } catch (err) {
      console.error('[FindMatchWidget] failed to load invitations', err);
      setError('load-failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isWrestler || !playerId) {
      return;
    }

    let cancelled = false;

    const run = async (): Promise<void> => {
      if (cancelled) return;
      await fetchInvitations();
    };

    void run();
    const interval = setInterval(() => {
      void run();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isWrestler, playerId, fetchInvitations]);

  const handleTogglePresence = useCallback(async (): Promise<void> => {
    if (toggling) return;
    setToggling(true);
    try {
      if (presenceEnabled) {
        await disablePresence();
      } else {
        await enablePresence();
      }
    } catch (err) {
      console.error('[FindMatchWidget] presence toggle failed', err);
    } finally {
      setToggling(false);
    }
  }, [presenceEnabled, enablePresence, disablePresence, toggling]);

  const handleOpen = useCallback((): void => {
    navigate('/find-match');
  }, [navigate]);

  if (!isWrestler || !playerId) {
    return null;
  }

  return (
    <section className="fm-widget" aria-label={t('findMatch.widget.title')}>
      <header className="fm-widget-header">
        <h3 className="fm-widget-title">{t('findMatch.widget.title')}</h3>
      </header>

      <div className="fm-widget-presence-row">
        <span
          className={`fm-widget-status-dot ${
            presenceEnabled ? 'fm-widget-status-dot--online' : 'fm-widget-status-dot--offline'
          }`}
          aria-hidden="true"
        />
        <span className="fm-widget-status-label">
          {presenceEnabled
            ? t('findMatch.appearOnline.on')
            : t('findMatch.appearOnline.off')}
        </span>
        <button
          type="button"
          className="fm-widget-toggle"
          onClick={() => {
            void handleTogglePresence();
          }}
          disabled={toggling}
        >
          {presenceEnabled
            ? t('findMatch.appearOnline.off')
            : t('findMatch.appearOnline.on')}
        </button>
      </div>

      {!loading && !error && incomingCount > 0 && (
        <div className="fm-widget-badge" role="status">
          {t('findMatch.widget.pendingCount', { count: incomingCount })}
        </div>
      )}

      <button type="button" className="fm-widget-cta" onClick={handleOpen}>
        {t('findMatch.widget.open')}
      </button>
    </section>
  );
};

export default FindMatchWidget;
