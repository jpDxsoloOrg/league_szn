import type {
  NotificationPage,
  NotificationsRepository,
} from '../NotificationsRepository';
import type { AppNotification } from '../types';

export class InMemoryNotificationsRepository implements NotificationsRepository {
  readonly store: AppNotification[] = [];

  async listByUser(userId: string, limit: number, cursor?: string): Promise<NotificationPage> {
    let items = this.store
      .filter((n) => n.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    if (cursor) {
      const idx = items.findIndex((n) => n.createdAt === cursor);
      if (idx >= 0) items = items.slice(idx + 1);
    }

    const page = items.slice(0, limit);
    return {
      notifications: page,
      nextCursor: page.length === limit && items.length > limit ? page[page.length - 1].createdAt : null,
    };
  }

  async countUnread(userId: string): Promise<number> {
    return this.store.filter((n) => n.userId === userId && !n.isRead).length;
  }

  async findByNotificationId(notificationId: string): Promise<AppNotification | null> {
    return this.store.find((n) => n.notificationId === notificationId) ?? null;
  }

  async markRead(userId: string, createdAt: string): Promise<void> {
    const item = this.store.find((n) => n.userId === userId && n.createdAt === createdAt);
    if (item) {
      item.isRead = true;
      item.updatedAt = new Date().toISOString();
    }
  }

  async markAllRead(userId: string): Promise<number> {
    const now = new Date().toISOString();
    let count = 0;
    for (const item of this.store) {
      if (item.userId === userId && !item.isRead) {
        item.isRead = true;
        item.updatedAt = now;
        count++;
      }
    }
    return count;
  }

  async delete(userId: string, createdAt: string): Promise<void> {
    const idx = this.store.findIndex((n) => n.userId === userId && n.createdAt === createdAt);
    if (idx >= 0) this.store.splice(idx, 1);
  }

  async deleteAllRead(userId: string): Promise<number> {
    const before = this.store.length;
    const remaining = this.store.filter((n) => !(n.userId === userId && n.isRead));
    const deleted = before - remaining.length;
    this.store.length = 0;
    this.store.push(...remaining);
    return deleted;
  }
}
