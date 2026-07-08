import React, { useState, useRef, useEffect, Suspense, lazy } from 'react';
import {
    ChevronLeft, Users, Save, Plus, Trash2, Minus,
    Shield, Target, Info, Brain, Activity,
    TrendingUp, Send, SaveAll, Star, X, Check,
    PenTool, MousePointer2, Eye, EyeOff, Layout, Copy,
    Search, MapPin, UserCheck, Calendar,
    Swords, Type, UserPlus, GripHorizontal, Settings2,
    MessageSquare, Zap, ShieldAlert, Flag, Dumbbell,
    Layers, Gauge, Crosshair, Share2, List, ChevronRight, ChevronDown, RotateCw, Hash, Loader2
} from 'lucide-react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { auth } from '../supabaseAuth';
import { supabase } from '../supabaseClient';
import { useAppStore } from '../store';
import { FORMATIONS as FORMATIONS_SSOT } from '../utils/formations';
// Küme 3 köprüsü: kanonik takım/kadro okumaları + tek kayıt kapısı
import {
    MyTeamRow, TeamSquadRow, getMyTeams, getTeamSquad, formatLabel,
} from '../services/teamSocialService';
import {
    saveTeamTactic, approveTacticRpc, rejectTacticRpc, getTacticById,
    setTacticShareLink, tacticShareUrl,
} from '../services/tacticSocialService';
import { sendTeamMessage, tacticMessageBody } from '../services/teamChatService';

// Paylaşılan tipler ve sabitler (SSOT)
import type {
    Player, GameIdentity, Archetype, Slot, SquadSize, FormationType,
    TacticState, DrawingLine, StudioTool, PlayMode
} from './studio/types';
import { ARCHETYPES, INSTRUCTIONS } from './studio/types';
// Hafif geometri/sekans yardımcıları — çekirdekte kalır
import { getSmoothPathStr, computeSeqMap } from './studio/pitchGeometry';

// ⚡ GELİŞMİŞ ANİMASYON MODÜLÜ — on-demand (lazy) indirilir.
// Bu chunk yalnız kullanıcı "Gelişmiş Animasyon" butonuna basınca yüklenir,
// böylece ilk yük hafif kalır (düşük telefonlar yorulmasın).
const AdvancedAnimationModule = lazy(() => import('./studio/AdvancedAnimationModule'));
const AnimationToolbar = lazy(() =>
    import('./studio/AdvancedAnimationModule').then(m => ({ default: m.AnimationToolbar }))
);

// --- Constants ---

const FORMATIONS = FORMATIONS_SSOT as Record<SquadSize, Record<string, Slot[]>>;

// Stüdyoda seçilebilir boyutlar (3v3–11v11; halı saha odaklı).
const STUDIO_SIZES: SquadSize[] = ['3v3', '4v4', '5v5', '6v6', '7v7', '8v8', '9v9', '10v10', '11v11'];

// Plan yönetimi — en fazla 6 plan (A–F), renk mentaliteden türetilir + pip override.
const MAX_PLANS = 6;
type PlanColor = 'DEFAULT' | 'RED' | 'NAVY' | 'GREEN';
const PLAN_COLORS: PlanColor[] = ['DEFAULT', 'RED', 'NAVY', 'GREEN'];
const planLetter = (i: number) => String.fromCharCode(65 + i); // A, B, C, ...
const mentalityColor = (m: TacticState['mentality']): PlanColor =>
    m === 'Attacking' ? 'RED' : m === 'Defensive' ? 'NAVY' : 'GREEN';
// Etkin renk: groupColor DEFAULT/boşsa mentaliteden türetilir, aksi halde elle seçilen renk.
const resolvePlanColor = (plan: TacticState): PlanColor =>
    (!plan.groupColor || plan.groupColor === 'DEFAULT') ? mentalityColor(plan.mentality) : plan.groupColor;
const PIP_HEX: Record<PlanColor, string> = { DEFAULT: '#39FF14', RED: '#ef4444', NAVY: '#6366f1', GREEN: '#10b981' };

// Boyuta göre örnek satır deseni (kaleci hariç toplam = boyut-1).
const exampleForSize = (size: SquadSize): string => {
    const outfield = parseInt(String(size), 10) - 1;
    const map: Record<number, string> = {
        1: '1', 2: '1-1', 3: '1-1-1', 4: '2-1-1', 5: '2-2-1',
        6: '2-3-1', 7: '3-3-1', 8: '3-3-2', 9: '4-3-2', 10: '4-4-2',
    };
    return map[outfield] || '2-3-1';
};

// Satır sayısı deseninden (ör. "3-2-1", arkadan öne) plana-özel diziliş üretir.
// Kaleci en altta; satırlar 75→24 arası dağıtılır; ilk satır DEF, son satır FWD, ortalar MID.
const generateFormationFromPattern = (size: SquadSize, pattern: string): { slots: Slot[]; label: string } | null => {
    const outfield = parseInt(String(size), 10) - 1;
    const nums = pattern.split(/[-\s+.,]+/).map(s => s.trim()).filter(s => s !== '').map(Number);
    if (!nums.length || nums.some(n => !Number.isInteger(n) || n < 1 || n > 9)) return null;
    if (nums.reduce((a, b) => a + b, 0) !== outfield) return null;
    const L = nums.length;
    const slots: Slot[] = [{ id: 's1', x: 50, y: 90, role: 'GK' }];
    let idx = 2;
    nums.forEach((n, i) => {
        const y = L === 1 ? 46 : Math.round(75 - i * (51 / (L - 1)));
        const role = i === 0 ? 'DEF' : (i === L - 1 ? 'FWD' : 'MID');
        for (let j = 0; j < n; j++) {
            const x = n === 1 ? 50 : Math.round(18 + j * (64 / (n - 1)));
            slots.push({ id: 's' + idx, x, y, role });
            idx++;
        }
    });
    return { slots, label: nums.join('-') };
};


interface StudioProps {
    onBack: () => void;
    onNavigate: (view: any) => void;
}

const Studio: React.FC<StudioProps> = ({ onBack, onNavigate }) => {
    // Unified Plans State
    const [plans, setPlans] = useState<TacticState[]>([{
        id: crypto.randomUUID(),
        name: 'Plan A',
        size: '7v7',
        formation: '2-3-1',
        slots: JSON.parse(JSON.stringify(FORMATIONS['7v7']['2-3-1'])),
        subs: [],
        captainId: null,
        notes: 'Taktiksel analiz',
        opponents: [],
        mentality: 'Balanced',
        tempo: 'Normal',
        identity: 'BALANCED'
    }]);
    const [activePlanIndex, setActivePlanIndex] = useState(0);
    
    // Farazi Tools
    const [tool, setTool] = useState<StudioTool>('move');
    // Faz 1 — Boyut/Formasyon seçici (butona yapışık dropdown) + özel formasyon
    const [openSelector, setOpenSelector] = useState<'size' | 'formation' | null>(null);
    const [customPattern, setCustomPattern] = useState('');
    const [customError, setCustomError] = useState<string | null>(null);
    // Faz 3 — etkileşim & animasyon motoru
    const [hideLines, setHideLines] = useState(false);              // "Sadece Hareket" (S12)
    const [showClearSheet, setShowClearSheet] = useState(false);    // granüler temizle (S13)
    const [undoStack, setUndoStack] = useState<{ slots: Slot[]; opponents: Slot[]; drawings: DrawingLine[] }[]>([]);
    const [redoStack, setRedoStack] = useState<{ slots: Slot[]; opponents: Slot[]; drawings: DrawingLine[] }[]>([]);
    const [selectedEl, setSelectedEl] = useState<{ type: 'slot' | 'opponent' | 'line'; id: string } | null>(null);
    // Faz 4 — rakip çizim tarafı (BİZ / RAKİP) (S19) + isimlendirme sheet (S18)
    const [drawSide, setDrawSide] = useState<'US' | 'OPP'>('US');
    const [namingOpp, setNamingOpp] = useState<string | null>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [isSimulating, setIsSimulating] = useState(false);
    const [playMode, setPlayMode] = useState<PlayMode>('SYNC');
    const [showBall, setShowBall] = useState(false);

    // ⚡ Gelişmiş Animasyon Modülü durumu (lazy-load).
    // isAdvancedAnimLoaded: kullanıcı modülü indirdi mi?
    // advancedAnimApiRef: yüklenen modülün getAnimationProps fonksiyonu (saha
    // slot/rakip markörlerini hareket ettirmek için çekirdekte kullanılır).
    const [isAdvancedAnimLoaded, setIsAdvancedAnimLoaded] = useState(false);
    const [isLoadingAdvancedAnim, setIsLoadingAdvancedAnim] = useState(false);
    const advancedAnimApiRef = useRef<null | ((path: DrawingLine, isSimulating: boolean, playMode: PlayMode, seqInfo: { startTime: number, duration: number }, totalSeqDur: number) => any)>(null);

    // Modülü on-demand indirir; getAnimationProps API'sini ref'e bağlar.
    const loadAdvancedAnimation = async () => {
        if (isAdvancedAnimLoaded || isLoadingAdvancedAnim) return;
        setIsLoadingAdvancedAnim(true);
        try {
            const mod = await import('./studio/AdvancedAnimationModule');
            advancedAnimApiRef.current = mod.getAnimationProps;
            setIsAdvancedAnimLoaded(true);
        } catch (e) {
            console.error('Gelişmiş animasyon modülü yüklenemedi:', e);
            showToast('Gelişmiş animasyon modülü yüklenemedi.', 'error');
        } finally {
            setIsLoadingAdvancedAnim(false);
        }
    };
    const [selectedSeqBadge, setSelectedSeqBadge] = useState<string | null>(null);
    const [isCustomSeqInputOpen, setIsCustomSeqInputOpen] = useState(false);
    const [customSeqValue, setCustomSeqValue] = useState<string>('');
    const [currentLine, setCurrentLine] = useState<DrawingLine | null>(null);
    const [selectedSlotForArchetype, setSelectedSlotForArchetype] = useState<string | null>(null);
    const [showExportModal, setShowExportModal] = useState(false);
    const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
    
    // Custom Player Creation (Farazi)
    const [customPlayerName, setCustomPlayerName] = useState('');
    const [customPlayerRole, setCustomPlayerRole] = useState('-');

    // Modal selection tabs & groups state (matching CommunityView)
    const [modalTab, setModalTab] = useState<'FRIENDS' | 'TEAMS' | 'CUSTOM'>('FRIENDS');
    const [selectedGroup, setSelectedGroup] = useState('Tümü');
    const [groups, setGroups] = useState(['Favorilerim', 'Lise Tayfası', 'Üniversite', 'İş Arkadaşları', 'Tümü']);
    const [selectedTeamRosterId, setSelectedTeamRosterId] = useState<string | null>(null);



    const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
    const [isTeamConfirmed, setIsTeamConfirmed] = useState(false);

    const canvasRef = useRef<HTMLDivElement>(null);

    // Modals
    const [showTacticsModal, setShowTacticsModal] = useState(false);
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);
    const [saveTacticName, setSaveTacticName] = useState('');
    const [dbTactics, setDbTactics] = useState<TacticState[]>([]);

    // Global Store — arkadaşlar oyuncu-seçicide kullanılır
    const { friends } = useAppStore();
    const studioContext = useAppStore(s => s.studioContext);
    const setStudioContext = useAppStore(s => s.setStudioContext);

    // ── Küme 3 köprüsü: kanonik takımlar + GERÇEK kadrolar ──
    // store.myTeams (hayalet roster JSONB) ÖLDÜ; kaynak get_my_teams +
    // get_team_squad. Kadrolar takım seçilince tembel yüklenir.
    const [studioTeams, setStudioTeams] = useState<MyTeamRow[]>([]);
    const [squadsByTeam, setSquadsByTeam] = useState<Record<string, TeamSquadRow[]>>({});
    const squadsRef = useRef(squadsByTeam);
    squadsRef.current = squadsByTeam;

    useEffect(() => {
        if (!auth.currentUser) return;
        getMyTeams()
            .then(rows => setStudioTeams(rows.filter(r => !r.is_archived)))
            .catch(e => console.error('[Studio] takımlar yüklenemedi', e));
    }, []);

    const ensureSquad = async (teamId: string): Promise<TeamSquadRow[]> => {
        const cached = squadsRef.current[teamId];
        if (cached) return cached;
        const rows = await getTeamSquad(teamId);
        setSquadsByTeam(prev => ({ ...prev, [teamId]: rows }));
        return rows;
    };

    const squadRowToPlayer = (m: TeamSquadRow): Player => ({
        id: m.user_id,
        name: m.full_name,
        role: m.pos || 'CM',
        rating: m.fp || 70,
    });

    const populateSlotsWithSquad = (squad: TeamSquadRow[], currentSlots: Slot[]): Slot[] => {
        const newSlots = currentSlots.map(s => ({ ...s, player: undefined as Player | undefined }));
        const availablePlayers = squad.map(squadRowToPlayer);

        // GK önce eşleşir
        const gkSlotIndex = newSlots.findIndex(s => s.role === 'GK');
        if (gkSlotIndex !== -1) {
            const gkIndex = availablePlayers.findIndex(p => p.role === 'GK' || p.role === 'KALECİ');
            if (gkIndex !== -1) {
                newSlots[gkSlotIndex].player = availablePlayers[gkIndex];
                availablePlayers.splice(gkIndex, 1);
            }
        }
        newSlots.forEach((slot, idx) => {
            if (!slot.player && availablePlayers.length > 0) {
                let matchingIdx = availablePlayers.findIndex(p => p.role === slot.role);
                if (matchingIdx === -1) matchingIdx = 0;
                newSlots[idx].player = availablePlayers[matchingIdx];
                availablePlayers.splice(matchingIdx, 1);
            }
        });
        return newSlots;
    };

    // DB satırı → TacticState (fetch + derin bağlantı hidrasyonu ortak)
    const parseDbTactic = (d: any): TacticState => ({
        id: d.id,
        name: d.name,
        teamName: d.teamName,
        teamId: d.teamId ?? null,
        size: d.size,
        formation: d.formation,
        slots: JSON.parse(d.slots || '[]'),
        subs: JSON.parse(d.subs || '[]'),
        captainId: d.captainId || null,
        notes: d.notes || '',
        opponents: JSON.parse(d.opponents || '[]'),
        mentality: d.mentality || 'Balanced',
        tempo: d.tempo || 'Normal',
        identity: d.identity || 'BALANCED',
        drawings: JSON.parse(d.drawings || '[]'),
        status: d.status || undefined,
        proposedBy: d.proposedBy ?? null,
    });

    // studioContext tüketimi (M80): Takım Detayı'ndan gelen takım/taktik
    // bağlamı — activeStudioTeam makinesinin halefi.
    useEffect(() => {
        const ctx = studioContext;
        if (!ctx) return;
        setStudioContext(null); // tek kullanımlık — tüket
        void (async () => {
            try {
                if (ctx.tacticId) {
                    const row = await getTacticById(ctx.tacticId);
                    if (!row) { showToast('Taktik bulunamadı ya da erişimin yok.', 'error'); return; }
                    const hydrated = parseDbTactic(row);
                    setPlans(prev => {
                        const idx = prev.findIndex(p => p.id === hydrated.id);
                        if (idx >= 0) {
                            const next = [...prev]; next[idx] = hydrated;
                            setActivePlanIndex(idx);
                            return next;
                        }
                        setActivePlanIndex(prev.length);
                        return [...prev, hydrated];
                    });
                    if (hydrated.teamId) {
                        setSelectedTeamId(hydrated.teamId);
                        setIsTeamConfirmed(true);
                        void ensureSquad(hydrated.teamId);
                    }
                } else if (ctx.teamId) {
                    setSelectedTeamId(ctx.teamId);
                    const [squad, teams] = await Promise.all([ensureSquad(ctx.teamId), getMyTeams()]);
                    const teamRow = teams.find(t => t.team_id === ctx.teamId);
                    setStudioTeams(teams.filter(r => !r.is_archived));
                    setPlans(prev => {
                        const idx = Math.min(activePlanIndex, prev.length - 1);
                        return prev.map((p, i) => i === idx
                            ? { ...p, slots: populateSlotsWithSquad(squad, p.slots), teamName: teamRow?.name, teamId: ctx.teamId }
                            : p);
                    });
                    setIsTeamConfirmed(true);
                }
            } catch (e) {
                console.error('[Studio] bağlam yüklenemedi', e);
                showToast('Stüdyo bağlamı yüklenemedi.', 'error');
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [studioContext]);

    useEffect(() => {
        if (!auth.currentUser) return;

        const fetchTactics = async () => {
            const { data, error } = await supabase
                .from('tactics')
                .select('*')
                .eq('userId', auth.currentUser.uid);

            if (error) {
                console.error("Error fetching tactics:", error);
                return;
            }

            setDbTactics((data || []).map(parseDbTactic));
        };
        fetchTactics();

        const channel = supabase.channel(`tactics_${auth.currentUser.uid}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tactics', filter: `userId=eq.${auth.currentUser.uid}` }, () => {
                fetchTactics();
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, []);



    // Common State
    const [editingPlanIndex, setEditingPlanIndex] = useState<number | null>(null);
    const [editingPlanName, setEditingPlanName] = useState('');
    const [showPlayerSelect, setShowPlayerSelect] = useState<{ type: 'slot', slotId: string } | { type: 'sub' } | { type: 'any' } | null>(null);
    const [draggedItem, setDraggedItem] = useState<{ type: 'slot' | 'opponent', id: string, offsetX: number, offsetY: number } | null>(null);
    
    // Instruction Modal State
    const [instructionModal, setInstructionModal] = useState<{ type: 'slot' | 'opponent', id: string } | null>(null);

    const activeTactic = plans[activePlanIndex] || plans[0];
    const setActiveTactic = (newTactic: TacticState) => {
        const index = Math.min(activePlanIndex, plans.length - 1);
        const newPlans = [...plans];
        newPlans[index] = newTactic;
        setPlans(newPlans);
    };

    const drawings = activeTactic.drawings || [];
    const setDrawings = (newDrawings: DrawingLine[] | ((prev: DrawingLine[]) => DrawingLine[])) => {
        const derivedDrawings = typeof newDrawings === 'function' ? newDrawings(drawings) : newDrawings;
        setActiveTactic({ ...activeTactic, drawings: derivedDrawings });
    };

    // ── Geri Al / Yinele (S14) — aktif planın sahne anlık-görüntü yığını (maks 30) ──
    type Scene = { slots: Slot[]; opponents: Slot[]; drawings: DrawingLine[] };
    const sceneSnapshot = (): Scene => ({
        slots: JSON.parse(JSON.stringify(activeTactic.slots)),
        opponents: JSON.parse(JSON.stringify(activeTactic.opponents || [])),
        drawings: JSON.parse(JSON.stringify(activeTactic.drawings || [])),
    });
    // Bir mutasyondan ÖNCE çağrılır: mevcut sahneyi geçmişe iter, yinele yığınını temizler.
    const pushHistory = () => {
        setUndoStack(prev => [...prev.slice(-29), sceneSnapshot()]);
        setRedoStack([]);
    };
    const applyScene = (s: Scene) =>
        setActiveTactic({ ...activeTactic, slots: s.slots, opponents: s.opponents, drawings: s.drawings });
    const undo = () => {
        if (!undoStack.length) return;
        const snap = undoStack[undoStack.length - 1];
        setRedoStack(r => [...r, sceneSnapshot()]);
        setUndoStack(u => u.slice(0, -1));
        applyScene(snap);
        setSelectedEl(null);
    };
    const redo = () => {
        if (!redoStack.length) return;
        const snap = redoStack[redoStack.length - 1];
        setUndoStack(u => [...u.slice(-29), sceneSnapshot()]);
        setRedoStack(r => r.slice(0, -1));
        applyScene(snap);
        setSelectedEl(null);
    };
    // Plan değişince geçmiş sıfırlanır (her planın kendi sahnesi vardır).
    useEffect(() => { setUndoStack([]); setRedoStack([]); setSelectedEl(null); }, [activePlanIndex]);

    // Sekans haritası (hafif hesap — çekirdekte kalır, gelişmiş modüle de geçer)
    const { seqMap, totalSeqDuration } = computeSeqMap(drawings);

    // --- Common Handlers ---
    const preservePlayersAndSubs = (newSlots: Slot[], currentSubs: Player[]) => {
        const currentPlayers = activeTactic.slots.filter(s => s.player).map(s => s.player);
        let playerIndex = 0;
        newSlots.forEach((s: any) => {
            if (playerIndex < currentPlayers.length) {
                let selectedPlayer = null;
                if (s.role === 'GK') {
                    const gkIndex = currentPlayers.findIndex((p: any, idx: number) => p.role === 'GK' && idx >= playerIndex);
                    if (gkIndex !== -1) {
                         selectedPlayer = currentPlayers[gkIndex];
                         currentPlayers[gkIndex] = currentPlayers[playerIndex];
                         currentPlayers[playerIndex] = selectedPlayer;
                    }
                }
                if (!selectedPlayer) {
                    selectedPlayer = currentPlayers[playerIndex];
                }
                s.player = selectedPlayer;
                playerIndex++;
            }
        });

        const leftovers = currentPlayers.slice(playerIndex);
        const newSubs = [...currentSubs];
        leftovers.forEach(p => {
            if (p && !newSubs.some(sub => sub.id === p.id)) {
                newSubs.push(p);
            }
        });
        
        return { newSlots, newSubs };
    };

    const handleSizeChange = (size: SquadSize) => {
        pushHistory();
        const defaultFormation = Object.keys(FORMATIONS[size])[0] as FormationType;
        let baseSlots = JSON.parse(JSON.stringify(FORMATIONS[size][defaultFormation]));
        const { newSlots, newSubs } = preservePlayersAndSubs(baseSlots, activeTactic.subs);
        let captainId = activeTactic.captainId;
        if (captainId && !newSlots.some((s:any) => s.player?.id === captainId)) captainId = null;
        setActiveTactic({ ...activeTactic, size, formation: defaultFormation, slots: newSlots, subs: newSubs, captainId, drawings: [] });
    };

    const handleIdentityChange = (identity: GameIdentity) => {
        pushHistory();
        const baseSlots = JSON.parse(JSON.stringify(FORMATIONS[activeTactic.size][activeTactic.formation]));
        const newSlots = baseSlots.map((slot: Slot) => {
            // Keep existing player and archetype
            const existingSlot = activeTactic.slots.find(s => s.id === slot.id);
            if (existingSlot) {
                slot.player = existingSlot.player;
                slot.archetype = existingSlot.archetype;
            }
            
            // Apply identity offset
            if (slot.role !== 'GK') {
                if (identity === 'HIGH_PRESS') {
                    // Push everyone up
                    slot.y = Math.max(10, slot.y - 15);
                } else if (identity === 'PARK_BUS') {
                    // Pull everyone back
                    slot.y = Math.min(85, slot.y + 15);
                } else if (identity === 'COUNTER_ATTACK') {
                    // FWD stays up, others drop back
                    if (slot.role === 'FWD') {
                        slot.y = 15;
                    } else {
                        slot.y = Math.min(85, slot.y + 10);
                    }
                }
            }
            return slot;
        });
        setActiveTactic({ ...activeTactic, identity, slots: newSlots });
    };

    const handleFormationChange = (f: FormationType) => {
        pushHistory();
        let baseSlots = JSON.parse(JSON.stringify(FORMATIONS[activeTactic.size][f]));
        const { newSlots, newSubs } = preservePlayersAndSubs(baseSlots, activeTactic.subs);
        let captainId = activeTactic.captainId;
        if (captainId && !newSlots.some((s:any) => s.player?.id === captainId)) captainId = null;
        setActiveTactic({ ...activeTactic, formation: f, slots: newSlots, subs: newSubs, captainId, drawings: [] });
    };

    const showToast = (message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    // Özel formasyon: satır sayısı deseninden üret, YALNIZ aktif plana uygula (anında).
    const handleCustomFormation = () => {
        const res = generateFormationFromPattern(activeTactic.size, customPattern);
        if (!res) {
            setCustomError(`Kaleci hariç toplam ${parseInt(String(activeTactic.size), 10) - 1} oyuncu olmalı. Örn: ${exampleForSize(activeTactic.size)}`);
            return;
        }
        pushHistory();
        const { newSlots, newSubs } = preservePlayersAndSubs(res.slots, activeTactic.subs);
        let captainId = activeTactic.captainId;
        if (captainId && !newSlots.some((s: any) => s.player?.id === captainId)) captainId = null;
        setActiveTactic({ ...activeTactic, formation: res.label, slots: newSlots, subs: newSubs, captainId, drawings: [] });
        setOpenSelector(null); setCustomPattern(''); setCustomError(null);
        showToast(`Özel formasyon uygulandı: ${res.label}`);
    };

    const handleSelectPlayer = (player: Player) => {
        if (!showPlayerSelect) return;

        const isAlreadyInSlots = activeTactic.slots.some(s => s.player?.id === player.id);
        const isAlreadyInSubs = activeTactic.subs.some(p => p.id === player.id);

        if (isAlreadyInSlots || isAlreadyInSubs) {
            showToast("Bu oyuncu zaten kadroda!", 'error');
            return;
        }

        if (showPlayerSelect.type === 'slot') {
            const newSlots = activeTactic.slots.map(s => 
                s.id === showPlayerSelect.slotId ? { ...s, player } : s
            );
            setActiveTactic({ ...activeTactic, slots: newSlots });
            setShowPlayerSelect(null);
        } else if (showPlayerSelect.type === 'sub') {
            setActiveTactic({ ...activeTactic, subs: [...activeTactic.subs, player] });
            setShowPlayerSelect(null);
        } else if (showPlayerSelect.type === 'any') {
            let targetSlotIndex = activeTactic.slots.findIndex(s => !s.player && s.role === player.role);
            if (targetSlotIndex === -1) {
                targetSlotIndex = activeTactic.slots.findIndex(s => !s.player);
            }
            if (targetSlotIndex !== -1) {
                const newSlots = [...activeTactic.slots];
                newSlots[targetSlotIndex] = { ...newSlots[targetSlotIndex], player };
                setActiveTactic({ ...activeTactic, slots: newSlots });
                showToast(`${player.name} sahaya eklendi!`, 'success');
            } else {
                setActiveTactic({ ...activeTactic, subs: [...activeTactic.subs, player] });
                showToast(`${player.name} yedeklere eklendi!`, 'success');
            }
        }
    };

    const handleRemovePlayer = (slotId: string) => {
        let newCaptainId = activeTactic.captainId;
        const newSlots = activeTactic.slots.map(s => {
            if (s.id === slotId) {
                if (activeTactic.captainId === s.player?.id) {
                    newCaptainId = null;
                }
                return { ...s, player: undefined, instruction: undefined };
            }
            return s;
        });
        setActiveTactic({ ...activeTactic, slots: newSlots, captainId: newCaptainId });
    };

    const handleRemoveSub = (playerId: string) => {
        setActiveTactic({ ...activeTactic, subs: activeTactic.subs.filter(p => p.id !== playerId) });
    };

    const handleSetCaptain = (playerId: string) => {
        setActiveTactic({ ...activeTactic, captainId: playerId });
    };

    const handleSetInstruction = (type: 'slot' | 'opponent', id: string, instruction: string) => {
        if (type === 'slot') {
            const newSlots = activeTactic.slots.map(s => 
                s.id === id ? { ...s, instruction } : s
            );
            setActiveTactic({ ...activeTactic, slots: newSlots });
        } else {
            const newOpponents = activeTactic.opponents.map(o => 
                o.id === id ? { ...o, instruction } : o
            );
            setActiveTactic({ ...activeTactic, opponents: newOpponents });
        }
        setInstructionModal(null);
    };

    const handleReorderPlans = (newPlans: TacticState[]) => {
        const currentActivePlan = plans[activePlanIndex];
        const newActiveIndex = newPlans.findIndex(p => p.id === currentActivePlan?.id);
        setPlans(newPlans);
        if (newActiveIndex !== -1) setActivePlanIndex(newActiveIndex);
    };

    // Sekme gövdesi = yalnız SEÇ (renk artık ayrı pip ile değişir).
    const handlePlanClick = (index: number) => {
        setActivePlanIndex(index);
    };

    // Köşe pip'i: tek tıkla renk döngüsü (DEFAULT=otomatik → RED → NAVY → GREEN).
    const cyclePlanColor = (index: number) => {
        const newPlans = [...plans];
        const cur = (newPlans[index].groupColor || 'DEFAULT') as PlanColor;
        const next = PLAN_COLORS[(PLAN_COLORS.indexOf(cur) + 1) % PLAN_COLORS.length];
        newPlans[index] = { ...newPlans[index], groupColor: next };
        setPlans(newPlans);
    };

    // Planı kopyala (tam kopya: diziliş + çizimler + rakipler dahil).
    const handleDuplicatePlan = (index: number) => {
        if (plans.length >= MAX_PLANS) { showToast(`En fazla ${MAX_PLANS} plan olabilir.`, 'error'); return; }
        const copy: TacticState = JSON.parse(JSON.stringify(plans[index]));
        copy.id = crypto.randomUUID();
        copy.name = `${plans[index].name} (kopya)`;
        copy.status = undefined; copy.proposedBy = null; copy.priority = undefined;
        const newPlans = [...plans.slice(0, index + 1), copy, ...plans.slice(index + 1)];
        setPlans(newPlans);
        setActivePlanIndex(index + 1);
        showToast('Plan kopyalandı.');
    };

    const handleRenamePlan = (index: number) => {
        setEditingPlanIndex(index);
        setEditingPlanName(plans[index].name);
    };

    const savePlanName = () => {
        if (editingPlanIndex !== null && editingPlanName.trim() !== '') {
            const newPlans = [...plans];
            newPlans[editingPlanIndex] = { ...newPlans[editingPlanIndex], name: editingPlanName.trim() };
            setPlans(newPlans);
        }
        setEditingPlanIndex(null);
    };

    const handleDeletePlan = (index: number) => {
        if (confirm('Bu planı silmek istediğinize emin misiniz?')) {
            const newPlans = plans.filter((_, i) => i !== index);
            setPlans(newPlans);
            if (activePlanIndex === index) {
                setActivePlanIndex(Math.max(0, index - 1));
            } else if (activePlanIndex > index) {
                setActivePlanIndex(activePlanIndex - 1);
            }
        }
    };

    const handleReset = () => {
        setPlans([{
            id: crypto.randomUUID(),
            name: 'Plan A',
            size: '7v7',
            formation: '2-3-1',
            slots: JSON.parse(JSON.stringify(FORMATIONS['7v7']['2-3-1'])),
            subs: [],
            captainId: null,
            notes: 'Taktiksel analiz',
            opponents: [],
            mentality: 'Balanced',
            tempo: 'Normal',
            identity: 'BALANCED'
        }]);
        setActivePlanIndex(0);
        setShowResetConfirmModal(false);
    };

    // Yeni plan: aktif planın KADROSUNU ve DİZİLİŞİNİ koruyarak açılır (varyant üret).
    const handleNewTactic = () => {
        if (plans.length >= MAX_PLANS) { showToast(`En fazla ${MAX_PLANS} plan olabilir.`, 'error'); return; }
        const src = activeTactic;
        const newPlan: TacticState = {
            id: crypto.randomUUID(),
            name: `Plan ${planLetter(plans.length)}`,
            size: src.size,
            formation: src.formation,
            slots: JSON.parse(JSON.stringify(src.slots)),
            subs: JSON.parse(JSON.stringify(src.subs || [])),
            captainId: src.captainId,
            notes: '',
            opponents: [],
            mentality: src.mentality,
            tempo: src.tempo,
            identity: src.identity,
            teamId: src.teamId,
            teamName: src.teamName,
            drawings: [],
        };
        setPlans([...plans, newPlan]);
        setActivePlanIndex(plans.length);
        showToast(`Plan ${planLetter(plans.length)} eklendi — kadro ve diziliş korundu.`);
    };

    // Kayıt TEK KAPIDAN: save_team_tactic RPC. Status SUNUCUDA belirlenir
    // (yönetici → APPROVED, üye → PENDING_APPROVAL + yöneticilere bildirim,
    // takımsız → kişisel kütüphane). İstemci status yazımı ÖLDÜ (M85).
    const handleSaveTactic = async () => {
        if (!saveTacticName.trim()) {
            showToast("Taktik ismi boş olamaz.", 'error');
            return;
        }
        if (!auth.currentUser) {
            showToast("Taktiği kaydetmek için giriş yapmalısın.", 'error');
            return;
        }

        try {
            const existingId = activeTactic.id && dbTactics.find(t => t.id === activeTactic.id)
                ? activeTactic.id : null;
            const res = await saveTeamTactic(selectedTeamId ?? null, existingId, {
                name: saveTacticName.trim(),
                size: activeTactic.size,
                formation: activeTactic.formation,
                slots: activeTactic.slots,
                subs: activeTactic.subs,
                opponents: activeTactic.opponents,
                drawings: activeTactic.drawings || [],
                captainId: activeTactic.captainId,
                notes: activeTactic.notes,
                mentality: activeTactic.mentality,
                tempo: activeTactic.tempo,
                identity: activeTactic.identity,
            });

            const teamRow = studioTeams.find(t => t.team_id === selectedTeamId);
            setActiveTactic({
                ...activeTactic,
                id: res.tacticId,
                name: saveTacticName.trim(),
                teamName: teamRow?.name,
                teamId: selectedTeamId || null,
                status: res.status as TacticState['status'],
                proposedBy: res.status === 'PENDING_APPROVAL' ? auth.currentUser.uid : null,
            });
            showToast(res.status === 'PENDING_APPROVAL'
                ? "Taktik önerin takım yöneticilerine gönderildi!"
                : "Taktik kaydedildi!");
            setShowSaveModal(false);
        } catch (error) {
            console.error("Error saving tactic:", error);
            showToast((error as Error)?.message || "Taktik kaydedilirken bir hata oluştu.", 'error');
        }
    };

    // Stüdyo-içi öneri karar akışı: bekleyen takım taktiği + yönetici (M87)
    const myRoleForActiveTeam = studioTeams.find(t => t.team_id === (activeTactic.teamId || selectedTeamId))?.my_role;
    const canDecideProposal = !!(
        activeTactic.status === 'PENDING_APPROVAL'
        && activeTactic.teamId
        && (myRoleForActiveTeam === 'CAPTAIN' || myRoleForActiveTeam === 'ADMIN')
        && activeTactic.proposedBy
        && activeTactic.proposedBy !== auth.currentUser?.uid
    );
    const [decidingProposal, setDecidingProposal] = useState(false);

    const decideProposal = async (approve: boolean) => {
        if (!activeTactic.id || decidingProposal) return;
        setDecidingProposal(true);
        try {
            if (approve) {
                await approveTacticRpc(activeTactic.id);
                setActiveTactic({ ...activeTactic, status: 'APPROVED' });
                showToast("Taktik onaylandı — oyun defterine eklendi!");
            } else {
                await rejectTacticRpc(activeTactic.id);
                setActiveTactic({ ...activeTactic, status: 'REJECTED' });
                showToast("Öneri reddedildi; yazarın kişisel kütüphanesine kopyalandı.");
            }
        } catch (e) {
            showToast((e as Error)?.message || 'İşlem tamamlanamadı.', 'error');
        } finally {
            setDecidingProposal(false);
        }
    };

    // --- Farazi Mode Handlers ---
    const handleCreateCustomPlayer = () => {
        if (!customPlayerName.trim() || !showPlayerSelect) return;

        const newPlayer: Player = {
            id: `custom_${Date.now()}`,
            name: customPlayerName,
            role: customPlayerRole,
            rating: 99,
            isCustom: true
        };

        handleSelectPlayer(newPlayer);
        setCustomPlayerName('');
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        if (!canvasRef.current) return;
        
        const rect = canvasRef.current.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;

        if (tool.startsWith('draw')) {
            setIsDrawing(true);
            pushHistory(); // çizim öncesi sahneyi geçmişe al (S14)

            // Find nearest slot or opponent (within 5% radius)
            // Çizim tarafına göre (BİZ/RAKİP) yalnız o tarafın ögelerine bağlan (S19)
            let attachedTo: string | undefined;
            const threshold = 5;
            let minDistance = Infinity;
            const attachCandidates = drawSide === 'OPP' ? activeTactic.opponents : activeTactic.slots;
            attachCandidates.forEach(el => {
                const dist = Math.sqrt(Math.pow(el.x - x, 2) + Math.pow(el.y - y, 2));
                if (dist < threshold && dist < minDistance) { minDistance = dist; attachedTo = el.id; }
            });

            // Aynı ögede aynı türden çizgi varsa değiştir (bir oyuncunun hem koşusu hem pası olabilir).
            if (attachedTo) {
                const lineType = tool === 'draw_pass' ? 'arrow' : 'line';
                setDrawings(prev => prev.filter(d => d.attachedTo !== attachedTo || d.type !== lineType));
            }

            const maxSeq = drawings.reduce((max, d) => Math.max(max, d.seqStep), 0);
            setCurrentLine({
                id: `l${Date.now()}`,
                points: [{ x, y }],
                color: drawSide === 'OPP' ? '#ef4444' : '#39FF14',
                type: tool === 'draw_pass' ? 'arrow' : 'line',
                attachedTo,
                seqStep: maxSeq + 1
            });
        } else if (tool === 'move') {
            // Boş sahaya dokunuş: seçimi kaldır; uzun basınca (500ms) o noktaya rakip bırak (S11/S17).
            setSelectedEl(null);
            const px = x, py = y;
            if (longPressRef.current) clearTimeout(longPressRef.current);
            longPressRef.current = setTimeout(() => { addOpponentAt(px, py); longPressRef.current = null; }, 500);
        }
    };

    const rafRef = useRef<number | null>(null);
    // Sürükleme başlangıç konumu + pre-drag sahne (yalnız gerçekten taşınırsa geçmişe yazılır).
    const dragStartRef = useRef<{ x: number; y: number; snap: Scene } | null>(null);
    // Rakip eklemek için uzun-basma zamanlayıcısı (S17).
    const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Boş sahaya uzun basınca o noktaya rakip bırak (S17).
    const addOpponentAt = (x: number, y: number) => {
        pushHistory();
        const stamp = Date.now();
        const newOpponent: Slot = {
            id: `opp_${stamp}`, x, y, role: 'OPP',
            player: { id: `opp_p_${stamp}`, name: `Rakip ${activeTactic.opponents.length + 1}`, role: 'OPP', rating: 0, isOpponent: true },
        };
        setActiveTactic({ ...activeTactic, opponents: [...activeTactic.opponents, newOpponent] });
        if (navigator.vibrate) navigator.vibrate(15);
    };

    // Rakip dizilişi: mevcut dizilişi rakip yarısına AYNALA (S20).
    const mirrorOpponents = () => {
        pushHistory();
        const stamp = Date.now();
        const mirrored: Slot[] = activeTactic.slots.map((s, i) => ({
            id: `opp_${stamp}_${i}`,
            x: Math.round(100 - s.x),
            y: Math.round(100 - s.y),
            role: 'OPP',
            player: { id: `opp_p_${stamp}_${i}`, name: `R${i + 1}`, role: 'OPP', rating: 0, isOpponent: true },
        }));
        setActiveTactic({ ...activeTactic, opponents: mirrored });
        showToast('Rakip dizilişi eklendi (ayna).');
    };

    const renameOpponent = (id: string, name: string, instruction?: string) => {
        setActiveTactic({
            ...activeTactic,
            opponents: activeTactic.opponents.map(o =>
                o.id === id
                    ? { ...o, player: { ...(o.player as Player), name: name.trim() || o.player?.name || 'Rakip' }, instruction: instruction ?? o.instruction }
                    : o),
        });
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!canvasRef.current) return;
        
        const rect = canvasRef.current.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;

        if (isDrawing && currentLine) {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            rafRef.current = requestAnimationFrame(() => {
                setCurrentLine(prev => {
                    if (!prev) return null;
                    const lastPoint = prev.points[prev.points.length - 1];
                    if (prev.points.length > 0) {
                        const dist = Math.hypot(x - lastPoint.x, y - lastPoint.y);
                        // Add point ONLY if it moved at least somewhat (2% distance)
                        if (dist < 2.0) return prev;
                    }
                    return {
                        ...prev,
                        points: [...prev.points, { x, y }]
                    };
                });
            });
        } else if (draggedItem && tool === 'move') {
            const clampedX = Math.max(0, Math.min(100, x - draggedItem.offsetX));
            const clampedY = Math.max(0, Math.min(100, y - draggedItem.offsetY));

            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            rafRef.current = requestAnimationFrame(() => {
                if (draggedItem.type === 'slot') {
                    setActiveTactic({
                        ...activeTactic,
                        slots: activeTactic.slots.map(s => 
                            s.id === draggedItem.id ? { ...s, x: clampedX, y: clampedY } : s
                        )
                    });
                } else if (draggedItem.type === 'opponent') {
                    setActiveTactic({
                        ...activeTactic,
                        opponents: activeTactic.opponents.map(o => 
                            o.id === draggedItem.id ? { ...o, x: clampedX, y: clampedY } : o
                        )
                    });
                }
            });
        }
    };

    const handlePointerUp = () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        // Uzun-basma iptali (500ms dolmadan bırakıldıysa rakip eklenmez).
        if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; }

        if (isDrawing && currentLine) {
            const finalLine = { ...currentLine } as DrawingLine;
            setDrawings([...drawings, finalLine]);
            setIsDrawing(false);
            setCurrentLine(null);
        }
        // Sürükleme mi, dokunuş mu? (S11) — taşındıysa geçmişe yaz; dokunuşsa SEÇ.
        if (draggedItem && dragStartRef.current) {
            const cur = draggedItem.type === 'slot'
                ? activeTactic.slots.find(s => s.id === draggedItem.id)
                : activeTactic.opponents.find(o => o.id === draggedItem.id);
            const moved = !!cur && Math.hypot(cur.x - dragStartRef.current.x, cur.y - dragStartRef.current.y) > 0.4;
            if (moved) {
                const snap = dragStartRef.current.snap;
                setUndoStack(prev => [...prev.slice(-29), snap]);
                setRedoStack([]);
            } else {
                // Dokunuş: öğeyi seç; rakipse isimlendirme sheet'ini aç (S18).
                setSelectedEl({ type: draggedItem.type, id: draggedItem.id });
                if (draggedItem.type === 'opponent') setNamingOpp(draggedItem.id);
            }
        }
        dragStartRef.current = null;
        setDraggedItem(null);
    };

    const handleDragStart = (type: 'slot' | 'opponent', id: string, e: React.PointerEvent) => {
        if (tool !== 'move' || !canvasRef.current) return;
        e.stopPropagation();
        e.currentTarget.releasePointerCapture(e.pointerId);

        let currentX = 0;
        let currentY = 0;
        if (type === 'slot') {
            const slot = activeTactic.slots.find(s => s.id === id);
            if (slot) { currentX = slot.x; currentY = slot.y; }
        } else {
            const opp = activeTactic.opponents.find(o => o.id === id);
            if (opp) { currentX = opp.x; currentY = opp.y; }
        }

        const rect = canvasRef.current.getBoundingClientRect();
        const pointerX = ((e.clientX - rect.left) / rect.width) * 100;
        const pointerY = ((e.clientY - rect.top) / rect.height) * 100;

        dragStartRef.current = { x: currentX, y: currentY, snap: sceneSnapshot() };
        setDraggedItem({ type, id, offsetX: pointerX - currentX, offsetY: pointerY - currentY });
        if (navigator.vibrate) navigator.vibrate(10);
    };

    const handleRemoveOpponent = (id: string) => {
        pushHistory();
        setActiveTactic({ ...activeTactic, opponents: activeTactic.opponents.filter(o => o.id !== id) });
        setSelectedEl(null);
    };

    // ── Granüler temizle (S13) ──
    const clearDrawingsOnly = () => { pushHistory(); setDrawings([]); setShowClearSheet(false); setSelectedEl(null); showToast('Çizimler silindi · GERİ AL ile dön'); };
    const clearOpponentsOnly = () => { pushHistory(); setActiveTactic({ ...activeTactic, opponents: [] }); setShowClearSheet(false); setSelectedEl(null); showToast('Rakipler silindi · GERİ AL ile dön'); };
    const clearSelected = () => {
        if (!selectedEl) return;
        pushHistory();
        if (selectedEl.type === 'line') setActiveTactic({ ...activeTactic, drawings: drawings.filter(d => d.id !== selectedEl.id) });
        else if (selectedEl.type === 'opponent') setActiveTactic({ ...activeTactic, opponents: activeTactic.opponents.filter(o => o.id !== selectedEl.id), drawings: drawings.filter(d => d.attachedTo !== selectedEl.id) });
        else if (selectedEl.type === 'slot') setActiveTactic({ ...activeTactic, drawings: drawings.filter(d => d.attachedTo !== selectedEl.id) });
        setShowClearSheet(false); setSelectedEl(null); showToast('Seçili öge silindi · GERİ AL ile dön');
    };
    const clearAllScene = () => { pushHistory(); setIsSimulating(false); setActiveTactic({ ...activeTactic, opponents: [], drawings: [] }); setShowClearSheet(false); setSelectedEl(null); showToast('Tahta temizlendi · GERİ AL ile dön'); };



    const isSquadComplete = activeTactic.slots.every(s => !!s.player);
    const hasGK = activeTactic.slots.some(s => s.role === 'GK' && !!s.player);
    const canSave = isSquadComplete && hasGK;

    // Get all players on the pitch (own team + opponents)
    const allPlayersOnPitch = [
        ...activeTactic.slots.filter(s => s.player).map(s => ({ ...s, type: 'slot' as const })),
        ...activeTactic.opponents.map(o => ({ ...o, type: 'opponent' as const }))
    ];

    return (
        <div className="min-h-screen flex flex-col font-sans selection:bg-[#39FF14] selection:text-black pb-10">
            <AnimatePresence mode="wait">
                {(
                    <motion.div 
                        key="studio"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex flex-col min-h-[calc(100vh-6rem)]"
                    >
                        {/* Header */}
                        <header className="px-6 pt-safe pb-4 flex justify-between items-center sticky top-0 bg-[#050812]/90 backdrop-blur-xl z-30 border-b border-white/5">
                            <div className="flex items-center gap-3">
                                <button id="studio-back-button" onClick={onBack} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white hover:bg-white/10">
                                    <ChevronLeft size={20} />
                                </button>
                                <div>
                                    <h1 className="text-xl font-black text-white tracking-[0.2em] uppercase">TAKTİK STUDIO</h1>
                                    <p className="text-[10px] text-[#39FF14] font-mono uppercase">Kadro & Diziliş</p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => {
                                        setSaveTacticName(activeTactic.name || '');
                                        setShowSaveModal(true);
                                    }}
                                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 rounded-full text-xs font-bold text-white shadow-[0_0_15px_rgba(16,185,129,0.5)] hover:shadow-[0_0_25px_rgba(16,185,129,0.8)] transition-all"
                                >
                                    <Save size={14} /> KAYDET
                                </button>
                                <button 
                                    onClick={() => setShowExportModal(true)}
                                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 rounded-full text-xs font-bold text-white shadow-[0_0_15px_rgba(147,51,234,0.5)] hover:shadow-[0_0_25px_rgba(147,51,234,0.8)] transition-all"
                                >
                                    <Send size={14} /> PAYLAŞ
                                </button>
                            </div>
                        </header>

            {/* Plan Selector */}
            <div className="px-6 pb-6 pt-2">
                <Reorder.Group 
                    axis="x" 
                    values={plans} 
                    onReorder={handleReorderPlans}
                    className="flex gap-3 overflow-x-auto no-scrollbar items-center snap-x p-1"
                >
                    {plans.map((plan, index) => {
                        const isActive = activePlanIndex === index;
                        const effColor = resolvePlanColor(plan);
                        const isAutoColor = !plan.groupColor || plan.groupColor === 'DEFAULT';

                        const getGroupColorStyles = (color: 'DEFAULT'|'RED'|'NAVY'|'GREEN'|undefined, isAct: boolean) => {
                            let base = '';
                            switch(color) {
                                case 'RED': base = 'bg-gradient-to-br from-red-500/20 to-rose-900/40 border-red-500/80'; break;
                                case 'NAVY': base = 'bg-gradient-to-br from-indigo-500/20 to-blue-900/40 border-indigo-500/80'; break;
                                case 'GREEN': base = 'bg-gradient-to-br from-emerald-500/20 to-green-900/40 border-emerald-500/80'; break;
                                case 'DEFAULT':
                                default:
                                    base = 'bg-gradient-to-br from-[#39FF14]/20 to-emerald-900/40 border-[#39FF14]/80';
                                    break;
                            }
                            if (isAct) {
                                switch(color) {
                                    case 'RED': return base + ' shadow-[0_0_20px_rgba(239,68,68,0.25)] ring-1 ring-red-500/50';
                                    case 'NAVY': return base + ' shadow-[0_0_20px_rgba(99,102,241,0.25)] ring-1 ring-indigo-500/50';
                                    case 'GREEN': return base + ' shadow-[0_0_20px_rgba(16,185,129,0.25)] ring-1 ring-emerald-500/50';
                                    case 'DEFAULT':
                                    default:
                                        return base + ' shadow-[0_0_20px_rgba(57,255,20,0.25)] ring-1 ring-[#39FF14]/50';
                                }
                            }
                            return base + ' hover:brightness-110';
                        };

                        const getTextColorStyles = (color: 'DEFAULT'|'RED'|'NAVY'|'GREEN'|undefined, isAct: boolean) => {
                            if (!isAct) {
                                switch(color) {
                                    case 'RED': return 'text-red-500 hover:text-red-400';
                                    case 'NAVY': return 'text-indigo-400 hover:text-indigo-300';
                                    case 'GREEN': return 'text-emerald-500 hover:text-emerald-400';
                                    case 'DEFAULT':
                                    default: return 'text-[#39FF14]/60 hover:text-[#39FF14]';
                                }
                            } else {
                                return 'text-white drop-shadow-[0_0_5px_rgba(255,255,255,0.5)]';
                            }
                        };

                        return (
                            <Reorder.Item 
                                key={plan.id}
                                value={plan}
                                dragConstraints={{ top: 0, bottom: 0 }}
                                dragElastic={0.2}
                                whileHover={{ scale: isActive ? 1 : 1.02 }}
                                whileDrag={{ scale: 1.05, zIndex: 50, cursor: 'grabbing', opacity: 0.95 }}
                                className={`relative snap-center flex-shrink-0 flex flex-col justify-between h-[80px] w-[148px] rounded-[20px] p-3 transition-colors duration-300 border cursor-grab active:cursor-grabbing ${getGroupColorStyles(effColor, isActive)}`}
                            >
                                <div className="flex justify-between items-start w-full">
                                    {/* Sabit A–F harf kimliği */}
                                    <span className="text-[11px] font-black text-white/90 bg-black/30 rounded-md px-1.5 py-0.5 leading-none font-mono">{planLetter(index)}</span>
                                    <div className="flex items-center gap-1">
                                        {/* Renk pip'i — her zaman görünür, tek tıkla döngü (kesik=otomatik, dolu=elle) */}
                                        <button
                                            onClick={(e) => { e.stopPropagation(); cyclePlanColor(index); }}
                                            title={isAutoColor ? 'Renk: mentaliteden (otomatik) — değiştirmek için dokun' : 'Renk: elle seçildi — değiştirmek için dokun'}
                                            className={`w-4 h-4 rounded-full cursor-pointer ${isAutoColor ? 'border border-dashed border-white/70' : 'border-2 border-white/90'}`}
                                            style={{ backgroundColor: PIP_HEX[effColor] }}
                                        />
                                        {isActive && editingPlanIndex !== index && (
                                            <>
                                                <button onClick={(e) => { e.stopPropagation(); handleRenamePlan(index); }} className="p-1 cursor-pointer text-gray-300 hover:text-white transition-colors" title="İsmi Değiştir"><PenTool size={12}/></button>
                                                <button onClick={(e) => { e.stopPropagation(); handleDuplicatePlan(index); }} className="p-1 cursor-pointer text-gray-300 hover:text-white transition-colors" title="Planı Kopyala"><Copy size={12}/></button>
                                                {plans.length > 1 && (
                                                    <button onClick={(e) => { e.stopPropagation(); handleDeletePlan(index); }} className="p-1 cursor-pointer text-gray-300 hover:text-red-500 transition-colors" title="Planı Sil"><Trash2 size={12}/></button>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                                {editingPlanIndex === index ? (
                                    <input
                                        autoFocus
                                        value={editingPlanName}
                                        onChange={(e) => setEditingPlanName(e.target.value)}
                                        onBlur={savePlanName}
                                        onKeyDown={(e) => e.key === 'Enter' && savePlanName()}
                                        className={`text-center text-sm font-black bg-transparent outline-none w-full uppercase tracking-tighter text-[#39FF14]`}
                                        placeholder="PLAN İSMİ"
                                    />
                                ) : (
                                    <button
                                        onClick={() => handlePlanClick(index)}
                                        onDoubleClick={() => isActive && handleRenamePlan(index)}
                                        className={`text-center text-sm font-black uppercase tracking-tighter truncate w-full transition-all ${getTextColorStyles(effColor, isActive)}`}
                                    >
                                        {plan.name}
                                    </button>
                                )}
                            </Reorder.Item>
                        );
                    })}
                    
                    {plans.length < MAX_PLANS && (
                        <button
                            onClick={handleNewTactic}
                            className="flex-shrink-0 w-[60px] h-[80px] rounded-[20px] bg-black/20 border-2 border-dashed border-white/10 hover:border-white/30 text-white/30 hover:text-white/60 transition-all flex flex-col items-center justify-center gap-1 group"
                            title="Yeni plan (kadro & diziliş korunur)"
                        >
                            <Plus size={20} className="group-hover:scale-110 transition-transform" />
                            <span className="text-[9px] font-black tracking-widest uppercase">Ekle</span>
                        </button>
                    )}
                </Reorder.Group>
            </div>

            {/* Boyut & Formasyon — butona yapışık dropdown'lar (anında uygulanır) */}
            <div className="px-6 pb-4">
                <div className="flex gap-2 relative">
                    {/* Boyut (oyuncu sayısı) */}
                    <div className="relative shrink-0">
                        <button
                            onClick={() => setOpenSelector(openSelector === 'size' ? null : 'size')}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-black tracking-widest hover:bg-white/10 transition-all"
                        >
                            <Users size={14} className="text-[#39FF14]" /> {activeTactic.size}
                            <ChevronDown size={14} className={`transition-transform ${openSelector === 'size' ? 'rotate-180' : ''}`} />
                        </button>
                        {openSelector === 'size' && (
                            <div className="absolute top-full left-0 mt-2 z-40 w-44 bg-[#0E1420] border border-white/10 rounded-2xl p-2 shadow-2xl max-h-64 overflow-y-auto no-scrollbar">
                                {STUDIO_SIZES.map(sz => (
                                    <button
                                        key={sz}
                                        onClick={() => { handleSizeChange(sz); setOpenSelector(null); }}
                                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-colors ${activeTactic.size === sz ? 'bg-[#39FF14]/15 text-[#39FF14]' : 'text-gray-300 hover:bg-white/5'}`}
                                    >
                                        <span>{sz}</span>
                                        <span className="text-[10px] text-gray-500 font-mono">{parseInt(String(sz), 10)} kişi</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Formasyon (+ satır sayısıyla özel formasyon) */}
                    <div className="relative flex-1 min-w-0">
                        <button
                            onClick={() => setOpenSelector(openSelector === 'formation' ? null : 'formation')}
                            className="w-full flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-black tracking-widest hover:bg-white/10 transition-all"
                        >
                            <span className="flex items-center gap-2 min-w-0"><Layout size={14} className="text-[#39FF14] shrink-0" /><span className="truncate">{activeTactic.formation}</span></span>
                            <ChevronDown size={14} className={`shrink-0 transition-transform ${openSelector === 'formation' ? 'rotate-180' : ''}`} />
                        </button>
                        {openSelector === 'formation' && (
                            <div className="absolute top-full left-0 right-0 mt-2 z-40 bg-[#0E1420] border border-white/10 rounded-2xl p-2 shadow-2xl">
                                <div className="max-h-52 overflow-y-auto no-scrollbar space-y-0.5">
                                    {Object.keys(FORMATIONS[activeTactic.size]).map(f => (
                                        <button
                                            key={f}
                                            onClick={() => { handleFormationChange(f); setOpenSelector(null); }}
                                            className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition-colors ${activeTactic.formation === f ? 'bg-[#39FF14] text-black' : 'text-gray-300 hover:bg-white/5'}`}
                                        >
                                            {f}
                                        </button>
                                    ))}
                                </div>
                                <div className="mt-2 pt-2 border-t border-white/10">
                                    <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest px-1 mb-1.5">Yeni formasyon (satır sayısı)</p>
                                    <div className="flex gap-2">
                                        <input
                                            value={customPattern}
                                            onChange={e => { setCustomPattern(e.target.value); setCustomError(null); }}
                                            onKeyDown={e => e.key === 'Enter' && handleCustomFormation()}
                                            placeholder={`örn. ${exampleForSize(activeTactic.size)}`}
                                            inputMode="numeric"
                                            className="flex-1 min-w-0 bg-[#0A0E14] border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-600 focus:border-[#39FF14] outline-none transition-colors"
                                        />
                                        <button
                                            onClick={handleCustomFormation}
                                            className="px-3 py-2 rounded-xl bg-[#39FF14] text-black text-[10px] font-black tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all shrink-0"
                                        >
                                            UYGULA
                                        </button>
                                    </div>
                                    {customError
                                        ? <p className="text-[10px] text-red-400 mt-1.5 px-1">{customError}</p>
                                        : <p className="text-[10px] text-gray-600 mt-1.5 px-1">Kaleci hariç {parseInt(String(activeTactic.size), 10) - 1} oyuncu, arkadan öne. Bu diziliş yalnız bu plana özeldir.</p>}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                {/* Dışarı tıklayınca kapat */}
                {openSelector && <div className="fixed inset-0 z-30" onClick={() => setOpenSelector(null)} />}
            </div>

            {/* Toolbar */}
            <div className="px-6 pb-4 flex gap-2 overflow-x-auto no-scrollbar">
                    <button 
                        onClick={() => setTool('move')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap ${tool === 'move' ? 'bg-[#39FF14] text-black' : 'bg-white/5 text-white hover:bg-white/10'}`}
                    >
                        <MousePointer2 size={14} /> TAŞI
                    </button>
                    <button 
                        onClick={() => setTool('draw_run')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap ${tool === 'draw_run' ? 'bg-[#39FF14] text-black' : 'bg-white/5 text-white hover:bg-white/10'}`}
                        title="Koşu Çiz"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="4 4"><path d="M5 12h14"></path></svg> KOŞU
                    </button>
                    <button 
                        onClick={() => setTool('draw_pass')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap ${tool === 'draw_pass' ? 'bg-[#39FF14] text-black' : 'bg-white/5 text-white hover:bg-white/10'}`}
                        title="Pas Çiz"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12h14M12 5l7 7-7 7"></path></svg> PAS
                    </button>
                    {/* BİZ / RAKİP çizim tarafı — koşu/pas hangi tarafa çizilecek (S19) */}
                    {tool.startsWith('draw') && (
                        <div className="flex items-center rounded-full bg-white/5 border border-white/10 p-0.5 shrink-0">
                            <button
                                onClick={() => setDrawSide('US')}
                                className={`px-3 py-1.5 rounded-full text-[11px] font-black tracking-widest transition-all ${drawSide === 'US' ? 'bg-[#39FF14] text-black' : 'text-gray-400 hover:text-white'}`}
                            >BİZ</button>
                            <button
                                onClick={() => setDrawSide('OPP')}
                                className={`px-3 py-1.5 rounded-full text-[11px] font-black tracking-widest transition-all ${drawSide === 'OPP' ? 'bg-red-500 text-white' : 'text-gray-400 hover:text-white'}`}
                            >RAKİP</button>
                        </div>
                    )}
                    {/* Rakip dizilişi ekle (ayna) (S20) */}
                    <button
                        onClick={mirrorOpponents}
                        title="Rakip dizilişi ekle (mevcut dizilişi aynala)"
                        className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold bg-white/5 text-white hover:bg-red-500/20 hover:text-red-400 transition-all whitespace-nowrap"
                    >
                        <Swords size={14} /> RAKİP DİZİLİŞİ
                    </button>
                    {drawings.length > 0 && (
                        !isAdvancedAnimLoaded ? (
                            // ⚡ Modül henüz indirilmedi: on-demand indirme butonu
                            <button
                                onClick={loadAdvancedAnimation}
                                disabled={isLoadingAdvancedAnim}
                                className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-black transition-all whitespace-nowrap shadow-lg bg-[#FACC15] text-black shadow-[#FACC15]/30 hover:scale-105 disabled:opacity-60"
                                title="Gelişmiş animasyon motorunu indir ve oynat"
                            >
                                {isLoadingAdvancedAnim ? (
                                    <><Loader2 size={14} className="animate-spin" /> MODÜL İNDİRİLİYOR...</>
                                ) : (
                                    <><Zap size={14} className="fill-current" /> GELİŞMİŞ ANİMASYON</>
                                )}
                            </button>
                        ) : (
                            // Modül indirildi: lazy toolbar kontrolleri
                            <Suspense fallback={
                                <div className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-black bg-white/5 text-gray-400 whitespace-nowrap">
                                    <Loader2 size={14} className="animate-spin" /> Gelişmiş animasyon modülü indiriliyor...
                                </div>
                            }>
                                <AnimationToolbar
                                    isSimulating={isSimulating}
                                    setIsSimulating={setIsSimulating}
                                    showBall={showBall}
                                    setShowBall={setShowBall}
                                    playMode={playMode}
                                    setPlayMode={setPlayMode}
                                />
                            </Suspense>
                        )
                    )}
                    <div className="w-px h-8 bg-white/10 mx-1"></div>
                    {/* Geri Al / Yinele (S14) */}
                    <button
                        onClick={undo}
                        disabled={undoStack.length === 0}
                        title="Geri Al"
                        className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold bg-white/5 text-white hover:bg-white/10 transition-all whitespace-nowrap disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        <RotateCw size={14} className="-scale-x-100" /> GERİ AL
                    </button>
                    <button
                        onClick={redo}
                        disabled={redoStack.length === 0}
                        title="Yinele"
                        className="flex items-center justify-center w-9 h-9 rounded-full text-xs font-bold bg-white/5 text-white hover:bg-white/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        <RotateCw size={14} />
                    </button>
                    {/* Sadece Hareket (S12) — çizgileri gizle, yalnız top+oyuncu hareketi görünür */}
                    <button
                        onClick={() => setHideLines(v => !v)}
                        title={hideLines ? 'Çizgileri göster' : 'Sadece hareket (çizgileri gizle)'}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap ${hideLines ? 'bg-[#39FF14] text-black' : 'bg-white/5 text-white hover:bg-white/10'}`}
                    >
                        {hideLines ? <EyeOff size={14} /> : <Eye size={14} />} SADECE HAREKET
                    </button>
                    <button
                        onClick={() => setShowClearSheet(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold bg-white/5 text-white hover:bg-red-500/20 hover:text-red-500 transition-all whitespace-nowrap"
                    >
                        <Trash2 size={14} /> TEMİZLE
                    </button>
                </div>

            {/* Pitch Area */}
            <div className="px-6 relative z-10 max-w-md mx-auto w-full">
                <div 
                    ref={canvasRef}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerLeave={handlePointerUp}
                    className={`relative w-full aspect-[3/4] bg-[#0B2815] rounded-[24px] border-4 border-[#161B22] shadow-[inset_0_0_60px_rgba(0,0,0,0.8)] overflow-hidden ${tool.startsWith('draw') ? 'cursor-crosshair touch-none' : ''} ${tool === 'opponent' ? 'cursor-copy touch-none' : ''}`}
                >
                    {/* Grass Stripes */}
                    <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 10%, rgba(0,0,0,0.2) 10%, rgba(0,0,0,0.2) 20%)' }}></div>
                    
                    {/* Pitch Markings (Halı Saha Style) */}
                    <div className="absolute inset-0 pointer-events-none opacity-30">
                        <svg viewBox="0 0 600 1000" preserveAspectRatio="none" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                            <g stroke="white" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round">
                                {/* Dış Çizgiler */}
                                <rect x="10" y="10" width="580" height="980" />
                                {/* Orta Çizgi */}
                                <line x1="10" y1="500" x2="590" y2="500" />
                                {/* Orta Yuvarlak */}
                                <circle cx="300" cy="500" r="80" />
                                <circle cx="300" cy="500" r="4" fill="white" />
                                
                                {/* Üst Ceza Sahası */}
                                <rect x="150" y="10" width="300" height="160" />
                                <circle cx="300" cy="130" r="4" fill="white" />
                                <path d="M 220 170 A 80 80 0 0 0 380 170" />
                                
                                {/* Alt Ceza Sahası */}
                                <rect x="150" y="830" width="300" height="160" />
                                <circle cx="300" cy="870" r="4" fill="white" />
                                <path d="M 220 830 A 80 80 0 0 1 380 830" />

                                {/* Köşe Vuruşu Yayları */}
                                <path d="M 10 40 A 30 30 0 0 0 40 10" />
                                <path d="M 560 10 A 30 30 0 0 0 590 40" />
                                <path d="M 10 960 A 30 30 0 0 1 40 990" />
                                <path d="M 590 960 A 30 30 0 0 0 560 990" />
                            </g>
                        </svg>
                    </div>

                    {/* Drawings Layer */}
                        <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
                            <defs>
                                <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
                                    <polygon points="0 0, 10 3.5, 0 7" fill="#39FF14" />
                                </marker>
                                <marker id="arrowhead-opp" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
                                    <polygon points="0 0, 10 3.5, 0 7" fill="#ef4444" />
                                </marker>
                            </defs>
                            {!hideLines && drawings.map(line => (
                                <path
                                    key={line.id}
                                    d={getSmoothPathStr(line.points, canvasRef.current!.clientWidth, canvasRef.current!.clientHeight)}
                                    fill="none"
                                    stroke={line.color}
                                    strokeWidth={selectedEl?.type === 'line' && selectedEl.id === line.id ? '5' : '3'}
                                    strokeDasharray={line.type === 'line' ? '8,8' : 'none'}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    markerEnd={line.color === '#ef4444' ? 'url(#arrowhead-opp)' : 'url(#arrowhead)'}
                                    opacity={isSimulating ? "0.3" : (selectedEl?.type === 'line' && selectedEl.id === line.id ? '1' : '0.8')}
                                    className="transition-opacity duration-500"
                                />
                            ))}
                            {!hideLines && currentLine && (
                                <path 
                                    d={getSmoothPathStr(currentLine.points, canvasRef.current!.clientWidth, canvasRef.current!.clientHeight)}
                                    fill="none"
                                    stroke={currentLine.color}
                                    strokeWidth="3"
                                    strokeDasharray={currentLine.type === 'line' ? '8,8' : 'none'}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    markerEnd={currentLine.color === '#ef4444' ? 'url(#arrowhead-opp)' : 'url(#arrowhead)'}
                                    opacity="0.8"
                                />
                            )}
                        </svg>

                    {/* Opponents */}
                    {activeTactic.opponents.map(opp => {
                        const path = drawings.find(d => d.attachedTo === opp.id && d.type === 'line');
                        const isMoving = isSimulating && path && advancedAnimApiRef.current;
                        const anim = path && isMoving ? advancedAnimApiRef.current!(path, isSimulating, playMode, seqMap.get(path.id)!, totalSeqDuration) : null;
                        return (
                        <motion.div 
                            key={opp.id}
                            onPointerDown={(e) => handleDragStart('opponent', opp.id, e)}
                            className={`absolute w-10 h-10 z-20 ${tool === 'move' ? 'cursor-grab active:cursor-grabbing touch-none' : 'pointer-events-auto'} ${isMoving ? 'brightness-125 drop-shadow-[0_0_15px_rgba(239,68,68,0.8)]' : ''}`}
                            animate={anim ? anim.animate : {
                                left: `${opp.x}%`,
                                top: `${opp.y}%`
                            }}
                            transition={anim ? anim.transition as any : (draggedItem?.id === opp.id ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 30 })}
                            style={{ x: "-50%", y: "-50%", zIndex: draggedItem?.id === opp.id ? 50 : 20 }}
                        >
                            <div className={`relative w-full h-full rounded-full border-2 flex items-center justify-center shadow-lg bg-red-900/80 text-white transition-all ${selectedEl?.type === 'opponent' && selectedEl.id === opp.id ? 'border-white ring-2 ring-white/70 scale-110' : 'border-red-500'}`}>
                                <Swords size={16} />
                            </div>
                            <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-1 flex flex-col items-center pointer-events-none">
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-950/80 text-red-200 whitespace-nowrap border border-red-500/30">
                                    {opp.player?.name}
                                </span>
                                {opp.instruction && (
                                    <span className="text-[8px] font-bold mt-0.5 bg-black/40 px-1 rounded text-red-400">
                                        {opp.instruction}
                                    </span>
                                )}
                            </div>
                        </motion.div>
                    )})}

                    {/* Slots */}
                    {activeTactic.slots.map(slot => {
                        const path = drawings.find(d => d.attachedTo === slot.id && d.type === 'line');
                        const isMoving = isSimulating && path && advancedAnimApiRef.current;
                        const anim = path && isMoving ? advancedAnimApiRef.current!(path, isSimulating, playMode, seqMap.get(path.id)!, totalSeqDuration) : null;
                        return (
                        <motion.div 
                            key={slot.id}
                            layout={draggedItem?.id === slot.id ? false : true}
                            animate={anim ? anim.animate : {
                                left: `${slot.x}%`,
                                top: `${slot.y}%`
                            }}
                            transition={anim ? anim.transition as any : (draggedItem?.id === slot.id ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 30 })}
                            onPointerDown={(e) => {
                                if (tool === 'move' && slot.player) {
                                    handleDragStart('slot', slot.id, e);
                                }
                            }}
                            className={`absolute w-12 h-12 z-20 ${tool === 'move' && slot.player ? 'cursor-grab active:cursor-grabbing touch-none' : ''} ${isMoving ? 'brightness-125 drop-shadow-[0_0_15px_rgba(57,255,20,0.8)]' : ''}`}
                            style={{ x: "-50%", y: "-50%", zIndex: draggedItem?.id === slot.id ? 50 : 20 }}
                        >
                            {slot.player ? (
                                <motion.div 
                                    whileHover={{ scale: 1.1 }}
                                    whileTap={{ scale: 0.9 }}
                                    className={`relative w-full h-full rounded-full border-2 flex items-center justify-center shadow-[0_4px_15px_rgba(0,0,0,0.5)] ${slot.role === 'GK' ? 'bg-gradient-to-br from-orange-400 to-orange-600 border-orange-300' : 'bg-gradient-to-br from-[#1e2532] to-[#11151c] border-white/30'}`}
                                >
                                    <span className="text-white font-black text-sm drop-shadow-md">{slot.player.name.charAt(0)}</span>
                                    {activeTactic.captainId === slot.player.id && (
                                        <div className="absolute -top-2 -right-2 w-5 h-5 bg-gradient-to-br from-yellow-300 to-yellow-500 rounded-full flex items-center justify-center text-black text-[10px] font-black border-2 border-[#161B22] shadow-sm">
                                            K
                                        </div>
                                    )}
                                    {slot.archetype && slot.archetype !== 'NONE' && (
                                        <div 
                                            className="absolute -bottom-2 -right-2 w-6 h-6 bg-gradient-to-br from-yellow-400 to-amber-600 rounded-full flex items-center justify-center text-black text-xs border-2 border-[#161B22] shadow-lg z-30"
                                        >
                                            {ARCHETYPES[slot.archetype].icon}
                                        </div>
                                    )}
                                </motion.div>
                            ) : (
                                <motion.button 
                                    whileHover={{ scale: 1.1 }}
                                    whileTap={{ scale: 0.9 }}
                                    onClick={() => setShowPlayerSelect({ type: 'slot', slotId: slot.id })}
                                    className={`relative w-full h-full rounded-full border-2 border-dashed flex items-center justify-center bg-black/20 backdrop-blur-sm transition-colors ${slot.role === 'GK' ? 'border-orange-500/50 text-orange-500 hover:border-orange-400' : 'border-[#39FF14]/50 text-[#39FF14]/70 hover:border-[#39FF14] hover:text-[#39FF14]'}`}
                                >
                                    <Plus size={20} />
                                </motion.button>
                            )}
                            <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-1 flex flex-col items-center pointer-events-none">
                                {slot.player && (
                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded text-white whitespace-nowrap ${slot.player?.isCustom ? 'bg-purple-600/80 border border-purple-400/50' : 'bg-black/60'}`}>
                                        {slot.player.name}
                                    </span>
                                )}
                                {slot.instruction && (
                                    <span className={`text-[8px] font-bold mt-0.5 bg-black/40 px-1 rounded text-[#39FF14]`}>
                                        {slot.instruction}
                                    </span>
                                )}
                            </div>
                        </motion.div>
                    )})}

                    {/* ⚡ GELİŞMİŞ ANİMASYON OVERLAY (lazy) — top animasyonu + sekans/timeline editörü.
                        Yalnız modül indirildiğinde mount edilir; ağır kısım buradadır. */}
                    {isAdvancedAnimLoaded && (
                        <Suspense fallback={null}>
                            <AdvancedAnimationModule
                                drawings={drawings}
                                isSimulating={isSimulating}
                                showBall={showBall}
                                playMode={playMode}
                                seqMap={seqMap}
                                totalSeqDuration={totalSeqDuration}
                                selectedSeqBadge={selectedSeqBadge}
                                setSelectedSeqBadge={setSelectedSeqBadge}
                                isCustomSeqInputOpen={isCustomSeqInputOpen}
                                setIsCustomSeqInputOpen={setIsCustomSeqInputOpen}
                                customSeqValue={customSeqValue}
                                setCustomSeqValue={setCustomSeqValue}
                                setDrawings={setDrawings}
                            />
                        </Suspense>
                    )}
                </div>
            </div>

            {/* Team Selection & Auto Fill */}
            {!isTeamConfirmed && (
            <div className="px-6 pb-6 mt-4">
                <div className="bg-[#161B22] rounded-[32px] border border-white/5 p-5 shadow-[0_4px_40px_rgba(0,0,0,0.5)]">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2">
                            <Users size={14} className="text-[#39FF14]" /> TAKIM SEÇİMİ
                        </h3>
                    </div>
                    
                    {/* Horizontal Team List — kanonik get_my_teams (hayalet güç puanı öldü) */}
                    <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2 mb-4">
                        {studioTeams.map((team) => (
                            <button
                                key={team.team_id}
                                onClick={() => { setSelectedTeamId(team.team_id); void ensureSquad(team.team_id); }}
                                className={`flex-shrink-0 w-[140px] p-3 rounded-2xl border transition-all text-left ${
                                    selectedTeamId === team.team_id
                                        ? 'bg-[#39FF14]/10 border-[#39FF14]/50 shadow-[0_0_15px_rgba(57,255,20,0.2)]'
                                        : 'bg-white/5 border-white/5 hover:bg-white/10'
                                }`}
                            >
                                <h4 className="text-white font-bold text-xs mb-1 truncate">{team.name}</h4>
                                <div className="text-[10px] font-bold text-gray-500">
                                    <span className={selectedTeamId === team.team_id ? 'text-[#39FF14]' : 'text-white'}>{team.member_count}</span> oyuncu · {formatLabel(team.format)}
                                </div>
                            </button>
                        ))}
                    </div>

                    <div className="flex flex-col gap-2">
                        {selectedTeamId && !isSquadComplete && (
                            <button
                                onClick={() => {
                                    void (async () => {
                                        try {
                                            const squad = await ensureSquad(selectedTeamId);
                                            const teamRow = studioTeams.find(t => t.team_id === selectedTeamId);
                                            setActiveTactic({
                                                ...activeTactic,
                                                slots: populateSlotsWithSquad(squad, activeTactic.slots),
                                                teamName: teamRow?.name,
                                                teamId: selectedTeamId,
                                            });
                                            setIsTeamConfirmed(true);
                                        } catch (e) {
                                            console.error('[Studio] kadro yüklenemedi', e);
                                            showToast('Kadro yüklenemedi.', 'error');
                                        }
                                    })();
                                }}
                                className="w-full h-12 bg-gradient-to-r from-[#39FF14] to-emerald-600 rounded-2xl flex items-center justify-center gap-2 text-black font-black text-[10px] tracking-widest uppercase hover:scale-[1.02] active:scale-[0.98] transition-all shadow-[0_0_20px_rgba(57,255,20,0.3)] animate-pulse"
                            >
                                <Users size={16} />
                                SEÇİLİ TAKIMI ONAYLA
                            </button>
                        )}
                        
                        {isSquadComplete && (
                            <button
                                onClick={() => setIsTeamConfirmed(true)}
                                className="w-full h-12 bg-gradient-to-r from-[#39FF14] to-emerald-600 rounded-2xl flex items-center justify-center gap-2 text-black font-black text-[10px] tracking-widest uppercase hover:scale-[1.02] active:scale-[0.98] transition-all shadow-[0_0_20px_rgba(57,255,20,0.3)] animate-pulse"
                            >
                                <Users size={16} />
                                KADROYU ONAYLA
                            </button>
                        )}

                        <button
                            onClick={() => setShowPlayerSelect({ type: 'any' })}
                            className="w-full h-12 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center gap-2 text-white font-black text-[10px] tracking-widest uppercase hover:scale-[1.02] active:scale-[0.98] transition-all shadow-[0_0_20px_rgba(79,70,229,0.3)]"
                        >
                            <Users size={16} className="text-yellow-400" />
                            KAYITLI ARKADAŞLARI GÖSTER
                        </button>
                    </div>
                </div>
            </div>
            )}

            {/* Tactical Settings (Mentality & Tempo) Redesign */}
            <div className="px-6 pb-6 mt-8">
                <div className="grid grid-cols-2 gap-4">
                    {/* Mentality */}
                    <div className="bg-[#161B22] rounded-[32px] border border-white/5 p-5 shadow-[0_4px_40px_rgba(0,0,0,0.5)]">
                        <h3 className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2 mb-4">
                            <Shield size={14} className="text-yellow-400" /> MENTALİTE
                        </h3>
                        <div className="flex flex-col gap-2">
                            {(['Defensive', 'Balanced', 'Attacking'] as const).map(m => (
                                <button 
                                    key={m}
                                    onClick={() => setActiveTactic({ ...activeTactic, mentality: m })}
                                    className={`w-full py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all border ${
                                        activeTactic.mentality === m 
                                            ? 'bg-yellow-400/10 border-yellow-400/50 text-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.2)]'
                                            : 'bg-white/5 border-transparent text-white hover:bg-white/10'
                                    }`}
                                >
                                    {m === 'Defensive' ? 'DEFANSİF' : m === 'Balanced' ? 'DENGELİ' : 'HÜCUMCU'}
                                </button>
                            ))}
                        </div>
                    </div>
                    
                    {/* Tempo */}
                    <div className="bg-[#161B22] rounded-[32px] border border-white/5 p-5 shadow-[0_4px_40px_rgba(0,0,0,0.5)]">
                        <h3 className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2 mb-4">
                            <Gauge size={14} className="text-blue-400" /> TEMPO
                        </h3>
                        <div className="flex flex-col gap-2">
                            {(['Slow', 'Normal', 'Fast'] as const).map(t => (
                                <button 
                                    key={t}
                                    onClick={() => setActiveTactic({ ...activeTactic, tempo: t })}
                                    className={`w-full py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all border ${
                                        activeTactic.tempo === t 
                                            ? 'bg-blue-400/10 border-blue-400/50 text-blue-400 shadow-[0_0_10px_rgba(96,165,250,0.2)]'
                                            : 'bg-white/5 border-transparent text-white hover:bg-white/10'
                                    }`}
                                >
                                    {t === 'Slow' ? 'YAVAŞ' : t === 'Normal' ? 'NORMAL' : 'HIZLI'}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Section Specific Content */}
            {/* Player List & Instructions Panel */}
            {allPlayersOnPitch.length > 0 && (
                <div className="px-6 mt-6">
                    <div className="bg-[#161B22] rounded-2xl border border-white/10 overflow-hidden">
                        <div className="p-4 border-b border-white/5 bg-white/5 flex items-center justify-between">
                            <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                                <Users size={16} className={'text-[#39FF14]'} /> 
                                Oyuncular
                            </h3>
                            <button 
                                onClick={() => setShowPlayerSelect({ type: 'any' })}
                                className="w-8 h-8 rounded-full bg-[#39FF14]/20 flex items-center justify-center text-[#39FF14] hover:bg-[#39FF14]/30 transition-colors"
                            >
                                <Plus size={16} />
                            </button>
                        </div>
                        <div className="divide-y divide-white/5">
                            {allPlayersOnPitch.map((item) => (
                                <div key={item.id} className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-white ${item.type === 'opponent' ? 'bg-red-500' : (item.role === 'GK' ? 'bg-orange-500' : 'bg-[#39FF14] text-black')}`}>
                                            {item.type === 'opponent' ? <Swords size={16} /> : item.player?.name.charAt(0)}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h4 className="text-white font-bold text-sm">{item.player?.name}</h4>
                                                {item.type === 'opponent' && <span className="bg-red-500/20 text-red-400 text-[8px] px-1.5 py-0.5 rounded border border-red-500/30">RAKİP</span>}
                                                {item.player?.isCustom && <span className="bg-purple-500/20 text-purple-400 text-[8px] px-1.5 py-0.5 rounded border border-purple-500/30">HAYALİ</span>}
                                                {activeTactic.captainId === item.player?.id && <span className="bg-yellow-400/20 text-yellow-400 text-[8px] px-1.5 py-0.5 rounded border border-yellow-400/30">KAPTAN</span>}
                                            </div>
                                            <p className="text-[10px] text-gray-500 font-bold mt-0.5">
                                                {item.type === 'slot' ? (
                                                    item.archetype && item.archetype !== 'NONE' ? (
                                                        <span className="text-purple-400">
                                                            Rol: {ARCHETYPES[item.archetype].label} {ARCHETYPES[item.archetype].icon}
                                                        </span>
                                                    ) : (
                                                        'Rol atanmadı'
                                                    )
                                                ) : (
                                                    item.instruction ? (
                                                        <span className={item.type === 'opponent' ? 'text-red-400' : 'text-[#39FF14]'}>
                                                            Görev: {item.instruction}
                                                        </span>
                                                    ) : (
                                                        'Görev atanmadı'
                                                    )
                                                )}
                                            </p>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-2">
                                        {item.type === 'slot' && (
                                            <button 
                                                onClick={() => handleSetCaptain(item.player!.id)}
                                                className={`p-2 rounded-lg transition-all ${activeTactic.captainId === item.player?.id ? 'bg-yellow-400/20 text-yellow-400' : 'bg-white/5 text-gray-400 hover:text-white'}`}
                                            >
                                                <Star size={16} className={activeTactic.captainId === item.player?.id ? 'fill-current' : ''} />
                                            </button>
                                        )}
                                        <button 
                                            onClick={() => item.type === 'slot' ? setSelectedSlotForArchetype(item.id) : setInstructionModal({ type: item.type, id: item.id })}
                                            className={`p-2 rounded-lg transition-all ${((item.type === 'slot' && item.archetype && item.archetype !== 'NONE') || (item.type !== 'slot' && item.instruction)) ? 'bg-[#39FF14]/20 text-[#39FF14]' : 'bg-white/5 text-gray-400 hover:text-white'}`}
                                        >
                                            {item.type === 'slot' ? <Brain size={16} /> : <MessageSquare size={16} />}
                                        </button>
                                        <button 
                                            onClick={() => item.type === 'slot' ? handleRemovePlayer(item.id) : handleRemoveOpponent(item.id)}
                                            className="p-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500/20 transition-all"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Action Buttons */}
            <div className="px-6 mt-6 pb-32">
                <div className="flex gap-2 w-full">
                    <button 
                        onClick={() => setShowTacticsModal(true)}
                        className="w-1/3 h-14 bg-[#161B22] border border-white/10 rounded-2xl flex flex-col items-center justify-center gap-1 text-white hover:bg-white/5 transition-all group"
                    >
                        <List size={18} className="text-gray-400 group-hover:text-white transition-colors" />
                        <span className="font-black text-[9px] tracking-widest text-[#39FF14]">TAKTİKLER</span>
                    </button>
                    
                    <button 
                        onClick={() => setShowResetConfirmModal(true)}
                        className="w-1/3 h-14 bg-[#161B22] border border-white/10 rounded-2xl flex flex-col items-center justify-center gap-1 text-white hover:bg-white/5 transition-all group"
                    >
                        <Plus size={18} className="text-gray-400 group-hover:text-white transition-colors" />
                        <span className="font-black text-[9px] tracking-widest text-[#39FF14]">YENİ TAKTİK</span>
                    </button>
                    
                    <div className="w-1/3 relative group">
                        <button 
                            disabled={!canSave}
                            onClick={() => {
                                setSaveTacticName(activeTactic.name || '');
                                setShowSaveModal(true);
                            }}
                            className="w-full h-14 rounded-2xl flex flex-col items-center justify-center gap-1 text-black font-black text-[9px] tracking-widest disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98] transition-all bg-[#39FF14] shadow-[0_0_20px_rgba(57,255,20,0.2)]"
                        >
                            <Save size={18} className="mb-0.5" />
                            KAYDET
                        </button>
                        {!canSave && (
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-red-500/90 text-white text-[10px] font-bold p-2 rounded-lg text-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                Kadroyu tamamlayın ve kaleci seçin.
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Archetype Selection Modal */}
            <AnimatePresence>
                {selectedSlotForArchetype && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/80 backdrop-blur-md z-[60] flex items-center justify-center p-6"
                        onClick={() => setSelectedSlotForArchetype(null)}
                    >
                        <motion.div 
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-[#161B22] border border-white/10 rounded-[32px] w-full max-w-sm p-6 shadow-2xl" 
                            onClick={e => e.stopPropagation()}
                        >
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-black text-white uppercase tracking-widest flex items-center gap-2">
                                <Brain size={20} className="text-purple-400" /> ROL ATA
                            </h3>
                            <button onClick={() => setSelectedSlotForArchetype(null)} className="p-2 text-gray-400 hover:text-white"><X size={20} /></button>
                        </div>
                        <div className="grid grid-cols-1 gap-3 max-h-[60vh] overflow-y-auto no-scrollbar pb-4">
                            {Object.entries(ARCHETYPES).map(([key, arch]) => (
                                <button
                                    key={key}
                                    onClick={() => {
                                        const newSlots = activeTactic.slots.map(s => 
                                            s.id === selectedSlotForArchetype ? { ...s, archetype: key as Archetype } : s
                                        );
                                        setActiveTactic({ ...activeTactic, slots: newSlots });
                                        setSelectedSlotForArchetype(null);
                                    }}
                                    className={`flex items-center gap-4 p-4 rounded-2xl border text-left transition-all ${
                                        activeTactic.slots.find(s => s.id === selectedSlotForArchetype)?.archetype === key 
                                        ? 'bg-purple-500/20 border-purple-500/50' 
                                        : 'bg-white/5 border-white/5 hover:bg-white/10'
                                    }`}
                                >
                                    <div className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center text-xl">
                                        {arch.icon || <X size={16} className="text-gray-500" />}
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-white text-sm">{arch.label}</h4>
                                        {arch.hint && <p className="text-[10px] text-gray-400 mt-1">{arch.hint}</p>}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>

            {/* Instruction Modal */}
            <AnimatePresence>
                {instructionModal && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-md flex items-center justify-center p-6"
                    >
                        <motion.div 
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-[#161B22] border border-white/10 rounded-2xl p-6 w-full max-w-sm"
                        >
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-lg font-black text-white uppercase tracking-widest">Görev Ver</h3>
                                <button onClick={() => setInstructionModal(null)} className="text-gray-400 hover:text-white">
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                {INSTRUCTIONS.map(inst => (
                                    <button 
                                        key={inst}
                                        onClick={() => handleSetInstruction(instructionModal.type, instructionModal.id, inst)}
                                        className={`py-3 rounded-xl text-xs font-bold transition-all ${instructionModal.type === 'opponent' ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20' : 'bg-[#39FF14]/10 text-[#39FF14] hover:bg-[#39FF14]/20 border border-[#39FF14]/20'}`}
                                    >
                                        {inst}
                                    </button>
                                ))}
                                <button 
                                    onClick={() => handleSetInstruction(instructionModal.type, instructionModal.id, '')}
                                    className="col-span-2 py-3 rounded-xl text-xs font-bold bg-white/5 text-gray-400 hover:bg-white/10 transition-all border border-white/10"
                                >
                                    Görevi Temizle
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Player Selection Modal */}
            <AnimatePresence>
                {showPlayerSelect && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-md flex flex-col"
                    >
                        <div className="flex-1 overflow-y-auto p-6 pt-20 max-w-md mx-auto w-full">
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h2 className="text-xl font-black text-white uppercase tracking-widest italic">Oyuncu Seç</h2>
                                    <p className={`text-[10px] font-bold uppercase tracking-widest text-[#39FF14]`}>
                                        Kayıtlı Arkadaşlar & Takımlar
                                    </p>
                                </div>
                                <button 
                                    onClick={() => {
                                        setShowPlayerSelect(null);
                                        setSelectedTeamRosterId(null);
                                    }}
                                    className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            {/* Navigation Tabs (Friends / Teams / Custom) */}
                            <div className="flex bg-black/40 backdrop-blur-md rounded-2xl p-1 border border-white/10 mb-6 relative z-10">
                                {[
                                  { id: 'FRIENDS', label: 'Arkadaşlarım', icon: Users },
                                  { id: 'TEAMS', label: 'Takımlarım', icon: Swords },
                                  { id: 'CUSTOM', label: 'Hayali', icon: Type }
                                ].map(tab => {
                                  const Icon = tab.icon;
                                  return (
                                    <button 
                                      key={tab.id}
                                      onClick={() => setModalTab(tab.id as any)}
                                      className={`flex-1 py-2.5 flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all relative ${modalTab === tab.id ? 'text-[#39FF14]' : 'text-gray-500 hover:text-gray-300'}`}
                                    >
                                      {modalTab === tab.id && (
                                        <motion.div layoutId="modalNav" className="absolute inset-0 bg-white/10 border border-white/5 rounded-xl" />
                                      )}
                                      <Icon size={14} className="relative z-10" />
                                      <span className="relative z-10">{tab.label}</span>
                                    </button>
                                  );
                                })}
                            </div>

                            {/* TAB 1: FRIENDS */}
                            {modalTab === 'FRIENDS' && (
                                <div className="space-y-4">
                                    {/* Groups list switcher (from CommunityView) */}
                                    <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar items-center">
                                        {groups.map(group => (
                                            <button 
                                                key={group} 
                                                onClick={() => setSelectedGroup(group)}
                                                className={`whitespace-nowrap px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all flex items-center gap-1.5 ${selectedGroup === group ? (group === 'Favorilerim' ? 'bg-[#FACC15] text-black border-[#FACC15] shadow-[0_0_15px_rgba(250,204,21,0.3)]' : 'bg-white text-black border-white shadow-lg') : 'bg-transparent text-gray-500 border-white/10 hover:border-white/30'}`}
                                            >
                                                {group === 'Favorilerim' && <Star size={12} fill={selectedGroup === group ? "black" : "currentColor"} className={selectedGroup === group ? 'text-black' : 'text-gray-500'} />}
                                                {group}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Friends list (from CommunityView style) */}
                                    <div className="grid gap-3">
                                        {friends && friends.filter(f => {
                                            if (selectedGroup === 'Tümü') return true;
                                            if (selectedGroup === 'Favorilerim') return f.isFavorite;
                                            return f.group === selectedGroup;
                                        }).length === 0 ? (
                                            <div className="text-center py-8 bg-[#161B22]/50 border border-white/5 rounded-2xl">
                                                <p className="text-gray-500 font-bold text-xs uppercase tracking-wider">Arkadaş Bulunamadı</p>
                                            </div>
                                        ) : (
                                            friends && friends.filter(f => {
                                                if (selectedGroup === 'Tümü') return true;
                                                if (selectedGroup === 'Favorilerim') return f.isFavorite;
                                                return f.group === selectedGroup;
                                            }).map(friend => (
                                                <button 
                                                    key={friend.id} 
                                                    onClick={() => {
                                                        const p: Player = {
                                                            id: friend.id,
                                                            name: friend.name,
                                                            role: friend.pos || 'CM',
                                                            rating: friend.fp || 80,
                                                            isCustom: false
                                                        };
                                                        handleSelectPlayer(p);
                                                    }}
                                                    className="w-full bg-gradient-to-br from-[#161B22] to-[#0A0E14] border border-white/5 rounded-3xl p-4 flex items-center justify-between hover:border-[#39FF14]/50 transition-all text-left relative group overflow-hidden"
                                                >
                                                    <div className="flex items-center gap-4 pointer-events-none">
                                                        <div className="relative">
                                                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center font-black text-lg border border-white/10 shadow-lg group-hover:bg-[#39FF14] group-hover:text-black transition-all">
                                                                {friend.name.charAt(0)}
                                                            </div>
                                                            {friend.online && <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-[#39FF14] rounded-full border-[3px] border-[#0A0E14] shadow-[0_0_10px_rgba(57,255,20,0.5)]" />}
                                                        </div>
                                                        <div>
                                                            <h4 className="text-base font-black text-white tracking-tight flex items-center gap-2 group-hover:text-[#39FF14] transition-colors">
                                                                {friend.name}
                                                                {friend.isFavorite && <Star size={12} className="text-[#FACC15]" fill="#FACC15" />}
                                                            </h4>
                                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                                <Hash size={10} className="text-gray-500" />
                                                                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">{friend.group}</span>
                                                                <span className="text-gray-700 text-[10px]">•</span>
                                                                <span className="text-[10px] font-bold text-gray-500">{friend.pos}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-3 pointer-events-none">
                                                        <div className="flex flex-col items-end gap-1">
                                                            <div className="flex items-end gap-[3px] h-4">
                                                                {[1, 2, 3, 4, 5].map(level => {
                                                                    const matches = (friend.wins || 0) + (friend.losses || 0);
                                                                    const activityLevel = Math.min(5, Math.max(1, Math.ceil(matches / 6)));
                                                                    const isActive = level <= activityLevel;
                                                                    const colors = ['bg-[#FACC15]', 'bg-amber-400', 'bg-orange-500', 'bg-rose-500', 'bg-red-600'];
                                                                    return (
                                                                        <div 
                                                                            key={level} 
                                                                            className={`w-1.5 rounded-sm transition-colors duration-500 ${isActive ? colors[activityLevel - 1] : 'bg-white/10'}`} 
                                                                            style={{ height: `${40 + level * 15}%` }} 
                                                                        />
                                                                    );
                                                                })}
                                                            </div>
                                                            <span className="text-[7px] text-gray-500 font-bold uppercase tracking-widest">Aktiflik</span>
                                                        </div>
                                                        <div className="w-8 h-8 rounded-full border border-white/20 flex items-center justify-center text-white/50 group-hover:border-[#39FF14] group-hover:text-[#39FF14] transition-all ml-2">
                                                            <Plus size={16} />
                                                        </div>
                                                    </div>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* TAB 2: TEAMS */}
                            {modalTab === 'TEAMS' && (
                                <div className="space-y-4">
                                    {selectedTeamRosterId === null ? (
                                        <div className="grid gap-3">
                                            {studioTeams.length === 0 ? (
                                                <div className="text-center py-8 bg-[#161B22]/50 border border-white/5 rounded-2xl">
                                                    <p className="text-gray-500 font-bold text-xs uppercase tracking-wider">Takım Bulunamadı</p>
                                                </div>
                                            ) : (
                                                studioTeams.map(team => (
                                                    <div
                                                        key={team.team_id}
                                                        onClick={() => { setSelectedTeamRosterId(team.team_id); void ensureSquad(team.team_id); }}
                                                        className="bg-gradient-to-br from-[#161B22] to-[#0A0E14] border border-white/5 rounded-3xl p-4 flex items-center justify-between cursor-pointer hover:border-[#39FF14]/50 transition-all group"
                                                    >
                                                        <div className="flex items-center gap-4">
                                                            <div className="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-black text-xl shadow-lg transition-transform group-hover:scale-105" style={{ backgroundColor: team.color1 || '#10B981' }}>
                                                                {(team.short_name || team.name).charAt(0)}
                                                            </div>
                                                            <div>
                                                                <h3 className="text-base font-black text-white tracking-tight group-hover:text-[#39FF14] transition-colors">{team.name}</h3>
                                                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{team.member_count} Oyuncu{team.city ? ` • ${team.city}` : ''}</p>
                                                            </div>
                                                        </div>
                                                        <ChevronRight className="text-gray-500 group-hover:translate-x-1 transition-transform" />
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    ) : (
                                        <div className="space-y-3 animate-fade-blur-in">
                                            <button
                                                onClick={() => setSelectedTeamRosterId(null)}
                                                className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-4 border border-white/10 px-3 py-1.5 rounded-xl bg-white/5 w-max"
                                            >
                                                <ChevronLeft size={16} />
                                                <span className="text-[10px] font-black uppercase tracking-widest">Takımlara Dön</span>
                                            </button>

                                            <h3 className="text-[10px] font-black text-[#39FF14] mb-3 uppercase tracking-widest">
                                                {studioTeams.find(t => t.team_id === selectedTeamRosterId)?.name} KADROSU
                                            </h3>

                                            {/* GERÇEK kadro (get_team_squad) — hayalet roster öldü */}
                                            {!squadsByTeam[selectedTeamRosterId] ? (
                                                <div className="py-8 flex justify-center">
                                                    <Loader2 size={20} className="animate-spin text-white/40" />
                                                </div>
                                            ) : (
                                                squadsByTeam[selectedTeamRosterId].map(m => (
                                                    <button
                                                        key={m.user_id}
                                                        onClick={() => handleSelectPlayer(squadRowToPlayer(m))}
                                                        className="w-full bg-gradient-to-br from-[#161B22] to-[#0A0E14] border border-white/5 rounded-3xl p-4 flex items-center justify-between hover:border-[#39FF14]/50 transition-all text-left group"
                                                    >
                                                        <div className="flex items-center gap-4 pointer-events-none">
                                                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center font-black text-lg border border-white/10 shadow-lg group-hover:bg-[#39FF14] group-hover:text-black transition-all">
                                                                {m.full_name.charAt(0)}
                                                            </div>
                                                            <div>
                                                                <h4 className="text-base font-black text-white tracking-tight group-hover:text-[#39FF14] transition-colors">{m.full_name}</h4>
                                                                <p className="text-[10px] text-gray-500 font-bold uppercase mt-0.5">
                                                                    {m.pos || 'OYUNCU'}{m.jersey_number != null ? ` • #${m.jersey_number}` : ''}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <div className="w-8 h-8 rounded-full border border-white/20 flex items-center justify-center text-white/50 group-hover:border-[#39FF14] group-hover:text-[#39FF14] transition-all pointer-events-none">
                                                            <Plus size={16} />
                                                        </div>
                                                    </button>
                                                ))
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* TAB 3: CUSTOM PLAYER */}
                            {modalTab === 'CUSTOM' && (
                                <div className="space-y-4">
                                    <div className="bg-purple-900/20 border border-purple-500/30 rounded-[24px] p-5">
                                        <h3 className="text-sm font-black text-purple-400 mb-3 flex items-center gap-2 uppercase tracking-wider">
                                            <Type size={16} /> Hayali Oyuncu Yarat
                                        </h3>
                                        <p className="text-xs text-purple-300/70 mb-4 leading-relaxed">
                                            Taktik tahtasında simüle etmek istediğiniz herhangi bir hayali oyuncuyu adlandırın ve mevkisini seçin.
                                        </p>
                                        <div className="flex gap-2 mb-3">
                                            <input 
                                                type="text"
                                                placeholder="Oyuncu Adı (Örn: X Oyuncusu)"
                                                value={customPlayerName}
                                                onChange={(e) => setCustomPlayerName(e.target.value)}
                                                className="flex-1 bg-[#161B22] border border-white/10 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                                            />
                                            <select 
                                                value={customPlayerRole}
                                                onChange={(e) => setCustomPlayerRole(e.target.value)}
                                                className="bg-[#161B22] border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                                            >
                                                <option value="-">-</option>
                                                <option value="FWD">FWD</option>
                                                <option value="MID">MID</option>
                                                <option value="DEF">DEF</option>
                                                <option value="GK">GK</option>
                                            </select>
                                        </div>
                                        <button 
                                            onClick={handleCreateCustomPlayer}
                                            disabled={!customPlayerName.trim()}
                                            className="w-full bg-purple-600 text-white py-3 rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-purple-700 active:scale-95 transition-all shadow-[0_0_15px_rgba(168,85,247,0.4)]"
                                        >
                                            <UserPlus size={16} /> Yarat ve Ekle
                                        </button>
                                    </div>
                                </div>
                            )}

                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Export Modal */}
            <AnimatePresence>
                {showExportModal && (
                    <div className="fixed inset-0 bg-black/95 backdrop-blur-xl z-[60] flex flex-col overflow-y-auto custom-scrollbar">
                        <motion.div 
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 20 }}
                            className="min-h-screen w-full flex flex-col items-center p-6 pb-12"
                        >
                            {/* Modal Header */}
                            <div className="w-full max-w-sm flex items-center justify-between mb-8 sticky top-0 z-10 py-2">
                                <button 
                                    onClick={() => setShowExportModal(false)} 
                                    className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white hover:bg-white/10 transition-all active:scale-90"
                                >
                                    <ChevronLeft size={24} />
                                </button>
                                <div className="text-right">
                                    <h3 className="text-lg font-black text-white uppercase tracking-tighter italic">TAKTİK PAYLAŞ</h3>
                                    <p className="text-[10px] text-[#39FF14] font-bold uppercase tracking-widest">Maç Günü Kartı</p>
                                </div>
                            </div>
                            
                            {/* The Card to Export */}
                            <div id="match-day-card" className="w-full max-w-sm bg-[#0B2815] rounded-[40px] overflow-hidden border-4 border-[#161B22] shadow-[0_20px_60px_rgba(0,0,0,0.8)] relative group">
                                {/* Decorative Glow */}
                                <div className="absolute -top-20 -left-20 w-40 h-40 bg-[#39FF14]/10 blur-[80px] rounded-full pointer-events-none"></div>
                                <div className="absolute -bottom-20 -right-20 w-40 h-40 bg-emerald-500/10 blur-[80px] rounded-full pointer-events-none"></div>

                                {/* Header */}
                                <div className="p-8 text-center border-b border-white/10 bg-black/40 relative overflow-hidden">
                                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#39FF14] to-transparent opacity-50"></div>
                                    <div className="absolute top-6 left-6 text-[9px] font-black text-white/30 tracking-[0.2em] uppercase">OFFICIAL LINEUP</div>
                                    <div className="absolute top-6 right-6 text-[9px] font-black text-white/30 tracking-[0.2em] uppercase">MATCH DAY</div>
                                    
                                    <div className="w-20 h-20 mx-auto bg-gradient-to-br from-[#39FF14] to-emerald-600 rounded-[24px] flex items-center justify-center shadow-[0_10px_30px_rgba(57,255,20,0.3)] mb-4 relative group-hover:scale-110 transition-transform duration-500">
                                        <Shield size={40} className="text-black" />
                                        <div className="absolute inset-0 rounded-[24px] border-2 border-white/20"></div>
                                    </div>
                                    
                                    <h2 className="text-3xl font-black text-white uppercase tracking-tighter italic leading-none">{activeTactic.name}</h2>
                                    <div className="inline-flex items-center gap-2 mt-3 px-3 py-1 bg-[#39FF14]/10 rounded-full border border-[#39FF14]/20">
                                        <div className="w-1.5 h-1.5 rounded-full bg-[#39FF14] animate-pulse"></div>
                                        <span className="text-[10px] text-[#39FF14] font-black uppercase tracking-widest">{activeTactic.formation} SİSTEMİ</span>
                                    </div>
                                </div>

                                {/* Pitch Area */}
                                <div className="relative w-full aspect-[3/4] bg-[#0B2815]">
                                    <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 10%, rgba(0,0,0,0.2) 10%, rgba(0,0,0,0.2) 20%)' }}></div>
                                    {/* Pitch Markings (Halı Saha Style) */}
                                    <div className="absolute inset-0 pointer-events-none opacity-30">
                                        <svg viewBox="0 0 600 1000" preserveAspectRatio="none" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                                            <g stroke="white" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round">
                                                <rect x="10" y="10" width="580" height="980" />
                                                <line x1="10" y1="500" x2="590" y2="500" />
                                                <circle cx="300" cy="500" r="80" />
                                                <circle cx="300" cy="500" r="4" fill="white" />
                                                <rect x="150" y="10" width="300" height="160" />
                                                <circle cx="300" cy="130" r="4" fill="white" />
                                                <path d="M 220 170 A 80 80 0 0 0 380 170" />
                                                <rect x="150" y="830" width="300" height="160" />
                                                <circle cx="300" cy="870" r="4" fill="white" />
                                                <path d="M 220 830 A 80 80 0 0 1 380 830" />
                                                <path d="M 10 40 A 30 30 0 0 0 40 10" />
                                                <path d="M 560 10 A 30 30 0 0 0 590 40" />
                                                <path d="M 10 960 A 30 30 0 0 1 40 990" />
                                                <path d="M 590 960 A 30 30 0 0 0 560 990" />
                                            </g>
                                        </svg>
                                    </div>
                                    
                                    {/* Players */}
                                    {activeTactic.slots.map(slot => (
                                        <div 
                                            key={slot.id}
                                            className="absolute w-12 h-12 transform -translate-x-1/2 -translate-y-1/2 z-20"
                                            style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                                        >
                                            {slot.player ? (
                                                <div className={`relative w-full h-full rounded-full border-2 flex items-center justify-center shadow-[0_4px_15px_rgba(0,0,0,0.5)] ${slot.role === 'GK' ? 'bg-gradient-to-br from-orange-400 to-orange-600 border-orange-300' : 'bg-gradient-to-br from-[#1e2532] to-[#11151c] border-white/30'}`}>
                                                    <span className="text-white font-black text-sm drop-shadow-md">{slot.player.name.charAt(0)}</span>
                                                    {activeTactic.captainId === slot.player.id && (
                                                        <div className="absolute -top-2 -right-2 w-5 h-5 bg-gradient-to-br from-yellow-300 to-yellow-500 rounded-full flex items-center justify-center text-black text-[10px] font-black border-2 border-[#161B22] shadow-sm">
                                                            K
                                                        </div>
                                                    )}
                                                    {slot.archetype && slot.archetype !== 'NONE' && (
                                                        <div className="absolute -bottom-2 -right-2 w-6 h-6 bg-gradient-to-br from-yellow-400 to-amber-600 rounded-full flex items-center justify-center text-black text-xs border-2 border-[#161B22] shadow-lg">
                                                            {ARCHETYPES[slot.archetype].icon}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className={`relative w-full h-full rounded-full border-2 border-dashed bg-black/20 ${slot.role === 'GK' ? 'border-orange-500/50' : 'border-[#39FF14]/50'}`} />
                                            )}
                                            <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-1 flex flex-col items-center pointer-events-none">
                                                {slot.player && (
                                                    <span className="text-[10px] font-bold text-white bg-black/60 px-2 py-0.5 rounded-full whitespace-nowrap shadow-sm">
                                                        {slot.player.name}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Footer */}
                                <div className="p-6 bg-black/60 border-t border-white/10">
                                    <div className="text-center mb-4">
                                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">OYUN KİMLİĞİ</div>
                                        <div className={`text-xl font-black italic uppercase ${
                                            activeTactic.identity === 'HIGH_PRESS' ? 'text-red-500' :
                                            activeTactic.identity === 'PARK_BUS' ? 'text-blue-500' :
                                            activeTactic.identity === 'COUNTER_ATTACK' ? 'text-yellow-500' : 'text-white'
                                        }`}>
                                            {activeTactic.identity === 'HIGH_PRESS' ? '🔥 ÖNDE BASKI' :
                                             activeTactic.identity === 'PARK_BUS' ? '🛡️ KATI SAVUNMA' :
                                             activeTactic.identity === 'COUNTER_ATTACK' ? '⚡ KONTRA ATAK' : '⚖️ DENGELİ'}
                                        </div>
                                    </div>
                                    
                                    {activeTactic.notes && (
                                        <div className="bg-white/5 p-4 rounded-xl border border-white/10 relative">
                                            <MessageSquare size={16} className="absolute top-4 left-4 text-white/20" />
                                            <p className="text-sm text-gray-300 italic pl-8 font-serif">"{activeTactic.notes}"</p>
                                        </div>
                                    )}

                                    {/* Dürüst veri: uydurma yaş/reyting satırı öldü (Spec §11) */}
                                    <div className="mt-4 pt-4 border-t border-white/5 flex justify-between items-center text-[9px] text-gray-500 font-mono uppercase tracking-widest">
                                        <span>{activeTactic.formation} · {formatLabel(activeTactic.size)}</span>
                                        <span className="text-[#39FF14]">Powered by OYNA</span>
                                    </div>
                                </div>
                            </div>

                            <div className="w-full max-w-sm mt-8 space-y-3">
                                {/* Paylaşım GERÇEK link üretir (N92): salt-okunur oyna.app/t/{token}.
                                    Kayıtsız taslak paylaşılamaz — dürüst kural. */}
                                <button
                                    onClick={async () => {
                                        const savedId = activeTactic.id && dbTactics.find(t => t.id === activeTactic.id)
                                            ? activeTactic.id : null;
                                        if (!savedId) {
                                            showToast('Önce taktiği kaydet — linki kayıtlı taktik taşır.', 'error');
                                            return;
                                        }
                                        try {
                                            const token = await setTacticShareLink(savedId, true);
                                            if (!token) throw new Error('Link üretilemedi.');
                                            const url = tacticShareUrl(token);
                                            if (navigator.share) {
                                                await navigator.share({
                                                    title: `${activeTactic.name} — OYNA Taktik`,
                                                    text: `${activeTactic.formation} dizilişli taktiğim: ${activeTactic.name}`,
                                                    url,
                                                });
                                            } else {
                                                await navigator.clipboard.writeText(url);
                                                showToast('Paylaşım linki kopyalandı!');
                                            }
                                        } catch (e) {
                                            if ((e as Error)?.name !== 'AbortError') {
                                                showToast((e as Error)?.message || 'Paylaşılamadı.', 'error');
                                            }
                                        }
                                    }}
                                    className="w-full py-5 bg-[#39FF14] text-black font-black rounded-[24px] text-sm tracking-widest uppercase hover:scale-[1.02] active:scale-[0.98] transition-all shadow-[0_10px_30px_rgba(57,255,20,0.3)] flex items-center justify-center gap-3"
                                >
                                    <Share2 size={20} /> LİNKLE PAYLAŞ
                                </button>

                                {/* Takım sohbetine zengin kart olarak düşer (Küme 4) */}
                                {(activeTactic.teamId || selectedTeamId) && (
                                    <button
                                        onClick={async () => {
                                            const savedId = activeTactic.id && dbTactics.find(t => t.id === activeTactic.id)
                                                ? activeTactic.id : null;
                                            const targetTeam = activeTactic.teamId || selectedTeamId;
                                            if (!savedId || !targetTeam) {
                                                showToast('Önce taktiği takıma kaydet.', 'error');
                                                return;
                                            }
                                            try {
                                                await sendTeamMessage(targetTeam,
                                                    tacticMessageBody(savedId, activeTactic.name, activeTactic.formation));
                                                showToast('Taktik takım sohbetine gönderildi 💬');
                                                setShowExportModal(false);
                                            } catch (e) {
                                                showToast((e as Error)?.message || 'Gönderilemedi.', 'error');
                                            }
                                        }}
                                        className="w-full py-4 bg-white/8 border border-white/12 text-white font-black rounded-[20px] text-xs tracking-widest uppercase hover:bg-white/12 transition-all flex items-center justify-center gap-2"
                                    >
                                        <MessageSquare size={16} className="text-[#39FF14]" /> TAKIM SOHBETİNE GÖNDER
                                    </button>
                                )}

                                <button
                                    onClick={() => setShowExportModal(false)}
                                    className="w-full py-4 bg-white/5 text-white/60 font-bold rounded-[20px] text-xs tracking-widest uppercase hover:bg-white/10 transition-all"
                                >
                                    VAZGEÇ
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Tactics Modal */}
            <AnimatePresence>
                {showTacticsModal && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/90 backdrop-blur-md z-[70] flex items-center justify-center p-6"
                        onClick={() => setShowTacticsModal(false)}
                    >
                        <motion.div 
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="bg-[#161B22] border border-white/10 rounded-[32px] w-full max-w-lg overflow-hidden shadow-[0_0_60px_rgba(57,255,20,0.1)] flex flex-col max-h-[80vh]"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#0A0E14]/50">
                                <h3 className="text-xl font-black text-white uppercase tracking-widest flex items-center gap-3">
                                    <List size={24} className="text-[#39FF14]" /> KAYITLI TAKTİKLER
                                </h3>
                                <button onClick={() => setShowTacticsModal(false)} className="p-2 text-gray-400 hover:text-white transition-colors bg-white/5 rounded-full"><X size={20} /></button>
                            </div>
                            <div className="p-4 overflow-y-auto flex-1 space-y-3 no-scrollbar">
                                {dbTactics.length === 0 ? (
                                    <div className="py-12 text-center text-gray-500 font-mono text-sm">
                                        Henüz kaydedilmiş bir taktik yok.
                                    </div>
                                ) : (
                                    dbTactics.map((t) => (
                                        <button
                                            key={t.id}
                                            onClick={() => {
                                                const existingIndex = plans.findIndex(p => p.id === t.id);
                                                if (existingIndex >= 0) {
                                                    setActivePlanIndex(existingIndex);
                                                } else {
                                                    setPlans([...plans, t]);
                                                    setActivePlanIndex(plans.length);
                                                }
                                                setShowTacticsModal(false);
                                            }}
                                            className="w-full text-left p-4 rounded-2xl border border-white/5 bg-[#0A0E14]/30 hover:bg-[#39FF14]/10 hover:border-[#39FF14]/30 transition-all group flex items-center justify-between"
                                        >
                                            <div>
                                                <h4 className="text-white font-bold text-lg group-hover:text-[#39FF14] transition-colors">{t.name}</h4>
                                                <div className="text-[10px] font-mono text-gray-500 flex items-center gap-2 mt-1 uppercase">
                                                    <span>{t.teamName || 'İSİMSİZ TAKIM'}</span>
                                                    <span>•</span>
                                                    <span>{t.formation}</span>
                                                    <span>•</span>
                                                    <span>{t.size}</span>
                                                </div>
                                            </div>
                                            <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-[#39FF14] group-hover:text-black transition-colors text-white/50">
                                                <ChevronRight size={18} />
                                            </div>
                                        </button>
                                    ))
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Save Modal */}
            <AnimatePresence>
                {showSaveModal && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/90 backdrop-blur-md z-[70] flex items-center justify-center p-6"
                        onClick={() => setShowSaveModal(false)}
                    >
                        <motion.div 
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="bg-[#161B22] border border-white/10 rounded-[32px] w-full max-w-sm overflow-hidden shadow-[0_0_60px_rgba(57,255,20,0.1)] p-6"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-lg font-black text-white uppercase tracking-widest flex items-center gap-2">
                                    <Save size={20} className="text-[#39FF14]" /> TAKTİĞİ KAYDET
                                </h3>
                                <button onClick={() => setShowSaveModal(false)} className="p-2 text-gray-400 hover:text-white transition-colors"><X size={20} /></button>
                            </div>
                            
                            <div className="space-y-4 mb-8">
                                <div>
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-2">Taktik İsmi</label>
                                    <input
                                        type="text"
                                        value={saveTacticName}
                                        onChange={(e) => setSaveTacticName(e.target.value)}
                                        placeholder="Bu taktiğin adı ne olsun?"
                                        className="w-full bg-[#0A0E14] border border-white/10 rounded-2xl px-5 py-4 text-sm text-white placeholder-gray-600 focus:border-[#39FF14] outline-none transition-colors"
                                    />
                                </div>
                                {/* Hedef bağlam: status sunucuda belirlenir — dürüst önizleme */}
                                <div className="bg-[#0A0E14] border border-white/10 rounded-2xl px-5 py-4 text-xs">
                                    {(() => {
                                        const teamRow = studioTeams.find(t => t.team_id === selectedTeamId);
                                        if (!teamRow) {
                                            return <span className="text-gray-400">📁 <b className="text-white">Kişisel kütüphanene</b> kaydedilir.</span>;
                                        }
                                        const admin = teamRow.my_role === 'CAPTAIN' || teamRow.my_role === 'ADMIN';
                                        return admin
                                            ? <span className="text-gray-400">🛡️ <b className="text-white">{teamRow.name}</b> oyun defterine <b className="text-[#39FF14]">onaylı</b> kaydedilir.</span>
                                            : <span className="text-gray-400">🛡️ <b className="text-white">{teamRow.name}</b> yöneticilerine <b className="text-amber-400">öneri</b> olarak gönderilir.</span>;
                                    })()}
                                </div>
                            </div>

                            <button
                                onClick={handleSaveTactic}
                                disabled={!saveTacticName.trim()}
                                className="w-full h-14 bg-[#39FF14] text-black font-black text-xs tracking-widest uppercase rounded-2xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(57,255,20,0.2)]"
                            >
                                {(() => {
                                    const teamRow = studioTeams.find(t => t.team_id === selectedTeamId);
                                    if (!teamRow) return "KAYDET";
                                    const admin = teamRow.my_role === 'CAPTAIN' || teamRow.my_role === 'ADMIN';
                                    return admin ? "KAYDET" : "TAKIMA ÖNER";
                                })()}
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Reset Confirm Modal */}
            <AnimatePresence>
                {showResetConfirmModal && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/90 backdrop-blur-md z-[70] flex items-center justify-center p-6"
                        onClick={() => setShowResetConfirmModal(false)}
                    >
                        <motion.div 
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="bg-[#161B22] border border-red-500/30 rounded-[32px] w-full max-w-sm overflow-hidden shadow-[0_0_60px_rgba(239,68,68,0.1)] p-6 text-center"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="w-16 h-16 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mx-auto mb-4 border border-red-500/20">
                                <RotateCw size={24} />
                            </div>
                            <h3 className="text-xl font-black text-white uppercase tracking-widest mb-2">
                                SAYFAYI YENİLE
                            </h3>
                            <p className="text-gray-400 text-sm mb-6">
                                Sayfa yenilenecektir. Eğer güncel taktikleri kaydetmediyseniz hepsi <strong className="text-red-400">YOK OLACAKTIR</strong>. Devam etmek istiyor musunuz?
                            </p>
                            
                            <div className="flex gap-3">
                                <button 
                                    onClick={() => setShowResetConfirmModal(false)}
                                    className="flex-1 py-4 bg-white/5 border border-white/10 text-white font-bold text-xs tracking-widest rounded-2xl hover:bg-white/10 transition-colors"
                                >
                                    İPTAL
                                </button>
                                <button 
                                    onClick={handleReset}
                                    className="flex-1 py-4 bg-red-500 text-white font-bold text-xs tracking-widest rounded-2xl bg-gradient-to-r hover:from-red-600 hover:to-red-500 shadow-[0_0_20px_rgba(239,68,68,0.3)] transition-all"
                                >
                                    YENİLE
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

        </motion.div>
    )}
</AnimatePresence>

{/* Öneri karar çubuğu — bekleyen takım taktiği + yönetici (M87) */}
            <AnimatePresence>
                {canDecideProposal && (
                    <motion.div
                        initial={{ opacity: 0, y: 40 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 40 }}
                        className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[90] w-[calc(100%-2.5rem)] max-w-md rounded-3xl bg-[#161B22] border border-amber-400/30 shadow-[0_8px_40px_rgba(0,0,0,0.6)] p-4"
                    >
                        <div className="text-[10px] font-black uppercase tracking-widest text-amber-400 mb-1">
                            Onay Bekleyen Öneri
                        </div>
                        <p className="text-xs text-white/60 mb-3">
                            "{activeTactic.name}" takım taktiği olarak önerildi. İncele ve karar ver.
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => decideProposal(false)}
                                disabled={decidingProposal}
                                className="flex-1 min-h-[44px] rounded-2xl bg-white/5 border border-white/10 text-sm font-bold text-white/70 active:scale-[0.97] disabled:opacity-50"
                            >
                                Reddet
                            </button>
                            <button
                                onClick={() => decideProposal(true)}
                                disabled={decidingProposal}
                                className="flex-1 min-h-[44px] rounded-2xl bg-[#39FF14] text-[#0A0E14] text-sm font-black active:scale-[0.97] disabled:opacity-50"
                            >
                                {decidingProposal ? '…' : 'Onayla'}
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Rakip isimlendirme sheet (S18) */}
            <AnimatePresence>
                {namingOpp && (() => {
                    const opp = activeTactic.opponents.find(o => o.id === namingOpp);
                    if (!opp) return null;
                    const OPP_ROLES = ['Kaleci', 'Stoper', 'Bek', 'Pivot', 'Orta Saha', 'Kanat', 'Forvet', 'Tehlikeli'];
                    return (
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
                            onClick={() => setNamingOpp(null)}
                        >
                            <motion.div
                                initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
                                onClick={e => e.stopPropagation()}
                                className="w-full max-w-sm bg-[#0E1420] border border-red-500/30 rounded-[24px] p-5 shadow-2xl"
                            >
                                <div className="flex items-center gap-2 mb-4">
                                    <div className="w-8 h-8 rounded-full bg-red-900/80 border-2 border-red-500 flex items-center justify-center"><Swords size={14} className="text-white" /></div>
                                    <h3 className="text-sm font-black text-white uppercase tracking-widest">Rakip</h3>
                                </div>
                                <input
                                    value={opp.player?.name || ''}
                                    onChange={e => renameOpponent(opp.id, e.target.value)}
                                    placeholder="Rakip adı"
                                    className="w-full bg-[#0A0E14] border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:border-red-500 outline-none transition-colors mb-3"
                                />
                                <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-2">Mevki</p>
                                <div className="flex flex-wrap gap-2 mb-4">
                                    {OPP_ROLES.map(r => (
                                        <button
                                            key={r}
                                            onClick={() => renameOpponent(opp.id, opp.player?.name || 'Rakip', r)}
                                            className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition-all ${opp.instruction === r ? 'bg-red-500 text-white' : 'bg-white/5 text-gray-300 hover:bg-white/10'}`}
                                        >{r}</button>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => { handleRemoveOpponent(opp.id); setNamingOpp(null); }}
                                        className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-red-500/15 text-red-400 text-xs font-black hover:bg-red-500/25 transition-all border border-red-500/30"
                                    ><Trash2 size={14} /> Sil</button>
                                    <button
                                        onClick={() => setNamingOpp(null)}
                                        className="flex-1 py-3 rounded-2xl bg-[#39FF14] text-black text-xs font-black uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all"
                                    >Tamam</button>
                                </div>
                            </motion.div>
                        </motion.div>
                    );
                })()}
            </AnimatePresence>

            {/* Granüler Temizle sheet (S13) */}
            <AnimatePresence>
                {showClearSheet && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
                        onClick={() => setShowClearSheet(false)}
                    >
                        <motion.div
                            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
                            onClick={e => e.stopPropagation()}
                            className="w-full max-w-sm bg-[#0E1420] border border-white/10 rounded-[24px] p-5 shadow-2xl"
                        >
                            <div className="flex items-center gap-2 mb-4">
                                <Trash2 size={18} className="text-red-400" />
                                <h3 className="text-sm font-black text-white uppercase tracking-widest">Neyi temizleyelim?</h3>
                            </div>
                            <div className="space-y-2">
                                <button onClick={clearDrawingsOnly} disabled={drawings.length === 0}
                                    className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-white/5 text-white text-sm font-bold hover:bg-white/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                                    <span className="flex items-center gap-3"><PenTool size={16} className="text-[#39FF14]" /> Sadece çizimler</span>
                                    <span className="text-[10px] text-gray-500 font-mono">{drawings.length}</span>
                                </button>
                                <button onClick={clearOpponentsOnly} disabled={activeTactic.opponents.length === 0}
                                    className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-white/5 text-white text-sm font-bold hover:bg-white/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                                    <span className="flex items-center gap-3"><Swords size={16} className="text-red-400" /> Sadece rakipler</span>
                                    <span className="text-[10px] text-gray-500 font-mono">{activeTactic.opponents.length}</span>
                                </button>
                                {selectedEl && (
                                    <button onClick={clearSelected}
                                        className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/5 text-white text-sm font-bold hover:bg-white/10 transition-all">
                                        <Crosshair size={16} className="text-amber-400" /> Seçili ögeyi sil
                                    </button>
                                )}
                                <button onClick={clearAllScene}
                                    className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-red-500/15 text-red-400 text-sm font-black hover:bg-red-500/25 transition-all border border-red-500/30">
                                    <Trash2 size={16} /> Hepsini sil
                                </button>
                            </div>
                            <button onClick={() => setShowClearSheet(false)}
                                className="w-full mt-3 py-3 rounded-2xl bg-white/5 text-gray-400 text-xs font-bold uppercase tracking-widest hover:bg-white/10 transition-all">
                                Vazgeç
                            </button>
                            <p className="text-[10px] text-gray-600 text-center mt-2">Sildikten sonra <b className="text-gray-400">GERİ AL</b> ile dönebilirsin.</p>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

{/* Toast Notification */}
            <AnimatePresence>
                {toast && (
                    <motion.div 
                        initial={{ opacity: 0, y: 50 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 50 }}
                        className="fixed bottom-32 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 min-w-[280px]"
                        style={{ 
                            backgroundColor: toast.type === 'success' ? '#10B981' : '#EF4444',
                            color: 'white'
                        }}
                    >
                        {toast.type === 'success' ? <UserCheck size={20} /> : <ShieldAlert size={20} />}
                        <span className="text-sm font-bold">{toast.message}</span>
                    </motion.div>
                )}
            </AnimatePresence>

        </div>
    );
};

export default Studio;
