import { create } from 'zustand';
import type { NotificationPreferences } from '../notifications/pushService';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '../notifications/pushService';
import * as FB from '../supabaseMutations';

export interface UserNotificationItem {
  id: number | string;
  type: string;
  title: string;
  desc: string;
  time: string;
  iconName: string;
  color: string;
  textColor: string;
  payload?: { matchId: string; slotId: string };
  read?: boolean;
}

export interface AdminNotification {
  id: string;
  title: string;
  body: string;
  type: 'INFO' | 'WARNING' | 'PROMO' | 'SYSTEM';
  targetAudience: 'ALL' | 'PRO' | 'CAPTAIN' | 'GK' | 'REFEREE';
  sentAt: string;
  isActive: boolean;
}

interface NotifState {
  // User notifications (in-app)
  userNotifications: UserNotificationItem[];
  isNotificationsOpen: boolean;
  unreadNotificationsCount: number;

  // Push
  pushToken: string | null;
  notificationPreferences: NotificationPreferences;

  // Admin notifications
  adminNotifications: AdminNotification[];

  // Actions
  addUserNotification: (notif: UserNotificationItem) => void;
  removeUserNotification: (id: string) => void;
  setIsNotificationsOpen: (open: boolean) => void;
  markAllNotificationsAsRead: () => void;
  incrementUnreadNotifications: () => void;
  clearUnreadNotifications: () => void;
  setPushToken: (token: string | null) => void;
  setNotificationPreferences: (prefs: NotificationPreferences) => void;
  updateSingleNotificationPref: (key: keyof NotificationPreferences, enabled: boolean) => void;
  setAdminNotifications: (notifs: AdminNotification[]) => void;
  addNotification: (n: AdminNotification) => void;
  deleteNotification: (id: string) => void;
  toggleNotification: (id: string) => void;
}

export const useNotifStore = create<NotifState>((set, get) => ({
  userNotifications: [],
  isNotificationsOpen: false,
  unreadNotificationsCount: 0,
  pushToken: null,
  notificationPreferences: DEFAULT_NOTIFICATION_PREFERENCES,
  adminNotifications: [],

  addUserNotification: (notif) => set((state) => ({
    userNotifications: [
      { id: Date.now().toString(), read: false, ...notif } as any,
      ...state.userNotifications,
    ],
  })),

  removeUserNotification: (id) => set((state) => ({
    userNotifications: state.userNotifications.filter((n) => String(n.id) !== id),
  })),

  setIsNotificationsOpen: (open) => set({ isNotificationsOpen: open }),

  markAllNotificationsAsRead: () => set((state) => ({
    userNotifications: state.userNotifications.map((n) => ({ ...n, read: true })),
  })),

  incrementUnreadNotifications: () => set((state) => ({
    unreadNotificationsCount: state.unreadNotificationsCount + 1,
  })),

  clearUnreadNotifications: () => set({ unreadNotificationsCount: 0 }),

  setPushToken: (token) => set({ pushToken: token }),

  setNotificationPreferences: (prefs) => set({ notificationPreferences: prefs }),

  updateSingleNotificationPref: (key, enabled) => set((state) => {
    const current = state.notificationPreferences[key];
    if (current?.mandatory) return state;
    return {
      notificationPreferences: {
        ...state.notificationPreferences,
        [key]: { ...current, enabled },
      },
    };
  }),

  setAdminNotifications: (adminNotifications) => set({ adminNotifications }),

  addNotification: (n) => FB.fbAddNotification(n),
  deleteNotification: (id) => FB.fbDeleteNotification(id),
  toggleNotification: (id) => {
    const notif = get().adminNotifications.find((n) => n.id === id);
    if (notif) FB.fbToggleNotificationAlert(id, !notif.isActive);
  },
}));
