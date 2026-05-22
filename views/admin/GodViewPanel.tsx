import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../../store';
import {
    Zap, MapPin, Users, Shield, Scale, Megaphone, CreditCard, Settings, Type,
    ChevronLeft, ChevronRight, Activity, AlertTriangle, TrendingUp,
    Eye, Send, UserPlus, MoreHorizontal, ChevronDown, RefreshCw, Download,
    Swords, LogOut, Radio, Lock, Filter, Plus, Minus, Check, X, LayoutDashboard,
    Trophy, Globe, Award, Share2
} from 'lucide-react';
import {
    PitchModal, MatchModal, BanModal, PushModal,
    AddPlayerModal, ContactModal, LogModal, RevenueModal, MoreMenu
} from './GodViewModals';
import { GodViewDataTables } from './GodViewDataTables';
import { DeepEditPitchModal, DeepEditUserModal, DeepEditProviderModal, AddPitchModal } from './DeepEditModals';
import { fbDeletePitch, fbDeleteUser } from '../../firebaseMutations';
import { MatchesTab, NotificationsTab } from './MatchNotifTabs';
import { SettingsTab, ContentTab } from './SettingsContentTabs';

interface Props { onBack: () => void; onNavigate?: (tab: string) => void; }

// ── Mini sparkline ────────────────────────────────────────────────
const Spark: React.FC<{ data: number[]; color: string }> = ({ data, color }) => {
    const max = Math.max(...data), min = Math.min(...data);
    const w = 80, h = 32;
    const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / (max - min + 1)) * h}`).join(' ');
    return <svg width={w} height={h} className="opacity-80"><polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={pts} /></svg>;
};
const statusStyle: Record<string, string> = {
    'AKTİF': 'bg-green-500/20 text-green-400 border-green-500/30',
    'EKSİK': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    'DİSPÜT': 'bg-red-500/20 text-red-400 border-red-500/30',
};
const Pill: React.FC<{ status: string }> = ({ status }) => (
    <span className={`px-2 py-0.5 text-[9px] font-black rounded border uppercase tracking-wide ${statusStyle[status] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>{status}</span>
);
const FillBar: React.FC<{ filled: number; total: number }> = ({ filled, total }) => {
    const pct = (filled / total) * 100;
    return (
        <div className="flex items-center gap-2">
            <div className="w-20 h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${pct >= 90 ? 'bg-green-500' : pct >= 60 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[10px] font-mono text-gray-400">{filled}/{total}</span>
        </div>
    );
};
const pinColor = (s: string) => ({ 'AKTİF': '#22c55e', 'EKSİK': '#eab308', 'DİSPÜT': '#ef4444' }[s] || '#6b7280');

const STATIC_PINS = [
    { name: 'Arena Beşiktaş', fill: 12, total: 14, status: 'AKTİF', x: '42%', y: '34%' },
    { name: 'Vadi Spor', fill: 8, total: 14, status: 'EKSİK', x: '55%', y: '22%' },
    { name: 'Kadıköy Moda', fill: 14, total: 14, status: 'AKTİF', x: '68%', y: '52%' },
    { name: 'Maslak İTÜ', fill: 4, total: 14, status: 'DİSPÜT', x: '49%', y: '16%' },
    { name: 'Üsküdar Sahil', fill: 10, total: 14, status: 'EKSİK', x: '72%', y: '38%' },
    { name: 'Florya Park', fill: 14, total: 14, status: 'AKTİF', x: '22%', y: '52%' },
];
const STATIC_FILLS = [13, 8, 14, 4, 14];
const STATIC_MATCH_STATUS = (fill: number) => fill >= 14 ? 'AKTİF' : fill >= 8 ? 'EKSİK' : 'DİSPÜT';

type ModalState =
    | { type: 'none' }
    | { type: 'pitch'; data: typeof STATIC_PINS[0] }
    | { type: 'match'; data: ReturnType<typeof buildRows>[0] }
    | { type: 'ban'; userId: string; userName: string }
    | { type: 'push'; target?: string }
    | { type: 'addPlayer'; matchId: string }
    | { type: 'contact'; pitchName: string }
    | { type: 'log' }
    | { type: 'revenue' }
    | { type: 'more'; data: ReturnType<typeof buildRows>[0] }
    | { type: 'addPitch' }
    | { type: 'deepEditPitch'; data: any }
    | { type: 'deepEditUser'; data: any }
    | { type: 'deepEditProvider'; typeParam: 'GK' | 'REF'; data: any };

function buildRows(matches: any[], fills: number[]) {
    return matches.slice(0, 5).map((m, i) => ({
        id: `#${1456 + i}`,
        matchId: m.id,
        pitch: m.location || m.title,
        time: `${m.date} ${m.time}`,
        fill: fills[i] ?? 7,
        total: 14,
        rev: m.price * 7,
        status: STATIC_MATCH_STATUS(fills[i] ?? 7),
    }));
}

const GodViewPanel: React.FC<Props> = ({ onBack, onNavigate }) => {
    const {
        adminPitches, adminGoalkeepers, adminReferees, adminMatches,
        adminUsers, appSettings, updatePitch, deleteMatch, updateAppSettings,
        impersonatedUser, setImpersonatedUser, originalRole, setOriginalRole,
        globalTexts, setGlobalText, role, setRole, setView
    } = useAppStore();

    // ── UI State ────────────────────────────────────────────────────
    const [subRoute, setSubRoute] = useState<'GENEL' | 'CONTROL' | 'SAHALAR' | 'KULLANICILAR' | 'KALECİLER' | 'HAKEMLER' | 'MATCHES' | 'NOTIFICATIONS' | 'CONTENT' | 'SETTINGS' | 'TOPLULUKLAR' | 'TAKIMLAR' | 'TURNUVALAR'>('GENEL');

    const [multiplier, setMultiplier] = useState(1.4);
    const [selectedPitchIdx, setSelectedPitchIdx] = useState(0);
    const [timeStart, setTimeStart] = useState('20:00');
    const [timeEnd, setTimeEnd] = useState('23:00');
    const [editTime, setEditTime] = useState<'start' | 'end' | null>(null);
    const [toast, setToast] = useState<string | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);
    const [modal, setModal] = useState<ModalState>({ type: 'none' });
    const [dismissedEvents, setDismissedEvents] = useState<Set<number>>(new Set());
    const [rowFills, setRowFills] = useState(STATIC_FILLS);

    // ── TOPLULUK / TAKIM / TURNUVA STATE ──────────────────────────────
    const [mockCommunities, setMockCommunities] = useState([
        {
            id: 'c1',
            name: 'Boğaziçi Üniversitesi',
            domain: '@boun.edu.tr',
            logo: '🦅',
            memberCount: 1250,
            activeMatches: 12,
            isVerified: true,
            modules: {
                transferMarket: true,
                leaderboards: true,
                tournaments: true,
                fairPlayStrict: true
            },
            teams: [
                { id: 't1', name: 'BOUN Crows', color: 'bg-yellow-400', wins: 15, losses: 3, fp: 98, playersCount: 12, formation: '5+1' },
                { id: 't2', name: 'BOUN Lions', color: 'bg-red-500', wins: 10, losses: 8, fp: 92, playersCount: 11, formation: '6+1' },
                { id: 't3', name: 'BOUN Eagles', color: 'bg-blue-500', wins: 8, losses: 9, fp: 88, playersCount: 10, formation: '7+1' }
            ],
            players: [
                { id: 'u1', name: 'Ahmet Yılmaz', position: 'SNT', fp: 96, team: 'BOUN Crows' },
                { id: 'u2', name: 'Mehmet Kaya', position: 'STP', fp: 94, team: 'BOUN Crows' },
                { id: 'u3', name: 'Can Demir', position: 'KL', fp: 90, team: 'BOUN Lions' },
                { id: 'u4', name: 'Alp Aslan', position: 'OS', fp: 85, team: 'BOUN Eagles' }
            ],
            tournaments: [
                {
                    id: 'tour1',
                    title: 'Boğaziçi Süper Kupa 2026',
                    status: 'PLAYING',
                    winnerTeamId: undefined,
                    brackets: [
                        {
                            round: 'Yarı Final (SF)',
                            matches: [
                                { id: 'bm1', homeTeam: 'BOUN Crows', awayTeam: 'BOUN Lions', homeScore: 3, awayScore: 2, winner: 'BOUN Crows', approved: true },
                                { id: 'bm2', homeTeam: 'BOUN Eagles', awayTeam: 'BOUN Lions', homeScore: undefined, awayScore: undefined, winner: undefined, approved: false }
                            ]
                        },
                        {
                            round: 'Final (F)',
                            matches: [
                                { id: 'bm3', homeTeam: 'BOUN Crows', awayTeam: 'BOUN Eagles', homeScore: undefined, awayScore: undefined, winner: undefined, approved: false }
                            ]
                        }
                    ]
                }
            ]
        },
        {
            id: 'c2',
            name: 'İstanbul Teknik Üniversitesi',
            domain: '@itu.edu.tr',
            logo: '🐝',
            memberCount: 980,
            activeMatches: 6,
            isVerified: true,
            modules: {
                transferMarket: true,
                leaderboards: true,
                tournaments: true,
                fairPlayStrict: false
            },
            teams: [
                { id: 't4', name: 'ITU Hornets', color: 'bg-yellow-500', wins: 12, losses: 6, fp: 94, playersCount: 12, formation: '6+1' },
                { id: 't5', name: 'ITU Mariners', color: 'bg-cyan-600', wins: 6, losses: 12, fp: 85, playersCount: 9, formation: '5+1' }
            ],
            players: [
                { id: 'u5', name: 'Kaan Balcı', position: 'SNT', fp: 92, team: 'ITU Hornets' },
                { id: 'u6', name: 'Efe Çetin', position: 'OS', fp: 89, team: 'ITU Mariners' }
            ],
            tournaments: [
                {
                    id: 'tour2',
                    title: 'Arı Arasın Bahar Turnuvası',
                    status: 'REGISTRATION',
                    winnerTeamId: undefined,
                    brackets: [
                        {
                            round: 'Final (F)',
                            matches: [
                                { id: 'bm4', homeTeam: 'ITU Hornets', awayTeam: 'ITU Mariners', homeScore: undefined, awayScore: undefined, winner: undefined, approved: false }
                            ]
                        }
                    ]
                }
            ]
        },
        {
            id: 'c3',
            name: 'Ortadoğu Teknik Üniversitesi',
            domain: '@metu.edu.tr',
            logo: '🐺',
            memberCount: 840,
            activeMatches: 4,
            isVerified: false,
            modules: {
                transferMarket: false,
                leaderboards: true,
                tournaments: false,
                fairPlayStrict: false
            },
            teams: [
                { id: 't6', name: 'METU Wolves', color: 'bg-red-600', wins: 9, losses: 7, fp: 90, playersCount: 11, formation: '5+1' }
            ],
            players: [
                { id: 'u7', name: 'Barış Öztürk', position: 'KL', fp: 91, team: 'METU Wolves' }
            ],
            tournaments: []
        }
    ]);

    const [selectedCommIdx, setSelectedCommIdx] = useState(0);
    const [commFilter, setCommFilter] = useState<'ALL' | 'VERIFIED' | 'INDEPENDENT'>('ALL');
    const [commSearch, setCommSearch] = useState('');

    const [selectedTeamIdx, setSelectedTeamIdx] = useState(0);
    const [teamSearch, setTeamSearch] = useState('');
    const [playerSearch, setPlayerSearch] = useState('');
    const [playerPositionFilter, setPlayerPositionFilter] = useState<'ALL' | 'KL' | 'STP' | 'OS' | 'SNT'>('ALL');
    const [playerFpFilter, setPlayerFpFilter] = useState<number>(0);
    const [playerSortBy, setPlayerSortBy] = useState<'FP_DESC' | 'NAME_ASC'>('FP_DESC');

    const nav = useCallback((tab: string) => { if (onNavigate) onNavigate(tab); }, [onNavigate]);

    const showToast = useCallback((msg: string) => {
        setToast(msg); setTimeout(() => setToast(null), 2200);
    }, []);

    const closeModal = useCallback(() => setModal({ type: 'none' }), []);
    const dismissEvent = (i: number) => setDismissedEvents(prev => new Set([...prev, i]));

    // ── Derived data ─────────────────────────────────────────────────
    const missingAlerts = adminMatches.filter(m => m.missingPositions.some(p => p.count > 0)).length;
    const liveRevenue = adminMatches.reduce((a, m) => a + m.price * 1.1, 0);
    const selectedPitch = adminPitches[selectedPitchIdx];

    const mkSpark = useCallback((base: number) =>
        Array.from({ length: 12 }, (_, i) => base + Math.round(Math.sin((i + refreshKey) * 0.8) * base * 0.2 + (refreshKey * 0.01 + i) % (base * 0.1 + 1))),
        [refreshKey]);

    const matchRows = useMemo(() => buildRows(adminMatches, rowFills), [adminMatches, rowFills]);

    // ── CSV export ───────────────────────────────────────────────────
    const exportCSV = () => {
        const hdr = 'ID,Saha,Tarih,Saat,Fiyat,Zorluk,Durum';
        const rows = adminMatches.map(m => `${m.id},"${m.location || m.title}",${m.date},${m.time},${m.price},${m.difficulty}`);
        const blob = new Blob([[hdr, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `oyna_maclar_${Date.now()}.csv`; a.click();
        URL.revokeObjectURL(url);
        showToast('CSV indirildi ✓');
    };

    // ── Pricing apply ─────────────────────────────────────────────────
    const applyPricing = () => {
        if (selectedPitch) {
            updatePitch({ ...selectedPitch, pricePerPerson: Math.round(selectedPitch.pricePerPerson * multiplier), totalPrice: Math.round(selectedPitch.totalPrice * multiplier) });
            showToast(`${selectedPitch.name} fiyatı güncellendi: ${multiplier}x çarpan uygulandı ✓`);
        }
    };

    // ── TOPLULUK TURNUVA VE MODÜL KONTROLLERİ ──────────────────────────────
    const handleToggleCommModule = (commId: string, moduleKey: 'transferMarket' | 'leaderboards' | 'tournaments' | 'fairPlayStrict') => {
        setMockCommunities(prev => prev.map(c => {
            if (c.id !== commId) return c;
            const updatedModules = { ...c.modules, [moduleKey]: !c.modules[moduleKey] };
            showToast(`${c.name} - ${moduleKey === 'transferMarket' ? 'Transfer Pazarı' : moduleKey === 'leaderboards' ? 'Liderlik Tablosu' : moduleKey === 'tournaments' ? 'Turnuva Motoru' : 'Fair Play'} modülü değiştirildi ✓`);
            return { ...c, modules: updatedModules };
        }));
    };

    const handleSetBracketScore = (commId: string, tourId: string, bracketRound: string, matchId: string, scoreHome: number, scoreAway: number) => {
        setMockCommunities(prev => prev.map(c => {
            if (c.id !== commId) return c;
            const updatedTours = c.tournaments.map(t => {
                if (t.id !== tourId) return t;
                
                let winnerTeam = '';
                const updatedBrackets = t.brackets.map(b => {
                    const updatedMatches = b.matches.map(m => {
                        if (m.id !== matchId) return m;
                        const winner = scoreHome > scoreAway ? m.homeTeam : scoreAway > scoreHome ? m.awayTeam : undefined;
                        winnerTeam = winner || '';
                        return {
                            ...m,
                            homeScore: scoreHome,
                            awayScore: scoreAway,
                            winner,
                            approved: true
                        };
                    });
                    return { ...b, matches: updatedMatches };
                });

                if (winnerTeam) {
                    updatedBrackets.forEach(b => {
                        if (b.round === 'Final (F)') {
                            b.matches = b.matches.map(fm => {
                                if (bracketRound === 'Yarı Final (SF)') {
                                    if (matchId === 'bm1') {
                                        return { ...fm, homeTeam: winnerTeam };
                                    } else if (matchId === 'bm2') {
                                        return { ...fm, awayTeam: winnerTeam };
                                    }
                                }
                                return fm;
                            });
                        }
                    });
                }

                let tourWinner = t.winnerTeamId;
                const finalMatch = updatedBrackets.find(b => b.round === 'Final (F)')?.matches[0];
                if (finalMatch && finalMatch.winner) {
                    tourWinner = finalMatch.winner;
                }

                return {
                    ...t,
                    brackets: updatedBrackets,
                    winnerTeamId: tourWinner,
                    status: tourWinner ? 'COMPLETED' as const : t.status
                };
            });
            return { ...c, tournaments: updatedTours };
        }));
        showToast('Turnuva skoru tescil edildi ve fikstür güncellendi! 🏆');
    };

    const handleAddNewTournament = (commId: string, title: string) => {
        setMockCommunities(prev => prev.map(c => {
            if (c.id !== commId) return c;
            const newTour = {
                id: `tour_${Date.now()}`,
                title,
                status: 'PLAYING' as const,
                winnerTeamId: undefined,
                brackets: [
                    {
                        round: 'Final (F)',
                        matches: [
                            { id: `bm_${Date.now()}`, homeTeam: c.teams[0]?.name || 'Takım A', awayTeam: c.teams[1]?.name || 'Takım B', homeScore: undefined, awayScore: undefined, winner: undefined, approved: false }
                        ]
                    }
                ]
            };
            showToast(`${title} Turnuvası oluşturuldu! 🏆`);
            return { ...c, tournaments: [...c.tournaments, newTour] };
        }));
    };

    const handleTransferPlayer = (commId: string, playerId: string, targetTeamName: string) => {
        setMockCommunities(prev => prev.map(c => {
            if (c.id !== commId) return c;
            
            // Update player's team
            const updatedPlayers = c.players.map(p => {
                if (p.id !== playerId) return p;
                return { ...p, team: targetTeamName || undefined };
            });

            // Recalculate playersCount for teams
            const updatedTeams = c.teams.map(t => {
                const count = updatedPlayers.filter(p => p.team === t.name).length;
                return { ...t, playersCount: count };
            });

            showToast(`Transfer başarılı! Oyuncu ${targetTeamName ? targetTeamName : 'Serbest Oyuncu'} kadrosuna katıldı. ⚽`);
            return { ...c, players: updatedPlayers, teams: updatedTeams };
        }));
    };

    const handleAddNewPlayerToCommunity = (commId: string, userId: string, position: string) => {
        const targetUser = adminUsers.find(u => u.id === userId);
        if (!targetUser) return;

        setMockCommunities(prev => prev.map(c => {
            if (c.id !== commId) return c;

            // Check if already in community
            if (c.players.some(p => p.id === userId)) {
                showToast('Oyuncu zaten bu topluluğun üyesi! ✗');
                return c;
            }

            const newPlayer = {
                id: userId,
                name: targetUser.name,
                position,
                fp: targetUser.reliabilityScore || 98,
                team: undefined, // starts as free agent
                avatar: targetUser.role === 'GOALKEEPER' ? '🧤' : targetUser.role === 'REFEREE' ? '🏁' : '🏃'
            };

            showToast(`${targetUser.name} topluluğa eklendi! ⚡`);
            return { ...c, players: [...c.players, newPlayer] };
        }));
    };

    const handleRemovePlayerFromCommunity = (commId: string, playerId: string) => {
        setMockCommunities(prev => prev.map(c => {
            if (c.id !== commId) return c;

            const targetPlayer = c.players.find(p => p.id === playerId);
            const updatedPlayers = c.players.filter(p => p.id !== playerId);

            // Recalculate playersCount for teams
            const updatedTeams = c.teams.map(t => {
                const count = updatedPlayers.filter(p => p.team === t.name).length;
                return { ...t, playersCount: count };
            });

            showToast(`${targetPlayer?.name || 'Oyuncu'} topluluktan ayrıldı. ✕`);
            return { ...c, players: updatedPlayers, teams: updatedTeams };
        }));
    };



    const getFormationPositions = (formation: string, roster: any[]) => {
        const positions: any[] = [];
        if (formation === '5+1') {
            const posNames = ['KL', 'STP', 'STP', 'OS', 'SNT', 'SNT'];
            posNames.forEach((role, i) => {
                const player = roster[i] || { name: 'Kadro Dışı', position: role };
                let coords = { top: '82%', left: '50%' };
                if (i === 1) coords = { top: '62%', left: '30%' };
                if (i === 2) coords = { top: '62%', left: '70%' };
                if (i === 3) coords = { top: '42%', left: '50%' };
                if (i === 4) coords = { top: '22%', left: '35%' };
                if (i === 5) coords = { top: '22%', left: '65%' };
                positions.push({ ...player, coords });
            });
        } else if (formation === '6+1') {
            const posNames = ['KL', 'STP', 'STP', 'OS', 'OS', 'SNT', 'SNT'];
            posNames.forEach((role, i) => {
                const player = roster[i] || { name: 'Kadro Dışı', position: role };
                let coords = { top: '82%', left: '50%' };
                if (i === 1) coords = { top: '62%', left: '30%' };
                if (i === 2) coords = { top: '62%', left: '70%' };
                if (i === 3) coords = { top: '44%', left: '35%' };
                if (i === 4) coords = { top: '44%', left: '65%' };
                if (i === 5) coords = { top: '22%', left: '30%' };
                if (i === 6) coords = { top: '22%', left: '70%' };
                positions.push({ ...player, coords });
            });
        } else {
            const posNames = ['KL', 'STP', 'STP', 'STP', 'OS', 'OS', 'SNT', 'SNT'];
            posNames.forEach((role, i) => {
                const player = roster[i] || { name: 'Kadro Dışı', position: role };
                let coords = { top: '82%', left: '50%' };
                if (i === 1) coords = { top: '64%', left: '20%' };
                if (i === 2) coords = { top: '64%', left: '50%' };
                if (i === 3) coords = { top: '64%', left: '80%' };
                if (i === 4) coords = { top: '42%', left: '35%' };
                if (i === 5) coords = { top: '42%', left: '65%' };
                if (i === 6) coords = { top: '20%', left: '30%' };
                if (i === 7) coords = { top: '20%', left: '70%' };
                positions.push({ ...player, coords });
            });
        }
        return positions;
    };

    // ── Sidebar groups ────────────────────────────────────────────────
    const SIDEBAR_GROUPS = [
        {
            label: 'BÖLGE KOMUTASI',
            items: [
                { icon: Radio, label: 'Genel', badge: null, active: subRoute === 'GENEL', action: () => setSubRoute('GENEL') },
                { icon: LayoutDashboard, label: 'Komuta Merkezi', badge: 'CANLI', active: subRoute === 'CONTROL', action: () => setSubRoute('CONTROL') }
            ]
        },
        {
            label: 'OPERASYON', items: [
                { icon: MapPin, label: 'Sahalar', badge: adminPitches.length, active: subRoute === 'SAHALAR', action: () => setSubRoute('SAHALAR') },
                { icon: Users, label: 'Kullanıcılar', badge: adminUsers.length, active: subRoute === 'KULLANICILAR', action: () => setSubRoute('KULLANICILAR') },
                { icon: Swords, label: 'Maçlar', badge: missingAlerts ? `${missingAlerts}⚠` : adminMatches.length, active: subRoute === 'MATCHES', action: () => setSubRoute('MATCHES') },
                { icon: Shield, label: 'Kaleciler', badge: adminGoalkeepers.length, active: subRoute === 'KALECİLER', action: () => setSubRoute('KALECİLER') },
                { icon: Scale, label: 'Hakemler', badge: adminReferees.length, active: subRoute === 'HAKEMLER', action: () => setSubRoute('HAKEMLER') },
            ]
        },
        {
            label: 'TOPLULUK YÖNETİMİ', items: [
                { icon: Globe, label: 'Topluluklar', badge: '3', active: subRoute === 'TOPLULUKLAR', action: () => setSubRoute('TOPLULUKLAR') },
                { icon: Users, label: 'Takımlar', badge: '8', active: subRoute === 'TAKIMLAR', action: () => setSubRoute('TAKIMLAR') },
                { icon: Trophy, label: 'Turnuvalar', badge: 'AKTİF', active: subRoute === 'TURNUVALAR', action: () => setSubRoute('TURNUVALAR') }
            ]
        },
        {
            label: 'PAZARLAMA', items: [
                { icon: Megaphone, label: 'Kampanyalar', badge: null, active: subRoute === 'NOTIFICATIONS', action: () => setSubRoute('NOTIFICATIONS') },
                { icon: Zap, label: 'İndirim Kodları', badge: null, active: false, action: () => showToast('İndirim modülü yakında 🚀') },
                { icon: Filter, label: 'Segmentasyon', badge: null, active: false, action: () => setSubRoute('KULLANICILAR') },
            ]
        },
        {
            label: 'FİNANS', items: [
                { icon: CreditCard, label: 'Ledger', badge: null, active: subRoute === 'SETTINGS', action: () => setSubRoute('SETTINGS') },
                { icon: TrendingUp, label: 'Gelir Analizi', badge: null, active: false, action: () => setModal({ type: 'revenue' }) },
                { icon: Download, label: 'Ödemeler', badge: null, active: subRoute === 'SETTINGS', action: () => setSubRoute('SETTINGS') },
            ]
        },
        {
            label: 'SİSTEM', items: [
                { icon: Type, label: 'Metinler', badge: null, active: subRoute === 'CONTENT', action: () => setSubRoute('CONTENT') },
                { icon: Settings, label: 'Ayarlar', badge: null, active: subRoute === 'SETTINGS', action: () => setSubRoute('SETTINGS') },
                { icon: Lock, label: 'Ekipler & Yetkiler', badge: null, active: false, action: () => showToast('ACL modülü geliştirme aşamasında') },
            ]
        },
    ];

    // ── Events ────────────────────────────────────────────────────────
    const ALL_EVENTS = [
        {
            level: 'critical', icon: '🚨', title: 'Dispute: Arena B — Maç #4567', sub: '3dk önce',
            actions: [
                { label: 'İNCELE', color: 'text-gray-300 border-white/10', fn: () => setModal({ type: 'match', data: matchRows[1] }) },
                { label: 'GEÇİCİ BAN', color: 'text-red-400 border-red-500/20', fn: () => setModal({ type: 'ban', userId: 'u2', userName: 'Şüpheli Kullanıcı' }) },
                { label: 'SAHAYA ULAŞ', color: 'text-orange-400 border-orange-500/20', fn: () => setModal({ type: 'contact', pitchName: 'Arena B' }) },
            ]
        },
        {
            level: 'warning', icon: '⚠️', title: 'Kaleci iptal: Maç #4521 — Yedek arıyor', sub: '8dk önce',
            actions: [{ label: 'YEDEK BUL', color: 'text-green-400 border-green-500/20', fn: () => { nav('GOALKEEPERS'); showToast('Kaleci listesi açıldı'); } }]
        },
        {
            level: 'info', icon: 'ℹ️', title: 'Yeni kayıt: Mecidiyeköy Spor — Onay bekliyor', sub: '12dk önce',
            actions: [
                { label: 'ONAYLA', color: 'text-green-400 border-green-500/20', fn: (i: number) => { dismissEvent(i); showToast('Mecidiyeköy Spor onaylandı ✓'); } },
                { label: 'REDDET', color: 'text-red-400 border-red-500/20', fn: (i: number) => { dismissEvent(i); showToast('Kayıt reddedildi'); } },
            ]
        },
        {
            level: 'warning', icon: '⚠️', title: 'Min rating ihlali: Oyuncu #8821', sub: '18dk önce',
            actions: [
                { label: 'LOGLAR', color: 'text-gray-300 border-white/10', fn: () => setModal({ type: 'log' }) },
                { label: 'SUSPEND', color: 'text-red-400 border-red-500/20', fn: () => setModal({ type: 'ban', userId: 'u3', userName: 'Oyuncu #8821' }) },
            ]
        },
    ];
    const visibleEvents = ALL_EVENTS.filter((_, i) => !dismissedEvents.has(i));

    return (
        <div className="h-screen bg-[#0D1117] text-white flex flex-col overflow-hidden font-sans">
            <div className="h-0.5 w-full bg-gradient-to-r from-red-700 via-red-500 to-orange-500 shrink-0" />

            <div className="flex flex-1 overflow-hidden">
                {/* ── SIDEBAR ─────────────────────────────────────────────── */}
                <aside className="w-52 bg-[#161B22] border-r border-white/5 flex flex-col shrink-0 overflow-hidden">
                    <div className="px-4 py-4 border-b border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 bg-red-600 rounded flex items-center justify-center"><Zap size={12} className="text-white" /></div>
                            <span className="text-sm font-black tracking-widest text-white uppercase">OYNA OS</span>
                        </div>
                        <button onClick={onBack} className="w-6 h-6 rounded flex items-center justify-center text-gray-600 hover:text-white transition-all" title="Geri"><ChevronLeft size={14} /></button>
                    </div>
                    <nav className="flex-1 overflow-y-auto custom-scrollbar py-2">
                        {SIDEBAR_GROUPS.map(group => (
                            <div key={group.label} className="mb-1">
                                <p className="px-4 py-1.5 text-[9px] text-gray-600 font-black uppercase tracking-widest">{group.label}</p>
                                {group.items.map(({ icon: Icon, label, badge, active, action }) => (
                                    <button key={label} onClick={action}
                                        className={`w-full flex items-center justify-between px-4 py-2 text-left transition-all group border-l-2 ${active ? 'bg-red-600/10 border-red-500 text-white' : 'border-transparent text-gray-500 hover:text-white hover:bg-white/5'}`}>
                                        <div className="flex items-center gap-2.5">
                                            <Icon size={13} className={active ? 'text-red-400' : 'group-hover:text-gray-300'} />
                                            <span className="text-[11px] font-bold uppercase tracking-wide">{label}</span>
                                        </div>
                                        {badge !== null && badge !== undefined && (
                                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${String(badge).includes('⚠') ? 'bg-yellow-500/20 text-yellow-400' : 'bg-white/10 text-gray-400'}`}>{badge}</span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        ))}
                    </nav>
                    <div className="border-t border-white/5 p-3 flex items-center gap-2">
                        <img src="https://i.pravatar.cc/150?u=patron" className="w-8 h-8 rounded-full border border-red-500/30" />
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-black text-white truncate">Admin</p>
                            <span className="text-[8px] px-1.5 py-0.5 bg-red-600/20 text-red-400 font-black rounded uppercase">PATRON</span>
                        </div>
                        <button onClick={onBack} title="Çıkış" className="text-gray-600 hover:text-red-400 transition-all"><LogOut size={13} /></button>
                    </div>
                </aside>

                {/* ── MAIN ─────────────────────────────────────────────────── */}
                {/* ── MAIN ─────────────────────────────────────────────────── */}
                <main className="flex-1 flex flex-col overflow-hidden">
                    {/* Header */}
                    <div className="px-6 py-3 border-b border-white/5 flex items-center justify-between bg-[#0D1117]/80 backdrop-blur shrink-0">
                        <div>
                            <h1 className="text-sm font-black tracking-widest uppercase text-white flex items-center gap-2 italic">
                                <Radio size={14} className="text-red-400 animate-pulse" /> OYNA KOMUTA MERKEZİ
                            </h1>
                            <p className="text-[9px] text-red-500 font-mono font-bold tracking-widest uppercase">BÖLGE KOMUTASI • MASTER KONTROL MERKEZİ</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => { updateAppSettings({ maintenanceMode: !appSettings.maintenanceMode }); showToast(appSettings.maintenanceMode ? 'Bakım modu kapatıldı' : '⚠️ Bakım modu AKTİF'); }}
                                className={`px-3 py-1.5 text-[9px] font-black rounded border transition-all uppercase ${appSettings.maintenanceMode ? 'bg-red-500/20 text-red-400 border-red-500/30 animate-pulse' : 'bg-white/5 text-gray-500 border-white/10 hover:text-white'}`}>
                                {appSettings.maintenanceMode ? 'BAKIM MODU' : 'NORMAL MOD'}
                            </button>
                            <span className="text-[9px] font-mono text-gray-600">v3.0.0</span>
                            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar p-4 space-y-3">

                        {/* ── METRICS ──────────────────────────────────────────── */}
                        <div className="grid grid-cols-4 gap-3">
                            {[
                                { label: 'CANLI MAÇLAR', value: adminMatches.length, unit: 'aktif maç', color: '#ef4444', data: mkSpark(adminMatches.length), action: () => nav('MATCHES') },
                                { label: 'EKSİK OYUNCU ALARMLAR', value: missingAlerts, unit: 'eksik kadrolu', color: '#eab308', data: mkSpark(missingAlerts + 1), action: () => nav('MATCHES') },
                                { label: 'CANLI KOMİSYON', value: `₺${Math.round(liveRevenue).toLocaleString('tr')}`, unit: 'son 5dk', color: '#22c55e', data: mkSpark(18), action: () => setModal({ type: 'revenue' }) },
                                { label: 'YENİ SAHA KAYITLAR', value: 3, unit: 'onay bekliyor', color: '#3b82f6', data: mkSpark(3), action: () => nav('PITCHES') },
                            ].map(({ label, value, unit, color, data, action }) => (
                                <button key={label} onClick={action} className="bg-[#161B22] border border-white/5 rounded-2xl p-4 flex flex-col gap-2 hover:border-white/15 transition-all text-left group">
                                    <p className="text-[8px] text-gray-500 font-black uppercase tracking-widest">{label}</p>
                                    <p className="text-2xl font-black text-white group-hover:text-white">{value}</p>
                                    <div className="flex items-end justify-between">
                                        <p className="text-[9px] text-gray-600 font-mono">{unit}</p>
                                        <Spark data={data} color={color} />
                                    </div>
                                </button>
                            ))}
                        </div>

                        {/* ── MIDDLE ROW (MAP OR DATA TABLES) ─────────────────────────────────── */}
                        {/* ── MIDDLE ROW (MAP OR DATA TABLES) ─────────────────────────────────── */}
                        {subRoute === 'GENEL' ? (
                            <>
                                <div className="grid grid-cols-12 gap-4">
                                    {/* 1. Kutu: Sistem Durumu & Aktiflik Göstergesi */}
                                    <div className="col-span-6 bg-[#161B22]/80 backdrop-blur-md border border-white/5 rounded-2xl p-5 flex flex-col justify-between">
                                        <div>
                                            <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                                                <Activity size={11} className="text-[#39FF14]" /> SİSTEM SAĞLIĞI & AKTİFLİK DURUMU
                                            </p>
                                            <div className="space-y-2.5">
                                                <div className="flex justify-between items-center bg-black/20 p-2.5 border border-white/5 rounded-xl">
                                                    <span className="text-[10px] text-gray-400 font-bold uppercase">BAKIM MODU</span>
                                                    <span className={`px-2 py-0.5 text-[9px] font-black rounded uppercase border ${appSettings.maintenanceMode ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-green-500/20 text-[#39FF14] border-[#39FF14]/30'}`}>
                                                        {appSettings.maintenanceMode ? 'AKTİF (KAPALI)' : 'PASİF (HERKESE AÇIK)'}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-center bg-black/20 p-2.5 border border-white/5 rounded-xl">
                                                    <span className="text-[10px] text-gray-400 font-bold uppercase">LOBİ BARAJ MOTORU</span>
                                                    <span className="px-2 py-0.5 text-[9px] font-black bg-green-500/20 text-[#39FF14] border border-[#39FF14]/30 rounded uppercase">
                                                        AKTİF (90 DK KONTROLÜ)
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-center bg-black/20 p-2.5 border border-white/5 rounded-xl">
                                                    <span className="text-[10px] text-gray-400 font-bold uppercase">ÖDEME GEÇİDİ (PARAM)</span>
                                                    <span className="px-2 py-0.5 text-[9px] font-black bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded uppercase">
                                                        {appSettings.payoutMode === 'cash' ? 'SAHADA NAKİT' : appSettings.payoutMode === 'online' ? 'ONLINE ÖDEME' : 'KAPORA MODU'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex gap-2 mt-4 pt-3 border-t border-white/5">
                                            <button 
                                                onClick={() => { updateAppSettings({ maintenanceMode: !appSettings.maintenanceMode }); showToast(appSettings.maintenanceMode ? 'Bakım modu kapatıldı ✓' : '⚠️ Bakım modu AKTİF'); }}
                                                className="flex-1 h-9 bg-black/30 hover:bg-black/50 border border-white/10 rounded-xl text-[10px] font-black text-white uppercase tracking-widest transition-all"
                                            >
                                                Bakım Modunu Değiştir
                                            </button>
                                        </div>
                                    </div>

                                    {/* 2. Kutu: Basit Fiyat Çarpanı Kontrolü (Hızlı İşleyen Arayüz) */}
                                    <div className="col-span-6 bg-[#161B22]/80 backdrop-blur-md border border-white/5 rounded-2xl p-5 flex flex-col justify-between">
                                        <div>
                                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                                                <TrendingUp size={11} className="text-[#FFFF00]" /> HIZLI FİYAT ÇARPANI DÜZENLEYİCİ
                                            </p>
                                            <p className="text-[10px] text-gray-400 mb-3 leading-relaxed font-medium">
                                                Seçtiğiniz sahanın kişi başı ücret çarpanını anında güncelleyin.
                                            </p>
                                            <div className="grid grid-cols-2 gap-3 mb-3">
                                                <div>
                                                    <label className="text-[8px] text-gray-500 font-black uppercase tracking-widest block mb-1">Saha Seçin</label>
                                                    <select 
                                                        value={selectedPitchIdx} 
                                                        onChange={e => setSelectedPitchIdx(+e.target.value)}
                                                        className="w-full h-9 bg-black/40 border border-white/10 rounded-lg px-2.5 text-xs text-white focus:outline-none focus:border-[#FFFF00]/50"
                                                    >
                                                        {adminPitches.map((p, i) => <option key={p.id} value={i}>{p.name}</option>)}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="text-[8px] text-gray-500 font-black uppercase tracking-widest block mb-1">Fiyat Çarpanı</label>
                                                    <select 
                                                        value={multiplier} 
                                                        onChange={e => setMultiplier(+e.target.value)}
                                                        className="w-full h-9 bg-black/40 border border-white/10 rounded-lg px-2.5 text-xs text-white focus:outline-none focus:border-[#FFFF00]/50"
                                                    >
                                                        <option value="1.0">1.0x (Normal)</option>
                                                        <option value="1.2">1.2x (Yoğun)</option>
                                                        <option value="1.5">1.5x (Zirve Saat)</option>
                                                        <option value="1.8">1.8x (Derbi Saati)</option>
                                                        <option value="2.0">2.0x (Süper Pik)</option>
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={applyPricing}
                                            className="h-9 w-full bg-[#FFFF00] hover:bg-[#FFFF00]/95 text-black font-black text-[10px] uppercase tracking-widest transition-all rounded-xl shadow-[0_0_12px_rgba(255,255,0,0.15)]"
                                        >
                                            FİYAT ÇARPANINI UYGULA
                                        </button>
                                    </div>
                                </div>

                                {/* ── MAÇ TABLOSU ───────────────────────────────────────── */}
                                <div className="bg-[#161B22] border border-white/5 rounded-2xl overflow-hidden mt-4">
                                    <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                            <Activity size={11} /> AKTİF & YAKINLAŞAN MAÇLAR
                                        </p>
                                        <div className="flex gap-2">
                                            <button onClick={exportCSV}
                                                className="flex items-center gap-1.5 px-3 h-7 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[9px] font-bold text-gray-400 hover:text-white transition-all">
                                                <Download size={10} /> Export CSV
                                            </button>
                                            <button onClick={async () => { const { seedFirestore } = await import('../../firebaseSync'); await seedFirestore(); }}
                                                className="flex items-center gap-1.5 px-3 h-7 bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 rounded-lg text-[9px] font-bold text-red-500 hover:text-white transition-all">
                                                💥 DB SEED
                                            </button>
                                            <button onClick={() => { setRefreshKey(k => k + 1); showToast('Veriler yenilendi ✓'); }}
                                                className="flex items-center gap-1.5 px-3 h-7 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[9px] font-bold text-gray-400 hover:text-white transition-all">
                                                <RefreshCw size={10} /> Yenile
                                            </button>
                                        </div>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left">
                                            <thead>
                                                <tr className="border-b border-white/5">
                                                    {['ID', 'SAHA', 'BAŞLANGIÇ', 'DOLULUK', 'GELİR', 'DURUM', 'AKSİYONLAR'].map(col => (
                                                        <th key={col} className="px-4 py-2.5 text-[8px] font-black text-gray-600 uppercase tracking-widest whitespace-nowrap">{col}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {matchRows.map((row) => (
                                                    <tr key={row.id} className="border-b border-white/5 last:border-0 hover:bg-red-500/3 transition-all group">
                                                        <td className="px-4 py-3 text-[10px] font-mono text-gray-500">{row.id}</td>
                                                        <td className="px-4 py-3 text-[10px] font-bold text-white whitespace-nowrap">{row.pitch}</td>
                                                        <td className="px-4 py-3 text-[10px] font-mono text-gray-400 whitespace-nowrap">{row.time}</td>
                                                        <td className="px-4 py-3"><FillBar filled={row.fill} total={row.total} /></td>
                                                        <td className="px-4 py-3 text-[10px] font-black text-white font-mono">₺{row.rev.toLocaleString('tr')}</td>
                                                        <td className="px-4 py-3"><Pill status={row.status} /></td>
                                                        <td className="px-4 py-3">
                                                            <div className="flex gap-1">
                                                                <button onClick={() => setModal({ type: 'match', data: row })} title="İzle"
                                                                    className="w-7 h-7 rounded-lg bg-white/3 hover:bg-white/10 border border-white/5 flex items-center justify-center text-gray-400 hover:text-white transition-all">
                                                                    <Eye size={11} />
                                                                </button>
                                                                <button onClick={() => setModal({ type: 'push', target: row.pitch })} title="Push Gönder"
                                                                    className="w-7 h-7 rounded-lg bg-white/3 hover:bg-blue-500/15 border border-white/5 flex items-center justify-center text-blue-400 hover:text-blue-300 transition-all">
                                                                    <Send size={11} />
                                                                </button>
                                                                <button onClick={() => setModal({ type: 'addPlayer', matchId: row.id })} title="Oyuncu Ekle"
                                                                    className="w-7 h-7 rounded-lg bg-white/3 hover:bg-green-500/15 border border-white/5 flex items-center justify-center text-green-400 hover:text-green-300 transition-all">
                                                                    <UserPlus size={11} />
                                                                </button>
                                                                <button onClick={() => setModal({ type: 'more', data: row })} title="Daha Fazla"
                                                                    className="w-7 h-7 rounded-lg bg-white/3 hover:bg-white/10 border border-white/5 flex items-center justify-center text-gray-600 hover:text-white transition-all">
                                                                    <MoreHorizontal size={11} />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="px-5 py-2.5 border-t border-white/5 flex items-center justify-between">
                                        <p className="text-[8px] text-gray-600 font-mono">{matchRows.length} / {adminMatches.length} maç gösteriliyor</p>
                                        <div className="flex gap-1">
                                            {[ChevronLeft, ChevronRight].map((Icon, i) => (
                                                <button key={i} onClick={() => showToast('Sayfalama yakında 🚀')}
                                                    className="w-6 h-6 rounded border border-white/10 flex items-center justify-center text-gray-600 hover:text-white hover:border-white/20 transition-all"><Icon size={11} /></button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </>
                        ) : subRoute === 'CONTROL' ? (
                            <div className="flex-1 h-full overflow-y-auto custom-scrollbar bg-[#0A0E14] p-6 rounded-2xl border border-white/5 space-y-6">
                                {/* OYNA Komuta Merkezi Title */}
                                <div className="flex items-center justify-between border-b border-white/5 pb-4">
                                    <div>
                                        <h2 className="text-lg font-black tracking-widest text-[#FFFF00] uppercase flex items-center gap-2 italic leading-none shadow-[0_0_15px_rgba(255,255,0,0.1)]">
                                            <Zap size={18} className="text-[#FFFF00] animate-pulse" /> OYNA KOMUTA MERKEZİ
                                        </h2>
                                        <p className="text-[10px] text-gray-500 font-mono mt-1.5 uppercase tracking-widest">SİSTEM AYARLARI, ALGORİTMALAR, METİNLER VE GHOST TAKLİT MODÜLÜ</p>
                                    </div>
                                    <span className="px-2.5 py-1 text-[9px] font-black bg-[#FFFF00]/10 text-[#FFFF00] border border-[#FFFF00]/20 rounded-lg tracking-widest uppercase">
                                        MASTER PANEL CONNECTED
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    {/* 1. Modül: KULLANICI TAKLİT (GHOST) MODÜLÜ */}
                                    <div className="bg-[#161B22]/80 backdrop-blur-md border border-white/5 rounded-2xl p-5 flex flex-col gap-4">
                                        <p className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2 italic">
                                            <Users size={14} className="text-[#39FF14]" /> Kullanıcı Taklit (Ghost) Modülü
                                        </p>
                                        <p className="text-[10px] text-gray-400">
                                            Uygulamadaki herhangi bir oyuncunun, kalecinin veya hakemin profiline "Ghost" olarak giriş yapın. Onların gözünden tüm panelleri ve ayarları test edin.
                                        </p>

                                        <div className="flex flex-col gap-3 mt-1">
                                            <div>
                                                <label className="text-[9px] text-gray-500 font-black uppercase tracking-widest block mb-1">Taklit Edilecek Kullanıcı Seçin</label>
                                                <select 
                                                    id="impersonateSelect"
                                                    className="w-full h-10 bg-black/40 border border-white/10 rounded-xl px-3 text-xs text-white focus:outline-none focus:border-[#FFFF00]/50"
                                                >
                                                    {adminUsers.map(u => (
                                                        <option key={u.id} value={u.id} className="bg-[#0A0E14] text-white">
                                                            {u.name} ({u.role}) - Skor: {u.reliabilityScore || 100}%
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            <button
                                                onClick={() => {
                                                    const selectEl = document.getElementById('impersonateSelect') as HTMLSelectElement;
                                                    const targetId = selectEl?.value;
                                                    const targetUser = adminUsers.find(u => u.id === targetId);
                                                    if (targetUser) {
                                                        // Impersonate user
                                                        setOriginalRole(role);
                                                        setImpersonatedUser(targetUser);
                                                        setRole(targetUser.role);
                                                        
                                                        // Switch view based on role
                                                        if (targetUser.role === 'OWNER') {
                                                            setView('OWNER_PANEL');
                                                        } else if (targetUser.role === 'REFEREE' || targetUser.role === 'GOALKEEPER') {
                                                            setView('SERVICE_DASHBOARD');
                                                        } else {
                                                            setView('DASHBOARD');
                                                        }
                                                        showToast(`🕵️ Ghost Mode: ${targetUser.name} Taklit Ediliyor!`);
                                                    }
                                                }}
                                                className="h-10 w-full bg-[#39FF14] hover:bg-[#39FF14]/90 text-black font-black text-[10px] uppercase tracking-widest transition-all rounded-xl shadow-[0_0_15px_rgba(57,255,20,0.2)]"
                                            >
                                                GHOST MODUNDA SİSTEME GİRİŞ YAP
                                            </button>
                                        </div>
                                    </div>

                                    {/* 2. Modül: CORE ALGORİTMA TUNER (DEĞİŞTİRİLEBİLİR KURALLAR) */}
                                    <div className="bg-[#161B22]/80 backdrop-blur-md border border-white/5 rounded-2xl p-5 flex flex-col gap-4">
                                        <p className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2 italic">
                                            <Scale size={14} className="text-[#FFFF00]" /> Core Algoritma Ayarları
                                        </p>
                                        <p className="text-[10px] text-gray-400">
                                            Uygulamanın iptal barajlarını, ceza oranlarını ve işletme komisyon oranlarını canlı olarak değiştirerek motoru yönlendirin.
                                        </p>

                                        <div className="grid grid-cols-2 gap-3 mt-1">
                                            <div>
                                                <label className="text-[8px] text-gray-500 font-black uppercase tracking-widest block mb-1">İptal Barajı (Dakika)</label>
                                                <input 
                                                    type="number" 
                                                    defaultValue={90}
                                                    className="w-full h-9 bg-black/40 border border-white/10 rounded-lg px-2.5 text-xs text-white focus:outline-none"
                                                    onChange={(e) => {
                                                        showToast(`İptal Süresi Barajı Güncellendi: ${e.target.value} Dk ✓`);
                                                    }}
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[8px] text-gray-500 font-black uppercase tracking-widest block mb-1">Güvenilirlik Cezası</label>
                                                <input 
                                                    type="number" 
                                                    defaultValue={10}
                                                    className="w-full h-9 bg-black/40 border border-white/10 rounded-lg px-2.5 text-xs text-white focus:outline-none"
                                                    onChange={(e) => {
                                                        showToast(`Son 3 Saat İptal Cezası: -%${e.target.value} Yapıldı ✓`);
                                                    }}
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[8px] text-gray-500 font-black uppercase tracking-widest block mb-1">Minimum Skor Limiti</label>
                                                <input 
                                                    type="number" 
                                                    defaultValue={70}
                                                    className="w-full h-9 bg-black/40 border border-white/10 rounded-lg px-2.5 text-xs text-white focus:outline-none"
                                                    onChange={(e) => {
                                                        showToast(`Yasaklama Sınır Skoru: %${e.target.value} Yapıldı ✓`);
                                                    }}
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[8px] text-gray-500 font-black uppercase tracking-widest block mb-1">Komisyon Oranı (%)</label>
                                                <input 
                                                    type="number" 
                                                    value={appSettings.commissionRate || 10}
                                                    className="w-full h-9 bg-black/40 border border-white/10 rounded-lg px-2.5 text-xs text-white focus:outline-none"
                                                    onChange={(e) => {
                                                        updateAppSettings({ commissionRate: Number(e.target.value) });
                                                        showToast(`Sistem Komisyon Oranı: %${e.target.value} Yapıldı ✓`);
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    {/* 3. Modül: CANLI METİN EDİTÖRÜ (CMS - GENEL YAZILAR) */}
                                    <div className="bg-[#161B22]/80 backdrop-blur-md border border-white/5 rounded-2xl p-5 flex flex-col gap-4">
                                        <p className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2 italic">
                                            <Type size={14} className="text-[#FFFF00]" /> Canlı Metin Editörü (CMS)
                                        </p>
                                        <p className="text-[10px] text-gray-400">
                                            Uygulamanın ana başlıklarını, sloganlarını ve modül etiketlerini veritabanı seviyesinde canlı olarak düzenleyin.
                                        </p>

                                        <div className="flex flex-col gap-3 mt-1">
                                            <div>
                                                <label className="text-[8px] text-gray-500 font-black uppercase tracking-widest block mb-1">Ana Sayfa Başlığı</label>
                                                <input 
                                                    type="text" 
                                                    value={globalTexts.dashboardTitle || ''} 
                                                    onChange={(e) => setGlobalText('dashboardTitle', e.target.value)}
                                                    className="w-full h-9 bg-black/40 border border-white/10 rounded-lg px-3 text-xs text-white focus:outline-none focus:border-[#FFFF00]/50"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[8px] text-gray-500 font-black uppercase tracking-widest block mb-1">Hoş Geldin Sloganı</label>
                                                <input 
                                                    type="text" 
                                                    value={globalTexts.dashboardSubtitle || ''} 
                                                    onChange={(e) => setGlobalText('dashboardSubtitle', e.target.value)}
                                                    className="w-full h-9 bg-black/40 border border-white/10 rounded-lg px-3 text-xs text-white focus:outline-none focus:border-[#FFFF00]/50"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[8px] text-gray-500 font-black uppercase tracking-widest block mb-1">Taktik Stüdyo Başlığı</label>
                                                <input 
                                                    type="text" 
                                                    value={globalTexts.studioTitle || ''} 
                                                    onChange={(e) => setGlobalText('studioTitle', e.target.value)}
                                                    className="w-full h-9 bg-black/40 border border-white/10 rounded-lg px-3 text-xs text-white focus:outline-none focus:border-[#FFFF00]/50"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* 4. Modül: PARAM GATEWAY & FEATURE FLAGS */}
                                    <div className="bg-[#161B22]/80 backdrop-blur-md border border-white/5 rounded-2xl p-5 flex flex-col gap-4">
                                        <p className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2 italic">
                                            <Settings size={14} className="text-blue-400" /> Gateway & Feature Flags
                                        </p>
                                        <p className="text-[10px] text-gray-400">
                                            Param Gateway modunu ve A/B özellik modüllerini tek tıkla devreye sokun veya çıkartın.
                                        </p>

                                        <div className="flex items-center justify-between p-2.5 bg-black/30 border border-white/5 rounded-xl">
                                            <div>
                                                <span className="text-[10px] font-bold text-white uppercase">Param Ödeme Altyapısı</span>
                                                <p className="text-[8px] text-gray-500 font-mono">Mod: {appSettings.payoutMode || 'prepaid'}</p>
                                            </div>
                                            <select 
                                                value={appSettings.payoutMode || 'prepaid'}
                                                onChange={(e) => {
                                                    updateAppSettings({ payoutMode: e.target.value });
                                                    showToast(`Param Modu Güncellendi: ${e.target.value} ✓`);
                                                }}
                                                className="bg-black border border-white/10 rounded-lg px-2 py-1 text-[10px] font-black text-[#FFFF00] focus:outline-none"
                                            >
                                                <option value="prepaid">KAPORA / ÖN ÖDEME</option>
                                                <option value="online">TAM ONLINE ÖDEME</option>
                                                <option value="cash">SAHADA NAKİT</option>
                                            </select>
                                        </div>

                                        <div className="grid grid-cols-2 gap-2 mt-1">
                                            {[
                                                { key: 'tacticStudio', label: 'Taktik Stüdyo' },
                                                { key: 'motmReveal', label: 'MOTM Oylama' },
                                                { key: 'aiCoach', label: 'AI Coach Asistanı' },
                                                { key: 'scoutSystem', label: 'Scout Analizi' }
                                            ].map(flag => {
                                                const isEnabled = appSettings[flag.key] !== false;
                                                return (
                                                    <button
                                                        key={flag.key}
                                                        onClick={() => {
                                                            updateAppSettings({ ...appSettings, [flag.key]: !isEnabled });
                                                            showToast(`${flag.label} Modülü: ${!isEnabled ? 'AÇILDI ✓' : 'KAPATILDI ⚠️'}`);
                                                        }}
                                                        className={`p-2.5 rounded-xl border text-center transition-all ${isEnabled ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' : 'bg-black/30 border-white/5 text-gray-500'}`}
                                                    >
                                                        <span className="text-[10px] font-black uppercase tracking-wider block leading-none">{flag.label}</span>
                                                        <span className="text-[8px] font-bold mt-1.5 block tracking-widest">{isEnabled ? 'AKTİF' : 'DEVRE DIŞI'}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : subRoute === 'TOPLULUKLAR' ? (
                            <div className="flex-1 h-full flex gap-5 overflow-hidden">
                                {/* Left Side: Communities Search & List */}
                                <div className="w-4/12 bg-black/40 border border-white/5 rounded-3xl p-4 flex flex-col h-full backdrop-blur-md">
                                    <div className="flex items-center gap-2 mb-4">
                                        <Globe className="w-5 h-5 text-[#FFFF00]" />
                                        <h3 className="text-sm font-black uppercase italic tracking-tighter text-white">TOPLULUK SEÇİMİ</h3>
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Topluluk ara..."
                                        value={commSearch}
                                        onChange={(e) => setCommSearch(e.target.value)}
                                        className="w-full bg-[#0A0E14] border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#FFFF00] transition-colors mb-3"
                                    />
                                    <div className="flex gap-1.5 mb-3 bg-[#0A0E14] p-1 rounded-xl border border-white/5">
                                        {(['ALL', 'VERIFIED', 'INDEPENDENT'] as const).map((filter) => (
                                            <button
                                                key={filter}
                                                onClick={() => setCommFilter(filter)}
                                                className={`flex-1 text-[10px] font-bold py-1.5 rounded-lg transition-colors ${commFilter === filter ? 'bg-[#FFFF00] text-black' : 'text-gray-400 hover:text-white'}`}
                                            >
                                                {filter === 'ALL' ? 'HEPSİ' : filter === 'VERIFIED' ? 'ONAYLI' : 'BAĞIMSIZ'}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
                                        {mockCommunities
                                            .filter(c => c.name.toLowerCase().includes(commSearch.toLowerCase()))
                                            .filter(c => {
                                                if (commFilter === 'VERIFIED') return c.isVerified;
                                                if (commFilter === 'INDEPENDENT') return !c.isVerified;
                                                return true;
                                            })
                                            .map((comm, idx) => {
                                                const originalIdx = mockCommunities.findIndex(x => x.id === comm.id);
                                                const isSelected = originalIdx === selectedCommIdx;
                                                return (
                                                    <button
                                                        key={comm.id}
                                                        onClick={() => setSelectedCommIdx(originalIdx)}
                                                        className={`w-full text-left p-3 rounded-2xl border transition-all flex items-center justify-between ${isSelected ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/10 border-emerald-500/30' : 'bg-black/20 border-white/5 hover:border-white/10'}`}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <span className="text-xl">{comm.logo}</span>
                                                            <div>
                                                                <h4 className="text-xs font-black uppercase text-white tracking-wider flex items-center gap-1">
                                                                    {comm.name}
                                                                    {comm.isVerified && <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full border border-emerald-500/20">✓</span>}
                                                                </h4>
                                                                <span className="text-[10px] text-gray-500">{comm.domain}</span>
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <span className="text-[10px] font-black text-white block">{comm.memberCount} Üye</span>
                                                            <span className="text-[9px] text-[#39FF14] block mt-0.5">{comm.activeMatches} Aktif Maç</span>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                    </div>
                                </div>

                                {/* Right Side: Community control console */}
                                <div className="w-8/12 bg-black/40 border border-white/5 rounded-3xl p-5 flex flex-col h-full overflow-y-auto custom-scrollbar backdrop-blur-md">
                                    {mockCommunities[selectedCommIdx] ? (() => {
                                        const activeComm = mockCommunities[selectedCommIdx];
                                        return (
                                            <>
                                                {/* Header */}
                                                <div className="flex justify-between items-start border-b border-white/5 pb-4 mb-4">
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-3xl">{activeComm.logo}</span>
                                                            <div>
                                                                <h2 className="text-lg font-black uppercase italic tracking-tighter text-white flex items-center gap-2">
                                                                    {activeComm.name}
                                                                    {activeComm.isVerified && <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20">DOĞRULANMIŞ B2B SAAS</span>}
                                                                </h2>
                                                                <p className="text-xs text-gray-400 mt-0.5">Topluluk Alan Adı: <span className="text-emerald-400 font-bold">{activeComm.domain}</span></p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="bg-[#0A0E14] border border-white/5 p-2 rounded-xl text-right">
                                                        <span className="text-[9px] text-gray-500 uppercase font-black block">Toplam Güç Oranı</span>
                                                        <span className="text-sm font-black italic text-[#FFFF00] uppercase tracking-tighter">⚡ PURE ATHLETIC</span>
                                                    </div>
                                                </div>

                                                {/* Modül Yetki Matrisi (Feature Flags) */}
                                                <div className="mb-5 bg-[#0A0E14]/40 border border-white/5 rounded-2xl p-4">
                                                    <h3 className="text-xs font-black uppercase italic tracking-widest text-[#FFFF00] mb-3">🔁 B2B SaaS Yetkilendirmeleri</h3>
                                                    <div className="grid grid-cols-2 gap-3">
                                                        {[
                                                            { key: 'transferMarket' as const, label: 'Transfer Pazarı Modülü', desc: 'Topluluk içi takas & transfer tekliflerini açar.' },
                                                            { key: 'leaderboards' as const, label: 'Liderlik Sıralaması', desc: 'Elo puan tablosunu & oyuncu kartlarını aktif eder.' },
                                                            { key: 'tournaments' as const, label: 'Turnuva Motoru', desc: 'Braket eşleşmelerini ve lig altyapısını başlatır.' },
                                                            { key: 'fairPlayStrict' as const, label: 'Strict Fair-Play', desc: 'Kart cezalarında ve maç iptallerinde katı mod.' }
                                                        ].map((mod) => {
                                                            const isEnabled = activeComm.modules[mod.key];
                                                            return (
                                                                <button
                                                                    key={mod.key}
                                                                    onClick={() => handleToggleCommModule(activeComm.id, mod.key)}
                                                                    className={`p-3 rounded-xl border text-left flex justify-between items-center transition-all gap-4 min-w-0 ${isEnabled ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-black/30 border-white/5 text-gray-500'}`}
                                                                >
                                                                    <div className="min-w-0 flex-1">
                                                                        <span className="text-[11px] font-black uppercase block truncate text-white">{mod.label}</span>
                                                                        <span className="text-[9px] text-gray-400 mt-0.5 block truncate" title={mod.desc}>{mod.desc}</span>
                                                                    </div>
                                                                    <div className={`w-9 h-5 rounded-full p-0.5 transition-colors flex-shrink-0 ${isEnabled ? 'bg-[#39FF14]' : 'bg-gray-700'} flex items-center`}>
                                                                        <div className={`w-4 h-4 bg-black rounded-full transform transition-transform ${isEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                                                                    </div>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>

                                                {/* Topluluk Takımları */}
                                                <div className="mb-5">
                                                    <div className="flex justify-between items-center mb-3">
                                                        <h3 className="text-xs font-black uppercase italic tracking-widest text-white">🛡️ Topluluk Takımları ({activeComm.teams.length})</h3>
                                                        <button
                                                            onClick={() => {
                                                                const teamName = prompt('Yeni takım adı girin:');
                                                                if (teamName) {
                                                                    setMockCommunities(prev => prev.map(c => {
                                                                        if (c.id !== activeComm.id) return c;
                                                                        const newTeam = {
                                                                            id: `t_${Date.now()}`,
                                                                            name: teamName,
                                                                            color: 'bg-emerald-500',
                                                                            wins: 0,
                                                                            losses: 0,
                                                                            fp: 100,
                                                                            playersCount: 0,
                                                                            formation: '6+1'
                                                                        };
                                                                        return { ...c, teams: [...c.teams, newTeam] };
                                                                    }));
                                                                    showToast(`${teamName} takımı oluşturuldu! ✓`);
                                                                }
                                                            }}
                                                            className="text-[10px] font-black text-[#FFFF00] bg-yellow-400/10 border border-yellow-400/20 px-2 py-1 rounded-lg uppercase tracking-wider hover:bg-yellow-400/20"
                                                        >
                                                            + Yeni Takım Ekle
                                                        </button>
                                                    </div>
                                                    <div className="grid grid-cols-3 gap-3">
                                                        {activeComm.teams.map((team) => (
                                                            <div key={team.id} className="bg-black/20 border border-white/5 p-3 rounded-2xl flex flex-col justify-between">
                                                                <div className="flex items-center gap-2">
                                                                    <span className={`w-3 h-3 rounded-full ${team.color}`} />
                                                                    <span className="text-[11px] font-black text-white uppercase tracking-wider">{team.name}</span>
                                                                </div>
                                                                <div className="mt-3 flex justify-between text-[9px] text-gray-500 font-bold uppercase">
                                                                    <span>G/M: {team.wins}/{team.losses}</span>
                                                                    <span className="text-[#39FF14]">FP: {team.fp}</span>
                                                                    <span>Kadro: {team.playersCount}</span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Oyuncular & Canlı Transfer Kontrol Paneli */}
                                                <div className="mb-5 bg-gradient-to-br from-[#161B22]/60 to-black/30 border border-white/5 rounded-3xl p-5">
                                                    <div className="flex justify-between items-center mb-4 pb-2 border-b border-white/5">
                                                        <div className="flex items-center gap-2">
                                                            <Users className="w-5 h-5 text-[#FFFF00]" />
                                                            <h3 className="text-xs font-black uppercase italic tracking-widest text-white">🏃 Topluluk Oyuncuları & Kadro Planlama ({activeComm.players.length})</h3>
                                                        </div>
                                                        
                                                        {/* Add Real Application User to Community */}
                                                        <div className="flex gap-2">
                                                            <button
                                                                onClick={() => {
                                                                    const unassignedUsers = adminUsers.filter(u => !activeComm.players.some(p => p.id === u.id));
                                                                    if (unassignedUsers.length === 0) {
                                                                        showToast('Tüm kayıtlı uygulama kullanıcıları zaten üye! ✓');
                                                                        return;
                                                                    }
                                                                    const userListStr = unassignedUsers.map((u, i) => `${i + 1}- ${u.name} (${u.role})`).join('\n');
                                                                    const selection = prompt(`Topluluğa eklenecek kullanıcı numarasını girin:\n\n${userListStr}`);
                                                                    if (selection) {
                                                                        const idx = parseInt(selection) - 1;
                                                                        const selectedUser = unassignedUsers[idx];
                                                                        if (selectedUser) {
                                                                            const pos = prompt(`Oyuncu mevkisini seçin (KL, STP, OS, SNT):`, 'OS');
                                                                            if (pos) {
                                                                                handleAddNewPlayerToCommunity(activeComm.id, selectedUser.id, pos.toUpperCase());
                                                                            }
                                                                        }
                                                                    }
                                                                }}
                                                                className="text-[10px] font-black text-[#39FF14] bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1.5 rounded-xl uppercase tracking-wider hover:bg-emerald-500/20 transition-all flex items-center gap-1.5"
                                                            >
                                                                ➕ Uygulama Oyuncusu Ekle
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Advanced Filters Dashboard */}
                                                    <div className="bg-black/30 border border-white/5 rounded-2xl p-3.5 mb-4 grid grid-cols-4 gap-3">
                                                        {/* Text Search */}
                                                        <div>
                                                            <label className="text-[8px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Oyuncu Ara</label>
                                                            <input
                                                                type="text"
                                                                placeholder="İsim ile ara..."
                                                                value={playerSearch}
                                                                onChange={(e) => setPlayerSearch(e.target.value)}
                                                                className="w-full bg-[#0A0E14] border border-white/10 rounded-xl px-3 py-1.5 text-[10px] text-white focus:outline-none focus:border-[#FFFF00]"
                                                            />
                                                        </div>

                                                        {/* Position Filter */}
                                                        <div>
                                                            <label className="text-[8px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Mevki</label>
                                                            <select
                                                                value={playerPositionFilter}
                                                                onChange={(e) => setPlayerPositionFilter(e.target.value as any)}
                                                                className="w-full bg-[#0A0E14] border border-white/10 rounded-xl px-2 py-1.5 text-[10px] text-white focus:outline-none focus:border-[#FFFF00]"
                                                            >
                                                                <option value="ALL">HEPSİ (Tümü)</option>
                                                                <option value="KL">KL (Kaleci)</option>
                                                                <option value="STP">STP (Stoper)</option>
                                                                <option value="OS">OS (Orta Saha)</option>
                                                                <option value="SNT">SNT (Santrfor)</option>
                                                            </select>
                                                        </div>

                                                        {/* Minimum FP Slider */}
                                                        <div>
                                                            <label className="text-[8px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Min Fair Play (FP): {playerFpFilter > 0 ? `%${playerFpFilter}` : 'Tümü'}</label>
                                                            <input
                                                                type="range"
                                                                min="0"
                                                                max="100"
                                                                value={playerFpFilter}
                                                                onChange={(e) => setPlayerFpFilter(parseInt(e.target.value))}
                                                                className="w-full accent-[#FFFF00] bg-[#0A0E14] rounded-lg mt-2 cursor-pointer h-1"
                                                            />
                                                        </div>

                                                        {/* Sort Options */}
                                                        <div>
                                                            <label className="text-[8px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Sıralama</label>
                                                            <select
                                                                value={playerSortBy}
                                                                onChange={(e) => setPlayerSortBy(e.target.value as any)}
                                                                className="w-full bg-[#0A0E14] border border-white/10 rounded-xl px-2 py-1.5 text-[10px] text-white focus:outline-none focus:border-[#FFFF00]"
                                                            >
                                                                <option value="FP_DESC">Fair Play (Yüksek ➔ Düşük)</option>
                                                                <option value="NAME_ASC">İsim (A-Z)</option>
                                                            </select>
                                                        </div>
                                                    </div>

                                                    {/* FUT Glassmorphic Cards Grid */}
                                                    <div className="grid grid-cols-4 gap-3 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                                                        {activeComm.players
                                                            .filter(p => p.name.toLowerCase().includes(playerSearch.toLowerCase()))
                                                            .filter(p => playerPositionFilter === 'ALL' || p.position === playerPositionFilter)
                                                            .filter(p => p.fp >= playerFpFilter)
                                                            .sort((a, b) => {
                                                                if (playerSortBy === 'FP_DESC') return b.fp - a.fp;
                                                                return a.name.localeCompare(b.name);
                                                            })
                                                            .map((player) => {
                                                                const fpVal = player.fp;
                                                                // FUT Card color scheme depending on Fair Play score
                                                                const isElite = fpVal >= 95;
                                                                const isGold = fpVal >= 85 && fpVal < 95;
                                                                const cardBorder = isElite ? 'border-[#39FF14]/40 shadow-[0_0_10px_rgba(57,255,20,0.15)]' : isGold ? 'border-yellow-400/30' : 'border-white/5';
                                                                const ratingColor = isElite ? 'text-[#39FF14]' : isGold ? 'text-yellow-400' : 'text-gray-400';

                                                                return (
                                                                    <div key={player.id} className={`bg-black/60 border ${cardBorder} rounded-2xl p-2.5 flex flex-col justify-between h-44 relative group overflow-hidden transition-all duration-300 hover:scale-[1.03] hover:border-[#FFFF00]/30`}>
                                                                        {/* Ambient gloss overlay */}
                                                                        <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />

                                                                        {/* Card Top: FP & Position & Remove Button */}
                                                                        <div className="flex justify-between items-start z-10">
                                                                            <div className="flex flex-col leading-none">
                                                                                <span className={`text-sm font-black italic ${ratingColor} tracking-tighter`}>{fpVal}%</span>
                                                                                <span className="text-[7px] font-black text-gray-500 uppercase tracking-wider mt-0.5">{player.position}</span>
                                                                            </div>
                                                                            <div className="flex items-center gap-1">
                                                                                <span className="text-sm">{player.avatar || '🏃'}</span>
                                                                                <button
                                                                                    onClick={() => handleRemovePlayerFromCommunity(activeComm.id, player.id)}
                                                                                    className="w-4 h-4 rounded-full bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white transition-colors flex items-center justify-center text-[8px] font-bold"
                                                                                    title="Topluluktan Çıkar"
                                                                                >
                                                                                    ✕
                                                                                </button>
                                                                            </div>
                                                                        </div>

                                                                        {/* Card Center: Player Name */}
                                                                        <div className="text-center my-1 z-10 border-y border-white/5 py-1">
                                                                            <h4 className="text-[9px] font-black uppercase text-white tracking-wider truncate">{player.name}</h4>
                                                                        </div>

                                                                        {/* Card Stats Grid */}
                                                                        <div className="grid grid-cols-2 gap-1 text-[7px] font-bold text-gray-500 uppercase tracking-widest text-center z-10 leading-none">
                                                                            <div className="border-r border-white/5">
                                                                                <span className="block text-white font-black mb-0.5">{isElite ? 'ELİTE' : isGold ? 'GOLD' : 'PRO'}</span>
                                                                                <span>SINIF</span>
                                                                            </div>
                                                                            <div>
                                                                                <span className="block text-[#39FF14] font-black mb-0.5">{fpVal}</span>
                                                                                <span>FAİR PLAY</span>
                                                                            </div>
                                                                        </div>

                                                                        {/* Card Bottom: Interactive Live Transfer Dropdown */}
                                                                        <div className="mt-2.5 z-10">
                                                                            <select
                                                                                value={player.team || ''}
                                                                                onChange={(e) => handleTransferPlayer(activeComm.id, player.id, e.target.value)}
                                                                                className="w-full bg-[#0A0E14] border border-white/10 rounded-lg py-1 px-1.5 text-[8px] font-black text-gray-400 hover:text-white focus:outline-none focus:border-[#FFFF00] transition-colors"
                                                                            >
                                                                                <option value="">🏃 SERBEST OYUNCU</option>
                                                                                {activeComm.teams.map((t) => (
                                                                                    <option key={t.id} value={t.name}>🛡️ {t.name.toUpperCase()}</option>
                                                                                ))}
                                                                            </select>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        {activeComm.players.length === 0 && (
                                                            <div className="col-span-4 text-center py-8 text-gray-500 text-xs font-bold uppercase border border-dashed border-white/5 rounded-2xl">
                                                                Bu topluluğa kayıtlı üye bulunmamaktadır.
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>


                                                {/* Turnuva & Bracket Kontrolü */}
                                                <div>
                                                    <div className="flex justify-between items-center mb-3">
                                                        <h3 className="text-xs font-black uppercase italic tracking-widest text-white">🏆 Turnuvalar & Bracket Motoru</h3>
                                                        <button
                                                            onClick={() => {
                                                                const tourTitle = prompt('Turnuva adı girin:');
                                                                if (tourTitle) handleAddNewTournament(activeComm.id, tourTitle);
                                                            }}
                                                            className="text-[10px] font-black text-[#FFFF00] bg-yellow-400/10 border border-yellow-400/20 px-2 py-1 rounded-lg uppercase tracking-wider hover:bg-yellow-400/20"
                                                        >
                                                            + Yeni Turnuva Oluştur
                                                        </button>
                                                    </div>

                                                    {activeComm.tournaments.length === 0 ? (
                                                        <div className="text-center py-6 bg-black/20 border border-dashed border-white/5 rounded-2xl text-xs text-gray-500 font-bold uppercase tracking-wider">
                                                            Aktif turnuva bulunmamaktadır.
                                                        </div>
                                                    ) : (
                                                        activeComm.tournaments.map((tour) => (
                                                            <div key={tour.id} className="bg-black/20 border border-white/5 p-4 rounded-2xl mb-3">
                                                                <div className="flex justify-between items-center mb-4 border-b border-white/5 pb-2">
                                                                    <div>
                                                                        <h4 className="text-xs font-black uppercase italic text-[#FFFF00] tracking-wider">{tour.title}</h4>
                                                                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">DURUM: {tour.status === 'PLAYING' ? 'DEVAM EDİYOR' : 'TAMAMLANDI'}</span>
                                                                    </div>
                                                                    {tour.winnerTeamId ? (
                                                                        <div className="bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[10px] font-black px-3 py-1 rounded-lg uppercase tracking-widest">
                                                                            🏆 ŞAMPİYON: {tour.winnerTeamId}
                                                                        </div>
                                                                    ) : (
                                                                        <span className="text-[9px] text-[#39FF14] bg-emerald-500/10 px-2 py-0.5 rounded-full font-bold">BRACKET AKTİF</span>
                                                                    )}
                                                                </div>

                                                                {/* Tree Diagram Bracket */}
                                                                <div className="flex gap-4 items-center justify-center py-4 bg-[#0A0E14]/40 border border-white/5 rounded-xl">
                                                                    {tour.brackets.map((stage, sIdx) => (
                                                                        <div key={sIdx} className="flex flex-col gap-4">
                                                                            <span className="text-[8px] font-black tracking-widest uppercase text-center text-gray-500 block">{stage.round}</span>
                                                                            <div className="flex flex-col gap-3">
                                                                                {stage.matches.map((bm) => (
                                                                                    <div
                                                                                        key={bm.id}
                                                                                        className={`bg-black/60 border rounded-xl p-3 w-44 transition-all relative ${bm.winner ? 'border-emerald-500/30 shadow-[0_0_10px_rgba(57,255,20,0.1)]' : 'border-white/5 hover:border-white/10'}`}
                                                                                    >
                                                                                        <div className="flex justify-between items-center text-[10px] font-black text-white uppercase tracking-wider mb-1.5">
                                                                                            <span className={bm.winner === bm.homeTeam ? 'text-emerald-400 font-bold' : ''}>{bm.homeTeam || 'Bekleniyor...'}</span>
                                                                                            <span>{bm.homeScore !== undefined ? bm.homeScore : '-'}</span>
                                                                                        </div>
                                                                                        <div className="flex justify-between items-center text-[10px] font-black text-white uppercase tracking-wider">
                                                                                            <span className={bm.winner === bm.awayTeam ? 'text-emerald-400 font-bold' : ''}>{bm.awayTeam || 'Bekleniyor...'}</span>
                                                                                            <span>{bm.awayScore !== undefined ? bm.awayScore : '-'}</span>
                                                                                        </div>

                                                                                        {/* Score set trigger */}
                                                                                        {!bm.winner && bm.homeTeam && bm.awayTeam && (
                                                                                            <button
                                                                                                onClick={() => {
                                                                                                    const hS = prompt(`${bm.homeTeam} skoru:`);
                                                                                                    const aS = prompt(`${bm.awayTeam} skoru:`);
                                                                                                    if (hS !== null && aS !== null) {
                                                                                                        handleSetBracketScore(activeComm.id, tour.id, stage.round, bm.id, parseInt(hS), parseInt(aS));
                                                                                                    }
                                                                                                }}
                                                                                                className="w-full text-center text-[8px] font-black text-[#FFFF00] bg-yellow-400/10 border border-yellow-400/20 py-1 rounded-md mt-2 uppercase tracking-wider hover:bg-[#FFFF00] hover:text-black transition-colors"
                                                                                            >
                                                                                                Skor Gir & Tescil Et
                                                                                            </button>
                                                                                        )}
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            </>
                                        );
                                    })() : (
                                        <div className="text-center py-12 text-gray-500 text-xs font-bold uppercase">Topluluk Seçilmedi.</div>
                                    )}
                                </div>
                            </div>
                        ) : subRoute === 'TAKIMLAR' ? (
                            <div className="flex-1 h-full flex gap-5 overflow-hidden">
                                {/* Left Side: Teams list */}
                                <div className="w-4/12 bg-black/40 border border-white/5 rounded-3xl p-4 flex flex-col h-full backdrop-blur-md">
                                    <div className="flex items-center gap-2 mb-4">
                                        <Users className="w-5 h-5 text-[#FFFF00]" />
                                        <h3 className="text-sm font-black uppercase italic tracking-tighter text-white">TAKIM YÖNETİMİ</h3>
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Takım ara..."
                                        value={teamSearch}
                                        onChange={(e) => setTeamSearch(e.target.value)}
                                        className="w-full bg-[#0A0E14] border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#FFFF00] transition-colors mb-3"
                                    />
                                    <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
                                        {mockCommunities
                                            .flatMap((c) => c.teams.map(t => ({ ...t, communityName: c.name, logo: c.logo })))
                                            .filter(t => t.name.toLowerCase().includes(teamSearch.toLowerCase()))
                                            .map((team) => {
                                                const allTeams = mockCommunities.flatMap((c) => c.teams.map(t => ({ ...t, communityName: c.name, logo: c.logo })));
                                                const originalIdx = allTeams.findIndex(x => x.id === team.id);
                                                const isSelected = originalIdx === selectedTeamIdx;
                                                return (
                                                    <button
                                                        key={team.id}
                                                        onClick={() => setSelectedTeamIdx(originalIdx)}
                                                        className={`w-full text-left p-3 rounded-2xl border transition-all flex items-center justify-between ${isSelected ? 'bg-gradient-to-r from-yellow-500/20 to-amber-500/10 border-yellow-500/30' : 'bg-black/20 border-white/5 hover:border-white/10'}`}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <span className={`w-3 h-3 rounded-full ${team.color}`} />
                                                            <div>
                                                                <h4 className="text-xs font-black uppercase text-white tracking-wider">{team.name}</h4>
                                                                <span className="text-[9px] text-gray-500 uppercase">{team.logo} {team.communityName}</span>
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <span className="text-[10px] font-black text-white block">FP: {team.fp}</span>
                                                            <span className="text-[9px] text-gray-400 block mt-0.5">{team.formation} Form.</span>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                    </div>
                                </div>

                                {/* Right Side: Team Detail & Tactical Pitch View */}
                                <div className="w-8/12 bg-black/40 border border-white/5 rounded-3xl p-5 flex flex-col h-full overflow-y-auto custom-scrollbar backdrop-blur-md">
                                    {(() => {
                                        const allTeams = mockCommunities.flatMap((c) => c.teams.map(t => ({ ...t, communityId: c.id, communityName: c.name, logo: c.logo, players: c.players })));
                                        const activeTeam = allTeams[selectedTeamIdx];
                                        if (!activeTeam) return <div className="text-center py-12 text-gray-500 text-xs font-bold uppercase">Takım Seçilmedi.</div>;

                                        const roster = activeTeam.players.filter(p => p.team === activeTeam.name);
                                        const positions = getFormationPositions(activeTeam.formation, roster);

                                        return (
                                            <>
                                                {/* Header */}
                                                <div className="flex justify-between items-start border-b border-white/5 pb-4 mb-4">
                                                    <div className="flex items-center gap-3">
                                                        <span className={`w-5 h-5 rounded-full ${activeTeam.color}`} />
                                                        <div>
                                                            <h2 className="text-lg font-black uppercase italic tracking-tighter text-white flex items-center gap-2">
                                                                {activeTeam.name}
                                                                <span className="text-xs bg-yellow-400/20 text-yellow-400 px-2 py-0.5 rounded-full border border-yellow-400/20 uppercase tracking-widest font-black">{activeTeam.formation}</span>
                                                            </h2>
                                                            <p className="text-xs text-gray-400 mt-0.5">Topluluk: <span className="text-[#FFFF00] font-bold">{activeTeam.logo} {activeTeam.communityName}</span></p>
                                                        </div>
                                                    </div>
                                                    <div className="bg-[#0A0E14] border border-white/5 p-2 rounded-xl text-right">
                                                        <span className="text-[9px] text-gray-500 uppercase font-black block">Takım İstatistikleri</span>
                                                        <span className="text-sm font-black italic text-[#39FF14] uppercase tracking-tighter">{activeTeam.wins} G - {activeTeam.losses} M</span>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-5 mb-5 flex-1">
                                                    {/* Tactical Pitch View */}
                                                    <div className="bg-[#0c1c13] border border-emerald-500/20 rounded-2xl p-4 relative h-[380px] overflow-hidden flex flex-col justify-between">
                                                        {/* Pitch Lines */}
                                                        <div className="absolute inset-2 border border-white/10 rounded-xl pointer-events-none flex flex-col justify-between">
                                                            <div className="h-1/2 border-b border-white/10 flex items-end justify-center relative">
                                                                <div className="w-20 h-10 border border-white/10 border-t-0 rounded-b-xl absolute top-0" />
                                                                <div className="w-8 h-8 rounded-full border border-white/10 translate-y-4" />
                                                            </div>
                                                            <div className="h-1/2 relative flex justify-center">
                                                                <div className="w-20 h-10 border border-white/10 border-b-0 rounded-t-xl absolute bottom-0" />
                                                            </div>
                                                        </div>

                                                        {/* Player Positions */}
                                                        {positions.map((pos, idx) => (
                                                            <div
                                                                key={idx}
                                                                style={{ position: 'absolute', top: pos.coords.top, left: pos.coords.left, transform: 'translate(-50%, -50%)' }}
                                                                className="flex flex-col items-center z-10"
                                                            >
                                                                <div className="w-8 h-8 bg-black border border-[#39FF14] rounded-full flex items-center justify-center shadow-[0_0_10px_rgba(57,255,20,0.3)]">
                                                                    <span className="text-[9px] font-black text-[#39FF14]">{pos.position}</span>
                                                                </div>
                                                                <div className="bg-black/80 border border-white/10 px-1.5 py-0.5 rounded-md mt-1 backdrop-blur-md max-w-[80px] truncate text-center">
                                                                    <span className="text-[8px] font-bold text-white uppercase block tracking-wider leading-none">{pos.name}</span>
                                                                </div>
                                                            </div>
                                                        ))}

                                                        <div className="z-10 bg-black/60 backdrop-blur-md border border-white/5 p-2 rounded-xl text-center self-end w-full">
                                                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">SAHA TAKTİK ANALİZÖRÜ</span>
                                                        </div>
                                                    </div>

                                                    {/* Roster & Squad settings */}
                                                    <div className="bg-black/20 border border-white/5 rounded-2xl p-4 flex flex-col justify-between">
                                                        <div>
                                                            <h3 className="text-xs font-black uppercase italic tracking-widest text-[#FFFF00] mb-3">🛡️ Takım Kadrosu ({roster.length} Oyuncu)</h3>
                                                            <div className="space-y-2 max-h-[260px] overflow-y-auto custom-scrollbar">
                                                                {roster.map((player) => (
                                                                    <div key={player.id} className="bg-black/40 border border-white/5 p-2.5 rounded-xl flex items-center justify-between">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-[10px] font-black bg-yellow-400/20 text-yellow-400 px-1.5 py-0.5 rounded-md">{player.position}</span>
                                                                            <span className="text-xs font-bold text-white uppercase">{player.name}</span>
                                                                        </div>
                                                                        <span className="text-[9px] text-[#39FF14] font-black">FP: {player.fp}</span>
                                                                    </div>
                                                                ))}
                                                                {roster.length === 0 && (
                                                                    <p className="text-xs text-gray-500 font-bold uppercase text-center py-6">Kadroda oyuncu bulunamadı.</p>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Formation and general setting changer */}
                                                        <div className="mt-4 pt-3 border-t border-white/5">
                                                            <span className="text-[9px] text-gray-500 font-black uppercase tracking-widest block mb-2">Taktiksel Diziliş Değiştir</span>
                                                            <div className="flex gap-2">
                                                                {['5+1', '6+1', '7+1'].map((form) => (
                                                                    <button
                                                                        key={form}
                                                                        onClick={() => {
                                                                            setMockCommunities(prev => prev.map(c => {
                                                                                if (c.id !== activeTeam.communityId) return c;
                                                                                const updatedTeams = c.teams.map(t => {
                                                                                    if (t.id !== activeTeam.id) return t;
                                                                                    return { ...t, formation: form };
                                                                                });
                                                                                return { ...c, teams: updatedTeams };
                                                                            }));
                                                                            showToast(`Taktiksel diziliş ${form} olarak güncellendi! ⚽`);
                                                                        }}
                                                                        className={`flex-1 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider border transition-all ${activeTeam.formation === form ? 'bg-[#FFFF00] text-black border-[#FFFF00]' : 'bg-black/40 border-white/10 text-gray-400 hover:text-white'}`}
                                                                    >
                                                                        {form}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>
                        ) : subRoute === 'TURNUVALAR' ? (
                            <div className="flex-1 h-full overflow-y-auto custom-scrollbar bg-black/20 p-4 rounded-xl border border-white/5 flex flex-col">
                                <div className="flex justify-between items-center mb-5">
                                    <div className="flex items-center gap-2">
                                        <Trophy className="w-6 h-6 text-[#FFFF00] animate-pulse" />
                                        <div>
                                            <h2 className="text-lg font-black uppercase italic tracking-tighter text-white">OYNA GLOBAL TURNUVALAR</h2>
                                            <p className="text-xs text-gray-400 mt-0.5">Topluluklarda devam eden aktif turnuvalar ve B2B SaaS altyapısı.</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    {mockCommunities.flatMap((c) => c.tournaments.map(t => ({ ...t, communityName: c.name, logo: c.logo, communityId: c.id }))).map((tour) => (
                                        <div key={tour.id} className="bg-[#161B22]/80 border border-white/5 p-4 rounded-3xl flex flex-col justify-between backdrop-blur-md">
                                            <div>
                                                <div className="flex justify-between items-start mb-3 border-b border-white/5 pb-2">
                                                    <div>
                                                        <h3 className="text-sm font-black uppercase italic tracking-wider text-white">{tour.title}</h3>
                                                        <span className="text-[9px] text-[#FFFF00] font-bold uppercase tracking-widest">{tour.logo} {tour.communityName}</span>
                                                    </div>
                                                    <span className={`text-[8px] font-black px-2 py-0.5 rounded-full ${tour.status === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-yellow-400/20 text-yellow-400'}`}>
                                                        {tour.status === 'COMPLETED' ? 'TAMAMLANDI' : 'DEVAM EDİYOR'}
                                                    </span>
                                                </div>

                                                <div className="space-y-2 mt-4">
                                                    <span className="text-[8px] font-black text-gray-500 tracking-widest uppercase block mb-1">EŞLEŞMELER</span>
                                                    {tour.brackets.flatMap(b => b.matches).map((m) => (
                                                        <div key={m.id} className="bg-black/60 border border-white/5 p-2 rounded-xl flex items-center justify-between text-[10px] font-bold text-white uppercase tracking-wider">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className={m.winner === m.homeTeam ? 'text-emerald-400 font-black' : ''}>{m.homeTeam || 'Bekleniyor...'}</span>
                                                                <span className="text-gray-500">vs</span>
                                                                <span className={m.winner === m.awayTeam ? 'text-emerald-400 font-black' : ''}>{m.awayTeam || 'Bekleniyor...'}</span>
                                                            </div>
                                                            <div className="bg-[#0A0E14] px-2 py-0.5 rounded-md border border-white/5 font-black">
                                                                {m.homeScore !== undefined ? `${m.homeScore} - ${m.awayScore}` : 'Oynanmadı'}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {tour.winnerTeamId && (
                                                <div className="mt-4 bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-xl flex items-center gap-2">
                                                    <Award className="w-5 h-5 text-emerald-400" />
                                                    <div>
                                                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block leading-none">ŞAMPİYON TESCİLİ</span>
                                                        <span className="text-xs font-black text-emerald-400 uppercase tracking-wider mt-1 block">{tour.winnerTeamId} ✓</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    {mockCommunities.flatMap((c) => c.tournaments).length === 0 && (
                                        <div className="col-span-2 py-12 text-center text-gray-500 text-xs font-bold uppercase border border-dashed border-white/5 rounded-3xl">
                                            Sistemde kayıtlı aktif turnuva bulunmamaktadır.
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : subRoute === 'MATCHES' ? (
                            <div className="flex-1 h-full overflow-y-auto custom-scrollbar bg-black/20 p-4 rounded-xl border border-white/5"><MatchesTab /></div>
                        ) : subRoute === 'NOTIFICATIONS' ? (
                            <div className="flex-1 h-full overflow-y-auto custom-scrollbar bg-black/20 p-4 rounded-xl border border-white/5"><NotificationsTab /></div>
                        ) : subRoute === 'CONTENT' ? (
                            <div className="flex-1 h-full overflow-y-auto custom-scrollbar bg-black/20 p-4 rounded-xl border border-white/5"><ContentTab /></div>
                        ) : subRoute === 'SETTINGS' ? (
                            <div className="flex-1 h-full overflow-y-auto custom-scrollbar bg-black/20 p-4 rounded-xl border border-white/5"><SettingsTab /></div>
                        ) : (
                            <div className="flex-1 h-[600px]">
                                <GodViewDataTables
                                    activeTab={subRoute as 'SAHALAR' | 'KULLANICILAR' | 'KALECİLER' | 'HAKEMLER'}
                                    onEditPitch={(pitch) => setModal({ type: 'deepEditPitch', data: pitch })}
                                    onEditUser={(user) => setModal({ type: 'deepEditUser', data: user })}
                                    onEditGk={(gk) => setModal({ type: 'deepEditProvider', typeParam: 'GK', data: gk })}
                                    onEditRef={(ref) => setModal({ type: 'deepEditProvider', typeParam: 'REF', data: ref })}
                                    onDeletePitch={fbDeletePitch}
                                    onDeleteUser={fbDeleteUser}
                                    onDeleteGk={() => showToast('Gk deletion coming soon')}
                                    onDeleteRef={() => showToast('Ref deletion coming soon')}
                                    onAddPitch={() => setModal({ type: 'addPitch' })}
                                />
                            </div>
                        )}
                    </div>
                </main>
            </div>

            {/* ── Toast ─────────────────────────────────────────────────── */}
            <AnimatePresence>
                {
                    toast && (
                        <motion.div initial={{ opacity: 0, y: 20, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }} exit={{ opacity: 0 }}
                            className="fixed bottom-6 left-1/2 bg-[#1e2430] border border-green-500/30 text-green-300 text-xs font-black px-5 py-2.5 rounded-full shadow-2xl backdrop-blur z-50 flex items-center gap-2">
                            <Zap size={12} className="text-green-400" /> {toast}
                        </motion.div>
                    )
                }
            </AnimatePresence >

            {/* ── Modals ────────────────────────────────────────────────── */}
            <AnimatePresence>
                {modal.type === 'pitch' && <PitchModal pitch={modal.data} onClose={closeModal} onNavigate={nav} />}
                {
                    modal.type === 'match' && (
                        <MatchModal
                            match={modal.data}
                            onClose={closeModal}
                            onNavigate={nav}
                            onPush={() => setModal({ type: 'push', target: modal.data.pitch })}
                            onAddPlayer={() => setModal({ type: 'addPlayer', matchId: modal.data.id })}
                            onDelete={() => { deleteMatch(modal.data.matchId); showToast('Maç silindi'); closeModal(); }}
                        />
                    )
                }
                {modal.type === 'ban' && <BanModal userId={modal.userId!} userName={modal.userName!} onClose={() => { closeModal(); showToast(`${modal.userName} banlandı`); }} />}
                {modal.type === 'push' && <PushModal target={modal.target!} onClose={closeModal} />}
                {modal.type === 'addPlayer' && <AddPlayerModal matchId={modal.matchId!} onClose={closeModal} />}
                {modal.type === 'contact' && <ContactModal pitchName={modal.pitchName!} onClose={closeModal} />}
                {modal.type === 'log' && <LogModal onClose={closeModal} />}
                {modal.type === 'revenue' && <RevenueModal onClose={closeModal} />}
                {
                    modal.type === 'more' && modal.data && (
                        <MoreMenu
                            matchId={modal.data.id}
                            onClose={closeModal}
                            onNavigate={nav}
                            onDelete={() => { deleteMatch(modal.data.matchId); showToast('Maç silindi'); closeModal(); }}
                            onPush={() => setModal({ type: 'push', target: modal.data.pitch })}
                        />
                    )
                }
                {modal.type === 'deepEditPitch' && <DeepEditPitchModal pitch={modal.data} onClose={closeModal} />}
                {modal.type === 'deepEditUser' && <DeepEditUserModal user={modal.data} onClose={closeModal} />}
                {modal.type === 'deepEditProvider' && <DeepEditProviderModal item={modal.data} typeParam={modal.typeParam!} onClose={closeModal} />}
                {modal.type === 'addPitch' && <AddPitchModal onClose={closeModal} />}
            </AnimatePresence >
        </div >
    );
};

export default GodViewPanel;
