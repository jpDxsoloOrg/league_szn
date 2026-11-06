import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useSiteConfig } from '../contexts/SiteConfigContext';
import { setAnnouncementOpen, useWrestlerPromptPending } from '../hooks/useAnnouncementOpen';
import { announcementsApi } from '../services/api';
import type { Announcement } from '../types';
import {
  closeAnnouncementsForSession,
  dismissAnnouncement,
  getHiddenAnnouncementIds,
} from '../utils/announcementDismissal';
import { waitForPageRequests } from '../utils/deferShellRequest';
import { toMediaUrl } from '../utils/mediaUrl';
import { sanitizeHtml } from '../utils/sanitizeHtml';
import Button from './ui/Button';
import Modal from './ui/Modal';
import './announcementContent.css';
import './AnnouncementModal.css';

function AnnouncementVideo({ url }: { url: string }) {
  const { t } = useTranslation();
  const mediaUrl = toMediaUrl(url);

  return (
    <video
      controls
      playsInline
      preload="metadata"
      className="announcement-video-player"
    >
      <source src={mediaUrl} />
      {t('highlights.videoNotSupported')}
    </video>
  );
}

export default function AnnouncementModal() {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading } = useAuth();
  const { features, isLoading: isConfigLoading } = useSiteConfig();
  const notificationsEnabled = !isConfigLoading && features.notifications;
  const wrestlerPromptPending = useWrestlerPromptPending();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (!isAuthenticated || isLoading || !notificationsEnabled) return;

    let mounted = true;
    const controller = new AbortController();

    const fetchAnnouncements = async () => {
      try {
        await waitForPageRequests(controller.signal);
        if (!mounted) return;
        const active = await announcementsApi.getActive(controller.signal);
        if (!mounted) return;

        const hiddenIds = getHiddenAnnouncementIds();
        setAnnouncements(active.filter((a) => !hiddenIds.has(a.announcementId)));
        setCurrentIndex(0);
      } catch {
        // Fail silently — don't show modal if API errors
      }
    };

    fetchAnnouncements();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [isAuthenticated, isLoading, notificationsEnabled]);

  // Let other overlays (the profile-setup modal) wait while this is up.
  const isOpen = notificationsEnabled && !wrestlerPromptPending && announcements[currentIndex] !== undefined;
  useEffect(() => {
    setAnnouncementOpen(isOpen);
    return () => setAnnouncementOpen(false);
  }, [isOpen]);

  const current: Announcement | undefined = announcements[currentIndex];
  if (!isOpen || !current) return null;
  const isLast = currentIndex >= announcements.length - 1;

  const handleClose = () => {
    closeAnnouncementsForSession(announcements.map((announcement) => announcement.announcementId));
    setAnnouncements([]);
  };

  const handleNext = () => {
    if (isLast) {
      handleClose();
    } else {
      setCurrentIndex((prev) => prev + 1);
    }
  };

  const handleDontShowAgain = () => {
    dismissAnnouncement(current.announcementId);
    const remaining = announcements.filter(
      (a) => a.announcementId !== current.announcementId
    );
    setAnnouncements(remaining);
    setCurrentIndex((prev) => (prev >= remaining.length ? 0 : prev));
  };

  return (
    <Modal
      open
      onClose={handleClose}
      title={current.title}
      className="announcement-modal"
      footer={
        <>
          {announcements.length > 1 && (
            <div className="announcement-modal-dots">
              {announcements.map((announcement, index) => (
                <button
                  key={announcement.announcementId}
                  type="button"
                  className={
                    index === currentIndex
                      ? 'announcement-modal-dot active'
                      : 'announcement-modal-dot'
                  }
                  aria-label={t('announcements.counter', {
                    current: index + 1,
                    total: announcements.length,
                  })}
                  aria-current={index === currentIndex}
                  onClick={() => setCurrentIndex(index)}
                />
              ))}
            </div>
          )}
          <Button variant="ghost" onClick={handleDontShowAgain}>
            {t('announcements.dontShowAgain')}
          </Button>
          <Button onClick={handleNext}>
            {isLast ? t('common.close') : t('common.next')}
          </Button>
        </>
      }
    >
      <div
        className="announcement-modal-body"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(current.body) }}
      />
      {current.videoUrl && (
        <AnnouncementVideo key={current.announcementId} url={current.videoUrl} />
      )}
    </Modal>
  );
}
