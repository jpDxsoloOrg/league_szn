import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useSiteConfig } from '../contexts/SiteConfigContext';
import { notificationsApi } from '../services/api/notifications.api';
import type { AppNotification } from '../types';
import './NotificationBell.css';

const POLL_INTERVAL_MS = 60_000;
const NOTIFICATIONS_LIMIT = 20;

function formatRelativeTime(dateStr: string, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return t('notifications.justNow');

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return t('notifications.justNow');
  if (minutes < 60) return t('notifications.minutesAgo', { count: minutes });

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('notifications.hoursAgo', { count: hours });

  const days = Math.floor(hours / 24);
  return t('notifications.daysAgo', { count: days });
}

function sourceTypeLabel(sourceType: AppNotification['sourceType']): string {
  switch (sourceType) {
    case 'promo': return 'notifications.typePromo';
    case 'challenge': return 'notifications.typeChallenge';
    case 'match': return 'notifications.typeMatch';
    case 'announcement': return 'notifications.typeAnnouncement';
    default: return 'notifications.typeAnnouncement';
  }
}

function getNavigationPath(notification: AppNotification, playerId: string | null): string {
  switch (notification.sourceType) {
    case 'promo': return '/promos';
    case 'challenge': return '/challenges';
    case 'match': {
      const params = new URLSearchParams({ status: 'scheduled' });
      if (playerId) params.set('playerId', playerId);
      return `/matches?${params.toString()}`;
    }
    case 'announcement': return '/';
    default: return '/';
  }
}

export default function NotificationBell() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAuthenticated, playerId } = useAuth();
  const { features } = useSiteConfig();

  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const bellRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const shouldShow = isAuthenticated && features.notifications;

  const fetchUnreadCount = useCallback(async (signal?: AbortSignal) => {
    try {
      const result = await notificationsApi.getUnreadCount(signal);
      setUnreadCount(result.count);
    } catch {
      // Silently ignore fetch errors (e.g., aborted, network)
    }
  }, []);

  const fetchNotifications = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    try {
      const result = await notificationsApi.getAll(NOTIFICATIONS_LIMIT, undefined, signal);
      setNotifications(result.notifications);
    } catch {
      // Silently ignore
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Poll unread count
  useEffect(() => {
    if (!shouldShow) return;

    const controller = new AbortController();
    fetchUnreadCount(controller.signal);

    intervalRef.current = setInterval(() => {
      fetchUnreadCount();
    }, POLL_INTERVAL_MS);

    return () => {
      controller.abort();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [shouldShow, fetchUnreadCount]);

  // Fetch notifications when dropdown opens
  useEffect(() => {
    if (!isOpen) return;

    const controller = new AbortController();
    fetchNotifications(controller.signal);

    return () => {
      controller.abort();
    };
  }, [isOpen, fetchNotifications]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleToggle = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  const handleMarkAllRead = useCallback(async () => {
    try {
      await notificationsApi.markAllRead();
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch {
      // Silently ignore
    }
  }, []);

  const handleNotificationClick = useCallback(async (notification: AppNotification) => {
    if (!notification.isRead) {
      try {
        await notificationsApi.markRead(notification.notificationId);
        setNotifications(prev =>
          prev.map(n => n.notificationId === notification.notificationId ? { ...n, isRead: true } : n)
        );
        setUnreadCount(prev => Math.max(0, prev - 1));
      } catch {
        // Silently ignore
      }
    }

    setIsOpen(false);
    navigate(getNavigationPath(notification, playerId));
  }, [navigate, playerId]);

  const handleDeleteNotification = useCallback(async (e: React.MouseEvent, notification: AppNotification) => {
    e.stopPropagation();
    try {
      await notificationsApi.delete(notification.notificationId);
      setNotifications(prev => prev.filter(n => n.notificationId !== notification.notificationId));
      if (!notification.isRead) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch {
      // Silently ignore
    }
  }, []);

  const handleDeleteAllRead = useCallback(async () => {
    try {
      await notificationsApi.deleteAllRead();
      setNotifications(prev => prev.filter(n => !n.isRead));
    } catch {
      // Silently ignore
    }
  }, []);

  if (!shouldShow) return null;

  return (
    <div className="notification-bell" ref={bellRef}>
      <button
        type="button"
        className="notification-bell-btn"
        onClick={handleToggle}
        aria-label={t('notifications.bell')}
        aria-expanded={isOpen}
      >
        <svg
          className="notification-bell-icon"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="notification-bell-badge">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="notification-dropdown">
          <div className="notification-dropdown-header">
            <span className="notification-dropdown-title">{t('notifications.title')}</span>
            <div className="notification-header-actions">
              {unreadCount > 0 && (
                <button
                  type="button"
                  className="notification-header-btn"
                  onClick={handleMarkAllRead}
                >
                  {t('notifications.markAllRead')}
                </button>
              )}
              {notifications.some(n => n.isRead) && (
                <button
                  type="button"
                  className="notification-header-btn notification-delete-read-btn"
                  onClick={handleDeleteAllRead}
                >
                  {t('notifications.deleteAllRead')}
                </button>
              )}
            </div>
          </div>

          <div className="notification-dropdown-list">
            {isLoading && notifications.length === 0 && (
              <div className="notification-empty">{t('common.loading')}</div>
            )}
            {!isLoading && notifications.length === 0 && (
              <div className="notification-empty">{t('notifications.empty')}</div>
            )}
            {notifications.map(notification => (
              <div
                key={notification.notificationId}
                className={`notification-item ${notification.isRead ? 'read' : 'unread'}`}
              >
                <button
                  type="button"
                  className="notification-item-content"
                  onClick={() => handleNotificationClick(notification)}
                >
                  <span className="notification-item-badge-label">
                    {t(sourceTypeLabel(notification.sourceType))}
                  </span>
                  <span className="notification-item-message">{notification.message}</span>
                  <span className="notification-item-time">
                    {formatRelativeTime(notification.createdAt, t)}
                  </span>
                </button>
                <button
                  type="button"
                  className="notification-delete-btn"
                  onClick={(e) => handleDeleteNotification(e, notification)}
                  aria-label={t('notifications.delete')}
                  title={t('notifications.delete')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <line x1="10" y1="11" x2="10" y2="17" />
                    <line x1="14" y1="11" x2="14" y2="17" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
