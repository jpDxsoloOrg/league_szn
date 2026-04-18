import type { AppNotification } from './types';

export interface NotificationPage {
  notifications: AppNotification[];
  nextCursor: string | null;
}

export interface NotificationsRepository {
  listByUser(userId: string, limit: number, cursor?: string): Promise<NotificationPage>;
  countUnread(userId: string): Promise<number>;
  findByNotificationId(notificationId: string): Promise<AppNotification | null>;
  markRead(userId: string, createdAt: string): Promise<void>;
  markAllRead(userId: string): Promise<number>;
  delete(userId: string, createdAt: string): Promise<void>;
  deleteAllRead(userId: string): Promise<number>;
}
