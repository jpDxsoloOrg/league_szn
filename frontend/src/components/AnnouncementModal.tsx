import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { announcementsApi } from '../services/api';
import type { Announcement } from '../types';
import './AnnouncementModal.css';

const STORAGE_KEY = 'dismissed_announcements';

function getDismissedIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as string[];
  } catch {
    return [];
  }
}

function dismissAnnouncement(id: string): void {
  const ids = getDismissedIds();
  if (!ids.includes(id)) {
    ids.push(id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  }
}

function AnnouncementVideo({ url }: { url: string }) {
  const { t } = useTranslation();

  return (
    <div className="announcement-modal-video">
      <video
        controls
        playsInline
        preload="metadata"
        className="announcement-video-player"
      >
        <source src={url} />
        {t('highlights.videoNotSupported')}
      </video>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="announcement-video-open-link"
      >
        {t('highlights.openDirectly')}
      </a>
    </div>
  );
}

export default function AnnouncementModal() {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (!isAuthenticated || isLoading) return;

    let mounted = true;
    const controller = new AbortController();

    const fetchAnnouncements = async () => {
      try {
        const active = await announcementsApi.getActive(controller.signal);
        if (!mounted) return;

        const dismissedIds = getDismissedIds();
        const filtered = active.filter(
          (a) => !dismissedIds.includes(a.announcementId)
        );
        setAnnouncements(filtered);
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
  }, [isAuthenticated, isLoading]);

  if (announcements.length === 0) return null;

  const current: Announcement | undefined = announcements[currentIndex];
  if (!current) return null;
  const isLast = currentIndex >= announcements.length - 1;

  const handleNext = () => {
    if (isLast) {
      setAnnouncements([]);
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
    <div
      className="announcement-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="announcement-modal-title"
    >
      <div className="announcement-modal">
        <h2 id="announcement-modal-title" className="announcement-modal-title">
          {current.title}
        </h2>
        <div
          className="announcement-modal-body"
          dangerouslySetInnerHTML={{ __html: current.body }}
        />
        {current.videoUrl && (
          <AnnouncementVideo url={current.videoUrl} />
        )}
        {announcements.length > 1 && (
          <div className="announcement-modal-counter">
            {t('announcements.counter', {
              current: currentIndex + 1,
              total: announcements.length,
            })}
          </div>
        )}
        <div className="announcement-modal-actions">
          <button className="btn-dismiss" onClick={handleDontShowAgain}>
            {t('announcements.dontShowAgain')}
          </button>
          <button className="btn-next" onClick={handleNext}>
            {isLast ? t('common.close') : t('common.next')}
          </button>
        </div>
      </div>
    </div>
  );
}
