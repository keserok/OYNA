import { create } from 'zustand';
import { supabase } from '../supabaseClient';
import * as FB from '../supabaseMutations';
import { auth } from './useAuthStore';
import type { MatchListing, Player, AdminUser } from '../types';

interface MatchState {
  adminMatches: MatchListing[];

  // Actions
  setAdminMatches: (matches: MatchListing[]) => void;
  addMatch: (match: MatchListing) => Promise<void>;
  updateMatch: (match: MatchListing) => Promise<void>;
  deleteMatch: (id: string) => Promise<void>;
  joinMatchPleiAction: (matchId: string, slotId: string, role: string, adminUsers: AdminUser[]) => Promise<void>;
  initSupabaseRealtime: () => void;
}

export const useMatchStore = create<MatchState>((set, get) => ({
  adminMatches: [],

  setAdminMatches: (adminMatches) => set({ adminMatches }),

  addMatch: async (match) => {
    const prev = get().adminMatches;
    set({ adminMatches: [match, ...prev] });
    try { await FB.fbAddMatch(match as any); }
    catch (e) { set({ adminMatches: prev }); throw e; }
  },

  updateMatch: async (match) => {
    const prev = get().adminMatches;
    set({ adminMatches: prev.map((m) => (m.id === match.id ? match : m)) });
    try { await FB.fbUpdateMatch(match as any); }
    catch (e) { set({ adminMatches: prev }); throw e; }
  },

  deleteMatch: async (id) => {
    const prev = get().adminMatches;
    set({ adminMatches: prev.filter((m) => m.id !== id) });
    try { await FB.fbDeleteMatch(id); }
    catch (e) { set({ adminMatches: prev }); throw e; }
  },

  joinMatchPleiAction: async (matchId, slotId, role, adminUsers) => {
    const state = get();
    const match = state.adminMatches.find((m) => m.id === matchId);
    if (!match) return;

    const previousSlots = match.slots ? [...match.slots] : [];
    const currentUserUid = auth.currentUser?.uid || 'u1';
    const currentUserProfile = adminUsers.find((u) => u.id === currentUserUid) ||
      adminUsers[0] ||
      { id: 'u1', name: 'Oyuncu', avatar: 'https://i.pravatar.cc/150' };

    const joinedPlayer: Player = {
      id: currentUserProfile.id || 'u1',
      name: currentUserProfile.name || 'Oyuncu',
      avatar: currentUserProfile.avatar || `https://i.pravatar.cc/150?u=${currentUserProfile.id}`,
      rating: (currentUserProfile as any).rating || 4.5,
      position: role,
      x: 50,
      y: 50,
    };

    const updatedSlots = previousSlots.map((s) =>
      s?.id === slotId ? { ...s, status: 'TAKEN' as const, player: joinedPlayer } : s
    );

    set({
      adminMatches: state.adminMatches.map((m) =>
        m.id === matchId ? { ...m, slots: updatedSlots } : m
      ),
    });

    try {
      const { error } = await supabase.rpc('join_match_slot', {
        p_match_id: matchId,
        p_user_id: currentUserUid,
        p_slot_id: slotId,
        p_slot_role: role,
      });
      if (error) throw error;
    } catch (error) {
      set({
        adminMatches: get().adminMatches.map((m) =>
          m.id === matchId ? { ...m, slots: previousSlots } : m
        ),
      });
      throw error;
    }
  },

  initSupabaseRealtime: () => {
    supabase
      .channel('public:match_registrations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_registrations' }, () => {})
      .subscribe();

    supabase
      .channel('public:waitlist')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'waitlist' }, () => {})
      .subscribe();
  },
}));
