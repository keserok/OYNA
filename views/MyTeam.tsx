
import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Share2, X, UserPlus, Trash2, Shield, Swords, Activity, CheckCircle2, Plus, Users, Zap, Layout, GripHorizontal, Heart, MessageCircle, Crown, Star, Copy, Send, Archive, LogOut, ShieldCheck, Loader2, Trophy } from 'lucide-react';
import { Player, AppView, UserRole } from '../types';
import { getTeamRolesAndInstructions, updateTeamRolesAndInstructions, sbRemovePlayerFromTeam, supabase } from '../supabaseClient';
import { useAppStore } from '../store';
import { withDefaultPositions, fetchTeamMatchHistory, TeamMatchRow } from '../services/teamService';
import {
    getTeamTacticsShowcase, voteTactic, commentTactic, getTacticComments,
    toggleTacticFavorite, setActiveTactic, copyTactic,
    TacticShowcaseItem, TacticComment,
} from '../services/tacticSocialService';
import {
    transferCaptaincy, setTeamAdmin, leaveTeam, archiveTeam,
} from '../services/teamAdminService';
import { auth } from '../supabaseAuth';
import { motion, AnimatePresence, Reorder } from 'framer-motion';

type MyTeamTab = 'GENEL' | 'KADRO' | 'TAKTIKLER' | 'GECMIS';
const RESULT_STYLE: Record<string, string> = {
    G: 'bg-emerald-500 text-white',
    B: 'bg-amber-500 text-white',
    M: 'bg-red-500 text-white',
};
interface MyTeamProps {
    onBack: () => void;
    onNavigate: (view: AppView) => void;
}

// ─── FAZ 6: Taktik vitrini kartı ────────────────────────────────────────────
const TacticShowcaseCard: React.FC<{
    item: TacticShowcaseItem;
    canManage: boolean;
    onVote: (id: string, percent: number) => void;
    onFavorite: (id: string) => void;
    onSetActive: (id: string) => void;
    onCopy: (id: string) => void;
    onOpen: (id: string) => void;
}> = ({ item, canManage, onVote, onFavorite, onSetActive, onCopy, onOpen }) => {
    const [voteVal, setVoteVal] = useState<number>(item.my_vote ?? 50);
    useEffect(() => { setVoteVal(item.my_vote ?? 50); }, [item.my_vote]);

    return (
        <div
            className={`bg-[#161B22] rounded-[24px] p-4 border transition-colors ${
                item.is_active
                    ? 'border-[#39FF14]/50 shadow-[0_0_18px_rgba(57,255,20,0.1)]'
                    : 'border-white/5 hover:border-white/15'
            }`}
        >
            {/* Üst: mini formasyon önizleme + isim + aktif rozeti */}
            <button onClick={() => onOpen(item.id)} className="w-full flex items-start gap-3 text-left">
                {/* Mini formasyon önizleme */}
                <div className="shrink-0 w-14 h-20 rounded-xl bg-[#1B4332] border border-white/10 flex flex-col items-center justify-center gap-1 overflow-hidden relative">
                    <div className="absolute inset-x-2 top-1/2 h-px bg-white/15" />
                    <span className="relative text-[9px] font-black text-white leading-none text-center px-1">
                        {item.formation || '—'}
                    </span>
                    {item.size && (
                        <span className="relative text-[7px] font-bold text-[#39FF14] uppercase tracking-wider mt-0.5">
                            {item.size}
                        </span>
                    )}
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h4 className="font-black text-white text-sm truncate">{item.name || 'İsimsiz Taktik'}</h4>
                        {item.is_active && (
                            <span className="px-2 py-0.5 rounded bg-[#39FF14]/20 text-[#39FF14] text-[8px] font-black uppercase tracking-widest flex items-center gap-1">
                                <Star size={8} className="fill-current" /> Aktif
                            </span>
                        )}
                    </div>

                    {/* Oy % barı (avg_vote) */}
                    <div className="mb-2">
                        <div className="flex justify-between items-center mb-0.5">
                            <span className="text-[9px] text-gray-500 uppercase font-bold tracking-wider">Takım Oyu</span>
                            <span className="text-[10px] font-black text-[#39FF14]">%{Math.round(item.avg_vote)}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-[#39FF14] to-emerald-500 rounded-full transition-all"
                                style={{ width: `${Math.max(0, Math.min(100, item.avg_vote))}%` }}
                            />
                        </div>
                    </div>

                    {/* İstatistik satırı: oy / favori / yorum */}
                    <div className="flex items-center gap-3 text-[10px] text-gray-400 font-bold">
                        <span className="flex items-center gap-1">
                            <Activity size={11} className="text-gray-500" /> {item.vote_count}
                        </span>
                        <span className={`flex items-center gap-1 ${item.i_favorited ? 'text-red-400' : ''}`}>
                            <Heart size={11} className={item.i_favorited ? 'fill-current' : ''} /> {item.fav_count}
                        </span>
                        <span className="flex items-center gap-1">
                            <MessageCircle size={11} className="text-gray-500" /> {item.comment_count}
                        </span>
                    </div>
                </div>
            </button>

            {/* % oylama slider */}
            <div className="mt-3 pt-3 border-t border-white/5">
                <div className="flex items-center gap-3">
                    <span className="text-[9px] text-gray-500 uppercase font-bold tracking-wider shrink-0">Oyum</span>
                    <input
                        type="range"
                        min={0}
                        max={100}
                        value={voteVal}
                        onChange={(e) => setVoteVal(Number(e.target.value))}
                        onPointerUp={() => onVote(item.id, voteVal)}
                        onKeyUp={() => onVote(item.id, voteVal)}
                        className="flex-1 accent-[#39FF14] cursor-pointer"
                    />
                    <span className="text-[11px] font-black text-white w-9 text-right shrink-0">%{voteVal}</span>
                </div>
            </div>

            {/* Eylemler: favori / aktif yap / kopyala & öner */}
            <div className="mt-3 flex items-center gap-2">
                <button
                    onClick={() => onFavorite(item.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider border transition-colors ${
                        item.i_favorited
                            ? 'bg-red-500/15 border-red-500/30 text-red-400'
                            : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                    }`}
                >
                    <Heart size={12} className={item.i_favorited ? 'fill-current' : ''} />
                    {item.i_favorited ? 'Favoride' : 'Favori'}
                </button>

                {canManage && (
                    <button
                        onClick={() => onSetActive(item.id)}
                        disabled={item.is_active}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider border transition-colors ${
                            item.is_active
                                ? 'bg-[#39FF14]/10 border-[#39FF14]/20 text-[#39FF14]/50 cursor-default'
                                : 'bg-white/5 border-white/10 text-gray-300 hover:text-white hover:border-[#39FF14]/40'
                        }`}
                    >
                        <Star size={12} /> Aktif yap
                    </button>
                )}

                <button
                    onClick={() => onCopy(item.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-colors ml-auto"
                >
                    <Copy size={12} /> Kopyala & öner
                </button>
            </div>
        </div>
    );
};

// ─── FAZ 6: Taktik detay + yorum thread modalı ─────────────────────────────
const TacticDetailModal: React.FC<{
    item: TacticShowcaseItem;
    onClose: () => void;
    onToast: (msg: string, type?: 'success' | 'error') => void;
    onCommentAdded: (id: string) => void;
}> = ({ item, onClose, onToast, onCommentAdded }) => {
    const [comments, setComments] = useState<TacticComment[]>([]);
    const [loading, setLoading] = useState(true);
    const [body, setBody] = useState('');
    const [sending, setSending] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            const list = await getTacticComments(item.id);
            if (!cancelled) { setComments(list); setLoading(false); }
        })();
        return () => { cancelled = true; };
    }, [item.id]);

    const submit = async () => {
        const text = body.trim();
        if (!text || sending) return;
        setSending(true);
        try {
            const c = await commentTactic(item.id, text);
            setComments(prev => [...prev, c]);
            setBody('');
            onCommentAdded(item.id);
        } catch (e: any) {
            onToast(e?.message || 'Yorum gönderilemedi.', 'error');
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6 animate-in fade-in duration-200">
            <div className="bg-[#161B22] w-full max-w-md rounded-t-[32px] sm:rounded-[32px] border border-white/10 shadow-2xl flex flex-col max-h-[85vh]">
                {/* Başlık */}
                <div className="flex items-center justify-between p-5 border-b border-white/5">
                    <div className="min-w-0">
                        <h3 className="text-lg font-black text-white truncate">{item.name || 'İsimsiz Taktik'}</h3>
                        <p className="text-[10px] text-gray-400 font-medium">
                            Formasyon: <span className="text-[#39FF14] font-bold">{item.formation || '—'}</span>
                            {item.size && <> • <span className="text-white font-bold">{item.size}</span></>}
                            {' • '}<span className="text-[#39FF14] font-bold">%{Math.round(item.avg_vote)} oy</span>
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-500 hover:text-white shrink-0">
                        <X size={20} />
                    </button>
                </div>

                {/* Yorum thread */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-3">
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                        <MessageCircle size={12} /> Yorumlar ({comments.length})
                    </span>
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="animate-spin text-[#39FF14]" size={22} />
                        </div>
                    ) : comments.length === 0 ? (
                        <div className="text-center py-8">
                            <MessageCircle size={28} className="mx-auto mb-2 text-gray-700" />
                            <p className="text-xs text-gray-500">Henüz yorum yok. İlk yorumu sen yap!</p>
                        </div>
                    ) : (
                        comments.map((c) => (
                            <div key={c.id} className="bg-black/30 border border-white/5 rounded-2xl p-3">
                                <p className="text-sm text-white">{c.body}</p>
                                <p className="text-[9px] text-gray-600 mt-1">
                                    {new Date(c.createdAt).toLocaleString('tr-TR')}
                                </p>
                            </div>
                        ))
                    )}
                </div>

                {/* Yorum ekleme */}
                <div className="p-4 border-t border-white/5 flex items-center gap-2">
                    <input
                        type="text"
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                        placeholder="Yorum yaz..."
                        className="flex-1 bg-[#0A0E14] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#39FF14]"
                    />
                    <button
                        onClick={submit}
                        disabled={sending || !body.trim()}
                        className="p-2.5 bg-[#39FF14] text-black rounded-xl disabled:opacity-40 hover:bg-green-400 transition-colors"
                    >
                        {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                    </button>
                </div>
            </div>
        </div>
    );
};

const MyTeam: React.FC<MyTeamProps> = ({ onBack, onNavigate }) => {
    const myTeams = useAppStore(s => s.myTeams);
    const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
    const activeTeam = myTeams.find(t => t.id === activeTeamId) ?? myTeams[0] ?? null;

    const teamTactics = useAppStore(s => s.teamTactics);
    const fetchTeamTactics = useAppStore(s => s.fetchTeamTactics);
    const approveTactic = useAppStore(s => s.approveTactic);
    const rejectTactic = useAppStore(s => s.rejectTactic);
    const updateTacticPriorities = useAppStore(s => s.updateTacticPriorities);
    const updateTacticSlots = useAppStore(s => s.updateTacticSlots);
    const setActiveStudioTeam = useAppStore(s => s.setActiveStudioTeam);
    const role = useAppStore(s => s.role);

    const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
    // Kaptanlık = takım-içi yöneticilik (global rol değil): kurucu veya çoklu yönetici.
    const isCaptain = !!activeTeam && !!auth.currentUser && (
        activeTeam.captain === auth.currentUser.uid
        || activeTeam.captains?.includes(auth.currentUser.uid)
    );

    const activeApprovedTactics = teamTactics.filter((t: any) => t.status === 'APPROVED');
    const [selectedTacticId, setSelectedTacticId] = useState<string | null>(null);

    const [roster, setRoster] = useState<Player[]>([]);
    const [draggedPlayer, setDraggedPlayer] = useState<string | null>(null);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const pitchRef = useRef<HTMLDivElement>(null);

    const loadMyTeams = useAppStore(s => s.loadMyTeams);

    // ── FAZ 6: Sekme yapısı (Genel · Kadro · Taktikler · Geçmiş) ──
    const [activeTab, setActiveTab] = useState<MyTeamTab>('GENEL');

    // ── FAZ 6: Taktik vitrini (oylama/yorum/favori) ──
    const [showcase, setShowcase] = useState<TacticShowcaseItem[]>([]);
    const [showcaseLoading, setShowcaseLoading] = useState(false);
    const [showcaseError, setShowcaseError] = useState<string | null>(null);
    const [openTacticId, setOpenTacticId] = useState<string | null>(null);

    // ── FAZ 6: Maç geçmişi (W/L) ──
    const [history, setHistory] = useState<TeamMatchRow[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    const isArchived = !!activeTeam && (
        (activeTeam as any).archived === true ||
        (activeTeam as any).is_archived === true ||
        (activeTeam as any).status === 'ARCHIVED'
    );

    // Aktif takım değişince taktikleri yükle
    useEffect(() => {
        if (activeTeam) {
            fetchTeamTactics(activeTeam.id);
            setSelectedTacticId(null);
        }
    }, [activeTeam?.id]);

    // ── FAZ 6: Vitrini yükle ──
    const loadShowcase = async (teamId: string) => {
        setShowcaseLoading(true);
        setShowcaseError(null);
        try {
            const items = await getTeamTacticsShowcase(teamId);
            setShowcase(items);
        } catch (e: any) {
            setShowcaseError(e?.message || 'Taktik vitrini yüklenemedi.');
        } finally {
            setShowcaseLoading(false);
        }
    };

    useEffect(() => {
        if (activeTeam && activeTab === 'TAKTIKLER') {
            loadShowcase(activeTeam.id);
        }
    }, [activeTeam?.id, activeTab]);

    // ── FAZ 6: Maç geçmişini yükle ──
    useEffect(() => {
        if (!activeTeam || activeTab !== 'GECMIS') return;
        let cancelled = false;
        const load = async () => {
            setHistoryLoading(true);
            try {
                const rows = await fetchTeamMatchHistory(activeTeam.id);
                if (!cancelled) setHistory(rows);
            } catch (e) {
                if (!cancelled) setHistory([]);
            } finally {
                if (!cancelled) setHistoryLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [activeTeam?.id, activeTab]);

    const currentTactic = activeApprovedTactics.find((t: any) => t.id === selectedTacticId) || activeApprovedTactics[0] || null;

    // Aktif takım değişince veya taktik değişince kadroyu kur
    useEffect(() => {
        if (!activeTeam) { setRoster([]); return; }
        
        const allTeamPlayers = activeTeam.roster || [];
        if (currentTactic) {
            const slots = typeof currentTactic.slots === 'string' ? JSON.parse(currentTactic.slots) : currentTactic.slots;
            
            const mergedRoster = allTeamPlayers.map(p => {
                const slot = (slots || []).find((s: any) => s.player && s.player.id === p.id);
                if (slot) {
                    return {
                        ...p,
                        position: slot.role,
                        x: slot.x,
                        y: slot.y,
                        instruction: slot.instruction || ''
                    };
                } else {
                    return {
                        ...p,
                        position: 'YEDEK',
                        x: -999,
                        y: -999,
                        instruction: ''
                    };
                }
            });
            setRoster(mergedRoster);
        } else {
            const baseRoster = withDefaultPositions(allTeamPlayers);
            setRoster(baseRoster);

            const loadSupabaseData = async () => {
                const savedRoles = await getTeamRolesAndInstructions(activeTeam.id);
                if (savedRoles) {
                    setRoster(prev => prev.map(p => {
                        const saved = savedRoles[p.id];
                        if (saved) {
                            return {
                                ...p,
                                x: saved.x ?? p.x,
                                y: saved.y ?? p.y,
                                position: saved.position ?? p.position,
                                instruction: saved.instruction ?? p.instruction
                            };
                        }
                        return p;
                    }));
                }
            };
            loadSupabaseData();
        }
    }, [activeTeam?.id, currentTactic?.id]);

    // Supabase'de pozisyonları ve talimatları güncelle (Fallback)
    const saveRosterToSupabase = async (currentRoster: Player[]) => {
        if (!activeTeam) return;
        const teamRolesObj: Record<string, any> = {};
        currentRoster.forEach(p => {
            teamRolesObj[p.id] = {
                x: p.x,
                y: p.y,
                position: p.position || 'OYUNCU',
                instruction: p.instruction || ''
            };
        });
        await updateTeamRolesAndInstructions(activeTeam.id, teamRolesObj);
    };

    const showToast = (message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    // ─── FAZ 6: Taktik vitrini eylemleri ──────────────────────────────────
    const handleVote = async (tacticId: string, percent: number) => {
        // İyimser güncelleme
        setShowcase(prev => prev.map(t => t.id === tacticId ? { ...t, my_vote: percent } : t));
        try {
            await voteTactic(tacticId, percent);
            if (activeTeam) loadShowcase(activeTeam.id);
        } catch (e: any) {
            showToast(e?.message || 'Oy kaydedilemedi.', 'error');
            if (activeTeam) loadShowcase(activeTeam.id);
        }
    };

    const handleToggleFavorite = async (tacticId: string) => {
        try {
            const fav = await toggleTacticFavorite(tacticId);
            setShowcase(prev => prev.map(t => t.id === tacticId
                ? { ...t, i_favorited: fav, fav_count: Math.max(0, t.fav_count + (fav ? 1 : -1)) }
                : t));
        } catch (e: any) {
            showToast(e?.message || 'Favori güncellenemedi.', 'error');
        }
    };

    const handleSetActive = async (tacticId: string) => {
        try {
            await setActiveTactic(tacticId);
            setShowcase(prev => prev.map(t => ({ ...t, is_active: t.id === tacticId })));
            showToast('Aktif taktik güncellendi!');
            if (activeTeam) loadShowcase(activeTeam.id);
        } catch (e: any) {
            showToast(e?.message || 'Aktif taktik ayarlanamadı.', 'error');
        }
    };

    const handleCopyTactic = async (tacticId: string) => {
        try {
            await copyTactic(tacticId, activeTeam?.id);
            showToast('Taktik kopyalandı ve önerin gönderildi!');
            if (activeTeam) loadShowcase(activeTeam.id);
        } catch (e: any) {
            showToast(e?.message || 'Taktik kopyalanamadı.', 'error');
        }
    };

    // ─── FAZ 6: Takım yönetimi eylemleri ──────────────────────────────────
    const handleTransferCaptaincy = async (userId: string, userName: string) => {
        if (!activeTeam) return;
        if (!confirm(`Kaptanlığı ${userName} oyuncusuna devretmek istediğine emin misin?`)) return;
        try {
            await transferCaptaincy(activeTeam.id, userId);
            showToast(`Kaptanlık ${userName} oyuncusuna devredildi.`);
            await loadMyTeams();
        } catch (e: any) {
            showToast(e?.message || 'Kaptanlık devredilemedi.', 'error');
        }
    };

    const handleSetAdmin = async (userId: string, userName: string, grant: boolean) => {
        if (!activeTeam) return;
        try {
            await setTeamAdmin(activeTeam.id, userId, grant);
            showToast(grant ? `${userName} yönetici yapıldı.` : `${userName} yöneticilikten alındı.`);
            await loadMyTeams();
        } catch (e: any) {
            showToast(e?.message || 'Yönetici durumu güncellenemedi.', 'error');
        }
    };

    const handleLeaveTeam = async () => {
        if (!activeTeam) return;
        if (!confirm('Bu takımdan ayrılmak istediğine emin misin?')) return;
        try {
            const { archived } = await leaveTeam(activeTeam.id);
            if (archived) {
                showToast('Takımdan ayrıldın. Son yönetici olduğun için takım arşivlendi.');
            } else {
                showToast('Takımdan ayrıldın.');
            }
            setActiveTeamId(null);
            await loadMyTeams();
        } catch (e: any) {
            showToast(e?.message || 'Takımdan ayrılınamadı.', 'error');
        }
    };

    const handleArchiveTeam = async () => {
        if (!activeTeam) return;
        const nextArchive = !isArchived;
        if (nextArchive && !confirm('Takımı arşivlemek istediğine emin misin? (Geçmiş korunur)')) return;
        try {
            await archiveTeam(activeTeam.id, nextArchive);
            showToast(nextArchive ? 'Takım arşivlendi.' : 'Takım arşivden çıkarıldı.');
            await loadMyTeams();
        } catch (e: any) {
            showToast(e?.message || 'Arşivleme başarısız.', 'error');
        }
    };

    // Bir kullanıcı takım yöneticisi mi? (kaptan veya çoklu-yönetici listesi)
    const isUserAdmin = (uid: string): boolean => !!activeTeam && (
        activeTeam.captain === uid || !!activeTeam.captains?.includes(uid)
    );

    // Formation Presets
    const applyFormation = async (type: '2-3-1' | '3-2-1') => {
        const newRoster = roster.map(p => ({ ...p }));
        if (type === '2-3-1' && newRoster.length >= 6) {
            // GK, 2 Def, 3 Mid, 1 Fwd
            newRoster[0].x = 50; newRoster[0].y = 10; // FWD
            newRoster[1].x = 20; newRoster[1].y = 45; // LM
            newRoster[2].x = 50; newRoster[2].y = 45; // CM
            newRoster[3].x = 80; newRoster[3].y = 45; // RM
            newRoster[4].x = 30; newRoster[4].y = 80; // CB
            newRoster[5].x = 70; newRoster[5].y = 80; // CB
        } else if (type === '3-2-1' && newRoster.length >= 6) {
            newRoster[0].x = 50; newRoster[0].y = 15; // FWD
            newRoster[1].x = 35; newRoster[1].y = 50; // CM
            newRoster[2].x = 65; newRoster[2].y = 50; // CM
            newRoster[3].x = 20; newRoster[3].y = 80; // LB
            newRoster[4].x = 50; newRoster[4].y = 85; // CB
            newRoster[5].x = 80; newRoster[5].y = 80; // RB
        }
        setRoster(newRoster);
        if (currentTactic) {
            const slots = typeof currentTactic.slots === 'string' ? JSON.parse(currentTactic.slots) : currentTactic.slots;
            const updatedSlots = slots.map((s: any) => {
                const rosterPlayer = newRoster.find(p => p.id === s.player?.id);
                if (rosterPlayer) {
                    return { ...s, x: rosterPlayer.x, y: rosterPlayer.y };
                }
                return s;
            });
            updateTacticSlots(currentTactic.id, updatedSlots);
            showToast("Taktik dizilişi güncellendi!");
        } else {
            await saveRosterToSupabase(newRoster);
        }
    };

    const rafRef = useRef<number | null>(null);

    const handlePointerMove = (e: React.PointerEvent) => {
        if (draggedPlayer && pitchRef.current) {
            const rect = pitchRef.current.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;

            const clampedX = Math.max(0, Math.min(100, x));
            const clampedY = Math.max(0, Math.min(100, y));

            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            rafRef.current = requestAnimationFrame(() => {
                setRoster(prev => prev.map(p =>
                    p.id === draggedPlayer ? { ...p, x: clampedX, y: clampedY } : p
                ));
            });
        }
    };

    const handlePointerUp = async () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        setDraggedPlayer(null);
        if (currentTactic) {
            const slots = typeof currentTactic.slots === 'string' ? JSON.parse(currentTactic.slots) : currentTactic.slots;
            const updatedSlots = slots.map((s: any) => {
                const rosterPlayer = roster.find(p => p.id === s.player?.id);
                if (rosterPlayer) {
                    return { ...s, x: rosterPlayer.x, y: rosterPlayer.y };
                }
                return s;
            });
            updateTacticSlots(currentTactic.id, updatedSlots);
        } else {
            await saveRosterToSupabase(roster);
        }
    };

    const removePlayer = async (id: string) => {
        if (!activeTeam) return;
        const nextRoster = roster.filter(p => p.id !== id);
        setRoster(nextRoster);
        await sbRemovePlayerFromTeam(activeTeam.id, id);
        if (currentTactic) {
            const slots = typeof currentTactic.slots === 'string' ? JSON.parse(currentTactic.slots) : currentTactic.slots;
            const updatedSlots = slots.map((s: any) => {
                if (s.player && s.player.id === id) {
                    return { ...s, player: undefined };
                }
                return s;
            });
            updateTacticSlots(currentTactic.id, updatedSlots);
        } else {
            await saveRosterToSupabase(nextRoster);
        }
    };

    const handleSetInstruction = async (playerId: string, instruction: string) => {
        const nextRoster = roster.map(p => p.id === playerId ? { ...p, instruction } : p);
        setRoster(nextRoster);
        if (currentTactic) {
            const slots = typeof currentTactic.slots === 'string' ? JSON.parse(currentTactic.slots) : currentTactic.slots;
            const updatedSlots = slots.map((s: any) => {
                if (s.player && s.player.id === playerId) {
                    return { ...s, instruction };
                }
                return s;
            });
            updateTacticSlots(currentTactic.id, updatedSlots);
            showToast("Oyuncu talimatı güncellendi!");
        } else {
            await saveRosterToSupabase(nextRoster);
        }
    };

    // ─── Boş durum: henüz takım yok ───────────────────────────────────────
    if (!activeTeam) {
        return (
            <div className="min-h-screen bg-[#0A0E14] flex flex-col">
                <header className="px-6 py-4 flex items-center gap-3 bg-[#161B22]/90 backdrop-blur-md border-b border-white/5">
                    <button onClick={onBack} className="p-2 rounded-full hover:bg-white/5 text-gray-400">
                        <ArrowLeft size={20} />
                    </button>
                    <h1 className="font-black text-white text-lg tracking-tight uppercase">Takımım</h1>
                </header>
                <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
                    <div className="w-24 h-24 rounded-full bg-[#161B22] border border-white/10 flex items-center justify-center mb-6">
                        <Users size={40} className="text-gray-600" />
                    </div>
                    <h2 className="text-xl font-black text-white mb-2">Henüz bir takımın yok</h2>
                    <p className="text-sm text-gray-500 mb-8 max-w-xs">
                        Takımını kur, arkadaşlarını davet et, taktiğini hazırla ve maça çık.
                    </p>
                    <button
                        onClick={() => onNavigate('TEAM_CREATOR')}
                        className="flex items-center gap-2 bg-[#39FF14] text-black px-8 py-4 rounded-2xl font-black uppercase tracking-wider text-sm hover:bg-green-400 transition-colors shadow-[0_0_30px_rgba(57,255,20,0.3)]"
                    >
                        <Plus size={18} /> Takım Kur
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0A0E14] flex flex-col relative">

            {/* Header */}
            <header className="px-6 py-4 flex justify-between items-center bg-[#161B22]/90 backdrop-blur-md border-b border-white/5 sticky top-0 z-20">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="p-2 rounded-full hover:bg-white/5 text-gray-400">
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="font-black text-white text-lg tracking-tight uppercase">{activeTeam.name}</h1>
                        <p className="text-[10px] text-gray-400 font-medium">Taktik Tahtası • Kaptan Modu</p>
                    </div>
                </div>
                <button className="p-2 bg-white/5 rounded-full text-white">
                    <Share2 size={20} />
                </button>
            </header>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">

                {/* Takım Değiştirici + Yeni Takım */}
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                    {myTeams.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setActiveTeamId(t.id)}
                            className={`shrink-0 px-4 py-2 rounded-full text-xs font-black uppercase tracking-wider border transition-colors ${
                                t.id === activeTeam.id
                                    ? 'bg-white text-black border-white'
                                    : 'bg-[#161B22] text-gray-400 border-white/10 hover:border-white/30'
                            }`}
                            style={t.id === activeTeam.id && t.color1 ? { backgroundColor: t.color1, borderColor: t.color1, color: '#fff' } : undefined}
                        >
                            {t.shortName || t.name}
                        </button>
                    ))}
                    <button
                        onClick={() => onNavigate('TEAM_CREATOR')}
                        className="shrink-0 px-3 py-2 rounded-full text-xs font-black border border-dashed border-white/20 text-gray-500 hover:text-white hover:border-white/50 transition-colors flex items-center gap-1"
                    >
                        <Plus size={12} /> Yeni
                    </button>
                </div>

                {/* Arşivli takım rozeti */}
                {isArchived && (
                    <div className="flex items-center gap-2 bg-gray-500/10 border border-gray-500/20 rounded-2xl px-4 py-3 text-gray-400">
                        <Archive size={16} />
                        <div>
                            <p className="text-xs font-black uppercase tracking-wider text-gray-300">Bu takım arşivlendi</p>
                            <p className="text-[10px] text-gray-500">Geçmiş korunuyor. Düzenlemek için arşivden çıkar.</p>
                        </div>
                    </div>
                )}

                {/* ── FAZ 6: Sekme Çubuğu (Genel · Kadro · Taktikler · Geçmiş) ── */}
                <div className="flex gap-1 border-b border-white/8 -mt-1">
                    {([
                        { id: 'GENEL', label: 'Genel' },
                        { id: 'KADRO', label: 'Kadro' },
                        { id: 'TAKTIKLER', label: 'Taktikler' },
                        { id: 'GECMIS', label: 'Geçmiş' },
                    ] as { id: MyTeamTab; label: string }[]).map(t => (
                        <button
                            key={t.id}
                            onClick={() => setActiveTab(t.id)}
                            className={`relative flex-1 pb-2.5 text-xs font-black uppercase tracking-wider transition-colors ${
                                activeTab === t.id ? 'text-white' : 'text-gray-500 hover:text-gray-300'
                            }`}
                        >
                            {t.label}
                            {activeTab === t.id && (
                                <motion.div
                                    layoutId="myTeamTabLine"
                                    className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-[#39FF14]"
                                />
                            )}
                        </button>
                    ))}
                </div>

                {/* ════════════ GENEL: Pitch + istatistik ════════════ */}
                {activeTab === 'GENEL' && (<>

                {/* Playbook Taktik Sekmeleri */}
                {activeApprovedTactics.length > 0 && (
                    <section className="space-y-2">
                        <div className="flex justify-between items-center px-1">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                                <Layout size={12} className="text-[#39FF14]" /> TAKTİK KİTAPÇIĞI
                            </span>
                            {isCaptain && (
                                <span className="text-[8px] text-gray-500 font-bold uppercase tracking-wider">Sürükleyip Sırala</span>
                            )}
                        </div>
                        
                        {isCaptain ? (
                            <Reorder.Group
                                axis="x"
                                values={activeApprovedTactics}
                                onReorder={(ordered) => {
                                    updateTacticPriorities(activeTeam.id, ordered.map((t: any) => t.id));
                                }}
                                className="flex gap-2 overflow-x-auto no-scrollbar pb-1"
                            >
                                {activeApprovedTactics.map((tactic) => {
                                    const isActive = selectedTacticId === tactic.id || (!selectedTacticId && activeApprovedTactics[0]?.id === tactic.id);
                                    return (
                                        <Reorder.Item
                                            key={tactic.id}
                                            value={tactic}
                                            dragConstraints={{ top: 0, bottom: 0 }}
                                            dragElastic={0.1}
                                            onClick={() => setSelectedTacticId(tactic.id)}
                                            className={`shrink-0 px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider border transition-all cursor-grab active:cursor-grabbing flex items-center gap-1.5 ${
                                                isActive
                                                    ? 'bg-gradient-to-r from-[#39FF14]/20 to-[#39FF14]/5 border-[#39FF14] text-white shadow-[0_0_15px_rgba(57,255,20,0.15)]'
                                                    : 'bg-[#161B22] text-gray-400 border-white/5 hover:border-white/20'
                                            }`}
                                        >
                                            <GripHorizontal size={10} className="text-gray-600" />
                                            {tactic.name}
                                        </Reorder.Item>
                                    );
                                })}
                            </Reorder.Group>
                        ) : (
                            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                                {activeApprovedTactics.map((tactic) => {
                                    const isActive = selectedTacticId === tactic.id || (!selectedTacticId && activeApprovedTactics[0]?.id === tactic.id);
                                    return (
                                        <button
                                            key={tactic.id}
                                            onClick={() => setSelectedTacticId(tactic.id)}
                                            className={`shrink-0 px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider border transition-all flex items-center gap-1.5 ${
                                                isActive
                                                    ? 'bg-gradient-to-r from-[#39FF14]/20 to-[#39FF14]/5 border-[#39FF14] text-white shadow-[0_0_15px_rgba(57,255,20,0.15)]'
                                                    : 'bg-[#161B22] text-gray-400 border-white/5 hover:border-white/20'
                                            }`}
                                        >
                                            {tactic.name}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </section>
                )}

                {/* Pitch Area */}
                <section>
                    {/* Controls */}
                    <div className="w-full flex justify-between items-center mb-4">
                        <div className="flex gap-2">
                            <button onClick={() => applyFormation('2-3-1')} className="px-3 py-1.5 bg-[#161B22] border border-white/10 rounded-lg text-xs font-bold text-gray-300 hover:text-white hover:border-white/30 transition-colors">
                                2-3-1
                            </button>
                            <button onClick={() => applyFormation('3-2-1')} className="px-3 py-1.5 bg-[#161B22] border border-white/10 rounded-lg text-xs font-bold text-gray-300 hover:text-white hover:border-white/30 transition-colors">
                                3-2-1
                            </button>
                        </div>
                        
                        <button
                            onClick={() => {
                                setActiveStudioTeam(activeTeam);
                                onNavigate('STUDIO');
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-[#39FF14] to-emerald-600 rounded-lg text-xs font-black text-black uppercase hover:scale-105 active:scale-95 transition-all shadow-[0_0_15px_rgba(57,255,20,0.15)] animate-pulse"
                        >
                            <Zap size={12} /> {isCaptain ? "Taktik Stüdyo" : "Taktik Öner"}
                        </button>
                    </div>

                    {/* Tactical Board */}
                    <div
                        ref={pitchRef}
                        className="relative w-full aspect-[2/3] max-h-[60vh] bg-[#1B4332] rounded-[24px] border-4 border-[#161B22] shadow-[inset_0_0_60px_rgba(0,0,0,0.8)] overflow-hidden touch-none"
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onPointerLeave={handlePointerUp}
                    >
                        {/* Grass Stripes */}
                        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 10%, rgba(0,0,0,0.2) 10%, rgba(0,0,0,0.2) 20%)' }}></div>

                        {/* Markings */}
                        <div className="absolute inset-0 pointer-events-none opacity-40">
                            <svg viewBox="0 0 680 1050" preserveAspectRatio="none" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                                <g stroke="white" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round">
                                    {/* Dış Çizgiler */}
                                    <rect x="20" y="20" width="640" height="1010" />
                                    {/* Orta Saha Çizgisi */}
                                    <line x1="20" y1="525" x2="660" y2="525" />
                                    {/* Orta Yuvarlak */}
                                    <circle cx="340" cy="525" r="90" />
                                    {/* Başlama Noktası */}
                                    <circle cx="340" cy="525" r="4" fill="white" />

                                    {/* Üst Ceza Sahası */}
                                    <rect x="140" y="20" width="400" height="150" />
                                    {/* Üst Altı Pas */}
                                    <rect x="240" y="20" width="200" height="50" />
                                    {/* Üst Penaltı Noktası */}
                                    <circle cx="340" cy="120" r="4" fill="white" />
                                    {/* Üst Ceza Sahası Yayı */}
                                    <path d="M 270 170 A 90 90 0 0 0 410 170" />

                                    {/* Alt Ceza Sahası */}
                                    <rect x="140" y="880" width="400" height="150" />
                                    {/* Alt Altı Pas */}
                                    <rect x="240" y="980" width="200" height="50" />
                                    {/* Alt Penaltı Noktası */}
                                    <circle cx="340" cy="930" r="4" fill="white" />
                                    {/* Alt Ceza Sahası Yayı */}
                                    <path d="M 270 880 A 90 90 0 0 1 410 880" />

                                    {/* Köşe Yayları */}
                                    <path d="M 20 60 A 40 40 0 0 0 60 20" />
                                    <path d="M 620 20 A 40 40 0 0 0 660 60" />
                                    <path d="M 20 990 A 40 40 0 0 1 60 1030" />
                                    <path d="M 660 1030 A 40 40 0 0 0 620 990" />
                                </g>
                            </svg>
                        </div>

                        {/* Draggable Players */}
                        {roster.filter(player => player.x !== -999).map((player) => (
                            <div
                                key={player.id}
                                className="absolute transform -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing active:scale-110 transition-transform"
                                style={{ left: `${player.x}%`, top: `${player.y}%`, zIndex: (draggedPlayer === player.id) ? 50 : 10 }}
                                onPointerDown={(e) => {
                                    e.currentTarget.releasePointerCapture(e.pointerId);
                                    setDraggedPlayer(player.id);
                                }}
                            >
                                <div className="flex flex-col items-center gap-1 relative">
                                    <div className={`relative w-10 h-10 rounded-full border-2 border-white shadow-lg overflow-hidden ${draggedPlayer === player.id ? 'ring-4 ring-[#FFFF00]' : ''}`}>
                                        <img src={player.avatar} alt={player.name} className="w-full h-full object-cover" />
                                    </div>
                                    <div className="bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded text-[9px] font-bold text-white whitespace-nowrap flex flex-col items-center gap-0.5">
                                        <span>{player.name}</span>
                                        {player.instruction && (
                                            <span className="text-[#FFFF00] text-[7px] tracking-widest uppercase font-black">{player.instruction}</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Team Stats Summary */}
                <section className="grid grid-cols-3 gap-3">
                    <div className="bg-[#161B22] p-3 rounded-2xl border border-white/5 flex flex-col items-center justify-center">
                        <Swords className="text-yellow-400 mb-1" size={20} />
                        <span className="text-xl font-black text-white">{activeTeam.wins ?? 0}</span>
                        <span className="text-[9px] text-gray-500 uppercase font-bold">Galibiyet</span>
                    </div>
                    <div className="bg-[#161B22] p-3 rounded-2xl border border-white/5 flex flex-col items-center justify-center">
                        <Shield className="text-blue-400 mb-1" size={20} />
                        <span className="text-xl font-black text-white">{activeTeam.losses ?? 0}</span>
                        <span className="text-[9px] text-gray-500 uppercase font-bold">Mağlubiyet</span>
                    </div>
                    <div className="bg-[#161B22] p-3 rounded-2xl border border-white/5 flex flex-col items-center justify-center">
                        <Activity className="text-green-400 mb-1" size={20} />
                        <span className="text-xl font-black text-white">{roster.length}</span>
                        <span className="text-[9px] text-gray-500 uppercase font-bold">Oyuncu</span>
                    </div>
                </section>

                </>)}

                {/* ════════════ TAKTIKLER: En İyi Taktikler vitrini ════════════ */}
                {activeTab === 'TAKTIKLER' && (<>

                {/* + Yeni Taktik (büyük CTA) */}
                <button
                    onClick={() => {
                        setActiveStudioTeam(activeTeam);
                        onNavigate('STUDIO');
                    }}
                    className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-[#39FF14] to-emerald-600 rounded-[24px] py-4 text-sm font-black text-black uppercase tracking-wider hover:scale-[1.01] active:scale-95 transition-all shadow-[0_0_25px_rgba(57,255,20,0.2)]"
                >
                    <Plus size={18} /> Yeni Taktik
                </button>

                {/* "En İyi Taktikler" vitrini */}
                <section className="space-y-3">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5 px-1">
                        <Trophy size={12} className="text-[#39FF14]" /> En İyi Taktikler
                    </span>

                    {showcaseLoading ? (
                        <div className="flex justify-center py-12">
                            <Loader2 className="animate-spin text-[#39FF14]" size={26} />
                        </div>
                    ) : showcaseError ? (
                        <div className="text-center py-10 bg-red-500/5 border border-red-500/15 rounded-[24px]">
                            <p className="text-xs text-red-400 mb-3">{showcaseError}</p>
                            <button
                                onClick={() => activeTeam && loadShowcase(activeTeam.id)}
                                className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-[10px] font-bold text-white uppercase hover:bg-white/10 transition-colors"
                            >
                                Tekrar Dene
                            </button>
                        </div>
                    ) : showcase.length === 0 ? (
                        <div className="text-center py-12 bg-[#161B22] border border-white/5 rounded-[24px]">
                            <Layout size={32} className="mx-auto mb-3 text-gray-700" />
                            <p className="text-sm text-gray-500">Henüz taktik yok</p>
                            <p className="text-[11px] text-gray-600 mt-1">Yukarıdan yeni bir taktik oluştur.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {showcase.map((item) => (
                                <TacticShowcaseCard
                                    key={item.id}
                                    item={item}
                                    canManage={isCaptain}
                                    onVote={handleVote}
                                    onFavorite={handleToggleFavorite}
                                    onSetActive={handleSetActive}
                                    onCopy={handleCopyTactic}
                                    onOpen={setOpenTacticId}
                                />
                            ))}
                        </div>
                    )}
                </section>

                {/* Önerilen Taktikler (Sadece Kaptana Görünür) */}
                {isCaptain && teamTactics.some(t => t.status === 'PENDING_APPROVAL') && (
                    <section className="bg-gradient-to-r from-yellow-500/10 to-amber-600/10 border border-yellow-500/20 rounded-[32px] p-5 space-y-3 shadow-[0_0_20px_rgba(245,158,11,0.05)]">
                        <div className="flex items-center gap-2 mb-1">
                            <Zap className="text-yellow-400 animate-pulse" size={18} />
                            <h3 className="font-black text-white text-sm uppercase tracking-wider">Taktik Önerileri</h3>
                        </div>
                        <div className="space-y-3">
                            {teamTactics.filter(t => t.status === 'PENDING_APPROVAL').map((tactic) => (
                                <div key={tactic.id} className="bg-black/40 border border-white/5 rounded-2xl p-4 flex flex-col gap-3">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h4 className="font-bold text-white text-sm">{tactic.name}</h4>
                                            <p className="text-[10px] text-gray-400 mt-0.5">Formasyon: <span className="text-[#39FF14] font-bold">{tactic.formation}</span> • Öneren: <span className="text-white font-bold">{tactic.teamName || 'Oyuncu'}</span></p>
                                        </div>
                                        <span className="px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400 text-[8px] font-black uppercase tracking-widest">Beklemede</span>
                                    </div>
                                    {tactic.notes && (
                                        <p className="text-[11px] text-gray-400 italic bg-white/5 p-2 rounded-lg">"{tactic.notes}"</p>
                                    )}
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => {
                                                setActiveStudioTeam(activeTeam);
                                                onNavigate('STUDIO');
                                            }}
                                            className="flex-1 py-2 bg-white/5 border border-white/10 rounded-xl text-[10px] font-bold text-white uppercase hover:bg-white/10 transition-colors"
                                        >
                                            Stüdyo'da İncele
                                        </button>
                                        <button 
                                            onClick={async () => {
                                                await approveTactic(tactic.id);
                                                showToast("Taktik onaylandı ve taktik kitapçığına eklendi!");
                                            }}
                                            className="px-4 py-2 bg-[#39FF14] rounded-xl text-[10px] font-black text-black uppercase hover:bg-green-400 transition-colors"
                                        >
                                            Onayla
                                        </button>
                                        <button 
                                            onClick={async () => {
                                                if (confirm("Bu taktik önerisini reddetmek istediğinize emin misiniz?")) {
                                                    await rejectTactic(tactic.id);
                                                    showToast("Taktik önerisi reddedildi.", "error");
                                                }
                                            }}
                                            className="p-2 text-gray-600 hover:text-red-500 transition-colors"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* Gönderdiğin Öneriler (Oyuncular İçin) */}
                {!isCaptain && teamTactics.some(t => t.status === 'PENDING_APPROVAL' && t.proposedBy === (auth.currentUser?.uid || 'guest')) && (
                    <section className="bg-white/5 border border-white/5 rounded-[32px] p-5 space-y-3">
                        <div className="flex items-center gap-2 mb-1">
                            <Activity className="text-yellow-400" size={18} />
                            <h3 className="font-black text-white text-sm uppercase tracking-wider">Gönderdiğin Öneriler</h3>
                        </div>
                        <div className="space-y-2">
                            {teamTactics.filter(t => t.status === 'PENDING_APPROVAL' && t.proposedBy === (auth.currentUser?.uid || 'guest')).map((tactic) => (
                                <div key={tactic.id} className="flex justify-between items-center p-3 bg-black/20 rounded-xl border border-white/5">
                                    <div>
                                        <h4 className="font-bold text-white text-xs">{tactic.name}</h4>
                                        <p className="text-[9px] text-gray-500 mt-0.5">Kaptan onayı bekleniyor...</p>
                                    </div>
                                    <span className="px-2 py-0.5 rounded bg-yellow-500/10 text-yellow-400 text-[8px] font-bold uppercase tracking-wider">Beklemede</span>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                </>)}

                {/* Local Toast Notification */}
                <AnimatePresence>
                    {toast && (
                        <motion.div
                            initial={{ opacity: 0, y: 50, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 20, scale: 0.9 }}
                            className={`fixed bottom-24 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-full text-xs font-black uppercase tracking-widest z-[100] shadow-2xl flex items-center gap-2 border ${
                                toast.type === 'error'
                                    ? 'bg-red-500/10 border-red-500/30 text-red-500'
                                    : 'bg-[#39FF14]/10 border-[#39FF14]/30 text-[#39FF14]'
                            }`}
                        >
                            <CheckCircle2 size={14} />
                            {toast.message}
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ════════════ KADRO: Kadro yönetimi + takım yönetimi ════════════ */}
                {activeTab === 'KADRO' && (<>

                {/* Roster List & Management */}
                <section className="bg-[#161B22] border border-white/5 rounded-[32px] p-5">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-black text-white">Kadro Yönetimi</h3>
                        <button
                            onClick={() => setShowInviteModal(true)}
                            className="flex items-center gap-2 bg-[#FFFF00] text-black px-3 py-1.5 rounded-full text-xs font-bold hover:bg-yellow-300 transition-colors"
                        >
                            <UserPlus size={14} /> Ekle
                        </button>
                    </div>
                    <div className="space-y-3">
                        {roster.map((player) => {
                            const playerIsAdmin = isUserAdmin(player.id);
                            const isCaptainSelf = activeTeam.captain === player.id;
                            const isMe = auth.currentUser?.uid === player.id;
                            return (
                            <div key={player.id} className="p-2 hover:bg-white/5 rounded-xl transition-colors">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <img src={player.avatar} className="w-10 h-10 rounded-full bg-gray-700 object-cover" alt={player.name} />
                                        <div>
                                            <p className="font-bold text-white text-sm flex items-center gap-1.5">
                                                {player.name}
                                                {isCaptainSelf && <Crown size={11} className="text-amber-400" />}
                                                {playerIsAdmin && !isCaptainSelf && <ShieldCheck size={11} className="text-blue-400" />}
                                            </p>
                                            <p className="text-[9px] text-[#39FF14] uppercase tracking-wider font-bold">{player.position || 'OYUNCU'}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <select
                                            value={player.instruction || ''}
                                            onChange={(e) => handleSetInstruction(player.id, e.target.value)}
                                            className="w-32 shrink-0 bg-[#0A0E14] text-[10px] font-bold text-[#FFFF00] border border-white/10 rounded-xl px-2 py-1.5 outline-none focus:border-[#FFFF00] cursor-pointer uppercase tracking-wider transition-all"
                                        >
                                            <option value="" className="text-gray-500">Talimat Yok</option>
                                            <option value="Hücuma Çık">Hücuma Çık</option>
                                            <option value="Geride Kal">Geride Kal</option>
                                            <option value="Serbest">Serbest</option>
                                            <option value="Markaj">Markaj</option>
                                            <option value="Oyun Kurucu">Oyun Kurucu</option>
                                            <option value="Pres Yap">Pres Yap</option>
                                        </select>
                                        <button
                                            onClick={() => removePlayer(player.id)}
                                            className="p-2 shrink-0 text-gray-600 hover:text-red-500 transition-colors"
                                            title="Kadrodan Çıkar"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>

                                {/* Yönetici eylemleri (yalnız kaptan/yönetici görür) */}
                                {isCaptain && !isCaptainSelf && !isMe && !isArchived && (
                                    <div className="flex flex-wrap gap-2 mt-2 pl-1">
                                        <button
                                            onClick={() => handleTransferCaptaincy(player.id, player.name)}
                                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 transition-colors"
                                        >
                                            <Crown size={10} /> Kaptanlığı devret
                                        </button>
                                        <button
                                            onClick={() => handleSetAdmin(player.id, player.name, !playerIsAdmin)}
                                            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider border transition-colors ${
                                                playerIsAdmin
                                                    ? 'bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500/20'
                                                    : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                                            }`}
                                        >
                                            <ShieldCheck size={10} /> {playerIsAdmin ? 'Yöneticiliği al' : 'Yönetici yap'}
                                        </button>
                                    </div>
                                )}
                            </div>
                            );
                        })}
                    </div>
                </section>

                {/* Takım Ayarları (ayrıl / arşivle) */}
                <section className="bg-[#161B22] border border-white/5 rounded-[32px] p-5 space-y-3">
                    <h3 className="font-black text-white text-sm uppercase tracking-wider">Takım Ayarları</h3>

                    {isCaptain && (
                        <button
                            onClick={handleArchiveTeam}
                            className="w-full flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-colors"
                        >
                            <span className="flex items-center gap-2 text-sm font-bold text-gray-200">
                                <Archive size={16} className="text-gray-400" />
                                {isArchived ? 'Takımı Arşivden Çıkar' : 'Takımı Arşivle'}
                            </span>
                        </button>
                    )}

                    <button
                        onClick={handleLeaveTeam}
                        className="w-full flex items-center justify-between p-3 bg-red-500/5 border border-red-500/20 rounded-2xl hover:bg-red-500/10 transition-colors"
                    >
                        <span className="flex items-center gap-2 text-sm font-bold text-red-400">
                            <LogOut size={16} /> Takımdan Ayrıl
                        </span>
                    </button>
                </section>

                </>)}

                {/* ════════════ GEÇMİS: Maç geçmişi (W/L) ════════════ */}
                {activeTab === 'GECMIS' && (
                    <section className="space-y-3">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5 px-1">
                            <Swords size={12} className="text-[#39FF14]" /> Son Sonuçlar
                        </span>
                        {historyLoading ? (
                            <div className="flex justify-center py-12">
                                <Loader2 className="animate-spin text-[#39FF14]" size={26} />
                            </div>
                        ) : history.length === 0 ? (
                            <div className="text-center py-12 bg-[#161B22] border border-white/5 rounded-[24px]">
                                <Swords size={32} className="mx-auto mb-3 text-gray-700" />
                                <p className="text-sm text-gray-500">Henüz tamamlanan maç yok</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {history.map((m) => (
                                    <div key={m.id} className="bg-[#161B22] border border-white/5 rounded-2xl px-4 py-3 flex items-center gap-3">
                                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${RESULT_STYLE[m.result]}`}>
                                            {m.result}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-white truncate">{m.opponentName}</p>
                                            <p className="text-[11px] text-gray-500">{m.date || ''}</p>
                                        </div>
                                        <span className="text-base font-black text-white shrink-0">{m.myScore}-{m.theirScore}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                )}

            </div>

            {/* ── FAZ 6: Taktik detay + yorum thread modalı ── */}
            <AnimatePresence>
                {openTacticId && (() => {
                    const item = showcase.find(t => t.id === openTacticId);
                    if (!item) return null;
                    return (
                        <TacticDetailModal
                            item={item}
                            onClose={() => setOpenTacticId(null)}
                            onToast={showToast}
                            onCommentAdded={(id) => setShowcase(prev => prev.map(t => t.id === id ? { ...t, comment_count: t.comment_count + 1 } : t))}
                        />
                    );
                })()}
            </AnimatePresence>

            {/* Invite Modal Overlay */}
            {showInviteModal && (
                <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
                    <div className="bg-[#161B22] w-full max-w-sm rounded-[32px] border border-white/10 p-6 shadow-2xl relative">
                        <button
                            onClick={() => setShowInviteModal(false)}
                            className="absolute top-4 right-4 text-gray-500 hover:text-white"
                        >
                            <X size={20} />
                        </button>
                        <h3 className="text-xl font-black text-white mb-4">Oyuncu Davet Et</h3>
                        <input type="text" placeholder="Kullanıcı Adı Ara..." className="w-full bg-[#0A0E14] border border-gray-700 rounded-xl p-3 text-white text-sm outline-none focus:border-[#FFFF00] mb-4" />

                        <p className="text-xs text-gray-500 font-bold uppercase mb-2">Rehberden Önerilenler</p>
                        <div className="space-y-2 mb-6">
                            <div className="flex items-center justify-between p-2 bg-[#0A0E14] rounded-xl border border-gray-800">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center font-bold">A</div>
                                    <span className="text-sm font-bold">Ahmet K.</span>
                                </div>
                                <button className="text-[#FFFF00] text-xs font-bold border border-[#FFFF00] px-2 py-1 rounded-lg hover:bg-[#FFFF00] hover:text-black transition-colors">Davet Et</button>
                            </div>
                            <div className="flex items-center justify-between p-2 bg-[#0A0E14] rounded-xl border border-gray-800">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center font-bold">M</div>
                                    <span className="text-sm font-bold">Mehmet Y.</span>
                                </div>
                                <button className="text-[#FFFF00] text-xs font-bold border border-[#FFFF00] px-2 py-1 rounded-lg hover:bg-[#FFFF00] hover:text-black transition-colors">Davet Et</button>
                            </div>
                        </div>

                        <button className="w-full py-3 bg-[#FFFF00] text-black font-black rounded-xl hover:bg-yellow-300">
                            Bağlantı Paylaş
                        </button>
                    </div>
                </div>
            )}

        </div>
    );
};

export default MyTeam;
