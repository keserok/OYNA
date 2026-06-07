import { create } from 'zustand';
import type { Team, PlayerSeekAnnouncement } from '../types';

export interface Friend {
  id: string;
  name: string;
  nickname: string;
  avatar: string;
  position: string;
  style: string;
  status: 'FRIEND' | 'PENDING_SENT' | 'PENDING_RECEIVED';
  tags?: string[];
  isFavorite?: boolean;
  group?: string;
  pos?: string;
  fp?: number;
  online?: boolean;
  wins?: number;
  losses?: number;
}

interface SocialState {
  friends: Friend[];
  selectedFriendsForTeam: string[];
  userTeams: Team[];
  myTeams: Team[];
  activeStudioTeam: Team | null;
  opponentAds: Team[];
  playerSeekAds: PlayerSeekAnnouncement[];

  // Location
  userLocation: { lat: number; lng: number } | null;
  locationPermissionStatus: 'GRANTED' | 'DENIED' | 'NOT_REQUESTED';
  searchRadius: number;

  // Actions
  addFriend: (friend: Friend) => void;
  removeFriend: (id: string) => void;
  acceptFriend: (id: string) => void;
  addPendingFriend: (friend: Friend) => void;
  toggleSelectedFriendForTeam: (id: string) => void;
  clearSelectedFriendsForTeam: () => void;
  addTeam: (team: Team) => void;
  addMyTeam: (team: Team) => void;
  setActiveStudioTeam: (team: Team | null) => void;
  addOpponentAd: (ad: Team) => void;
  addPlayerSeekAd: (ad: PlayerSeekAnnouncement) => void;
  toggleJoinPlayerSeekAd: (adId: string, userId: string) => void;
  acceptPlayerSeekAdRequest: (adId: string, userId: string) => void;
  setUserLocation: (location: { lat: number; lng: number } | null) => void;
  setLocationPermissionStatus: (status: 'GRANTED' | 'DENIED' | 'NOT_REQUESTED') => void;
  setSearchRadius: (radius: number) => void;
}

export const useSocialStore = create<SocialState>((set) => ({
  friends: [],
  selectedFriendsForTeam: [],
  userTeams: [],
  myTeams: [],
  activeStudioTeam: null,
  opponentAds: [],
  playerSeekAds: [],
  userLocation: null,
  locationPermissionStatus: 'NOT_REQUESTED',
  searchRadius: 50,

  addFriend: (friend) => set((s) => ({ friends: [...s.friends, friend] })),
  removeFriend: (id) => set((s) => ({ friends: s.friends.filter((f) => f.id !== id) })),
  acceptFriend: (id) => set((s) => ({
    friends: s.friends.map((f) => (f.id === id ? { ...f, status: 'FRIEND' as const } : f)),
  })),
  addPendingFriend: (friend) => set((s) => ({
    friends: [...s.friends, { ...friend, status: 'PENDING_SENT' as const }],
  })),
  toggleSelectedFriendForTeam: (id) => set((s) => ({
    selectedFriendsForTeam: s.selectedFriendsForTeam.includes(id)
      ? s.selectedFriendsForTeam.filter((fid) => fid !== id)
      : [...s.selectedFriendsForTeam, id],
  })),
  clearSelectedFriendsForTeam: () => set({ selectedFriendsForTeam: [] }),
  addTeam: (team) => set((s) => ({ userTeams: [team, ...s.userTeams] })),
  addMyTeam: (team) => set((s) => ({ myTeams: [team, ...s.myTeams] })),
  setActiveStudioTeam: (team) => set({ activeStudioTeam: team }),
  addOpponentAd: (ad) => set((s) => ({ opponentAds: [...s.opponentAds, ad] })),
  addPlayerSeekAd: (ad) => set((s) => ({ playerSeekAds: [ad, ...s.playerSeekAds] })),
  toggleJoinPlayerSeekAd: (adId, userId) => set((s) => ({
    playerSeekAds: s.playerSeekAds.map((ad) => {
      if (ad.id !== adId) return ad;
      const isJoined = ad.joinedPlayers?.includes(userId);
      return {
        ...ad,
        joinedPlayers: isJoined
          ? (ad.joinedPlayers || []).filter((id) => id !== userId)
          : [...(ad.joinedPlayers || []), userId],
        acceptedPlayers: isJoined
          ? (ad.acceptedPlayers || []).filter((id) => id !== userId)
          : ad.acceptedPlayers || [],
      };
    }),
  })),
  acceptPlayerSeekAdRequest: (adId, userId) => set((s) => ({
    playerSeekAds: s.playerSeekAds.map((ad) => {
      if (ad.id !== adId) return ad;
      return {
        ...ad,
        acceptedPlayers: ad.acceptedPlayers?.includes(userId)
          ? ad.acceptedPlayers
          : [...(ad.acceptedPlayers || []), userId],
      };
    }),
  })),
  setUserLocation: (userLocation) => set({ userLocation }),
  setLocationPermissionStatus: (status) => set({ locationPermissionStatus: status }),
  setSearchRadius: (radius) => set({ searchRadius: radius }),
}));
