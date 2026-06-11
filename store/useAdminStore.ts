import { create } from 'zustand';
import * as FB from '../supabaseMutations';
import type { Pitch, Goalkeeper, Referee, AdminUser, Team } from '../types';

export interface AppSettings {
  appName: string;
  maintenanceMode: boolean;
  registrationOpen: boolean;
  proPrice: number;
  commissionRate: number;
  minRatingToPlay: number;
  maxMatchsPerDay: number;
  featuredPitchId: string;
  announcementBanner: string;
  showAnnouncementBanner: boolean;
  payoutMode?: string;
  tacticStudio?: boolean;
  motmReveal?: boolean;
  aiCoach?: boolean;
  scoutSystem?: boolean;
}

const INITIAL_SETTINGS: AppSettings = {
  appName: 'OYNA',
  maintenanceMode: false,
  registrationOpen: true,
  proPrice: 199,
  commissionRate: 10,
  minRatingToPlay: 2.5,
  maxMatchsPerDay: 3,
  featuredPitchId: '1',
  announcementBanner: 'OYNA v2.0 yayinda! Yeni ozellikler geldi.',
  showAnnouncementBanner: true,
};

interface AdminState {
  adminPitches: Pitch[];
  adminGoalkeepers: Goalkeeper[];
  adminReferees: Referee[];
  adminUsers: AdminUser[];
  adminTeams: Team[];
  appSettings: AppSettings;
  announcementBanner: string;
  showAnnouncementBanner: boolean;
  reliabilityScore: number;
  banExpiresAt: string | null;
  initialLoadComplete: boolean;
  isHydrated: boolean;

  // Direct setters
  setAdminPitches: (pitches: Pitch[]) => void;
  setAdminGoalkeepers: (gks: Goalkeeper[]) => void;
  setAdminReferees: (refs: Referee[]) => void;
  setAdminUsers: (users: AdminUser[]) => void;
  setAdminTeams: (teams: Team[]) => void;
  setInitialLoadComplete: (v: boolean) => void;
  setReliabilityScore: (score: number) => void;
  setBanExpiresAt: (dateStr: string | null) => void;

  // CRUD
  addPitch: (pitch: Pitch) => Promise<void>;
  updatePitch: (pitch: Pitch) => Promise<void>;
  deletePitch: (id: string) => Promise<void>;
  addGoalkeeper: (gk: Goalkeeper) => Promise<void>;
  updateGoalkeeper: (gk: Goalkeeper) => Promise<void>;
  deleteGoalkeeper: (id: string) => Promise<void>;
  addReferee: (ref: Referee) => Promise<void>;
  updateReferee: (ref: Referee) => Promise<void>;
  deleteReferee: (id: string) => Promise<void>;
  loadServices: () => Promise<void>;
  updateUser: (user: AdminUser) => Promise<void>;
  addUser: (user: AdminUser) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  banUser: (id: string) => Promise<void>;
  unbanUser: (id: string) => Promise<void>;
  toggleUserPro: (id: string) => Promise<void>;
  verifyUser: (id: string) => Promise<void>;
  updateAppSettings: (settings: Partial<AppSettings>) => void;
}

export const useAdminStore = create<AdminState>((set, get) => ({
  adminPitches: [],
  adminGoalkeepers: [],
  adminReferees: [],
  adminUsers: [],
  adminTeams: [],
  appSettings: INITIAL_SETTINGS,
  announcementBanner: INITIAL_SETTINGS.announcementBanner,
  showAnnouncementBanner: INITIAL_SETTINGS.showAnnouncementBanner,
  reliabilityScore: 100,
  banExpiresAt: null,
  initialLoadComplete: false,
  isHydrated: true,

  setAdminPitches: (adminPitches) => set({ adminPitches }),
  setAdminGoalkeepers: (adminGoalkeepers) => set({ adminGoalkeepers }),
  setAdminReferees: (adminReferees) => set({ adminReferees }),
  setAdminUsers: (adminUsers) => set({ adminUsers }),
  setAdminTeams: (adminTeams) => set({ adminTeams }),
  setInitialLoadComplete: (v) => set({ initialLoadComplete: v }),
  setReliabilityScore: (score) => set({ reliabilityScore: score }),
  setBanExpiresAt: (banExpiresAt) => set({ banExpiresAt }),

  // Pitch CRUD
  addPitch: async (pitch) => {
    const prev = get().adminPitches;
    set({ adminPitches: [pitch, ...prev] });
    try { await FB.fbAddPitch(pitch); }
    catch (e) { set({ adminPitches: prev }); throw e; }
  },
  updatePitch: async (pitch) => {
    const prev = get().adminPitches;
    set({ adminPitches: prev.map((p) => (p.id === pitch.id ? pitch : p)) });
    try { await FB.fbUpdatePitch(pitch); }
    catch (e) { set({ adminPitches: prev }); throw e; }
  },
  deletePitch: async (id) => {
    const prev = get().adminPitches;
    set({ adminPitches: prev.filter((p) => p.id !== id) });
    try { await FB.fbDeletePitch(id); }
    catch (e) { set({ adminPitches: prev }); throw e; }
  },

  // Goalkeeper CRUD
  addGoalkeeper: async (gk) => {
    const prev = get().adminGoalkeepers;
    set({ adminGoalkeepers: [gk, ...prev] });
    try { await FB.fbAddGoalkeeper(gk); }
    catch (e) { set({ adminGoalkeepers: prev }); throw e; }
  },
  updateGoalkeeper: async (gk) => {
    const prev = get().adminGoalkeepers;
    set({ adminGoalkeepers: prev.map((g) => (g.id === gk.id ? gk : g)) });
    try { await FB.fbUpdateGoalkeeper(gk); }
    catch (e) { set({ adminGoalkeepers: prev }); throw e; }
  },
  deleteGoalkeeper: async (id) => {
    const prev = get().adminGoalkeepers;
    set({ adminGoalkeepers: prev.filter((g) => g.id !== id) });
    try { await FB.fbDeleteGoalkeeper(id); }
    catch (e) { set({ adminGoalkeepers: prev }); throw e; }
  },

  // Referee CRUD
  addReferee: async (ref) => {
    const prev = get().adminReferees;
    set({ adminReferees: [ref, ...prev] });
    try { await FB.fbAddReferee(ref); }
    catch (e) { set({ adminReferees: prev }); throw e; }
  },
  updateReferee: async (ref) => {
    const prev = get().adminReferees;
    set({ adminReferees: prev.map((r) => (r.id === ref.id ? ref : r)) });
    try { await FB.fbUpdateReferee(ref); }
    catch (e) { set({ adminReferees: prev }); throw e; }
  },
  deleteReferee: async (id) => {
    const prev = get().adminReferees;
    set({ adminReferees: prev.filter((r) => r.id !== id) });
    try { await FB.fbDeleteReferee(id); }
    catch (e) { set({ adminReferees: prev }); throw e; }
  },

  loadServices: async () => {
    try {
      const gks = await FB.fbGetGoalkeepers();
      if (gks && gks.length > 0) set({ adminGoalkeepers: gks });
      const refs = await FB.fbGetReferees();
      if (refs && refs.length > 0) set({ adminReferees: refs });
    } catch (err) {
      console.error('Error loading services', err);
    }
  },

  // User CRUD
  updateUser: async (user) => {
    const prev = get().adminUsers;
    set({ adminUsers: prev.map((u) => (u.id === user.id ? user : u)) });
    try { await FB.fbUpdateUser(user); }
    catch (e) { set({ adminUsers: prev }); throw e; }
  },
  addUser: async (user) => {
    const prev = get().adminUsers;
    set({ adminUsers: [user, ...prev] });
    try { await FB.fbAddUser(user); }
    catch (e) { set({ adminUsers: prev }); throw e; }
  },
  deleteUser: async (id) => {
    const prev = get().adminUsers;
    set({ adminUsers: prev.filter((u) => u.id !== id) });
    try { await FB.fbDeleteUser(id); }
    catch (e) { set({ adminUsers: prev }); throw e; }
  },
  banUser: async (id) => {
    const prev = get().adminUsers;
    set({ adminUsers: prev.map((u) => (u.id === id ? { ...u, isBanned: true } : u)) });
    try { await FB.fbBanUser(id, true); }
    catch (e) { set({ adminUsers: prev }); throw e; }
  },
  unbanUser: async (id) => {
    const prev = get().adminUsers;
    set({ adminUsers: prev.map((u) => (u.id === id ? { ...u, isBanned: false } : u)) });
    try { await FB.fbBanUser(id, false); }
    catch (e) { set({ adminUsers: prev }); throw e; }
  },
  toggleUserPro: async (id) => {
    const user = get().adminUsers.find((u) => u.id === id);
    if (!user) return;
    const prev = get().adminUsers;
    set({ adminUsers: prev.map((u) => (u.id === id ? { ...u, isPro: !u.isPro } : u)) });
    try { await FB.fbToggleUserPro(id, !user.isPro); }
    catch (e) { set({ adminUsers: prev }); throw e; }
  },
  verifyUser: async (id) => {
    const prev = get().adminUsers;
    set({ adminUsers: prev.map((u) => (u.id === id ? { ...u, isVerified: true } : u)) });
    try { await FB.fbVerifyUser(id); }
    catch (e) { set({ adminUsers: prev }); throw e; }
  },

  updateAppSettings: (settings) => FB.fbUpdateAppSettings(settings),
}));
