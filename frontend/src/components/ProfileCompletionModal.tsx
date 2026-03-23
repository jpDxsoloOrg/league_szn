import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { profileApi } from '../services/api';
import type { Player } from '../types';
import './ProfileCompletionModal.css';

export default function ProfileCompletionModal() {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading } = useAuth();
  const [profile, setProfile] = useState<Player | null>(null);
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [missingFields, setMissingFields] = useState<{ name: boolean; psnId: boolean }>({
    name: false,
    psnId: false,
  });
  const [name, setName] = useState('');
  const [psnId, setPsnId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || isLoading || dismissed) return;

    let mounted = true;
    const controller = new AbortController();

    const checkProfile = async () => {
      try {
        const p = await profileApi.getMyProfile(controller.signal);
        if (!mounted) return;
        setProfile(p);

        const missingName = !p.name || p.name.trim() === '';
        const missingPsn = !p.psnId || p.psnId.trim() === '';

        if (missingName || missingPsn) {
          setMissingFields({ name: missingName, psnId: missingPsn });
          setShow(true);
        }
      } catch {
        // No profile or error — don't show modal
      }
    };

    checkProfile();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [isAuthenticated, isLoading, dismissed]);

  const handleSubmit = useCallback(async () => {
    setError(null);
    setSaving(true);

    try {
      const updates: { name?: string; psnId?: string } = {};
      if (missingFields.name && name.trim()) {
        updates.name = name.trim();
      }
      if (missingFields.psnId && psnId.trim()) {
        updates.psnId = psnId.trim();
      }

      if (!updates.name && !updates.psnId) {
        setError(t('profileModal.fillRequired'));
        setSaving(false);
        return;
      }

      await profileApi.updateMyProfile(updates);
      setShow(false);
      setDismissed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('profileModal.saveFailed'));
    } finally {
      setSaving(false);
    }
  }, [missingFields, name, psnId, t]);

  const handleDismiss = () => {
    setShow(false);
    setDismissed(true);
  };

  if (!show || !profile) return null;

  return (
    <div className="profile-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="profile-modal-title">
      <div className="profile-modal">
        <h2 id="profile-modal-title">{t('profileModal.title')}</h2>
        <p className="profile-modal-subtitle">{t('profileModal.subtitle')}</p>

        <div className="profile-modal-form">
          {missingFields.name && (
            <div className="form-group">
              <label htmlFor="modal-name">{t('profileModal.playerName')}</label>
              <input
                type="text"
                id="modal-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('profileModal.playerNamePlaceholder')}
                autoFocus
              />
            </div>
          )}

          {missingFields.psnId && (
            <div className="form-group">
              <label htmlFor="modal-psnId">{t('profileModal.psnId')}</label>
              <input
                type="text"
                id="modal-psnId"
                value={psnId}
                onChange={(e) => setPsnId(e.target.value)}
                placeholder={t('profileModal.psnIdPlaceholder')}
                autoFocus={!missingFields.name}
              />
            </div>
          )}

          {error && (
            <div className="error-message" role="alert">{error}</div>
          )}

          <div className="profile-modal-actions">
            <button
              className="btn-secondary"
              onClick={handleDismiss}
              disabled={saving}
            >
              {t('profileModal.later')}
            </button>
            <button
              className="btn-primary"
              onClick={handleSubmit}
              disabled={saving}
              aria-busy={saving}
            >
              {saving ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
