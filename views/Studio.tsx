import React, { useState, useRef, useEffect, useMemo, useCallback, Suspense, lazy } from 'react';
import { Spinner } from '../components/ui/Spinner';
import {
    ChevronLeft, Users, Save, Plus, Trash2, Minus,
    Shield, Brain,
    SaveAll, Star, X, Check,
    PenTool, MousePointer2, Eye, EyeOff, Layout, Copy,
    Search, UserCheck,
    Swords, UserPlus,
    MessageSquare, ShieldAlert,
    Layers, Gauge, Crosshair, Share2, List, ChevronRight, ChevronDown, RotateCw, Loader2,
    ZoomIn, ZoomOut, Maximize2, RotateCcw, Sparkles, HelpCircle, Calendar,
    Radio, Play
} from 'lucide-react';
import { motion, AnimatePresence, Reorder, useReducedMotion, MotionConfig } from 'framer-motion';
import { auth } from '../supabaseAuth';
import { supabase } from '../supabaseClient';
import { useAppStore } from '../store';
import { FORMATIONS as FORMATIONS_SSOT, resolveFormation } from '../utils/formations';
// Ham sunucu hatası ekrana sızmaz — tek sözlükten Türkçe mesaj (utils/errorMap).
import { mapError } from '../utils/errorMap';
import { useConfirmSheet } from '../components/ui/useConfirmSheet';
// Küme 3 köprüsü: kanonik takım/kadro okumaları + tek kayıt kapısı
import {
    MyTeamRow, TeamSquadRow, getMyTeams, getTeamSquad, formatLabel,
} from '../services/teamSocialService';
import {
    saveTeamTactic, approveTacticRpc, rejectTacticRpc, getTacticById,
    setTacticShareLink, tacticShareUrl, getTeamTacticsShowcase,
    setActiveTactic as setActiveTacticRpc, TacticConflictError, logStudioEvent,
    assignMatchTactic, deleteMyTactic,
} from '../services/tacticSocialService';
// Takımın yaklaşan maçı — "kaydederken maça ata" için (teamService SSOT)
import { fetchTeamNextMatch } from '../services/teamService';
import type { TeamMatchRow } from '../services/teamService';
import { sendTeamMessage, tacticMessageBody } from '../services/teamChatService';
// Gerçek arkadaş verisi (Sosyal ile aynı kaynak) — sahte store friends öldü
import { getFriends, getFriendLists } from '../services/socialService';
import type { FriendRow, FriendList } from '../services/socialService';
// Kütüphanesiz taktik görseli (SVG→PNG) + indirme
import { buildTacticSvg, svgToPngBlob, downloadBlob, tacticImageFilename } from './studio/shareImage';

// Paylaşılan tipler ve sabitler (SSOT)
import type {
    Player, GameIdentity, Archetype, Slot, SquadSize, FormationType,
    TacticState, DrawingLine, StudioTool, PlayMode
} from './studio/types';
import { ARCHETYPES, INSTRUCTIONS, DEFAULT_TEMPO, normalizeTempo, tempoSpeedFactor } from './studio/types';
// Hafif geometri/sekans yardımcıları — çekirdekte kalır
import { getSmoothPathStr, computeSeqMap } from './studio/pitchGeometry';
// BİZ/RAKİP katman anahtarı — aktif taraf önde, pasif taraf arkada ve kilitli
import { isLayerEditing, markerLayer, lineIsMuted } from './studio/layering';
// Birleşik taktik kütüphanesi (kişisel + takım oyun defterleri) — saf yardımcılar
import {
    statusMeta, filterEntries, sortEntries, mineToEntry, showcaseToEntry,
} from './studio/tacticLibrary';
import type { LibraryEntry, StatusTone } from './studio/tacticLibrary';
// Performans katmanı — zayıf cihazda süs efektlerini kıs (içerik değişmez)
import { perfTierFrom, readDeviceSignals, liteGate } from './studio/perf';
import { trUpper } from '../utils/trUpper';

// ⚡ ANİMASYON MODÜLÜ — ayrı chunk olarak lazy tutulur (ilk boya hafif kalır)
// ama stüdyo açılır açılmaz arka planda otomatik indirilir: oynatma kontrolleri
// araç çubuğunda her zaman doğrudan görünür, ayrıca bir "indir" kapısı yoktur.
const AdvancedAnimationModule = lazy(() => import('./studio/AdvancedAnimationModule'));
// Oyuncu markörünün CSS animasyon tarifi (yalnız tip — chunk'ı çekmez).
import type { PlayerCssAnimation } from './studio/AdvancedAnimationModule';
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

// Çizgi başlangıcının bir oyuncuya "tutunma" yarıçapı (saha yüzdesi cinsinden).
// KOŞU bir oyuncudan başlamak ZORUNDA olduğu için alanı daha geniş: oyuncu
// markörü sahanın ~%7'si kadar, dar bir alan çizmeyi imkânsızlaştırır.
// PAS'ta eski değer korunur — boş alana pas serbest, geniş alan istemsiz
// bağlanmaya yol açar.
const RUN_ATTACH_RADIUS = 9;
const PASS_ATTACH_RADIUS = 5;

// Araç ipucu — araç çubuğunun ÇİZİM satırının altında, seçili aracın ne
// yaptığını tek cümleyle anlatır. Stüdyoyu ilk kez açan biri deneme yanılma
// yapmadan anlasın diye var; araç değişince yazı da değişir (aria-live).
const TOOL_HINTS: Record<StudioTool, string> = {
    move: 'TAŞI seçili — oyuncuya dokunup sürükle; boş mevkideki + işaretiyle oyuncu ekle.',
    draw_run: 'KOŞU seçili — bir oyuncudan başlayıp parmağınla hareket çizgisini çek.',
    draw_pass: 'PAS seçili — topun gideceği yolu çiz; arka arkaya çizersen pas zinciri olur.',
    opponent: 'RAKİP seçili — sahaya dokunarak rakip oyuncu ekle.',
};

// Faz 9 — kalıcılık & mobil deneyim anahtarları
const DRAFT_KEY = 'oyna_studio_draft_v1';   // S49 otomatik taslak
const ONBOARD_KEY = 'oyna_studio_onboarded_v1'; // ilk kullanım turu bir kez gösterilir
const ZOOM_STEPS = [1, 1.35, 1.7, 2.1] as const; // S46 pinch/pan yakınlaştırma kademeleri

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
    // IP-23: markalı onay penceresi (window.confirm yerine). `confirmElement`
    // bileşenin köküne konur; `confirm()` promise döner.
    const { confirm, confirmElement } = useConfirmSheet();
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
        tempo: DEFAULT_TEMPO,
        identity: 'BALANCED'
    }]);
    const [activePlanIndex, setActivePlanIndex] = useState(0);
    
    // Farazi Tools
    const [tool, setTool] = useState<StudioTool>('move');
    // Sunum modu — Paylaş'tan başlatılır: yalnız saha + sadece-hareket oynatımı
    const [presentMode, setPresentMode] = useState(false);
    // Faz 9 — mobil deneyim: yakınlaştırma/pan (S46), taslak (S49), reduced-motion (S50)
    const reduceMotion = useReducedMotion();
    // Cihaz performans sınıfı — zayıf telefonda gölge/blur/glow kısılır (içerik aynı).
    const perfTier = React.useMemo(() => perfTierFrom(readDeviceSignals(!!reduceMotion)), [reduceMotion]);
    const perfLite = perfTier === 'lite';
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const panStartRef = useRef<{ px: number; py: number; ox: number; oy: number; moved: boolean } | null>(null);
    const pinchRef = useRef<{ startDist: number; startZoom: number } | null>(null);
    const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
    const [resumeDraft, setResumeDraft] = useState<{ plans: TacticState[]; activePlanIndex: number; savedAt: number } | null>(null);
    const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const draftHydratedRef = useRef(false);
    const [isLandscape, setIsLandscape] = useState(false);
    // Faz 1 — Boyut/Formasyon seçici (butona yapışık dropdown) + özel formasyon
    const [openSelector, setOpenSelector] = useState<'size' | 'formation' | null>(null);
    const [customPattern, setCustomPattern] = useState('');
    const [customError, setCustomError] = useState<string | null>(null);
    // Faz 3 — etkileşim & animasyon motoru
    const [hideLines, setHideLines] = useState(false);              // "Sadece Hareket" (S12)
    // Koşu kuralı: KOŞU bir oyuncudan başlamak zorunda. Boş sahadan denenirse
    // çizgi OLUŞMAZ ve sahanın üstünde kırmızı uyarı belirir. Uyarı bir stüdyo
    // oturumunda en fazla İKİ kez gösterilir — kural yine geçerlidir, yalnız
    // mesaj susar (sayaç ref'te: yeniden çizim tetiklemesin).
    const [showRunHint, setShowRunHint] = useState(false);
    const runHintShownRef = useRef(0);
    const RUN_HINT_MAX = 2;
    // Uyarı yalnız KOŞU aracı seçiliyken anlamlı: başka araca geçilince kalkar.
    useEffect(() => { if (tool !== 'draw_run') setShowRunHint(false); }, [tool]);
    const [showClearSheet, setShowClearSheet] = useState(false);    // granüler temizle (S13)
    // Temizle sayfasının alt görünümü: null = ana menü, 'drawings'/'opponents' = seçim listesi.
    // clearPicks: listede işaretlenen ögelerin id'leri ("Seçilenleri sil" bunları kaldırır).
    const [clearMode, setClearMode] = useState<null | 'drawings' | 'opponents'>(null);
    const [clearPicks, setClearPicks] = useState<string[]>([]);
    const openClearSheet = () => { setClearMode(null); setClearPicks([]); setShowClearSheet(true); };
    const closeClearSheet = () => { setShowClearSheet(false); setClearMode(null); setClearPicks([]); };
    const toggleClearPick = (id: string) =>
        setClearPicks(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
    const [showTempoSheet, setShowTempoSheet] = useState(false);    // tempo ayar sayfası (araç çubuğu çipi)
    const [onboardStep, setOnboardStep] = useState<number | null>(null); // ilk kullanım turu adımı (null = kapalı)
    const [undoStack, setUndoStack] = useState<{ slots: Slot[]; opponents: Slot[]; drawings: DrawingLine[] }[]>([]);
    const [redoStack, setRedoStack] = useState<{ slots: Slot[]; opponents: Slot[]; drawings: DrawingLine[] }[]>([]);
    const [selectedEl, setSelectedEl] = useState<{ type: 'slot' | 'opponent' | 'line'; id: string } | null>(null);
    // Faz 4 — rakip çizim tarafı (BİZ / RAKİP) (S19) + isimlendirme sheet (S18)
    const [drawSide, setDrawSide] = useState<'US' | 'OPP'>('US');
    const [namingOpp, setNamingOpp] = useState<string | null>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [isSimulating, setIsSimulating] = useState(false);
    // Madde 18 — DURDUR = OLDUĞU YERDE DON, OYNAT = DEVAM. simPaused: dondurulmuş;
    // simEnded: rota sonuna ulaşıldı (buton "TEKRAR OYNAT"). isSimulating: sim aktif
    // (oynuyor VEYA duraklatılmış) — mevcut opaklık/katman mantığı bunu kullanır.
    const [simPaused, setSimPaused] = useState(false);
    const [simEnded, setSimEnded] = useState(false);
    const [playMode, setPlayMode] = useState<PlayMode>('SYNC');
    const [showBall, setShowBall] = useState(false);

    // ⚡ Gelişmiş Animasyon Modülü durumu (lazy-load).
    // isAdvancedAnimLoaded: modül indi mi?
    // advancedAnimApiRef: yüklenen modülün getPlayerCssAnimation fonksiyonu (saha
    // slot/rakip markörlerini hareket ettirmek için çekirdekte kullanılır).
    const [isAdvancedAnimLoaded, setIsAdvancedAnimLoaded] = useState(false);
    const [isLoadingAdvancedAnim, setIsLoadingAdvancedAnim] = useState(false);
    const advancedAnimApiRef = useRef<null | ((path: DrawingLine, playMode: PlayMode, seqInfo: { startTime: number, duration: number }, totalSeqDur: number) => PlayerCssAnimation | null)>(null);

    // Modülü on-demand indirir; oyuncu animasyonu API'sini ref'e bağlar.
    const loadAdvancedAnimation = async () => {
        if (isAdvancedAnimLoaded || isLoadingAdvancedAnim) return;
        setIsLoadingAdvancedAnim(true);
        try {
            const mod = await import('./studio/AdvancedAnimationModule');
            advancedAnimApiRef.current = mod.getPlayerCssAnimation;
            setIsAdvancedAnimLoaded(true);
        } catch (e) {
            console.error('Gelişmiş animasyon modülü yüklenemedi:', e);
            showToast('Gelişmiş animasyon modülü yüklenemedi.', 'error');
        } finally {
            setIsLoadingAdvancedAnim(false);
        }
    };
    // Animasyon modülü stüdyo açılışında arka planda indirilir (kapı butonu öldü).
    // Aynı anda anonim "stüdyo açıldı" telemetrisi (kişisel içerik yazılmaz).
    useEffect(() => {
        void loadAdvancedAnimation();
        logStudioEvent('studio_open');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const [selectedSeqBadge, setSelectedSeqBadge] = useState<string | null>(null);
    const [isCustomSeqInputOpen, setIsCustomSeqInputOpen] = useState(false);
    const [customSeqValue, setCustomSeqValue] = useState<string>('');
    const [currentLine, setCurrentLine] = useState<DrawingLine | null>(null);
    const [selectedSlotForArchetype, setSelectedSlotForArchetype] = useState<string | null>(null);
    const [showExportModal, setShowExportModal] = useState(false);
    const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
    
    // S26 — yedek tepsisinden sahaya yerleştir/takas: "elde tutulan" yedek oyuncu id'si
    const [heldSub, setHeldSub] = useState<string | null>(null);
    // S24 — birleşik oyuncu araması; isim yazınca aynı kutu MANUEL EKLE kapısıdır
    const [playerSearch, setPlayerSearch] = useState('');
    // Oyuncu Seç kaynak filtresi: 'Tümü' | 'Favorilerim' | liste adı | 'team:<id>'
    const [selectedGroup, setSelectedGroup] = useState('Tümü');
    // Gerçek arkadaş verisi (get_friends RPC) + kişisel listeler (friend_lists)
    const [studioFriends, setStudioFriends] = useState<FriendRow[]>([]);
    const [studioFriendLists, setStudioFriendLists] = useState<FriendList[]>([]);



    const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
    const [isTeamConfirmed, setIsTeamConfirmed] = useState(false);

    const canvasRef = useRef<HTMLDivElement>(null);

    // Modals
    const [showTacticsModal, setShowTacticsModal] = useState(false);
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [conflictOpen, setConflictOpen] = useState(false);          // iyimser kilit çakışma diyaloğu
    const [reloadingConflict, setReloadingConflict] = useState(false);
    // "Kaydederken maça ata" — yalnız yönetici + takım taktiği + yaklaşan maç varsa
    const [nextMatch, setNextMatch] = useState<TeamMatchRow | null>(null);
    const [assignToMatch, setAssignToMatch] = useState(false);
    const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);
    const [saveTacticName, setSaveTacticName] = useState('');
    const [dbTactics, setDbTactics] = useState<TacticState[]>([]);
    // ── Birleşik kütüphane: aktif sekme (Kütüphanem / takım) + arama + takım vitrinleri ──
    const [libraryTab, setLibraryTab] = useState<'MINE' | string>('MINE');
    const [librarySearch, setLibrarySearch] = useState('');
    const [teamShowcases, setTeamShowcases] = useState<Record<string, LibraryEntry[]>>({});
    const [loadingShowcase, setLoadingShowcase] = useState<string | null>(null);
    const [openingTacticId, setOpeningTacticId] = useState<string | null>(null);
    const [deletingTacticId, setDeletingTacticId] = useState<string | null>(null);

    // Global Store — stüdyo bağlamı
    const studioContext = useAppStore(s => s.studioContext);
    const setStudioContext = useAppStore(s => s.setStudioContext);
    const setStoreSelectedTeamId = useAppStore(s => s.setSelectedTeamId);
    // Takımdan gelindiyse geri tuşu oraya döner (bağlam kopmasın); değilse onBack.
    const [returnTeamId, setReturnTeamId] = useState<string | null>(null);

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
        ...(m.jersey_number != null ? { jersey: m.jersey_number } : {}),
    });

    // Mevkiyi (pos) saha hattına eşle: GK/DEF/MID/FWD.
    const posToLine = (pos?: string): 'GK' | 'DEF' | 'MID' | 'FWD' => {
        const p = (pos || '').toUpperCase();
        if (/GK|KALE/.test(p)) return 'GK';
        if (/CB|LB|RB|WB|STOP|BEK|DEF|\bDF\b/.test(p)) return 'DEF';
        if (/ST|CF|LW|RW|WING|KANAT|FOR|\bFW\b/.test(p)) return 'FWD';
        if (/DM|CM|AM|LM|RM|MID|ORTA|PIVOT/.test(p)) return 'MID';
        return 'MID';
    };

    // Akıllı dizme (S22): mevki hattına göre eşleştir. Sıra deterministik olsun
    // diye ada göre dizilir (OVR/fp söküldü — 20260830 puan sistemi sökümü).
    const populateSlotsWithSquad = (squad: TeamSquadRow[], currentSlots: Slot[]): Slot[] => {
        const newSlots = currentSlots.map(s => ({ ...s, player: undefined as Player | undefined }));
        const players = squad.map(m => ({ ...squadRowToPlayer(m), line: posToLine(m.pos) }))
            .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
        const used = new Set<string>();
        // 1. Geçiş: her slotu HATTI uyan en yüksek fp'li oyuncuyla doldur.
        newSlots.forEach((slot, i) => {
            const cand = players.find(p => !used.has(p.id) && p.line === slot.role);
            if (cand) { newSlots[i].player = cand; used.add(cand.id); }
        });
        // 2. Geçiş: kalan boş slotları en yüksek fp'li kalan oyuncularla doldur.
        newSlots.forEach((slot, i) => {
            if (newSlots[i].player) return;
            const cand = players.find(p => !used.has(p.id));
            if (cand) { newSlots[i].player = cand; used.add(cand.id); }
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
        // IP-23: eski (adı içeriğiyle çelişen) formasyon adları düzeltildi.
        // Eski adla kaydedilmiş bir taktik okunursa boş ekran değil, karşılığı
        // gelir — kullanıcı taktiğini kaybetmez.
        formation: resolveFormation(d.size, d.formation) as FormationType,
        slots: JSON.parse(d.slots || '[]'),
        subs: JSON.parse(d.subs || '[]'),
        captainId: d.captainId || null,
        notes: d.notes || '',
        opponents: JSON.parse(d.opponents || '[]'),
        mentality: d.mentality || 'Balanced',
        tempo: normalizeTempo(d.tempo),
        identity: d.identity || 'BALANCED',
        drawings: JSON.parse(d.drawings || '[]'),
        status: d.status || undefined,
        proposedBy: d.proposedBy ?? null,
        updatedAt: d.updatedAt || undefined,
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
                        setReturnTeamId(hydrated.teamId);
                        setIsTeamConfirmed(true);
                        void ensureSquad(hydrated.teamId);
                    }
                } else if (ctx.teamId) {
                    setSelectedTeamId(ctx.teamId);
                    setReturnTeamId(ctx.teamId);
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

    // Pas zincirinin (tek top rotası) SON noktası — sonraki pas buradan başlar.
    // Sıralı pas okları (type 'arrow') seqStep'e göre; en yüksek seqStep = son pas.
    const passArrows = drawings.filter(d => d.type === 'arrow');
    const passChainEnd = passArrows.length
        ? (() => { const last = passArrows.reduce((a, b) => (b.seqStep >= a.seqStep ? b : a)); return last.points[last.points.length - 1] || null; })()
        : null;

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
    // Plan değişince yakınlaştırma sıfırla (her plan tam görünür başlasın).
    useEffect(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, [activePlanIndex]);

    // ── S49 — Otomatik taslak: açılışta yarım kalan çalışmayı bir kez teklif et ──
    useEffect(() => {
        if (draftHydratedRef.current) return;
        draftHydratedRef.current = true;
        if (studioContext) return; // bağlamla açıldıysa (takım/taktik) taslak sorma
        try {
            const raw = localStorage.getItem(DRAFT_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            const dp: TacticState[] = parsed?.plans;
            if (!Array.isArray(dp) || dp.length === 0) return;
            const hasContent = dp.some(p =>
                (p.slots || []).some((s: Slot) => !!s.player) ||
                (p.drawings || []).length > 0 ||
                (p.opponents || []).length > 0 ||
                (p.subs || []).length > 0
            ) || dp.length > 1;
            if (hasContent) setResumeDraft(parsed);
        } catch { /* taslak okunamadı — sessiz geç */ }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── S49 — çalışma 800ms debounce ile localStorage'a yazılır ──
    useEffect(() => {
        if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
        draftTimerRef.current = setTimeout(() => {
            try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ plans, activePlanIndex, savedAt: Date.now() })); } catch { /* kota dolu — sessiz */ }
        }, 800);
        return () => { if (draftTimerRef.current) clearTimeout(draftTimerRef.current); };
    }, [plans, activePlanIndex]);

    const applyResumeDraft = () => {
        if (!resumeDraft) return;
        // Eski taslaklar tempo'yu Slow/Normal/Fast taşıyabilir — tek kapıdan normalize et
        setPlans(resumeDraft.plans.map(p => ({ ...p, tempo: normalizeTempo(p.tempo) })));
        setActivePlanIndex(Math.min(resumeDraft.activePlanIndex || 0, resumeDraft.plans.length - 1));
        setResumeDraft(null);
        showToast('Taslak geri yüklendi.');
    };
    const discardResumeDraft = () => {
        setResumeDraft(null);
        try { localStorage.removeItem(DRAFT_KEY); } catch { /* yok say */ }
    };

    // ── Gerçek arkadaşlar + kişisel listeler (Sosyal ile aynı kaynak) ──
    useEffect(() => {
        if (!auth.currentUser) return;
        void (async () => {
            try {
                const [fr, ls] = await Promise.all([getFriends(), getFriendLists()]);
                setStudioFriends(fr);
                setStudioFriendLists(ls);
            } catch (e) {
                console.error('[Studio] arkadaşlar yüklenemedi', e);
            }
        })();
    }, []);

    // ── S47 — yatay (landscape) sunum modu algısı ──
    useEffect(() => {
        const check = () => setIsLandscape(window.matchMedia('(orientation: landscape) and (max-height: 600px)').matches);
        check();
        window.addEventListener('resize', check);
        window.addEventListener('orientationchange', check);
        return () => { window.removeEventListener('resize', check); window.removeEventListener('orientationchange', check); };
    }, []);

    // ── S46 — yakınlaştırma yardımcıları (pan sınırlarını canvas ölçüsüne göre kısıtla) ──
    const clampPan = (z: number, p: { x: number; y: number }) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        const w = rect?.width ?? 320, h = rect?.height ?? 420;
        const maxX = (z - 1) * w / 2, maxY = (z - 1) * h / 2;
        return { x: Math.max(-maxX, Math.min(maxX, p.x)), y: Math.max(-maxY, Math.min(maxY, p.y)) };
    };
    const setZoomLevel = (z: number) => {
        const nz = Math.max(1, Math.min(ZOOM_STEPS[ZOOM_STEPS.length - 1], z));
        setZoom(nz);
        if (nz <= 1) setPan({ x: 0, y: 0 }); else setPan(p => clampPan(nz, p));
    };
    const zoomIn = () => { const i = ZOOM_STEPS.findIndex(s => s > zoom + 0.001); setZoomLevel(i === -1 ? ZOOM_STEPS[ZOOM_STEPS.length - 1] : ZOOM_STEPS[i]); };
    const zoomOut = () => { const cur = ZOOM_STEPS.filter(s => s < zoom - 0.001); setZoomLevel(cur.length ? cur[cur.length - 1] : 1); };
    const resetZoom = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

    // ── Sunum modu (OYNAT'ın halefi): yalnız saha + sadece-hareket oynatımı ──
    const enterPresentMovement = async () => {
        setShowExportModal(false);
        resetZoom();
        setPresentMode(true);
        setHideLines(true);          // "sadece hareket" — çizgiler + sekans rozetleri gizli
        await loadAdvancedAnimation();
        setShowBall(true);
        setIsSimulating(true);
    };
    const replayPresent = () => { setIsSimulating(false); requestAnimationFrame(() => requestAnimationFrame(() => setIsSimulating(true))); };
    const exitPresent = () => { setIsSimulating(false); setPresentMode(false); };

    // ── Paylaşım: taktik görseli (SVG→PNG) + link (Web Share API / fallback) ──
    const buildShareBlob = async (): Promise<Blob> => {
        const shareTeam = studioTeams.find(t => t.team_id === (activeTactic.teamId || selectedTeamId));
        const svg = buildTacticSvg(activeTactic, { teamName: shareTeam?.name, accent: shareTeam?.color1, sizeLabel: formatLabel(activeTactic.size) });
        return svgToPngBlob(svg);
    };
    const getSavedShareUrl = async (): Promise<string | null> => {
        const savedId = activeTactic.id && dbTactics.find(t => t.id === activeTactic.id) ? activeTactic.id : null;
        if (!savedId) return null;
        try { const token = await setTacticShareLink(savedId, true); return token ? tacticShareUrl(token) : null; } catch { return null; }
    };
    const handleDownloadImage = async () => {
        try {
            const blob = await buildShareBlob();
            // Sonuca göre konuş: pakette paylaşım sayfası açılır ("kaydedildi"
            // demek yalan olurdu), kullanıcı vazgeçerse hiçbir şey söylenmez.
            const sonuc = await downloadBlob(blob, tacticImageFilename(activeTactic));
            if (sonuc === 'PAYLASILDI') showToast('Taktik görseli paylaşıma hazır.');
            else if (sonuc === 'INDIRILDI') showToast('Taktik görseli indirildi.');
            else if (sonuc === 'DESTEKLENMIYOR') showToast('Görsel bu cihazda kaydedilemedi.', 'error');
        } catch (e) { showToast(mapError(e, 'Görsel üretilemedi.'), 'error'); }
    };
    const handleCopyLink = async () => {
        const url = await getSavedShareUrl();
        if (!url) { showToast('Önce taktiği kaydet — link kayıtlı taktiği taşır.', 'error'); return; }
        try { await navigator.clipboard.writeText(url); showToast('Paylaşım linki kopyalandı!'); }
        catch { showToast('Link kopyalanamadı.', 'error'); }
    };
    // Tek "Paylaş": görsel + (varsa) link → cihazın paylaş menüsü; desteklenmiyorsa indir + kopyala
    const handleShareTactic = async () => {
        try {
            const blob = await buildShareBlob();
            const file = new File([blob], tacticImageFilename(activeTactic), { type: 'image/png' });
            const url = await getSavedShareUrl();
            const nav = navigator as unknown as { canShare?: (d: unknown) => boolean; share?: (d: unknown) => Promise<void> };
            if (nav.canShare && nav.share && nav.canShare({ files: [file] })) {
                await nav.share({
                    files: [file],
                    title: `${activeTactic.name} — OYNA Taktik`,
                    text: `${activeTactic.formation} dizilişli taktiğim: ${activeTactic.name}`,
                    ...(url ? { url } : {}),
                });
            } else {
                // Buradaki mesaj eskiden KOŞULSUZ "Görsel indirildi" diyordu; Android'de
                // dosya hiç oluşmadığı hâlde başarı yazıyordu. Artık dönen sonuca bakıyoruz:
                // link kopyalama görselden BAĞIMSIZ başarabilir, bu yüzden ikisi ayrı anlatılır.
                const sonuc = await downloadBlob(blob, tacticImageFilename(activeTactic));
                let linkKopyalandi = false;
                if (url) {
                    try { await navigator.clipboard.writeText(url); linkKopyalandi = true; } catch { /* yok say */ }
                }
                const gorselOldu = sonuc === 'PAYLASILDI' || sonuc === 'INDIRILDI';
                const gorselMetni = sonuc === 'PAYLASILDI' ? 'Görsel paylaşıma hazır' : 'Görsel indirildi';
                if (gorselOldu) {
                    showToast(linkKopyalandi
                        ? `${gorselMetni}, link kopyalandı.`
                        : url ? `${gorselMetni}. Link kopyalanamadı.` : `${gorselMetni}. Link için taktiği kaydet.`);
                } else if (sonuc === 'DESTEKLENMIYOR') {
                    showToast(linkKopyalandi
                        ? 'Görsel bu cihazda kaydedilemedi; link kopyalandı.'
                        : 'Görsel bu cihazda kaydedilemedi.', 'error');
                } else if (linkKopyalandi) {
                    // 'IPTAL' → görsel için başarı YAZILMAZ; yalnız gerçekten olan iş söylenir.
                    showToast('Paylaşım linki kopyalandı.');
                }
            }
        } catch (e) {
            if ((e as Error)?.name !== 'AbortError') showToast(mapError(e, 'Paylaşılamadı.'), 'error');
        }
    };

    // Sekans haritası (hafif hesap — çekirdekte kalır, gelişmiş modüle de geçer).
    // Oynatma hızı plan temposundan gelir: tempo 5 = 1.0x, 1 = 0.6x, 10 = 1.5x.
    const { seqMap, totalSeqDuration } = computeSeqMap(drawings, tempoSpeedFactor(activeTactic.tempo));

    // ── OYNAT = BİR tur: taktik bir kez oynar, sonra kendiliğinden durur; tekrar
    // izlemek için "TEKRAR OYNAT" gerekir. Top, oyuncular ve bitiş sayacı AYNI
    // süreyi paylaşır; üçü birlikte başlar ve birlikte biter.
    const playCycleSeconds = playMode === 'SEQ'
        ? totalSeqDuration
        : drawings.reduce((mx, d) => Math.max(mx, seqMap.get(d.id)?.duration || 0), 0);
    // Rota süresi (CSS top animasyonuyla eş): zincir sonuna varınca "bitti".
    const simTotalSeconds = Math.max(0.4, totalSeqDuration || playCycleSeconds || 2);

    // ── Oyuncu markörlerinin CSS animasyonu (madde 18 — DONDUR/DEVAM) ────────
    // Oyuncular topla AYNI motorla sürülür: CSS @keyframes + animationPlayState.
    // Böylece DURDUR hepsini AYNI ANDA olduğu yerde dondurur, OYNAT kaldığı
    // yerden devam ettirir. (framer-motion'da "dondur" yoktu; eskiden top donar,
    // oyuncular yürümeye devam ederdi.)
    // Anahtar: markörün id'si (slot ya da rakip) → animasyon tarifi.
    const playerAnims = useMemo(() => {
        const map = new Map<string, PlayerCssAnimation>();
        const api = advancedAnimApiRef.current;
        if (!isSimulating || !api) return map;
        [...activeTactic.slots, ...activeTactic.opponents].forEach(el => {
            const path = drawings.find(d => d.attachedTo === el.id && d.type === 'line');
            if (!path) return;
            const info = seqMap.get(path.id);
            if (!info) return;
            const anim = api(path, playMode, info, totalSeqDuration);
            if (anim) map.set(el.id, anim);
        });
        return map;
        // isAdvancedAnimLoaded: ref dolduğunda yeniden hesapla (ref tek başına tetiklemez).
    }, [isSimulating, isAdvancedAnimLoaded, activeTactic.slots, activeTactic.opponents,
        drawings, playMode, seqMap, totalSeqDuration]);

    // ── OYNAT / DURDUR / DEVAM durum makinesi (madde 18) ─────────────────────
    // Eski davranış (DURDUR → başa dön) KALDIRILDI. Artık:
    //   • İlk OYNAT: baştan oynat (isSimulating=true, paused=false, ended=false).
    //   • DURDUR: simPaused=true → top/oyuncular CSS play-state:paused ile OLDUĞU
    //     YERDE donar (otomatik başa-dönüş yok).
    //   • DEVAM: simPaused=false → kaldığı yerden ilerler.
    //   • Rota bitince (sim-clock animationEnd) simEnded=true → buton TEKRAR OYNAT.
    const startSimulation = useCallback(() => {
        setSimPaused(false);
        setSimEnded(false);
        setIsSimulating(false);
        requestAnimationFrame(() => requestAnimationFrame(() => setIsSimulating(true)));
    }, []);
    const handlePlayPause = useCallback(() => {
        if (simEnded || !isSimulating) { startSimulation(); return; }
        setSimPaused(p => !p); // oynuyorsa dondur, donmuşsa devam
    }, [simEnded, isSimulating, startSimulation]);
    // Mevcut çağrılar (clearAllScene vb. setIsSimulating(false)) için: sim
    // kapanınca duraklama/bitiş bayraklarını da temizle.
    useEffect(() => { if (!isSimulating) { setSimPaused(false); setSimEnded(false); } }, [isSimulating]);

    // Anonim "oynatıldı" telemetrisi — simülasyon her başladığında (kişisel içerik yok).
    useEffect(() => { if (isSimulating) logStudioEvent('tactic_play'); }, [isSimulating]);

    // ── BİZ/RAKİP katman anahtarı: düzenlemede aktif taraf önde, pasif arkada ──
    const layerEditing = isLayerEditing(isSimulating, presentMode);
    const usLayer = markerLayer('US', drawSide, layerEditing);
    const oppLayer = markerLayer('OPP', drawSide, layerEditing);
    // Pasif tarafın çizgileri: soluk + sekans rozetleri kilitli
    const mutedLineIds = drawings.filter(d => lineIsMuted(d.color, drawSide, layerEditing)).map(d => d.id);

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

    // Akıllı geri dönüş: sunum modundaysa çık; takımdan gelindiyse takım detayına
    // dön (bağlam kopmasın); değilse normal geri.
    const handleBack = () => {
        if (presentMode) { exitPresent(); return; }
        if (returnTeamId) {
            setStoreSelectedTeamId(returnTeamId);
            onNavigate('MY_TEAM');
            return;
        }
        onBack();
    };

    // ── İlk kullanım tanıtımı: KULLANICI-BAŞINA bir kez (takım bağlamıyla değil) ──
    // localStorage cihaz-başına hızlı önbellek; profiles.studio_intro_seen kalıcı
    // kullanıcı-başına kaynak (yeni cihaz / yeniden kurulumda da tekrar açmaz).
    const onboardCheckedRef = useRef(false);
    useEffect(() => {
        if (onboardCheckedRef.current) return;
        onboardCheckedRef.current = true;
        if (studioContext) return; // takım/taktik bağlamıyla geldiyse tur açma
        let seenLocal = false;
        try { seenLocal = !!localStorage.getItem(ONBOARD_KEY); } catch { /* yok */ }
        if (seenLocal) return;
        const uid = auth.currentUser?.uid;
        if (!uid) { setOnboardStep(0); return; } // oturumsuz: cihaz-başına göster
        void (async () => {
            try {
                const { data } = await supabase.from('profiles').select('studio_intro_seen').eq('id', uid).single();
                if (data?.studio_intro_seen) {
                    try { localStorage.setItem(ONBOARD_KEY, '1'); } catch { /* yok */ }
                    return; // bu kullanıcı daha önce görmüş
                }
            } catch { /* okunamazsa güvenli varsayılan: göster */ }
            setOnboardStep(0);
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const dismissOnboarding = () => {
        setOnboardStep(null);
        try { localStorage.setItem(ONBOARD_KEY, '1'); } catch { /* yok say */ }
        const uid = auth.currentUser?.uid;
        if (uid) {
            void supabase.from('profiles').update({ studio_intro_seen: true }).eq('id', uid)
                .then(undefined, () => { /* kalıcı yazım best-effort; localStorage yeterli */ });
        }
    };
    const openHelp = () => setOnboardStep(0);

    // Takım seçimini onayla — TEK giriş noktası (eskiden iki ayrı düğme vardı).
    // Üç durum:
    //   • Takım yok (Kişisel): plan takımdan KOPARILIR, kayıt kişisel kütüphaneye gider.
    //   • Takım var, kadro elle doldurulmuş: üzerine YAZMA, yalnız onayla.
    //   • Takım var, kadro eksik: takımın gerçek kadrosunu diz ve onayla.
    const confirmTeamSelection = async () => {
        if (!selectedTeamId) {
            setActiveTactic({ ...activeTactic, teamId: null, teamName: undefined });
            setIsTeamConfirmed(true);
            return;
        }
        const teamRow = studioTeams.find(t => t.team_id === selectedTeamId);
        if (isSquadComplete) {
            setActiveTactic({ ...activeTactic, teamId: selectedTeamId, teamName: teamRow?.name });
            setIsTeamConfirmed(true);
            return;
        }
        try {
            const squad = await ensureSquad(selectedTeamId);
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
    };

    // Tempo (1-10, plana özel) — oynatma hızını da sürer (computeSeqMap çarpanı).
    const setTempo = (value: number) => {
        const tempo = normalizeTempo(value);
        if (tempo === normalizeTempo(activeTactic.tempo)) return;
        setActiveTactic({ ...activeTactic, tempo });
    };

    // ── Birleşik kütüphane: takım oyun defterini tembel yükle (vitrin RPC) ──
    const loadTeamShowcase = async (teamId: string) => {
        if (teamShowcases[teamId]) return;
        setLoadingShowcase(teamId);
        try {
            const rows = await getTeamTacticsShowcase(teamId);
            setTeamShowcases(prev => ({ ...prev, [teamId]: rows.map(r => showcaseToEntry(r, teamId)) }));
        } catch (e) {
            console.error('[Studio] takım vitrini yüklenemedi', e);
            setTeamShowcases(prev => ({ ...prev, [teamId]: [] }));
        } finally {
            setLoadingShowcase(null);
        }
    };

    // Kütüphane penceresi açıldığında / sekme değişince ilgili takımı yükle
    useEffect(() => {
        if (!showTacticsModal) return;
        if (libraryTab !== 'MINE') void loadTeamShowcase(libraryTab);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showTacticsModal, libraryTab]);

    // Aktif sekmenin süzülmüş + sıralanmış satırları
    const libraryEntries: LibraryEntry[] = sortEntries(filterEntries(
        libraryTab === 'MINE'
            ? dbTactics.map(mineToEntry)
            : (teamShowcases[libraryTab] || []),
        librarySearch,
    ));

    // Bir kütüphane satırını plana yükle: kişiselse yereldeki tam kayıt,
    // takımsa getTacticById ile derin hidrasyon. Zaten açık plan varsa ona geç.
    const openLibraryEntry = async (entry: LibraryEntry) => {
        const existingIndex = plans.findIndex(p => p.id === entry.id);
        if (existingIndex >= 0) {
            setActivePlanIndex(existingIndex);
            setShowTacticsModal(false);
            return;
        }
        let tactic: TacticState | undefined =
            entry.source === 'MINE' ? dbTactics.find(t => t.id === entry.id) : undefined;
        if (!tactic) {
            setOpeningTacticId(entry.id);
            try {
                const row = await getTacticById(entry.id);
                if (!row) { showToast('Taktik bulunamadı ya da erişimin yok.', 'error'); return; }
                tactic = parseDbTactic(row);
            } catch (e) {
                console.error('[Studio] taktik yüklenemedi', e);
                showToast('Taktik yüklenemedi.', 'error');
                return;
            } finally {
                setOpeningTacticId(null);
            }
        }
        if (entry.teamId) {
            tactic = { ...tactic, teamId: entry.teamId };
            setSelectedTeamId(entry.teamId);
            setIsTeamConfirmed(true);
            void ensureSquad(entry.teamId);
        }
        setPlans(prev => [...prev, tactic!]);
        setActivePlanIndex(plans.length);
        setShowTacticsModal(false);
    };

    // Kütüphaneden taktik sil — YALNIZ kişisel sekmede (kendi kaydettiklerin).
    // Yetki veritabanındaki `tactics_delete` kuralına dayanır (userId = auth.uid());
    // başkasının/takımın taktiği bu yolla silinemez. Geri alınamaz → önce onay sor.
    // Açık plan silinen kayda bağlıysa sorun olmaz: kaydetme, listede bulunmayan
    // id'yi "yeni kayıt" sayar (doSaveTactic'teki existingId kontrolü).
    const handleDeleteLibraryEntry = async (entry: LibraryEntry) => {
        const ok = await confirm({
            title: 'Taktiği sil?',
            message: <><b className="text-white">{entry.name}</b> kütüphanenden kalıcı olarak silinecek. Bu işlem geri alınamaz.</>,
            confirmLabel: 'Sil',
            destructive: true,
        });
        if (!ok) return;
        setDeletingTacticId(entry.id);
        try {
            await deleteMyTactic(entry.id);
            setDbTactics(prev => prev.filter(t => t.id !== entry.id));
            showToast('Taktik silindi.');
        } catch (e) {
            showToast(mapError(e, 'Taktik silinemedi.'), 'error');
        } finally {
            setDeletingTacticId(null);
        }
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
            // IP-23: panel KAPANMIYOR. Eskiden her seçimde tam ekran katman
            // sökülüp yeniden kuruluyor, arama ve grup filtresi sıfırlanıyordu:
            // 5 kişilik kadro = 5 kez aç-ara-kapa. Artık sıradaki BOŞ mevkiye
            // kendiliğinden geçer; son mevki dolunca panel kendiliğinden kapanır.
            const sonrakiBos = newSlots.find(s => !s.player);
            if (sonrakiBos) setShowPlayerSelect({ type: 'slot', slotId: sonrakiBos.id });
            else closePlayerSelect();
        } else if (showPlayerSelect.type === 'sub') {
            setActiveTactic({ ...activeTactic, subs: [...activeTactic.subs, player] });
            // Yedek eklemede panel açık kalır: yedek sayısı sınırlı değil,
            // kullanıcı genelde arka arkaya birkaç kişi ekliyor.
            showToast(`${player.name} yedeklere eklendi.`, 'success');
        } else if (showPlayerSelect.type === 'any') {
            // IP-23: eşleşme HAM `player.role` ile yapılıyordu. Oyuncunun mevkisi
            // 'ST' / 'CM' / 'CB' gibi gelir; slot rolü ise GK/DEF/MID/FWD.
            // Yani hat eşleşmesi hiç tutmuyor, herkes ilk boş slota düşüyordu.
            // Dosyada doğru eşleyici (posToLine) zaten vardı, toplu dizmede
            // kullanılıyordu — tekil seçimde kullanılmıyordu.
            const hat = posToLine(player.role);
            let targetSlotIndex = activeTactic.slots.findIndex(s => !s.player && s.role === hat);
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
        if (heldSub === playerId) setHeldSub(null);
    };

    // ── S26 — elde tutulan yedeği mevkiye yerleştir; doluysa oyuncuları TAKAS et ──
    const placeHeldSub = (slotId: string) => {
        if (drawSide === 'OPP') return; // RAKİP katmanı önde — bizim mevkiler kilitli
        if (!heldSub) return;
        const incoming = activeTactic.subs.find(p => p.id === heldSub);
        if (!incoming) { setHeldSub(null); return; }
        pushHistory();
        const targetSlot = activeTactic.slots.find(s => s.id === slotId);
        const displaced = targetSlot?.player; // varsa yedeğe döner (takas)
        const newSubs = activeTactic.subs.filter(p => p.id !== heldSub);
        if (displaced) newSubs.push(displaced);
        setActiveTactic({
            ...activeTactic,
            slots: activeTactic.slots.map(s => s.id === slotId ? { ...s, player: incoming, instruction: undefined } : s),
            subs: newSubs,
        });
        setHeldSub(null);
        setSelectedEl(null);
        showToast(displaced ? `${incoming.name} ↔ ${displaced.name} takas edildi` : `${incoming.name} sahaya yerleşti`);
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

    const handleDeletePlan = async (index: number) => {
        // IP-23: burada işletim sisteminin çıplak penceresi açılıyordu — markalı
        // arayüzden çıkıp "localhost diyor ki" gibi bir kutu gösteriyordu ve
        // iOS WebView'de görünümü hiç kontrol edilemiyordu. Uygulamanın kendi
        // onay sayfası zaten yazılıydı, yalnız tesis panelinde kullanılıyordu.
        const onay = await confirm({
            title: 'Planı sil?',
            message: `"${plans[index]?.name ?? 'Plan'}" kalıcı olarak silinecek. Bu işlem geri alınamaz.`,
            confirmLabel: 'Planı Sil',
            destructive: true,
        });
        if (!onay) return;
        const newPlans = plans.filter((_, i) => i !== index);
        setPlans(newPlans);
        if (activePlanIndex === index) {
            setActivePlanIndex(Math.max(0, index - 1));
        } else if (activePlanIndex > index) {
            setActivePlanIndex(activePlanIndex - 1);
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
            tempo: DEFAULT_TEMPO,
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
    // force=true: iyimser kilidi atla (çakışma diyaloğunda "Üzerine yaz").
    const doSaveTactic = async (force: boolean) => {
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
            // İyimser kilit: yalnız mevcut kaydı güncellerken ve force değilken gönder
            expectedUpdatedAt: (!force && existingId) ? (activeTactic.updatedAt ?? null) : null,
        });

        const teamRow = studioTeams.find(t => t.team_id === selectedTeamId);
        setActiveTactic({
            ...activeTactic,
            id: res.tacticId,
            name: saveTacticName.trim(),
            teamName: teamRow?.name,
            teamId: selectedTeamId || null,
            status: res.status as TacticState['status'],
            proposedBy: res.status === 'PENDING_APPROVAL' ? auth.currentUser!.uid : null,
            updatedAt: res.updatedAt ?? activeTactic.updatedAt, // beklenen damgayı tazele
        });
        logStudioEvent('tactic_save');

        // Kaydederken maça ata: yalnız ONAYLI takım taktiği (yönetici kaydı) + anahtar açık + maç var.
        // Kayıt başarısını bozmaz — atama ayrı denenir, hatası ayrı bildirilir.
        let assignedNote = '';
        if (assignToMatch && nextMatch && res.status === 'APPROVED') {
            try {
                await assignMatchTactic(nextMatch.id, res.tacticId);
                assignedNote = ` "${nextMatch.opponentName}" maçına atandı.`;
            } catch (e) {
                showToast(mapError(e, 'Kayıt tamam ama maça atanamadı.'), 'error');
            }
        }
        showToast(res.status === 'PENDING_APPROVAL'
            ? "Taktik önerin takım yöneticilerine gönderildi!"
            : `Taktik kaydedildi!${assignedNote}`);
        setShowSaveModal(false);
        setConflictOpen(false);
        setAssignToMatch(false);
        // S49 — kaydedilen iş için "devam et?" taslağı artık gereksiz
        try { localStorage.removeItem(DRAFT_KEY); } catch { /* yok say */ }
    };

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
            await doSaveTactic(false);
        } catch (error) {
            if (error instanceof TacticConflictError) {
                // Sessiz emek kaybı yok: kullanıcıya sor (üzerine yaz / yenile)
                setShowSaveModal(false);
                setConflictOpen(true);
                return;
            }
            console.error("Error saving tactic:", error);
            showToast(mapError(error, "Taktik kaydedilirken bir hata oluştu."), 'error');
        }
    };

    // Çakışma diyaloğu: "Üzerine yaz" (force) / "Yenile" (sunucudaki sürümü al)
    const overwriteConflict = async () => {
        try { await doSaveTactic(true); }
        catch (e) { showToast(mapError(e, 'Kaydedilemedi.'), 'error'); }
    };
    const reloadConflict = async () => {
        if (!activeTactic.id) { setConflictOpen(false); return; }
        setReloadingConflict(true);
        try {
            const row = await getTacticById(activeTactic.id);
            if (row) {
                const fresh = parseDbTactic(row);
                setPlans(prev => prev.map((p, i) => i === activePlanIndex ? fresh : p));
                showToast('Sunucudaki güncel sürüm yüklendi.');
            }
        } catch { showToast('Güncel sürüm yüklenemedi.', 'error'); }
        finally { setReloadingConflict(false); setConflictOpen(false); }
    };

    // Kaydet penceresi açılınca: yönetici + takım ise yaklaşan maçı getir (atama için).
    useEffect(() => {
        if (!showSaveModal || !selectedTeamId) { setNextMatch(null); setAssignToMatch(false); return; }
        const role = studioTeams.find(t => t.team_id === selectedTeamId)?.my_role;
        if (role !== 'CAPTAIN' && role !== 'ADMIN') { setNextMatch(null); setAssignToMatch(false); return; }
        let alive = true;
        fetchTeamNextMatch(selectedTeamId)
            .then(m => { if (alive) setNextMatch(m); })
            .catch(() => { if (alive) setNextMatch(null); });
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showSaveModal, selectedTeamId]);

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
            showToast(mapError(e, 'İşlem tamamlanamadı.'), 'error');
        } finally {
            setDecidingProposal(false);
        }
    };

    // ── Oyuncu Seç yaşam döngüsü ──
    // IP-23: filtre sıfırlaması AÇILIŞA bağlıydı ve panel her seçimde kapanıp
    // yeniden açıldığı için her oyuncuda arama kutusu siliniyordu. Artık
    // sıfırlama KAPANIŞTA yapılır; panel açık kaldığı sürece arama ve grup
    // filtresi korunur. Kadro yüklemesi açılışta bir kez tetiklenir.
    const panelAcik = !!showPlayerSelect;
    useEffect(() => {
        if (!panelAcik) return;
        studioTeams.forEach(t => { void ensureSquad(t.team_id); });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [panelAcik]);

    const closePlayerSelect = () => {
        setShowPlayerSelect(null);
        setPlayerSearch('');
        setSelectedGroup('Tümü');
    };

    // Manuel ekle: aramaya yazılan isim tek dokunuşla oyuncuya dönüşür (mevki sorulmaz;
    // mevkiyi bırakılan slot belirler, genel akışta ilk boş slota oturur).
    const handleManualAdd = () => {
        const name = playerSearch.trim().slice(0, 20);
        if (name.length < 2) return;
        const newPlayer: Player = { id: `custom_${Date.now()}`, name, role: '-', isCustom: true };
        handleSelectPlayer(newPlayer);
        setPlayerSearch('');
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        if (!canvasRef.current) return;

        // S46 — iki parmak → pinch yakınlaştırma; olası tek-parmak etkileşimlerini iptal et
        pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointersRef.current.size === 2) {
            const pts = Array.from(pointersRef.current.values());
            pinchRef.current = { startDist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1, startZoom: zoom };
            if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; }
            panStartRef.current = null;
            if (isDrawing) { setIsDrawing(false); setCurrentLine(null); }
            return;
        }

        const rect = canvasRef.current.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;

        if (tool.startsWith('draw')) {
            const isPass = tool === 'draw_pass';

            // En yakın oyuncuyu/rakibi bul. Çizim tarafına göre (BİZ/RAKİP) yalnız
            // o tarafın ögelerine bağlanılır (S19).
            // Yakalama alanı: KOŞU'nun oyuncudan başlaması ZORUNLU olduğu için o
            // araçta alan daha geniş tutulur — dar alan çizmeyi imkânsızlaştırır.
            // PAS'ta eski davranış korunur (boş alana pas serbest).
            let attachedTo: string | undefined;
            const threshold = isPass ? PASS_ATTACH_RADIUS : RUN_ATTACH_RADIUS;
            let minDistance = Infinity;
            const attachCandidates = drawSide === 'OPP' ? activeTactic.opponents : activeTactic.slots;
            attachCandidates.forEach(el => {
                const dist = Math.sqrt(Math.pow(el.x - x, 2) + Math.pow(el.y - y, 2));
                if (dist < threshold && dist < minDistance) { minDistance = dist; attachedTo = el.id; }
            });

            // KOŞU KURALI: oyuncudan başlamayan koşu OLUŞMAZ. Çizim hiç başlamaz,
            // geçmişe de yazılmaz (boşuna "geri al" adımı üretmesin).
            if (!isPass && !attachedTo) {
                if (runHintShownRef.current < RUN_HINT_MAX) {
                    runHintShownRef.current += 1;
                    setShowRunHint(true);
                }
                return;
            }

            setIsDrawing(true);
            pushHistory(); // çizim öncesi sahneyi geçmişe al (S14)

            // Koşu ('line'): aynı ögede aynı türden çizgi varsa değiştir (bir
            // oyuncunun tek koşusu olur). Pas ('arrow'): ZİNCİR olduğundan
            // dedup YOK — çok sayıda bağlı pas oku birikebilir.
            if (attachedTo && !isPass) {
                setDrawings(prev => prev.filter(d => d.attachedTo !== attachedTo || d.type !== 'line'));
            }

            // ── TEK TOP + ZİNCİRLEME PAS (madde 19) ──────────────────────────
            // Sahada tek top vardır. Yeni pas, önceki pasın BİTTİĞİ noktadan
            // OTOMATİK başlar (kullanıcı yalnız hedefi çizer) — dağınık çoklu
            // top yerine tek bağlı pas rotası. İlk pas dokunulan yerden başlar.
            let startPt = { x, y };
            if (isPass) {
                const passes = drawings.filter(d => d.type === 'arrow');
                if (passes.length > 0) {
                    const last = passes.reduce((a, b) => (b.seqStep >= a.seqStep ? b : a));
                    const end = last.points[last.points.length - 1];
                    if (end) startPt = { x: end.x, y: end.y };
                }
            }

            const maxSeq = drawings.reduce((max, d) => Math.max(max, d.seqStep), 0);
            setCurrentLine({
                id: `l${Date.now()}`,
                points: [startPt],
                color: drawSide === 'OPP' ? '#ef4444' : '#39FF14',
                type: isPass ? 'arrow' : 'line',
                attachedTo,
                seqStep: maxSeq + 1
            });
        } else if (tool === 'move') {
            // Boş sahaya dokunuş: seçimi kaldır. RAKİP modundayken uzun basınca (500ms)
            // o noktaya rakip bırak (BİZ modunda rakip eklenmez).
            setSelectedEl(null);
            // S46 — yakınlaştırılmışken boş sahayı sürüklemek pan yapar
            if (zoom > 1) panStartRef.current = { px: e.clientX, py: e.clientY, ox: pan.x, oy: pan.y, moved: false };
            if (drawSide === 'OPP') {
                const px = x, py = y;
                if (longPressRef.current) clearTimeout(longPressRef.current);
                longPressRef.current = setTimeout(() => { addOpponentAt(px, py); longPressRef.current = null; }, 500);
            }
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
            player: { id: `opp_p_${stamp}`, name: `Rakip ${activeTactic.opponents.length + 1}`, role: 'OPP', isOpponent: true },
        };
        setActiveTactic({ ...activeTactic, opponents: [...activeTactic.opponents, newOpponent] });
    };

    // Rakip takımını sahaya diz: mevcut dizilişi rakip yarısına AYNALA (S20).
    const mirrorOpponents = () => {
        pushHistory();
        const stamp = Date.now();
        const mirrored: Slot[] = activeTactic.slots.map((s, i) => ({
            id: `opp_${stamp}_${i}`,
            x: Math.round(100 - s.x),
            y: Math.round(100 - s.y),
            role: 'OPP',
            player: { id: `opp_p_${stamp}_${i}`, name: `R${i + 1}`, role: 'OPP', isOpponent: true },
        }));
        setActiveTactic({ ...activeTactic, opponents: mirrored });
        showToast('Rakip takım sahaya dizildi (ayna).');
    };

    // "RAKİP" butonu: rakip yoksa takımı diz; her hâlde RAKİP düzenleme moduna geç.
    // Rakip varken RE-diz yapıp elle düzenlemeyi silmez (deneyimi bozmaz).
    const placeOpponentTeam = () => {
        if (activeTactic.opponents.length === 0) {
            mirrorOpponents();
        } else {
            showToast('Rakip düzenleme modu — BİZ/RAKİP ile geçebilirsin.');
        }
        setDrawSide('OPP');
        setSelectedEl(null);
        setHeldSub(null); // yedek yerleştirme bizim takıma ait — rakip katmanında bırakılır
        setSelectedSeqBadge(null);
    };

    // Rakip: İSİM (player.name, maks 14) + NOT (instruction, maks 10 karakter).
    const updateOpponent = (id: string, patch: { name?: string; note?: string }) => {
        setActiveTactic({
            ...activeTactic,
            opponents: activeTactic.opponents.map(o =>
                o.id === id
                    ? {
                        ...o,
                        player: patch.name !== undefined ? { ...(o.player as Player), name: patch.name.slice(0, 14) } : o.player,
                        instruction: patch.note !== undefined ? patch.note.slice(0, 10) : o.instruction,
                    }
                    : o),
        });
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!canvasRef.current) return;

        // S46 — pinch yakınlaştırma (iki parmak arası mesafenin oranı)
        if (pinchRef.current && pointersRef.current.has(e.pointerId)) {
            pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (pointersRef.current.size >= 2) {
                const pts = Array.from(pointersRef.current.values());
                const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
                setZoomLevel(pinchRef.current.startZoom * (dist / pinchRef.current.startDist));
            }
            return;
        }
        // S46 — pan (yakınlaştırılmışken boş sahayı sürükle)
        if (panStartRef.current && !draggedItem && !isDrawing) {
            const dx = e.clientX - panStartRef.current.px;
            const dy = e.clientY - panStartRef.current.py;
            if (Math.hypot(dx, dy) > 4) {
                panStartRef.current.moved = true;
                if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; }
                setPan(clampPan(zoom, { x: panStartRef.current.ox + dx, y: panStartRef.current.oy + dy }));
            }
            return;
        }

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

    const handlePointerUp = (e?: React.PointerEvent) => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        // Uzun-basma iptali (500ms dolmadan bırakıldıysa rakip eklenmez).
        if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; }

        // S46 — dokunuş sayacı & pinch/pan temizliği
        if (e) pointersRef.current.delete(e.pointerId);
        if (pointersRef.current.size < 2) pinchRef.current = null;
        panStartRef.current = null;

        if (isDrawing && currentLine) {
            const finalLine = { ...currentLine } as DrawingLine;
            setDrawings([...drawings, finalLine]);
            setIsDrawing(false);
            setCurrentLine(null);
            // Geçerli bir koşu oluştu → kırmızı uyarı görevini tamamladı, kalksın.
            if (finalLine.type === 'line') setShowRunHint(false);
        }
        // Sürükleme mi, dokunuş mu? (S11) — taşındıysa geçmişe yaz; dokunuşsa SEÇ.
        if (draggedItem && dragStartRef.current) {
            const cur = draggedItem.type === 'slot'
                ? activeTactic.slots.find(s => s.id === draggedItem.id)
                : activeTactic.opponents.find(o => o.id === draggedItem.id);
            const moved = !!cur && Math.hypot(cur.x - dragStartRef.current.x, cur.y - dragStartRef.current.y) > 0.4;
            if (moved && cur) {
                // S45 — mıknatıslı hizalama: bırakışta yakın eksene otur (düzgün diziliş)
                const SNAP = 2.4;
                const others = (draggedItem.type === 'slot' ? activeTactic.slots : activeTactic.opponents).filter(o => o.id !== draggedItem.id);
                let sx = cur.x, sy = cur.y, snapped = false;
                if (Math.abs(sx - 50) < SNAP) { sx = 50; snapped = true; }   // dikey orta çizgi
                for (const o of others) {
                    if (Math.abs(sx - o.x) < SNAP) { sx = o.x; snapped = true; }
                    if (Math.abs(sy - o.y) < SNAP) { sy = o.y; snapped = true; }
                }
                if (snapped) {
                    sx = Math.round(sx * 10) / 10; sy = Math.round(sy * 10) / 10;
                    if (draggedItem.type === 'slot')
                        setActiveTactic({ ...activeTactic, slots: activeTactic.slots.map(s => s.id === draggedItem.id ? { ...s, x: sx, y: sy } : s) });
                    else
                        setActiveTactic({ ...activeTactic, opponents: activeTactic.opponents.map(o => o.id === draggedItem.id ? { ...o, x: sx, y: sy } : o) });
                }
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
        // Yalnız SEÇİLİ tarafın oyuncuları düzenlenebilir (BİZ=slot, RAKİP=opponent).
        if ((drawSide === 'US' && type === 'opponent') || (drawSide === 'OPP' && type === 'slot')) return;
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
    };

    const handleRemoveOpponent = (id: string) => {
        pushHistory();
        setActiveTactic({ ...activeTactic, opponents: activeTactic.opponents.filter(o => o.id !== id) });
        setSelectedEl(null);
    };

    // ── Granüler temizle (S13) ──
    // "Sadece çizimler" / "Sadece rakipler" artık DOĞRUDAN SİLMEZ: içeriği listeler,
    // kullanıcı istediklerini işaretler ve alttaki "Seçilenleri sil" ile kaldırır;
    // "Hepsini sil" düğmesi de aynı listede durur. Böylece tek bir çizimi silmek
    // için her şeyi silmek gerekmez.
    const clearDrawingsOnly = () => { pushHistory(); setDrawings([]); closeClearSheet(); setSelectedEl(null); showToast('Çizimler silindi · GERİ AL ile dön'); };
    const clearOpponentsOnly = () => { pushHistory(); setActiveTactic({ ...activeTactic, opponents: [] }); closeClearSheet(); setSelectedEl(null); showToast('Rakipler silindi · GERİ AL ile dön'); };

    // Seçili çizimleri sil (liste görünümü).
    const deletePickedDrawings = () => {
        if (clearPicks.length === 0) return;
        pushHistory();
        const n = clearPicks.length;
        setDrawings(drawings.filter(d => !clearPicks.includes(d.id)));
        closeClearSheet(); setSelectedEl(null);
        showToast(`${n} çizim silindi · GERİ AL ile dön`);
    };
    // Seçili rakipleri sil. Rakip silinince ona BAĞLI çizimler de gider —
    // "Seçili ögeyi sil" akışı da böyle davranıyor, iki yol ayrışmasın.
    const deletePickedOpponents = () => {
        if (clearPicks.length === 0) return;
        pushHistory();
        const n = clearPicks.length;
        setActiveTactic({
            ...activeTactic,
            opponents: activeTactic.opponents.filter(o => !clearPicks.includes(o.id)),
            drawings: drawings.filter(d => !d.attachedTo || !clearPicks.includes(d.attachedTo)),
        });
        closeClearSheet(); setSelectedEl(null);
        showToast(`${n} rakip silindi · GERİ AL ile dön`);
    };
    const clearSelected = () => {
        if (!selectedEl) return;
        pushHistory();
        if (selectedEl.type === 'line') setActiveTactic({ ...activeTactic, drawings: drawings.filter(d => d.id !== selectedEl.id) });
        else if (selectedEl.type === 'opponent') setActiveTactic({ ...activeTactic, opponents: activeTactic.opponents.filter(o => o.id !== selectedEl.id), drawings: drawings.filter(d => d.attachedTo !== selectedEl.id) });
        else if (selectedEl.type === 'slot') setActiveTactic({ ...activeTactic, drawings: drawings.filter(d => d.attachedTo !== selectedEl.id) });
        closeClearSheet(); setSelectedEl(null); showToast('Seçili öge silindi · GERİ AL ile dön');
    };
    const clearAllScene = () => { pushHistory(); setIsSimulating(false); setActiveTactic({ ...activeTactic, opponents: [], drawings: [] }); closeClearSheet(); setSelectedEl(null); showToast('Tahta temizlendi · GERİ AL ile dön'); };



    const isSquadComplete = activeTactic.slots.every(s => !!s.player);
    const hasGK = activeTactic.slots.some(s => s.role === 'GK' && !!s.player);
    const filledCount = activeTactic.slots.filter(s => !!s.player).length;
    const missingCount = activeTactic.slots.length - filledCount;
    // S23: eksik kadroyla da kaydedilebilir — yeter ki bir kaleci olsun (plan ≠ maç 11'i).
    const canSave = hasGK;
    const confirmedTeam = studioTeams.find(t => t.team_id === (activeTactic.teamId || selectedTeamId));
    // S40: bağlama göre birincil aksiyon (etiket + hedef).
    const teamForSave = studioTeams.find(t => t.team_id === selectedTeamId);
    const isTeamAdmin = teamForSave?.my_role === 'CAPTAIN' || teamForSave?.my_role === 'ADMIN';
    const primaryLabel = !teamForSave ? 'KÜTÜPHANEME KAYDET' : (isTeamAdmin ? 'TAKIMA KAYDET' : 'TAKIMA ÖNER');
    const primaryTarget = !teamForSave ? 'Kütüphanem' : (teamForSave.name || 'Takımım');

    // Get all players on the pitch (own team + opponents)
    const allPlayersOnPitch = [
        ...activeTactic.slots.filter(s => s.player).map(s => ({ ...s, type: 'slot' as const })),
        ...activeTactic.opponents.map(o => ({ ...o, type: 'opponent' as const }))
    ];

    // ── Bayat kadro tespiti: takım taktiğindeki oyuncu artık kadroda değilse işaretle ──
    // Kadro yüklüyse (squadsByTeam), takım oyuncusu olup güncel kadroda olmayan
    // (elle eklenen hayali oyuncu HARİÇ) slotları "artık kadroda değil" say.
    const activeTeamSquad = activeTactic.teamId ? squadsByTeam[activeTactic.teamId] : undefined;
    const staleSlotIds = new Set<string>();
    if (activeTeamSquad) {
        const squadIds = new Set(activeTeamSquad.map(m => m.user_id));
        activeTactic.slots.forEach(s => {
            if (s.player && !s.player.isCustom && !squadIds.has(s.player.id)) staleSlotIds.add(s.id);
        });
    }
    const hasStaleSquad = staleSlotIds.size > 0;

    // "Kadroyla eşitle": güncel kadroyu mevki hattına göre akıllıca yeniden dizer.
    const syncWithSquad = async () => {
        if (!activeTactic.teamId) return;
        try {
            const squad = await ensureSquad(activeTactic.teamId);
            pushHistory();
            setActiveTactic({ ...activeTactic, slots: populateSlotsWithSquad(squad, activeTactic.slots) });
            showToast('Kadro güncel oyuncularla eşitlendi.');
        } catch (e) {
            console.error('[Studio] kadro eşitlenemedi', e);
            showToast('Kadro eşitlenemedi.', 'error');
        }
    };

    // ── Oyuncu Seç veri hazırlığı: tek akışlı liste (arkadaş + takım kadroları + manuel) ──
    const takenPlayerIds = new Set<string>([
        ...activeTactic.slots.filter(s => s.player).map(s => s.player!.id),
        ...activeTactic.subs.map(p => p.id),
    ]);
    const pickQuery = playerSearch.trim();
    const pickMatches = (name: string) => !pickQuery || name.toLowerCase().includes(pickQuery.toLowerCase());
    const pickTeamFilterId = selectedGroup.startsWith('team:') ? selectedGroup.slice(5) : null;
    const pickListId = studioFriendLists.find(l => l.name === selectedGroup)?.id;
    // Arkadaşlar: favoriler önde; grup/liste ve arama süzer (takım çipi seçiliyse gizli)
    const pickFriends = pickTeamFilterId ? [] : studioFriends
        .filter(f => pickMatches(f.full_name))
        .filter(f => {
            if (selectedGroup === 'Tümü') return true;
            if (selectedGroup === 'Favorilerim') return f.is_favorite;
            return pickListId ? f.list_ids.includes(pickListId) : true;
        })
        .sort((a, b) => Number(b.is_favorite) - Number(a.is_favorite));
    const pickFriendIds = new Set(pickFriends.map(f => f.friend_id));
    // Takım kadroları: Tümü görünümünde hepsi (arkadaş olarak listelenenler yinelenmez),
    // takım çipi seçiliyse yalnız o takımın tam kadrosu
    const pickTeamGroups = (pickTeamFilterId
        ? studioTeams.filter(t => t.team_id === pickTeamFilterId)
        : (selectedGroup === 'Tümü' ? studioTeams : []))
        .map(team => ({
            team,
            loaded: !!squadsByTeam[team.team_id],
            members: (squadsByTeam[team.team_id] || [])
                .filter(m => pickMatches(m.full_name))
                .filter(m => (pickTeamFilterId ? true : !pickFriendIds.has(m.user_id))),
        }));
    const pickHasMatches = pickFriends.length > 0 || pickTeamGroups.some(g => g.members.length > 0);
    const canManualAdd = pickQuery.length >= 2;
    const ROLE_TR: Record<string, string> = { GK: 'KALECİ', DEF: 'DEFANS', MID: 'ORTA SAHA', FWD: 'FORVET' };
    const pickContextLabel = !showPlayerSelect ? ''
        : showPlayerSelect.type === 'slot'
            ? `${ROLE_TR[activeTactic.slots.find(s => s.id === showPlayerSelect.slotId)?.role ?? ''] ?? 'MEVKİ'} mevkisi için seç`
            : showPlayerSelect.type === 'sub' ? 'Yedeklere ekle' : 'Kadroya ekle';

    return (
        <MotionConfig reducedMotion="user">
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
                        <header className="px-6 pt-safe-baslik pb-4 flex justify-between items-center gap-3 sticky top-0 bg-[#050812]/90 backdrop-blur-xl z-30 border-b border-white/5">
                            <div className="flex items-center gap-3 min-w-0">
                                <button id="studio-back-button" onClick={handleBack} aria-label="Geri" className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white hover:bg-white/10 shrink-0">
                                    <ChevronLeft size={20} />
                                </button>
                                <div className="min-w-0">
                                    {presentMode ? (
                                        <>
                                            <h1 className="text-lg font-extrabold text-white truncate">{activeTactic.name}</h1>
                                            <p className="text-[0.625rem] text-[#39FF14] font-mono uppercase truncate tracking-widest">Sunum · Sadece Hareket</p>
                                        </>
                                    ) : (
                                        // Sabit başlık: yalnızca "Stüdyo". Plan adı ve diziliş/boyut
                                        // satırı başlıktan kaldırıldı — ikisi de zaten plan kartında
                                        // görünüyor. Plan adını değiştirme yolu da orada: karttaki
                                        // kalem simgesi ya da karta çift dokunma.
                                        <h1 className="text-lg font-extrabold text-white truncate">Stüdyo</h1>
                                    )}
                                </div>
                            </div>
                            {presentMode ? (
                                <button
                                    onClick={exitPresent}
                                    aria-label="Sunumdan çık"
                                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/15 text-white font-extrabold text-[0.6875rem] tracking-widest shrink-0 hover:bg-white/15 active:scale-95 transition-all"
                                >
                                    <X size={15} /> ÇIKIŞ
                                </button>
                            ) : (
                                <div className="flex items-center gap-2 shrink-0">
                                    {/* Yardım — ilk kullanım turunu yeniden aç */}
                                    <button
                                        onClick={openHelp}
                                        aria-label="Yardım"
                                        title="Nasıl çalışır?"
                                        className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-gray-300 hover:text-white hover:bg-white/10 active:scale-95 transition-all"
                                    >
                                        <HelpCircle size={18} />
                                    </button>
                                    {/* Paylaş — taktik görseli + link + sadece-hareket sunumu */}
                                    <button
                                        onClick={() => setShowExportModal(true)}
                                        aria-label="Paylaş"
                                        className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#39FF14] text-black font-extrabold text-[0.6875rem] tracking-widest hover:brightness-110 active:scale-95 transition-all shadow-[0_0_18px_rgba(57,255,20,0.25)]"
                                    >
                                        <Share2 size={15} /> PAYLAŞ
                                    </button>
                                </div>
                            )}
                        </header>

            {/* Düzenleme kromu — sunum modunda gizlenir (yalnız saha kalır) */}
            {!presentMode && (<>
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
                                    {/* Renk pip'i (büyük) — sol-üst; planın görsel kimliği. Tek tıkla döngü (kesik=otomatik, dolu=elle) */}
                                    <button
                                        onClick={(e) => { e.stopPropagation(); cyclePlanColor(index); }}
                                        title={isAutoColor ? 'Renk: otomatik — değiştirmek için dokun' : 'Renk: elle seçildi — değiştirmek için dokun'}
                                        aria-label="Plan rengini değiştir"
                                        className={`w-6 h-6 rounded-full cursor-pointer shrink-0 shadow-[0_0_8px_rgba(0,0,0,0.4)] ${isAutoColor ? 'border-2 border-dashed border-white/70' : 'border-2 border-white/90'}`}
                                        style={{ backgroundColor: PIP_HEX[effColor] }}
                                    />
                                    <div className="flex items-center gap-1">
                                        {isActive && editingPlanIndex !== index && (
                                            <>
                                                <button onClick={(e) => { e.stopPropagation(); handleRenamePlan(index); }} aria-label="İsmi değiştir" className="p-1 cursor-pointer text-gray-300 hover:text-white transition-colors" title="İsmi Değiştir"><PenTool size={12}/></button>
                                                <button onClick={(e) => { e.stopPropagation(); handleDuplicatePlan(index); }} aria-label="Planı kopyala" className="p-1 cursor-pointer text-gray-300 hover:text-white transition-colors" title="Planı Kopyala"><Copy size={12}/></button>
                                                {plans.length > 1 && (
                                                    <button onClick={(e) => { e.stopPropagation(); handleDeletePlan(index); }} aria-label="Planı sil" className="p-1 cursor-pointer text-gray-300 hover:text-red-500 transition-colors" title="Planı Sil"><Trash2 size={12}/></button>
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
                                        className={`text-center text-sm font-extrabold bg-transparent outline-none w-full uppercase tracking-tighter text-[#39FF14]`}
                                        placeholder="PLAN İSMİ"
                                    />
                                ) : (
                                    <button
                                        onClick={() => handlePlanClick(index)}
                                        onDoubleClick={() => isActive && handleRenamePlan(index)}
                                        className={`text-center text-sm font-extrabold uppercase tracking-tighter truncate w-full transition-all ${getTextColorStyles(effColor, isActive)}`}
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
                            className="flex-shrink-0 w-[60px] h-[80px] rounded-[20px] bg-black/20 border-2 border-dashed border-white/10 hover:border-white/30 text-ink-4 hover:text-white/60 transition-all flex flex-col items-center justify-center gap-1 group"
                            title="Yeni plan (kadro & diziliş korunur)"
                        >
                            <Plus size={20} className="group-hover:scale-110 transition-transform" />
                            <span className="text-[0.625rem] font-extrabold tracking-widest uppercase">Ekle</span>
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
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-extrabold tracking-widest hover:bg-white/10 transition-all"
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
                                        <span className="text-[0.6875rem] text-ink-4 font-mono">{parseInt(String(sz), 10)} kişi</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Formasyon (+ satır sayısıyla özel formasyon) */}
                    <div className="relative flex-1 min-w-0">
                        <button
                            onClick={() => setOpenSelector(openSelector === 'formation' ? null : 'formation')}
                            className="w-full flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-extrabold tracking-widest hover:bg-white/10 transition-all"
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
                                    <p className="text-[0.625rem] text-ink-4 font-extrabold uppercase tracking-widest px-1 mb-1.5">Yeni formasyon (satır sayısı)</p>
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
                                            className="px-3 py-2 rounded-xl bg-[#39FF14] text-black text-[0.6875rem] font-extrabold tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all shrink-0"
                                        >
                                            UYGULA
                                        </button>
                                    </div>
                                    {customError
                                        ? <p className="text-[0.6875rem] text-red-400 mt-1.5 px-1">{customError}</p>
                                        : <p className="text-[0.6875rem] text-ink-4 mt-1.5 px-1">Kaleci hariç {parseInt(String(activeTactic.size), 10) - 1} oyuncu, arkadan öne. Bu diziliş yalnız bu plana özeldir.</p>}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                {/* Dışarı tıklayınca kapat */}
                {openSelector && <div className="fixed inset-0 z-30" onClick={() => setOpenSelector(null)} />}
            </div>

            {/* Araç çubuğu — İŞE GÖRE 3 SATIR (ince ayraçla ayrılır).
                Önceden 14 buton tek satırda yan yana kayıyordu; ekrana sığmayanı
                görmek için yana sürüklemek gerekiyordu. Artık her satır tek bir
                soruyu yanıtlar:
                  1) ÇİZİM   — ne çiziyorum?      (TAŞI · KOŞU · PAS · sadece hareket)
                  2) TAKIM   — kimi düzenliyorum? (BİZ/RAKİP · rakibi diz · geri/yinele/temizle)
                  3) OYNATMA — nasıl izliyorum?   (OYNAT · top · sıra · TEMPO)
                Satırlar dar telefonda da sığacak şekilde ölçülendi: 360/375/390 px
                genişlikte, boş tahtada da oynatma sırasında da taşma yok. Yardımcı
                butonlar yer kazanmak için yazısız/simgeli (anlamları title +
                aria-label ile korunur). overflow-x-auto yalnız güvenlik ağıdır —
                beklenmedik bir genişlikte hiçbir buton erişilemez kalmasın diye. */}
            <div className="px-6 pb-4 space-y-2">

                {/* ── 1. SATIR · ÇİZİM — hangi araç açık (3 eşit kutu, satırı doldurur) */}
                <div className="flex gap-2">
                    <button
                        onClick={() => setTool('move')}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap ${tool === 'move' ? 'bg-[#39FF14] text-black' : 'bg-white/5 text-white hover:bg-white/10'}`}
                    >
                        <MousePointer2 size={14} /> TAŞI
                    </button>
                    <button
                        onClick={() => setTool('draw_run')}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap ${tool === 'draw_run' ? 'bg-[#39FF14] text-black' : 'bg-white/5 text-white hover:bg-white/10'}`}
                        title="Koşu Çiz"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="4 4"><path d="M5 12h14"></path></svg> KOŞU
                    </button>
                    <button
                        onClick={() => setTool('draw_pass')}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap ${tool === 'draw_pass' ? 'bg-[#39FF14] text-black' : 'bg-white/5 text-white hover:bg-white/10'}`}
                        title="Pas Çiz"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12h14M12 5l7 7-7 7"></path></svg> PAS
                    </button>
                    {/* Sadece Hareket (S12) — çizgileri gizle, yalnız top+oyuncu hareketi
                        görünür. Çizim satırında durur: çizgilerin GÖRÜNÜRLÜĞÜNÜ ayarlar. */}
                    <button
                        onClick={() => setHideLines(v => !v)}
                        title={hideLines ? 'Çizgileri göster' : 'Sadece hareket (çizgileri gizle)'}
                        aria-label={hideLines ? 'Çizgileri göster' : 'Sadece hareket (çizgileri gizle)'}
                        className={`shrink-0 flex items-center justify-center w-9 h-9 ml-1 rounded-full transition-all ${hideLines ? 'bg-[#39FF14] text-black' : 'bg-white/5 text-white hover:bg-white/10'}`}
                    >
                        {hideLines ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                </div>

                {/* Araç ipucu — seçili aracın ne yaptığı tek cümle. aria-live ile
                    ekran okuyucu da araç değişimini duyurur. */}
                <p aria-live="polite" className="px-1 text-[0.6875rem] leading-snug text-ink-4">
                    {TOOL_HINTS[tool]}
                </p>

                <div className="h-px bg-white/10" />

                {/* ── 2. SATIR · TAKIM — kimi düzenliyorum (sol) + geri al/yinele/temizle (sağ) */}
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                    {/* BİZ / RAKİP — hangi takımı DÜZENLİYORUM (taşıma/isim/çizim yalnız o tarafta) */}
                    <div className="flex items-center rounded-full bg-white/5 border border-white/10 p-0.5 shrink-0">
                        <button
                            onClick={() => { setDrawSide('US'); setSelectedEl(null); setNamingOpp(null); setSelectedSeqBadge(null); }}
                            title="Bizim takımı düzenle"
                            className={`px-2.5 py-1.5 rounded-full text-[0.6875rem] font-extrabold tracking-widest transition-all ${drawSide === 'US' ? 'bg-[#39FF14] text-black' : 'text-gray-400 hover:text-white'}`}
                        >BİZ</button>
                        <button
                            onClick={() => { setDrawSide('OPP'); setSelectedEl(null); setHeldSub(null); setSelectedSeqBadge(null); }}
                            title="Rakibi düzenle"
                            className={`px-2.5 py-1.5 rounded-full text-[0.6875rem] font-extrabold tracking-widest transition-all ${drawSide === 'OPP' ? 'bg-red-500 text-white' : 'text-gray-400 hover:text-white'}`}
                        >RAKİP</button>
                    </div>
                    {/* Rakip takımı sahaya diz (ayna) + rakip düzenleme moduna geç.
                        Yanındaki anahtarda zaten "RAKİP" yazdığı için burada yazı
                        yinelenmiyor; kılıç simgesi + title yeterli ve satır sığıyor. */}
                    <button
                        onClick={placeOpponentTeam}
                        title="Rakip takımı sahaya diz (mevcut dizilişin aynası)"
                        aria-label="Rakip takımı sahaya diz (mevcut dizilişin aynası)"
                        className={`shrink-0 flex items-center justify-center w-9 h-9 rounded-full transition-all ${drawSide === 'OPP' ? 'bg-red-500 text-white' : 'bg-white/5 text-white hover:bg-red-500/20 hover:text-red-400'}`}
                    >
                        <Swords size={14} />
                    </button>
                    {/* Esneyen boşluk — düzenleme yardımcılarını sağa yaslar */}
                    <div className="flex-1 min-w-2" />
                    {/* Geri Al / Yinele (S14) + Temizle — yer kazanmak için simge */}
                    <button
                        onClick={undo}
                        disabled={undoStack.length === 0}
                        title="Geri Al"
                        aria-label="Geri Al"
                        className="shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-white/5 text-white hover:bg-white/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        <RotateCw size={14} className="-scale-x-100" />
                    </button>
                    <button
                        onClick={redo}
                        disabled={redoStack.length === 0}
                        title="Yinele"
                        aria-label="Yinele"
                        className="shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-white/5 text-white hover:bg-white/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        <RotateCw size={14} />
                    </button>
                    <button
                        onClick={openClearSheet}
                        title="Temizle"
                        aria-label="Temizle"
                        className="shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-white/5 text-white hover:bg-red-500/20 hover:text-red-500 transition-all"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>

                <div className="h-px bg-white/10" />

                {/* ── 3. SATIR · OYNATMA — taktiği nasıl izliyorum.
                    Oynatma sırasında "düzenlemeye dön" butonu da eklendiği için bu
                    satır en kalabalık hale gelir; dar telefonda (360px) sığması için
                    aralıklar ve iç boşluklar ölçülü tutuldu. */}
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                    {/* Oynatma kontrolleri — kapı butonu yok; modül açılışta arka planda yüklenir */}
                    {drawings.length > 0 && (
                        <Suspense fallback={
                            <div className="flex items-center gap-2 px-3 py-2 rounded-full text-xs font-extrabold bg-white/5 text-gray-400 whitespace-nowrap">
                                <Loader2 size={14} className="animate-spin" /> Oynatma yükleniyor…
                            </div>
                        }>
                            <AnimationToolbar
                                isSimulating={isSimulating}
                                simPaused={simPaused}
                                simEnded={simEnded}
                                onPlayPause={handlePlayPause}
                                onExit={() => setIsSimulating(false)}
                                showBall={showBall}
                                setShowBall={setShowBall}
                                playMode={playMode}
                                setPlayMode={setPlayMode}
                            />
                        </Suspense>
                    )}
                    {/* Tempo — plana özel oynatma hızı (1-10); dokununca ayar sayfası açılır */}
                    <button
                        onClick={() => setShowTempoSheet(true)}
                        title="Oynatma temposu (plana özel, 1-10)"
                        className="shrink-0 flex items-center gap-1 px-2.5 py-2 rounded-full text-xs font-extrabold transition-all whitespace-nowrap shadow-lg bg-blue-500/15 text-blue-300 border border-blue-400/30 hover:bg-blue-500/25"
                    >
                        <Gauge size={14} /> TEMPO {normalizeTempo(activeTactic.tempo)}
                    </button>
                </div>
            </div>
            </>)}

            {/* Bayat kadro uyarısı — takım oyuncusu artık kadroda değilse tek dokunuş eşitle */}
            {!presentMode && hasStaleSquad && (
                <div className="px-6 pb-3">
                    <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-2xl p-3">
                        <ShieldAlert size={18} className="text-red-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                            <div className="text-[0.75rem] font-extrabold text-red-300">{staleSlotIds.size} oyuncu artık kadroda değil</div>
                            <div className="text-[0.6875rem] text-red-400/80">Bu oyuncular takımdan ayrılmış olabilir.</div>
                        </div>
                        <button
                            onClick={() => void syncWithSquad()}
                            className="text-[0.625rem] font-extrabold text-black uppercase tracking-widest px-3 py-2 rounded-xl bg-red-400 hover:bg-red-300 active:scale-95 transition-all shrink-0"
                        >Kadroyla eşitle</button>
                    </div>
                </div>
            )}

            {/* Koşu uyarısı — KOŞU aracıyla bir oyuncudan başlamayan çizim denendiğinde
                sahanın hemen üstünde belirir. Doğru bir koşu çizilince kaybolur.
                Bir stüdyo oturumunda en fazla İKİ kez gösterilir (kural her zaman
                geçerli, uyarı iki kezden sonra susar); KOŞU aracından çıkınca da
                kalkar, çünkü mesaj yalnız o araç seçiliyken anlamlı. */}
            {!presentMode && showRunHint && (
                <div className="px-6 pb-3">
                    <div role="alert" className="flex items-center gap-3 bg-red-500/12 border border-red-500/40 rounded-2xl p-3">
                        <ShieldAlert size={18} className="text-red-400 shrink-0" />
                        <div className="min-w-0">
                            <div className="text-[0.75rem] font-extrabold text-red-300">Koşu bir oyuncudan başlamalı</div>
                            <div className="text-[0.6875rem] text-red-400/80">Parmağını bir oyuncunun üzerinden başlatıp çek; boş sahadan çizilen koşu oluşmaz.</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Pitch Area */}
            <div className="px-6 relative z-10 max-w-md mx-auto w-full overflow-hidden">
                {/* S46 — yakınlaştırma kontrolleri (sahayla ölçeklenmez; alt navigasyonla çakışmaz) */}
                {!presentMode && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 z-40 flex flex-col gap-1.5">
                        <button onClick={zoomIn} disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]} aria-label="Yakınlaştır" title="Yakınlaştır"
                            className="w-11 h-11 rounded-full bg-black/70 backdrop-blur border border-white/15 text-white flex items-center justify-center hover:bg-black/85 active:scale-95 transition disabled:opacity-30 disabled:cursor-not-allowed shadow-lg">
                            <ZoomIn size={18} />
                        </button>
                        <button onClick={zoomOut} disabled={zoom <= 1} aria-label="Uzaklaştır" title="Uzaklaştır"
                            className="w-11 h-11 rounded-full bg-black/70 backdrop-blur border border-white/15 text-white flex items-center justify-center hover:bg-black/85 active:scale-95 transition disabled:opacity-30 disabled:cursor-not-allowed shadow-lg">
                            <ZoomOut size={18} />
                        </button>
                        {zoom > 1 && (
                            <button onClick={resetZoom} aria-label="Sıfırla" title="Görünümü sıfırla"
                                className="w-11 h-11 rounded-full bg-black/70 backdrop-blur border border-white/15 text-[#39FF14] flex items-center justify-center hover:bg-black/85 active:scale-95 transition shadow-lg">
                                <Maximize2 size={16} />
                            </button>
                        )}
                    </div>
                )}
                {/* Sunum modu — Tekrar Oynat kontrolü (saha altında) */}
                {presentMode && (
                    <button
                        onClick={replayPresent}
                        aria-label="Tekrar oynat"
                        className="absolute left-1/2 -translate-x-1/2 bottom-4 z-40 flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#39FF14] text-black font-extrabold text-[0.6875rem] tracking-widest hover:brightness-110 active:scale-95 transition-all shadow-[0_6px_24px_rgba(57,255,20,0.35)]"
                    >
                        <RotateCcw size={15} /> TEKRAR OYNAT
                    </button>
                )}
                <div
                    ref={canvasRef}
                    data-testid="studio-pitch"
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerLeave={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    // PARMAK PAYLAŞIMI: tahta ekranın büyük bölümünü kaplıyor.
                    // Parmağı hep kendine alırsa kullanıcı bu alandan sayfayı
                    // kaydıramaz. Kural:
                    //   • Oyuncunun ÜSTÜ → oyuncu taşınır (onlarda `touch-none`)
                    //   • Boş saha       → sayfa kayar ('pan-y')
                    //   • Çizim modu     → parmak çizer ('none' şart)
                    //   • Yakınlaştırılmış → tahta gezinir ('none'); kullanıcı
                    //     yakınlaştırmayı bilerek açtı, "Sıfırla" ile geri döner.
                    // Yakınlaştırma her durumda iki parmakla (pinch) çalışır:
                    // pinch'te parmakların ORTASI yer değiştirmediği için
                    // tarayıcı 'pan-y' hareketini kaydırma sanmaz.
                    style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: 'center center', touchAction: (tool.startsWith('draw') || zoom > 1) ? 'none' : 'pan-y', transition: (pinchRef.current || panStartRef.current) ? 'none' : 'transform 0.18s ease-out' }}
                    className={`relative w-full aspect-[3/4] bg-[#0B2815] rounded-[24px] border-4 border-[#161B22] ${liteGate(perfTier, 'shadow-[inset_0_0_60px_rgba(0,0,0,0.8)]')} overflow-hidden ${tool.startsWith('draw') ? 'cursor-crosshair' : ''} ${tool === 'opponent' ? 'cursor-copy' : ''}`}
                >
                    {/* S44 — hafif kimlik vinyeti (WCAG: yalnız dekoratif, kontrastı bozmaz) */}
                    <div className="absolute inset-0 pointer-events-none z-[1]" style={{ boxShadow: 'inset 0 0 90px rgba(0,0,0,0.55)' }} />
                    {/* S46 — yakınlaştırma göstergesi */}
                    {zoom > 1 && (
                        <div className="absolute top-2 right-2 z-30 px-2 py-0.5 rounded-full bg-black/60 text-[#39FF14] text-[0.6875rem] font-extrabold font-mono pointer-events-none">
                            {Math.round(zoom * 100)}%
                        </div>
                    )}
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
                                    opacity={isSimulating ? '0.3' : (lineIsMuted(line.color, drawSide, layerEditing) ? '0.22' : (selectedEl?.type === 'line' && selectedEl.id === line.id ? '1' : '0.8'))}
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

                    {/* Zincir başlangıç göstergesi (madde 19): PAS aracı seçiliyken
                        ve zaten bir pas varsa, sonraki pasın BAŞLAYACAĞI nokta
                        (önceki pasın bitişi) yanıp sönen halka ile işaretlenir. */}
                    {tool === 'draw_pass' && !isSimulating && passChainEnd && (
                        <div
                            className="absolute z-[55] pointer-events-none"
                            style={{ left: `${passChainEnd.x}%`, top: `${passChainEnd.y}%`, transform: 'translate(-50%,-50%)' }}
                        >
                            <span className="block w-5 h-5 rounded-full border-2 border-[#39FF14] bg-[#39FF14]/20 animate-ping" />
                            <span className="absolute inset-0 m-auto w-2 h-2 rounded-full bg-[#39FF14]" />
                        </div>
                    )}

                    {/* Oyuncu/rakip koşu animasyonlarının @keyframes tanımları —
                        tek <style> ile basılır; markörler bunlara ada göre bağlanır. */}
                    {playerAnims.size > 0 && (
                        <style>{Array.from(playerAnims.values()).map(a => a.css).join('')}</style>
                    )}

                    {/* Opponents */}
                    {activeTactic.opponents.map(opp => {
                        const anim = playerAnims.get(opp.id) || null;
                        const isMoving = !!anim;
                        return (
                        <motion.div 
                            key={opp.id}
                            onPointerDown={(e) => handleDragStart('opponent', opp.id, e)}
                            // `touch-none` YALNIZ gerçekten sürüklenebilirken: RAKİP modunda
                            // değilken bu nokta taşınamaz, parmağı boşuna tutup sayfanın
                            // kaymasını engellememeli.
                            className={`absolute w-10 h-10 ${!oppLayer.interactive ? 'pointer-events-none' : (tool === 'move' ? `cursor-grab active:cursor-grabbing ${drawSide === 'OPP' ? 'touch-none' : ''}` : 'pointer-events-auto')} ${isMoving ? `brightness-125 ${liteGate(perfTier, 'drop-shadow-[0_0_15px_rgba(239,68,68,0.8)]')}` : ''} ${oppLayer.dimmed ? 'opacity-40' : ''}`}
                            // Simülasyonda konumu CSS animasyonu sürer; framer-motion
                            // yalnız markörü rotanın BAŞINA oturtur (sıçrama olmasın).
                            animate={anim
                                ? { left: `${anim.startX}%`, top: `${anim.startY}%` }
                                : { left: `${opp.x}%`, top: `${opp.y}%` }}
                            transition={anim ? { duration: 0 } : (draggedItem?.id === opp.id ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 30 })}
                            // `animation` kısayolu play-state'i sıfırlar → animationPlayState
                            // MUTLAKA sonra gelmeli (topla aynı desen).
                            style={{
                                x: "-50%", y: "-50%",
                                zIndex: draggedItem?.id === opp.id ? 50 : oppLayer.z,
                                ...(anim ? {
                                    animation: `${anim.name} ${anim.duration}s linear forwards`,
                                    animationPlayState: simPaused ? 'paused' as const : 'running' as const,
                                } : {}),
                            }}
                        >
                            <div className={`relative w-full h-full rounded-full border-2 flex items-center justify-center shadow-lg bg-red-900/80 text-white transition-all ${selectedEl?.type === 'opponent' && selectedEl.id === opp.id ? 'border-white ring-2 ring-white/70 scale-110' : 'border-red-500'}`}>
                                <Swords size={16} />
                            </div>
                            <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-1 flex flex-col items-center pointer-events-none">
                                <span className="text-[0.6875rem] font-bold px-1.5 py-0.5 rounded bg-red-950/80 text-red-200 whitespace-nowrap border border-red-500/30">
                                    {opp.player?.name}
                                </span>
                                {opp.instruction && (
                                    <span className="text-[0.6875rem] font-bold mt-0.5 bg-black/40 px-1 rounded text-red-400">
                                        {opp.instruction}
                                    </span>
                                )}
                            </div>
                        </motion.div>
                    )})}

                    {/* Slots */}
                    {activeTactic.slots.map(slot => {
                        const anim = playerAnims.get(slot.id) || null;
                        const isMoving = !!anim;
                        return (
                        <motion.div
                            key={slot.id}
                            // Simülasyonda `layout` kapalı: CSS animasyonu left/top'u
                            // sürerken framer-motion layout ölçümü araya girmesin.
                            layout={draggedItem || isMoving ? false : !perfLite}
                            animate={anim
                                ? { left: `${anim.startX}%`, top: `${anim.startY}%` }
                                : { left: `${slot.x}%`, top: `${slot.y}%` }}
                            transition={anim ? { duration: 0 } : (draggedItem?.id === slot.id ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 30 })}
                            onPointerDown={(e) => {
                                if (heldSub) return; // S26 — takas modunda sürükleme başlatma
                                if (tool === 'move' && slot.player) {
                                    handleDragStart('slot', slot.id, e);
                                }
                            }}
                            onClick={() => { if (heldSub) placeHeldSub(slot.id); }}
                            // `touch-none` YALNIZ gerçekten sürüklenebilirken (yukarıdaki
                            // onPointerDown ile aynı koşul) — aksi hâlde bu kare parmağı
                            // boşuna tutar ve sayfa kaymaz.
                            className={`absolute w-12 h-12 ${!usLayer.interactive ? 'pointer-events-none' : (tool === 'move' && slot.player && drawSide === 'US' && !heldSub ? 'cursor-grab active:cursor-grabbing touch-none' : '')} ${isMoving ? `brightness-125 ${liteGate(perfTier, 'drop-shadow-[0_0_15px_rgba(57,255,20,0.8)]')}` : ''} ${usLayer.dimmed ? 'opacity-40' : ''} ${heldSub ? 'cursor-pointer ring-2 ring-[#39FF14] rounded-full ring-offset-1 ring-offset-black/40' : ''}`}
                            // `animation` kısayolu play-state'i sıfırlar → animationPlayState
                            // MUTLAKA sonra gelmeli (topla aynı desen).
                            style={{
                                x: "-50%", y: "-50%",
                                zIndex: draggedItem?.id === slot.id ? 50 : usLayer.z,
                                ...(anim ? {
                                    animation: `${anim.name} ${anim.duration}s linear forwards`,
                                    animationPlayState: simPaused ? 'paused' as const : 'running' as const,
                                } : {}),
                            }}
                        >
                            {slot.player ? (
                                <motion.div
                                    whileHover={{ scale: 1.1 }}
                                    whileTap={{ scale: 0.9 }}
                                    className={`relative w-full h-full rounded-full border-2 flex items-center justify-center ${liteGate(perfTier, 'shadow-[0_4px_15px_rgba(0,0,0,0.5)]')} ${slot.role === 'GK' ? 'bg-gradient-to-br from-orange-400 to-orange-600 border-orange-300' : 'bg-gradient-to-br from-[#1e2532] to-[#11151c] border-white/30'} ${staleSlotIds.has(slot.id) ? 'ring-2 ring-red-500 ring-offset-1 ring-offset-black/50' : ''}`}
                                >
                                    <span className="text-white font-extrabold text-sm drop-shadow-md">{slot.player.name.charAt(0)}</span>
                                    {/* Forma numarası (takım kadrosundan) — sol üst rozet */}
                                    {slot.player.jersey != null && (
                                        <div className="absolute -top-1.5 -left-1.5 min-w-[16px] h-4 px-1 bg-black/80 rounded-full flex items-center justify-center text-white text-[0.6875rem] font-extrabold border border-white/25 shadow-sm tabular-nums">
                                            {slot.player.jersey}
                                        </div>
                                    )}
                                    {/* Artık kadroda değil — sol alt uyarı */}
                                    {staleSlotIds.has(slot.id) && (
                                        <div className="absolute -bottom-1.5 -left-1.5 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-white border-2 border-[#161B22] shadow-sm" title="Artık kadroda değil">
                                            <ShieldAlert size={9} />
                                        </div>
                                    )}
                                    {activeTactic.captainId === slot.player.id && (
                                        <div className="absolute -top-2 -right-2 w-5 h-5 bg-gradient-to-br from-yellow-300 to-yellow-500 rounded-full flex items-center justify-center text-black text-[0.6875rem] font-extrabold border-2 border-[#161B22] shadow-sm">
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
                                    aria-label="Mevkiye oyuncu ekle"
                                    onClick={() => {
                                        if (drawSide === 'OPP') return; // RAKİP katmanı önde — bizim mevkiler kilitli
                                        if (heldSub) placeHeldSub(slot.id); else setShowPlayerSelect({ type: 'slot', slotId: slot.id });
                                    }}
                                    className={`relative w-full h-full rounded-full border-2 border-dashed flex items-center justify-center bg-black/20 backdrop-blur-sm transition-colors ${slot.role === 'GK' ? 'border-orange-500/50 text-orange-500 hover:border-orange-400' : 'border-[#39FF14]/50 text-[#39FF14]/70 hover:border-[#39FF14] hover:text-[#39FF14]'}`}
                                >
                                    <Plus size={20} />
                                </motion.button>
                            )}
                            <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-1 flex flex-col items-center pointer-events-none">
                                {slot.player && (
                                    <span className={`text-[0.6875rem] font-bold px-1.5 py-0.5 rounded text-white whitespace-nowrap bg-black/60`}>
                                        {slot.player.name}
                                    </span>
                                )}
                                {slot.instruction && (
                                    <span className={`text-[0.6875rem] font-bold mt-0.5 bg-black/40 px-1 rounded text-[#39FF14]`}>
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
                            {/* Sim-clock (madde 18): rota süresi kadar koşar, DURDUR ile
                                birlikte donar (play-state), bitince simEnded=true → buton
                                TEKRAR OYNAT. Görünmez, layout'a etkisiz. */}
                            {isSimulating && (
                                <>
                                    <style>{`@keyframes oySimClock{from{left:0}to{left:0.01px}}`}</style>
                                    <div
                                        aria-hidden
                                        onAnimationEnd={() => setSimEnded(true)}
                                        style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none',
                                                 animation: `oySimClock ${simTotalSeconds}s linear forwards`,
                                                 animationPlayState: simPaused ? 'paused' : 'running' }}
                                    />
                                </>
                            )}
                            <AdvancedAnimationModule
                                drawings={drawings}
                                isSimulating={isSimulating}
                                simPaused={simPaused}
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
                                hideLines={hideLines}
                                mutedLineIds={mutedLineIds}
                            />
                        </Suspense>
                    )}
                </div>
            </div>

            {/* Team Selection & Auto Fill */}
            {!isTeamConfirmed && !presentMode && (
            <div className="px-6 pb-6 mt-4">
                <div className="bg-[#161B22] rounded-[32px] border border-white/5 p-5 shadow-[0_4px_40px_rgba(0,0,0,0.5)]">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-[0.625rem] font-extrabold text-white uppercase tracking-widest flex items-center gap-2">
                            <Users size={14} className="text-[#39FF14]" /> TAKIM SEÇİMİ
                        </h3>
                    </div>
                    
                    {/* Takım şeridi — kanonik get_my_teams. Başta "Kişisel" kartı:
                        takımsız çalışma yolu (kayıt kişisel kütüphaneye gider).
                        Takım yoksa şerit yerine yol gösteren boş durum çıkar. */}
                    {studioTeams.length === 0 ? (
                        <div className="mb-4 rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-4">
                            <p className="text-[0.8125rem] font-extrabold text-white">Henüz bir takımın yok</p>
                            <p className="text-[0.6875rem] text-ink-4 leading-relaxed mt-1">
                                Sorun değil — taktiğini kurup <b className="text-gray-300">kişisel kütüphanene</b> kaydedebilirsin.
                                Takımla çalışmak istersen önce Sosyal'den bir takım kur ya da bir takıma katıl.
                            </p>
                            <button
                                onClick={() => onNavigate('SOCIAL')}
                                className="mt-3 inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-[0.625rem] font-extrabold uppercase tracking-widest hover:bg-white/10 hover:border-[#39FF14]/40 transition-all"
                            >
                                <Users size={14} className="text-[#39FF14]" /> Sosyal'e git
                            </button>
                        </div>
                    ) : (
                    <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2 mb-4">
                        {/* Kişisel (takımsız) */}
                        <button
                            onClick={() => setSelectedTeamId(null)}
                            className={`flex-shrink-0 w-[150px] p-3 rounded-2xl border transition-all text-left ${
                                selectedTeamId === null
                                    ? 'bg-[#39FF14]/10 border-[#39FF14]/50 shadow-[0_0_15px_rgba(57,255,20,0.2)]'
                                    : 'bg-white/5 border-white/5 hover:bg-white/10'
                            }`}
                        >
                            <div className="flex items-center gap-2 mb-1.5">
                                <span className="w-6 h-6 rounded-lg bg-white/10 border border-white/15 flex items-center justify-center text-white shrink-0"><UserPlus size={13} /></span>
                                <h4 className="text-white font-bold text-xs truncate flex-1">Kişisel</h4>
                            </div>
                            <div className="text-[0.6875rem] font-bold text-ink-4">Takımsız çalış</div>
                        </button>

                        {studioTeams.map((team) => {
                            const need = activeTactic.slots.length;
                            const ready = Math.min(team.member_count, need);
                            const enough = team.member_count >= need;
                            return (
                            <button
                                key={team.team_id}
                                onClick={() => { setSelectedTeamId(team.team_id); void ensureSquad(team.team_id); }}
                                className={`flex-shrink-0 w-[150px] p-3 rounded-2xl border transition-all text-left ${
                                    selectedTeamId === team.team_id
                                        ? 'bg-[#39FF14]/10 border-[#39FF14]/50 shadow-[0_0_15px_rgba(57,255,20,0.2)]'
                                        : 'bg-white/5 border-white/5 hover:bg-white/10'
                                }`}
                            >
                                <div className="flex items-center gap-2 mb-1.5">
                                    <span className="w-6 h-6 rounded-lg flex items-center justify-center text-[0.6875rem] font-extrabold text-black shrink-0" style={{ background: team.color1 || '#39FF14' }}>{trUpper((team.short_name || team.name || '?').slice(0, 2))}</span>
                                    <h4 className="text-white font-bold text-xs truncate flex-1">{team.name}</h4>
                                </div>
                                <div className="text-[0.6875rem] font-bold text-ink-4">
                                    <span className={enough ? 'text-[#39FF14]' : 'text-amber-400'}>{ready}/{need}</span> hazır
                                </div>
                                {!enough && <div className="mt-1 text-[0.625rem] font-extrabold text-amber-400 uppercase tracking-widest">Eksik kadro</div>}
                            </button>
                        );})}
                    </div>
                    )}

                    <div className="flex flex-col gap-2">
                        {/* TEK onay düğmesi — etiketi bağlama göre değişir; kadro elle
                            doldurulmuşsa üzerine YAZILMAZ, yalnız onaylanır. */}
                        <button
                            onClick={() => void confirmTeamSelection()}
                            className="w-full h-12 bg-[#39FF14] rounded-2xl flex items-center justify-center gap-2 text-black font-extrabold text-[0.625rem] tracking-widest uppercase hover:brightness-110 active:scale-[0.98] transition-all shadow-[0_0_20px_rgba(57,255,20,0.25)]"
                        >
                            <Users size={16} />
                            {!selectedTeamId ? 'KİŞİSEL OLARAK DEVAM ET'
                                : isSquadComplete ? 'KADROYU ONAYLA' : 'KADROYU DİZ VE ONAYLA'}
                        </button>

                        <button
                            onClick={() => setShowPlayerSelect({ type: 'any' })}
                            className="w-full h-12 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center gap-2 text-white font-extrabold text-[0.625rem] tracking-widest uppercase hover:bg-white/10 hover:border-[#39FF14]/40 active:scale-[0.98] transition-all"
                        >
                            <UserPlus size={16} className="text-[#39FF14]" />
                            ARKADAŞ / OYUNCU EKLE
                        </button>
                    </div>
                </div>
            </div>
            )}

            {/* Onaylı takım çipi (S21) + eksik kadro rozeti (S23) */}
            {isTeamConfirmed && (
                <div className="px-6 pb-3 mt-4">
                    <div className="flex items-center gap-3 bg-[#161B22] rounded-2xl border border-white/5 p-3">
                        {/* Kişisel modda takım arması yerine nötr simge */}
                        {confirmedTeam ? (
                            <span className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-extrabold text-black shrink-0" style={{ background: confirmedTeam.color1 || '#39FF14' }}>
                                {trUpper((confirmedTeam.short_name || activeTactic.teamName || '?').slice(0, 2))}
                            </span>
                        ) : (
                            <span className="w-9 h-9 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center text-white shrink-0"><UserPlus size={16} /></span>
                        )}
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-extrabold text-white truncate">{confirmedTeam ? (activeTactic.teamName || confirmedTeam.name) : 'Kişisel'}</div>
                            <div className="text-[0.6875rem] font-bold text-ink-4">
                                <span className={missingCount === 0 ? 'text-[#39FF14]' : 'text-amber-400'}>{filledCount}/{activeTactic.slots.length}</span> dizili
                                {missingCount > 0 && <span className="ml-2 text-amber-400 font-extrabold uppercase tracking-widest">· {missingCount} eksik</span>}
                            </div>
                        </div>
                        <button
                            onClick={() => setIsTeamConfirmed(false)}
                            className="text-[0.625rem] font-extrabold text-[#39FF14] uppercase tracking-widest px-3 py-2 rounded-xl bg-[#39FF14]/10 hover:bg-[#39FF14]/20 transition-all"
                        >Değiştir</button>
                    </div>
                </div>
            )}

            {/* Yedek tepsisi (S27) — kalıcı yatay şerit + sahaya yerleştir/takas (S26) */}
            {!presentMode && (
            <div className="px-6 pb-4">
                <div className="flex items-center gap-2 mb-2">
                    <List size={12} className="text-ink-4" />
                    <span className="text-[0.625rem] font-extrabold text-ink-4 uppercase tracking-widest">Yedekler ({activeTactic.subs.length})</span>
                    {heldSub && (
                        <span className="text-[0.625rem] font-extrabold text-[#39FF14] uppercase tracking-widest flex items-center gap-1 animate-pulse">
                            · bir mevkiye dokun
                            <button onClick={() => setHeldSub(null)} className="ml-1 text-gray-400 hover:text-white" aria-label="Vazgeç"><X size={11} /></button>
                        </span>
                    )}
                </div>
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                    {activeTactic.subs.map(sub => {
                        const held = heldSub === sub.id;
                        return (
                        <div key={sub.id} className={`flex-shrink-0 flex items-center gap-2 rounded-full pl-1 pr-2 py-1 border transition-all ${held ? 'bg-[#39FF14]/15 border-[#39FF14] ring-2 ring-[#39FF14]/40' : 'bg-white/5 border-white/10'}`}>
                            <button
                                onClick={() => setHeldSub(held ? null : sub.id)}
                                disabled={drawSide === 'OPP'}
                                title={drawSide === 'OPP' ? 'Yedekler bizim takıma ait — BİZ moduna geç' : (held ? 'Bir mevkiye dokunarak yerleştir' : 'Sahaya yerleştir / takas et')}
                                className="flex items-center gap-2 min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <span className="w-6 h-6 rounded-full bg-gradient-to-br from-[#1e2532] to-[#11151c] border border-white/20 flex items-center justify-center text-[0.6875rem] font-extrabold text-white">{sub.name.charAt(0)}</span>
                                <span className={`text-[0.6875rem] font-bold max-w-[90px] truncate ${held ? 'text-[#39FF14]' : 'text-white'}`}>{sub.name}</span>
                            </button>
                            <button onClick={() => handleRemoveSub(sub.id)} className="text-ink-4 hover:text-red-400 transition-colors" aria-label={`${sub.name} yedeği sil`}><X size={12} /></button>
                        </div>
                    );})}
                    <button
                        onClick={() => setShowPlayerSelect({ type: 'sub' })}
                        className="flex-shrink-0 flex items-center gap-1.5 bg-white/5 border border-dashed border-white/20 rounded-full px-3 py-1.5 text-[0.6875rem] font-bold text-gray-400 hover:text-white hover:border-white/40 transition-all min-h-[36px]"
                    >
                        <Plus size={12} /> Ekle
                    </button>
                </div>
            </div>
            )}

            {/* Oyuncu talimatları — yalnız Düzenle modu (S42). Tempo araç çubuğu çipine taşındı. */}
            {!presentMode && (<>

            {/* Section Specific Content */}
            {/* Player List & Instructions Panel */}
            {allPlayersOnPitch.length > 0 && (
                <div className="px-6 mt-6">
                    <div className="bg-[#161B22] rounded-2xl border border-white/10 overflow-hidden">
                        <div className="p-4 border-b border-white/5 bg-white/5 flex items-center justify-between">
                            <h3 className="text-sm font-extrabold text-white uppercase tracking-widest flex items-center gap-2">
                                <Users size={16} className={'text-[#39FF14]'} /> 
                                Oyuncular
                            </h3>
                            {/* IP-23: eskiden 32px, metinsiz ve erişilebilir adsız bir artı
                                ikonuydu; kadro onaylandıktan sonra kalan TEK giriş buydu ve
                                ekranı kaydırmadan görünmüyordu. */}
                            <button 
                                onClick={() => setShowPlayerSelect({ type: 'any' })}
                                aria-label="Oyuncu ekle"
                                className="min-h-11 px-3.5 rounded-full bg-[#39FF14]/20 flex items-center gap-1.5 text-[#39FF14] text-xs font-extrabold hover:bg-[#39FF14]/30 transition-colors"
                            >
                                <Plus size={16} /> Oyuncu Ekle
                            </button>
                        </div>
                        <div className="divide-y divide-white/5">
                            {allPlayersOnPitch.map((item) => (
                                <div key={item.id} className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-extrabold text-white ${item.type === 'opponent' ? 'bg-red-500' : (item.role === 'GK' ? 'bg-orange-500' : 'bg-[#39FF14] text-black')}`}>
                                            {item.type === 'opponent' ? <Swords size={16} /> : item.player?.name.charAt(0)}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h4 className="text-white font-bold text-sm">{item.player?.name}</h4>
                                                {item.type === 'opponent' && <span className="bg-red-500/20 text-red-400 text-[0.6875rem] px-1.5 py-0.5 rounded border border-red-500/30">RAKİP</span>}
                                                {item.player?.isCustom && <span className="bg-white/10 text-gray-300 text-[0.6875rem] px-1.5 py-0.5 rounded border border-white/20">MANUEL</span>}
                                                {activeTactic.captainId === item.player?.id && <span className="bg-yellow-400/20 text-yellow-400 text-[0.6875rem] px-1.5 py-0.5 rounded border border-yellow-400/30">KAPTAN</span>}
                                            </div>
                                            <p className="text-[0.6875rem] text-ink-4 font-bold mt-0.5">
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
                                                aria-label="Kaptan yap"
                                                className={`p-2 rounded-lg transition-all ${activeTactic.captainId === item.player?.id ? 'bg-yellow-400/20 text-yellow-400' : 'bg-white/5 text-gray-400 hover:text-white'}`}
                                            >
                                                <Star size={16} className={activeTactic.captainId === item.player?.id ? 'fill-current' : ''} />
                                            </button>
                                        )}
                                        <button
                                            onClick={() => item.type === 'slot' ? setSelectedSlotForArchetype(item.id) : setInstructionModal({ type: item.type, id: item.id })}
                                            aria-label={item.type === 'slot' ? 'Rol ata' : 'Görev ver'}
                                            className={`p-2 rounded-lg transition-all ${((item.type === 'slot' && item.archetype && item.archetype !== 'NONE') || (item.type !== 'slot' && item.instruction)) ? 'bg-[#39FF14]/20 text-[#39FF14]' : 'bg-white/5 text-gray-400 hover:text-white'}`}
                                        >
                                            {item.type === 'slot' ? <Brain size={16} /> : <MessageSquare size={16} />}
                                        </button>
                                        <button
                                            onClick={() => item.type === 'slot' ? handleRemovePlayer(item.id) : handleRemoveOpponent(item.id)}
                                            aria-label="Oyuncuyu çıkar"
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
            </>)}

            {/* Alt bar (S43/S40) — sunum modunda gizli */}
            {!presentMode && (
            <div className="px-6 mt-6 pb-32">
                <div className="flex gap-2 w-full items-stretch">
                    <button
                        onClick={() => setShowTacticsModal(true)}
                        title="Kütüphane"
                        className="w-16 shrink-0 min-h-[56px] rounded-2xl bg-[#161B22] border border-white/10 flex flex-col items-center justify-center gap-1 text-gray-400 hover:text-white hover:bg-white/5 transition-all"
                    >
                        <List size={18} />
                        <span className="font-extrabold text-[0.625rem] tracking-widest">KÜTÜPHANE</span>
                    </button>

                    <div className="flex-1 relative group">
                        <button
                            disabled={!canSave}
                            onClick={() => { setSaveTacticName(activeTactic.name || ''); setShowSaveModal(true); }}
                            className="w-full h-full min-h-[56px] rounded-2xl flex flex-col items-center justify-center text-black font-extrabold disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.01] active:scale-[0.98] transition-all bg-[#39FF14] shadow-[0_0_24px_rgba(57,255,20,0.25)] px-2 text-center"
                        >
                            <span className="text-[0.6875rem] tracking-widest leading-tight">{primaryLabel}</span>
                            <span className="text-[0.6875rem] font-bold text-black/55 tracking-wide mt-0.5">→ {primaryTarget}</span>
                        </button>
                        {!canSave && (
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-44 bg-red-500/90 text-white text-[0.6875rem] font-bold p-2 rounded-lg text-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                Kaydetmek için en az bir kaleci ekleyin.
                            </div>
                        )}
                    </div>
                </div>
            </div>
            )}

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
                            <h3 className="text-lg font-extrabold text-white uppercase tracking-widest flex items-center gap-2">
                                <Brain size={20} className="text-purple-400" /> ROL ATA
                            </h3>
                            <button onClick={() => setSelectedSlotForArchetype(null)} aria-label="Kapat" className="p-2 text-gray-400 hover:text-white"><X size={20} /></button>
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
                                        {arch.icon || <X size={16} className="text-ink-4" />}
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-white text-sm">{arch.label}</h4>
                                        {arch.hint && <p className="text-[0.6875rem] text-gray-400 mt-1">{arch.hint}</p>}
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
                                <h3 className="text-lg font-extrabold text-white uppercase tracking-widest">Görev Ver</h3>
                                <button onClick={() => setInstructionModal(null)} aria-label="Kapat" className="text-gray-400 hover:text-white">
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

            {/* Oyuncu Seç — tam ekran; tek akışlı liste: arkadaşlar + takım kadroları + manuel ekle.
                Üst bölge (bağlam + arama) sabittir; klavye açıkken de görünür kalır. */}
            <AnimatePresence>
                {showPlayerSelect && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-md flex flex-col"
                    >
                        {/* Sabit üst bölge: bağlam başlığı + kapat + arama */}
                        <div className="pt-safe-baslik px-6 pb-3 max-w-md mx-auto w-full shrink-0">
                            <div className="flex justify-between items-center mb-4 pt-4 gap-3">
                                <div className="min-w-0">
                                    <h2 className="text-xl font-extrabold text-white uppercase tracking-widest italic">Oyuncu Seç</h2>
                                    <p className="text-[0.625rem] font-bold uppercase tracking-widest text-[#39FF14] truncate">{pickContextLabel}</p>
                                </div>
                                <button
                                    onClick={closePlayerSelect}
                                    aria-label="Kapat"
                                    className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 shrink-0"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="relative">
                                <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-4 pointer-events-none" />
                                <input
                                    value={playerSearch}
                                    onChange={(e) => setPlayerSearch(e.target.value)}
                                    placeholder="Ara ya da isim yazıp manuel ekle…"
                                    maxLength={20}
                                    className="w-full bg-black/40 border border-white/10 rounded-2xl pl-11 pr-10 py-3 text-sm text-white placeholder:text-ink-4 focus:border-[#39FF14]/50 focus:outline-none"
                                />
                                {playerSearch && (
                                    <button onClick={() => setPlayerSearch('')} aria-label="Aramayı temizle" className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-gray-400 hover:text-white">
                                        <X size={13} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Kaydırılan liste */}
                        <div className="flex-1 overflow-y-auto px-6 max-w-md mx-auto w-full pb-safe">
                            {/* Kaynak çipleri: arkadaş grupları + takımlar tek şeritte */}
                            <div className="flex gap-2 overflow-x-auto no-scrollbar py-3 items-center">
                                {['Tümü', 'Favorilerim', ...studioFriendLists.map(l => l.name)].map(group => {
                                    const emoji = studioFriendLists.find(l => l.name === group)?.emoji;
                                    const sel = selectedGroup === group;
                                    return (
                                        <button
                                            key={group}
                                            onClick={() => setSelectedGroup(group)}
                                            className={`whitespace-nowrap px-3.5 py-2 rounded-full text-[0.625rem] font-extrabold uppercase tracking-widest border transition-all flex items-center gap-1.5 shrink-0 ${sel ? 'bg-[#39FF14] text-black border-[#39FF14] shadow-[0_0_15px_rgba(57,255,20,0.25)]' : 'bg-white/5 text-gray-400 border-white/10 hover:border-white/30 hover:text-white'}`}
                                        >
                                            {group === 'Favorilerim' && <Star size={11} fill={sel ? 'black' : 'currentColor'} className={sel ? 'text-black' : 'text-[#FACC15]'} />}
                                            {emoji && <span className="text-[0.6875rem] leading-none">{emoji}</span>}
                                            {group}
                                        </button>
                                    );
                                })}
                                {studioTeams.length > 0 && <div className="w-px h-5 bg-white/10 shrink-0" />}
                                {studioTeams.map(team => {
                                    const key = `team:${team.team_id}`;
                                    const sel = selectedGroup === key;
                                    return (
                                        <button
                                            key={key}
                                            onClick={() => setSelectedGroup(sel ? 'Tümü' : key)}
                                            className={`whitespace-nowrap px-3.5 py-2 rounded-full text-[0.625rem] font-extrabold uppercase tracking-widest border transition-all flex items-center gap-1.5 shrink-0 ${sel ? 'bg-[#39FF14] text-black border-[#39FF14] shadow-[0_0_15px_rgba(57,255,20,0.25)]' : 'bg-white/5 text-gray-400 border-white/10 hover:border-white/30 hover:text-white'}`}
                                        >
                                            <span className="w-3.5 h-3.5 rounded-[4px] flex items-center justify-center text-[0.6875rem] font-extrabold text-black leading-none" style={{ background: team.color1 || '#39FF14' }}>
                                                {trUpper((team.short_name || team.name).charAt(0))}
                                            </span>
                                            {team.short_name || team.name}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Manuel ekle — eşleşme yokken üstte, öneri olarak */}
                            {canManualAdd && !pickHasMatches && (
                                <button
                                    onClick={handleManualAdd}
                                    className="w-full bg-[#39FF14]/10 border border-dashed border-[#39FF14]/40 rounded-2xl p-3.5 flex items-center gap-3 hover:bg-[#39FF14]/15 active:scale-[0.99] transition-all text-left mb-2.5"
                                >
                                    <span className="w-11 h-11 rounded-2xl bg-[#39FF14]/15 border border-[#39FF14]/30 flex items-center justify-center text-[#39FF14] shrink-0"><UserPlus size={18} /></span>
                                    <span className="min-w-0">
                                        <span className="block text-sm font-bold text-white truncate">“{pickQuery}” adıyla manuel ekle</span>
                                        <span className="block text-[0.6875rem] text-ink-4 mt-0.5">Kayıtsız oyuncu — yalnız bu taktik tahtasında yaşar.</span>
                                    </span>
                                </button>
                            )}

                            {/* Arkadaşlar (favoriler önde) */}
                            <div className="grid gap-2.5">
                                {pickFriends.map(friend => {
                                    const inSquad = takenPlayerIds.has(friend.friend_id);
                                    return (
                                        <button
                                            key={friend.friend_id}
                                            onClick={() => handleSelectPlayer({ id: friend.friend_id, name: friend.full_name, role: friend.pos || 'CM', isCustom: false })}
                                            disabled={inSquad}
                                            className="w-full bg-[#161B22] border border-white/5 rounded-2xl p-3 flex items-center justify-between transition-all text-left group enabled:hover:border-[#39FF14]/50 enabled:hover:bg-[#39FF14]/[0.04] disabled:opacity-45 disabled:cursor-not-allowed"
                                        >
                                            <div className="flex items-center gap-3 min-w-0 pointer-events-none">
                                                <div className="relative w-11 h-11 shrink-0">
                                                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#1e2532] to-[#11151c] flex items-center justify-center font-extrabold text-base text-white border border-white/10 shadow-lg group-hover:text-[#39FF14] transition-colors">
                                                        {trUpper(friend.full_name.charAt(0))}
                                                    </div>
                                                    {friend.avatar_url && (
                                                        <img src={friend.avatar_url} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} className="absolute inset-0 w-11 h-11 rounded-2xl object-cover border border-white/10 shadow-lg" />
                                                    )}
                                                </div>
                                                <div className="min-w-0">
                                                    <h4 className="text-sm font-extrabold text-white tracking-tight flex items-center gap-1.5 truncate group-hover:text-[#39FF14] transition-colors">
                                                        {friend.full_name}
                                                        {friend.is_favorite && <Star size={12} className="text-[#FACC15] shrink-0" fill="#FACC15" />}
                                                    </h4>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        {friend.pos && <span className="text-[0.625rem] font-extrabold text-[#39FF14] bg-[#39FF14]/10 border border-[#39FF14]/20 rounded px-1.5 py-0.5 uppercase tracking-widest">{friend.pos}</span>}
                                                        <span className="text-[0.6875rem] font-bold text-ink-4 flex items-center gap-1">
                                                            <Users size={10} /> {friend.matches_together} maç birlikte
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                            {inSquad ? (
                                                <span className="flex items-center gap-1.5 text-[0.625rem] font-extrabold uppercase tracking-widest text-[#39FF14] bg-[#39FF14]/10 border border-[#39FF14]/30 rounded-full px-2.5 py-1 shrink-0 ml-2 pointer-events-none"><Check size={11} /> Kadroda</span>
                                            ) : (
                                                <div className="w-8 h-8 rounded-full border border-white/20 flex items-center justify-center text-white/50 group-hover:border-[#39FF14] group-hover:text-[#39FF14] group-hover:bg-[#39FF14]/10 transition-all shrink-0 ml-2 pointer-events-none">
                                                    <Plus size={16} />
                                                </div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Takım kadroları (başlıklı bölümler; kadro tembel yüklenir) */}
                            {pickTeamGroups.map(({ team, loaded, members }) => (
                                (loaded && members.length === 0) ? null : (
                                    <div key={team.team_id} className="mt-4">
                                        <h4 className="text-[0.625rem] font-extrabold text-ink-4 uppercase tracking-widest flex items-center gap-2 mb-2">
                                            <span className="w-4 h-4 rounded-md flex items-center justify-center text-[0.6875rem] font-extrabold text-black leading-none" style={{ background: team.color1 || '#39FF14' }}>
                                                {trUpper((team.short_name || team.name).charAt(0))}
                                            </span>
                                            {team.name}
                                        </h4>
                                        {!loaded ? (
                                            <div className="py-4 flex justify-center"><Spinner size={18} color="rgba(255,255,255,0.4)" glow={false} /></div>
                                        ) : (
                                            <div className="grid gap-2.5">
                                                {members.map(m => {
                                                    const inSquad = takenPlayerIds.has(m.user_id);
                                                    return (
                                                        <button
                                                            key={m.user_id}
                                                            onClick={() => handleSelectPlayer(squadRowToPlayer(m))}
                                                            disabled={inSquad}
                                                            className="w-full bg-[#161B22] border border-white/5 rounded-2xl p-3 flex items-center justify-between transition-all text-left group enabled:hover:border-[#39FF14]/50 enabled:hover:bg-[#39FF14]/[0.04] disabled:opacity-45 disabled:cursor-not-allowed"
                                                        >
                                                            <div className="flex items-center gap-3 min-w-0 pointer-events-none">
                                                                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#1e2532] to-[#11151c] flex items-center justify-center font-extrabold text-base text-white border border-white/10 shadow-lg group-hover:text-[#39FF14] transition-colors shrink-0">
                                                                    {trUpper(m.full_name.charAt(0))}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <h4 className="text-sm font-extrabold text-white tracking-tight truncate group-hover:text-[#39FF14] transition-colors">{m.full_name}</h4>
                                                                    <div className="flex items-center gap-2 mt-0.5">
                                                                        {m.pos && <span className="text-[0.625rem] font-extrabold text-[#39FF14] bg-[#39FF14]/10 border border-[#39FF14]/20 rounded px-1.5 py-0.5 uppercase tracking-widest">{m.pos}</span>}
                                                                        {m.jersey_number != null && <span className="text-[0.6875rem] font-bold text-ink-4 font-mono">#{m.jersey_number}</span>}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            {inSquad ? (
                                                                <span className="flex items-center gap-1.5 text-[0.625rem] font-extrabold uppercase tracking-widest text-[#39FF14] bg-[#39FF14]/10 border border-[#39FF14]/30 rounded-full px-2.5 py-1 shrink-0 ml-2 pointer-events-none"><Check size={11} /> Kadroda</span>
                                                            ) : (
                                                                <div className="w-8 h-8 rounded-full border border-white/20 flex items-center justify-center text-white/50 group-hover:border-[#39FF14] group-hover:text-[#39FF14] group-hover:bg-[#39FF14]/10 transition-all shrink-0 ml-2 pointer-events-none">
                                                                    <Plus size={16} />
                                                                </div>
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )
                            ))}

                            {/* Boş durum — arama yok ve hiç kaynak yoksa yönlendir */}
                            {!pickHasMatches && !canManualAdd && (
                                <div className="text-center py-10 bg-[#161B22]/60 border border-white/5 rounded-2xl flex flex-col items-center gap-2 mt-1">
                                    <Users size={22} className="text-ink-4" />
                                    <p className="text-ink-4 font-bold text-xs uppercase tracking-wider">
                                        {pickQuery ? 'Eşleşen oyuncu yok' : 'Listelenecek oyuncu yok'}
                                    </p>
                                    <p className="text-ink-4 text-[0.6875rem] px-6">İsim yazarsan manuel ekleyebilirsin; arkadaş eklersen burada görünür.</p>
                                </div>
                            )}

                            {/* Manuel ekle — eşleşmeler varken listenin altında */}
                            {canManualAdd && pickHasMatches && (
                                <button
                                    onClick={handleManualAdd}
                                    className="w-full bg-[#39FF14]/10 border border-dashed border-[#39FF14]/40 rounded-2xl p-3.5 flex items-center gap-3 hover:bg-[#39FF14]/15 active:scale-[0.99] transition-all text-left mt-2.5"
                                >
                                    <span className="w-11 h-11 rounded-2xl bg-[#39FF14]/15 border border-[#39FF14]/30 flex items-center justify-center text-[#39FF14] shrink-0"><UserPlus size={18} /></span>
                                    <span className="min-w-0">
                                        <span className="block text-sm font-bold text-white truncate">“{pickQuery}” adıyla manuel ekle</span>
                                        <span className="block text-[0.6875rem] text-ink-4 mt-0.5">Kayıtsız oyuncu — yalnız bu taktik tahtasında yaşar.</span>
                                    </span>
                                </button>
                            )}

                            {/* Başparmak bölgesi: çıkış.
                                IP-23: panel artık seçimden sonra kapanmadığı için bu tuş
                                "vazgeç" değil "bitti"dir — kaç mevkinin dolduğunu da söyler. */}
                            <button
                                onClick={closePlayerSelect}
                                className="w-full mt-4 mb-6 min-h-11 py-3.5 rounded-2xl bg-white/5 text-gray-400 text-xs font-bold uppercase tracking-widest hover:bg-white/10 transition-all"
                            >
                                {(() => {
                                    const toplam = activeTactic.slots.length;
                                    const dolu = activeTactic.slots.filter(s => s.player).length;
                                    return dolu > 0 ? `Bitti · ${dolu}/${toplam} dizili` : 'Vazgeç';
                                })()}
                            </button>
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
                            className="min-h-screen w-full flex flex-col items-center p-6 pb-12 pt-safe-6"
                        >
                            {/* Modal Header
                                ÇENTİK: bu katman `fixed inset-0`, yani EKRANIN tepesinden başlar;
                                `p-6`nın 24px'i Dynamic Island'ın (59px) altında kalıyordu ve geri
                                düğmesi durum çubuğunun ARKASINA giriyordu. `pt-safe-6` aynı 24px'i
                                korur, üstüne güvenli alanı (ve varsa çevrimdışı şeridini) ekler.
                                `top-safe`: başlık yapışkan; kaydırınca ekranın tepesine yapışıp
                                yine çentiğin altına giriyordu — artık güvenli alana yapışır. */}
                            <div className="w-full max-w-sm flex items-center justify-between mb-8 sticky top-safe z-10 py-2">
                                <button
                                    onClick={() => setShowExportModal(false)}
                                    aria-label="Geri"
                                    className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white hover:bg-white/10 transition-all active:scale-90"
                                >
                                    <ChevronLeft size={24} />
                                </button>
                                <div className="text-right">
                                    <h3 className="text-lg font-extrabold text-white uppercase tracking-tighter italic">TAKTİK PAYLAŞ</h3>
                                    <p className="text-[0.625rem] text-[#39FF14] font-bold uppercase tracking-widest">Maç Günü Kartı</p>
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
                                    <div className="absolute top-6 left-6 text-[0.625rem] font-extrabold text-ink-4 tracking-[0.2em] uppercase">OFFICIAL LINEUP</div>
                                    <div className="absolute top-6 right-6 text-[0.625rem] font-extrabold text-ink-4 tracking-[0.2em] uppercase">MATCH DAY</div>
                                    
                                    <div className="w-20 h-20 mx-auto bg-gradient-to-br from-[#39FF14] to-emerald-600 rounded-[24px] flex items-center justify-center shadow-[0_10px_30px_rgba(57,255,20,0.3)] mb-4 relative group-hover:scale-110 transition-transform duration-500">
                                        <Shield size={40} className="text-black" />
                                        <div className="absolute inset-0 rounded-[24px] border-2 border-white/20"></div>
                                    </div>
                                    
                                    <h2 className="text-3xl font-extrabold text-white uppercase tracking-tighter italic leading-none">{activeTactic.name}</h2>
                                    <div className="inline-flex items-center gap-2 mt-3 px-3 py-1 bg-[#39FF14]/10 rounded-full border border-[#39FF14]/20">
                                        <div className="w-1.5 h-1.5 rounded-full bg-[#39FF14] animate-pulse"></div>
                                        <span className="text-[0.625rem] text-[#39FF14] font-extrabold uppercase tracking-widest">{activeTactic.formation} SİSTEMİ</span>
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
                                                    <span className="text-white font-extrabold text-sm drop-shadow-md">{slot.player.name.charAt(0)}</span>
                                                    {activeTactic.captainId === slot.player.id && (
                                                        <div className="absolute -top-2 -right-2 w-5 h-5 bg-gradient-to-br from-yellow-300 to-yellow-500 rounded-full flex items-center justify-center text-black text-[0.6875rem] font-extrabold border-2 border-[#161B22] shadow-sm">
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
                                                    <span className="text-[0.6875rem] font-bold text-white bg-black/60 px-2 py-0.5 rounded-full whitespace-nowrap shadow-sm">
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
                                        <div className="text-[0.625rem] font-bold text-gray-400 uppercase tracking-widest mb-1">OYUN KİMLİĞİ</div>
                                        <div className={`text-xl font-extrabold italic uppercase ${
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
                                            <MessageSquare size={16} className="absolute top-4 left-4 text-ink-4" />
                                            <p className="text-sm text-gray-300 italic pl-8 font-serif">"{activeTactic.notes}"</p>
                                        </div>
                                    )}

                                    {/* Dürüst veri: uydurma yaş/reyting satırı öldü (Spec §11) */}
                                    <div className="mt-4 pt-4 border-t border-white/5 flex justify-between items-center text-[0.625rem] text-ink-4 font-mono uppercase tracking-widest">
                                        <span>{activeTactic.formation} · {formatLabel(activeTactic.size)}</span>
                                        <span className="text-[#39FF14]">Powered by OYNA</span>
                                    </div>
                                </div>
                            </div>

                            <div className="w-full max-w-sm mt-8 space-y-3">
                                {/* BİRİNCİL: görsel (+ varsa link) → cihazın paylaş menüsü (WhatsApp/Instagram/…) */}
                                <button
                                    onClick={handleShareTactic}
                                    className="w-full py-5 bg-[#39FF14] text-black font-extrabold rounded-[24px] text-sm tracking-widest uppercase hover:scale-[1.02] active:scale-[0.98] transition-all shadow-[0_10px_30px_rgba(57,255,20,0.3)] flex items-center justify-center gap-3"
                                >
                                    <Share2 size={20} /> PAYLAŞ
                                </button>

                                {/* Sadece hareket sunumu (OYNAT'ın halefi) */}
                                <button
                                    onClick={enterPresentMovement}
                                    className="w-full py-4 bg-white/8 border border-white/12 text-white font-extrabold rounded-[20px] text-xs tracking-widest uppercase hover:bg-white/12 transition-all flex items-center justify-center gap-2"
                                >
                                    <Eye size={16} className="text-[#39FF14]" /> SADECE HAREKETLE OYNAT
                                </button>

                                {/* İkincil aksiyonlar: görseli indir + linki kopyala */}
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        onClick={handleDownloadImage}
                                        className="py-4 bg-white/5 border border-white/10 text-white font-extrabold rounded-[20px] text-xs tracking-widest uppercase hover:bg-white/10 transition-all flex items-center justify-center gap-2"
                                    >
                                        <SaveAll size={16} className="text-[#39FF14]" /> GÖRSELİ İNDİR
                                    </button>
                                    <button
                                        onClick={handleCopyLink}
                                        className="py-4 bg-white/5 border border-white/10 text-white font-extrabold rounded-[20px] text-xs tracking-widest uppercase hover:bg-white/10 transition-all flex items-center justify-center gap-2"
                                    >
                                        <Layers size={16} className="text-[#39FF14]" /> LİNKİ KOPYALA
                                    </button>
                                </div>

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
                                                showToast(mapError(e, 'Gönderilemedi.'), 'error');
                                            }
                                        }}
                                        className="w-full py-4 bg-white/8 border border-white/12 text-white font-extrabold rounded-[20px] text-xs tracking-widest uppercase hover:bg-white/12 transition-all flex items-center justify-center gap-2"
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
                            <div className="p-5 border-b border-white/5 bg-[#0A0E14]/50">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-lg font-extrabold text-white uppercase tracking-widest flex items-center gap-2.5">
                                        <List size={20} className="text-[#39FF14]" /> KÜTÜPHANE
                                    </h3>
                                    <button onClick={() => setShowTacticsModal(false)} aria-label="Kapat" className="p-2 text-gray-400 hover:text-white transition-colors bg-white/5 rounded-full"><X size={18} /></button>
                                </div>
                                {/* Sekmeler: Kütüphanem + üyesi olunan takımlar */}
                                <div className="flex gap-2 overflow-x-auto no-scrollbar mb-3">
                                    <button
                                        onClick={() => setLibraryTab('MINE')}
                                        className={`whitespace-nowrap px-3.5 py-2 rounded-full text-[0.625rem] font-extrabold uppercase tracking-widest border transition-all shrink-0 ${libraryTab === 'MINE' ? 'bg-[#39FF14] text-black border-[#39FF14]' : 'bg-white/5 text-gray-400 border-white/10 hover:text-white'}`}
                                    >Kütüphanem</button>
                                    {studioTeams.map(team => (
                                        <button
                                            key={team.team_id}
                                            onClick={() => setLibraryTab(team.team_id)}
                                            title={`Takım kütüphanesi: ${team.name}`}
                                            className={`whitespace-nowrap px-3.5 py-2 rounded-full text-[0.625rem] font-extrabold uppercase tracking-widest border transition-all flex items-center gap-1.5 shrink-0 ${libraryTab === team.team_id ? 'bg-[#39FF14] text-black border-[#39FF14]' : 'bg-white/5 text-gray-400 border-white/10 hover:text-white'}`}
                                        >
                                            <span className="w-3.5 h-3.5 rounded-[4px] flex items-center justify-center text-[0.6875rem] font-extrabold text-black leading-none" style={{ background: team.color1 || '#39FF14' }}>
                                                {trUpper((team.short_name || team.name).charAt(0))}
                                            </span>
                                            {team.short_name || team.name}
                                        </button>
                                    ))}
                                </div>
                                {/* Arama */}
                                <div className="relative">
                                    <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-4 pointer-events-none" />
                                    <input
                                        value={librarySearch}
                                        onChange={(e) => setLibrarySearch(e.target.value)}
                                        placeholder="Taktik ara…"
                                        aria-label="Taktik ara"
                                        className="w-full bg-black/40 border border-white/10 rounded-2xl pl-10 pr-9 py-2.5 text-sm text-white placeholder:text-ink-4 focus:border-[#39FF14]/50 focus:outline-none"
                                    />
                                    {librarySearch && (
                                        <button onClick={() => setLibrarySearch('')} aria-label="Aramayı temizle" className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-gray-400 hover:text-white"><X size={12} /></button>
                                    )}
                                </div>
                            </div>
                            <div className="p-4 overflow-y-auto flex-1 space-y-2.5 no-scrollbar">
                                {loadingShowcase === libraryTab ? (
                                    <div className="py-12 flex justify-center"><Spinner size={22} color="rgba(255,255,255,0.4)" glow={false} /></div>
                                ) : libraryEntries.length === 0 ? (
                                    <div className="py-12 text-center text-ink-4 text-sm px-6">
                                        {librarySearch
                                            ? 'Eşleşen taktik yok.'
                                            : libraryTab === 'MINE'
                                                ? 'Kişisel kütüphanen boş — bir taktik kur ve kaydet.'
                                                : 'Bu takımın oyun defteri henüz boş.'}
                                    </div>
                                ) : (
                                    libraryEntries.map((entry) => {
                                        const sm = statusMeta(entry.status);
                                        const toneClass: Record<StatusTone, string> = {
                                            ok: 'bg-[#39FF14]/10 text-[#39FF14] border-[#39FF14]/25',
                                            wait: 'bg-amber-400/10 text-amber-400 border-amber-400/25',
                                            no: 'bg-red-500/10 text-red-400 border-red-500/25',
                                            none: 'hidden',
                                        };
                                        const isOpening = openingTacticId === entry.id;
                                        const isDeleting = deletingTacticId === entry.id;
                                        // Onay rozeti YALNIZ takım defterlerinde anlamlı. Kişisel
                                        // kütüphanede her şey zaten senin; "Onaylı" rozeti gürültü.
                                        const showStatus = entry.source === 'TEAM' && sm.tone !== 'none';
                                        return (
                                            <div key={entry.id} className="flex items-stretch gap-2">
                                            <button
                                                onClick={() => void openLibraryEntry(entry)}
                                                disabled={isOpening || isDeleting}
                                                className="flex-1 min-w-0 text-left p-4 rounded-2xl border border-white/5 bg-[#0A0E14]/30 hover:bg-[#39FF14]/10 hover:border-[#39FF14]/30 transition-all group flex items-center justify-between disabled:opacity-60"
                                            >
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        {entry.isActive && (
                                                            <span title="Takımın aktif maç planı" className="shrink-0"><Star size={14} className="text-[#FACC15]" fill="#FACC15" /></span>
                                                        )}
                                                        <h4 className="text-white font-bold text-base group-hover:text-[#39FF14] transition-colors truncate">{entry.name}</h4>
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                                        <span className="text-[0.6875rem] font-mono text-ink-4 uppercase">{entry.formation || '—'} · {entry.size || '—'}</span>
                                                        {showStatus && (
                                                            <span className={`text-[0.625rem] font-extrabold uppercase tracking-widest border rounded-full px-2 py-0.5 ${toneClass[sm.tone]}`}>{sm.label}</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-[#39FF14] group-hover:text-black transition-colors text-white/50 shrink-0 ml-3">
                                                    {isOpening ? <Loader2 size={16} className="animate-spin" /> : <ChevronRight size={16} />}
                                                </div>
                                            </button>
                                            {/* Sil — yalnız kişisel kütüphanede (kendi kaydettiklerin).
                                                Takım defterinde çıkmaz: oradan silme yetkisi yok. */}
                                            {entry.source === 'MINE' && (
                                                <button
                                                    onClick={() => void handleDeleteLibraryEntry(entry)}
                                                    disabled={isDeleting || isOpening}
                                                    title="Taktiği sil"
                                                    aria-label={`${entry.name} taktiğini sil`}
                                                    className="shrink-0 w-12 rounded-2xl border border-white/5 bg-[#0A0E14]/30 text-ink-4 hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/30 transition-all flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                                                >
                                                    {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                                                </button>
                                            )}
                                            </div>
                                        );
                                    })
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
                                <h3 className="text-lg font-extrabold text-white uppercase tracking-widest flex items-center gap-2">
                                    <Save size={20} className="text-[#39FF14]" /> TAKTİĞİ KAYDET
                                </h3>
                                <button onClick={() => setShowSaveModal(false)} aria-label="Kapat" className="p-2 text-gray-400 hover:text-white transition-colors"><X size={20} /></button>
                            </div>
                            
                            <div className="space-y-4 mb-8">
                                <div>
                                    <label className="block text-[0.625rem] font-extrabold text-gray-400 uppercase tracking-widest mb-2 ml-2">Taktik İsmi</label>
                                    <input
                                        type="text"
                                        value={saveTacticName}
                                        onChange={(e) => setSaveTacticName(e.target.value)}
                                        placeholder="Bu taktiğin adı ne olsun?"
                                        className="w-full bg-[#0A0E14] border border-white/10 rounded-2xl px-5 py-4 text-sm text-white placeholder-gray-600 focus:border-[#39FF14] outline-none transition-colors"
                                    />
                                </div>
                                {/* Nereye kaydedilecek? Son anda değiştirilebilir —
                                    eskiden yalnız gösteriliyordu, seçilemiyordu. */}
                                {studioTeams.length > 0 && (
                                    <div>
                                        <label className="block text-[0.625rem] font-extrabold text-gray-400 uppercase tracking-widest mb-2 ml-2">Nereye kaydedilsin?</label>
                                        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                                            <button
                                                type="button"
                                                onClick={() => setSelectedTeamId(null)}
                                                className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[0.625rem] font-extrabold uppercase tracking-widest border transition-all ${!selectedTeamId ? 'bg-[#39FF14] text-black border-[#39FF14]' : 'bg-white/5 text-gray-400 border-white/10 hover:text-white'}`}
                                            >
                                                <List size={12} /> Kütüphanem
                                            </button>
                                            {studioTeams.map(t => (
                                                <button
                                                    key={t.team_id}
                                                    type="button"
                                                    onClick={() => setSelectedTeamId(t.team_id)}
                                                    className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[0.625rem] font-extrabold uppercase tracking-widest border transition-all ${selectedTeamId === t.team_id ? 'bg-[#39FF14] text-black border-[#39FF14]' : 'bg-white/5 text-gray-400 border-white/10 hover:text-white'}`}
                                                >
                                                    <span className="w-3.5 h-3.5 rounded-[4px] flex items-center justify-center text-[0.6875rem] font-extrabold text-black leading-none" style={{ background: t.color1 || '#39FF14' }}>
                                                        {trUpper((t.short_name || t.name).charAt(0))}
                                                    </span>
                                                    {t.short_name || t.name}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {/* Hedef bağlam: status sunucuda belirlenir — dürüst önizleme */}
                                <div className="bg-[#0A0E14] border border-white/10 rounded-2xl px-5 py-4 text-xs">
                                    {(() => {
                                        const teamRow = studioTeams.find(t => t.team_id === selectedTeamId);
                                        if (!teamRow) {
                                            return <span className="flex items-center gap-2.5 text-gray-400"><List size={15} className="text-[#39FF14] shrink-0" /><span><b className="text-white">Kişisel kütüphanene</b> kaydedilir.</span></span>;
                                        }
                                        const admin = teamRow.my_role === 'CAPTAIN' || teamRow.my_role === 'ADMIN';
                                        return admin
                                            ? <span className="flex items-center gap-2.5 text-gray-400"><Shield size={15} className="text-[#39FF14] shrink-0" /><span><b className="text-white">{teamRow.name}</b> oyun defterine <b className="text-[#39FF14]">onaylı</b> kaydedilir.</span></span>
                                            : <span className="flex items-center gap-2.5 text-gray-400"><Shield size={15} className="text-amber-400 shrink-0" /><span><b className="text-white">{teamRow.name}</b> yöneticilerine <b className="text-amber-400">öneri</b> olarak gönderilir.</span></span>;
                                    })()}
                                </div>
                                {/* Kaydederken maça ata — yalnız yönetici + takım + yaklaşan maç (nextMatch effect zaten gate'ler) */}
                                {nextMatch && (
                                    <button
                                        type="button"
                                        onClick={() => setAssignToMatch(v => !v)}
                                        aria-pressed={assignToMatch}
                                        className={`w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 border transition-all text-left ${assignToMatch ? 'bg-[#39FF14]/10 border-[#39FF14]/40' : 'bg-[#0A0E14] border-white/10 hover:border-white/25'}`}
                                    >
                                        <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${assignToMatch ? 'bg-[#39FF14] border-[#39FF14]' : 'border-white/30'}`}>
                                            {assignToMatch && <Check size={13} className="text-black" />}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-[0.75rem] font-extrabold text-white">Yaklaşan maça ata</span>
                                            <span className="block text-[0.6875rem] text-ink-4 truncate">
                                                {nextMatch.opponentName} · {nextMatch.date}{nextMatch.time ? ` ${nextMatch.time}` : ''}
                                            </span>
                                        </span>
                                        <Calendar size={16} className={assignToMatch ? 'text-[#39FF14]' : 'text-ink-4'} />
                                    </button>
                                )}
                            </div>

                            <button
                                onClick={handleSaveTactic}
                                disabled={!saveTacticName.trim()}
                                className="w-full h-14 bg-[#39FF14] text-black font-extrabold text-xs tracking-widest uppercase rounded-2xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(57,255,20,0.2)]"
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
                            <h3 className="text-xl font-extrabold text-white uppercase tracking-widest mb-2">
                                SAYFAYI YENİLE
                            </h3>
                            <p className="text-gray-400 text-sm mb-6">
                                Sayfa yenilenecek. Güncel taktikleri kaydetmediysen hepsi <strong className="text-red-400">YOK OLACAKTIR</strong>. Devam etmek istiyor musun?
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
                        <div className="text-[0.625rem] font-extrabold uppercase tracking-widest text-amber-400 mb-1">
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
                                className="flex-1 min-h-[44px] rounded-2xl bg-[#39FF14] text-[#0A0E14] text-sm font-extrabold active:scale-[0.97] disabled:opacity-50"
                            >
                                {decidingProposal ? '…' : 'Onayla'}
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Rakip kartı — İSİM + NOT, ekranın ortasında basit kart (S18) */}
            <AnimatePresence>
                {namingOpp && (() => {
                    const opp = activeTactic.opponents.find(o => o.id === namingOpp);
                    if (!opp) return null;
                    return (
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
                            onClick={() => setNamingOpp(null)}
                        >
                            <motion.div
                                initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.94, opacity: 0 }}
                                onClick={e => e.stopPropagation()}
                                className="w-full max-w-xs bg-[#0E1420] border border-red-500/30 rounded-[24px] p-5 shadow-2xl"
                            >
                                <div className="flex items-center gap-2 mb-5">
                                    <div className="w-9 h-9 rounded-full bg-red-900/80 border-2 border-red-500 flex items-center justify-center"><Swords size={15} className="text-white" /></div>
                                    <h3 className="text-sm font-extrabold text-white uppercase tracking-widest">Rakip Oyuncu</h3>
                                </div>

                                {/* İsim */}
                                <div className="flex items-center justify-between mb-1.5 px-1">
                                    <label className="text-[0.625rem] text-gray-400 font-extrabold uppercase tracking-widest">İsim</label>
                                    <span className="text-[0.6875rem] text-ink-4 font-mono">{(opp.player?.name || '').length}/14</span>
                                </div>
                                <input
                                    value={opp.player?.name || ''}
                                    onChange={e => updateOpponent(opp.id, { name: e.target.value })}
                                    maxLength={14}
                                    autoFocus
                                    placeholder="ör. Ahmet, 10 no"
                                    className="w-full bg-[#0A0E14] border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:border-red-500 outline-none transition-colors mb-4"
                                />

                                {/* Not */}
                                <div className="flex items-center justify-between mb-1.5 px-1">
                                    <label className="text-[0.625rem] text-gray-400 font-extrabold uppercase tracking-widest">Not</label>
                                    <span className="text-[0.6875rem] text-ink-4 font-mono">{(opp.instruction || '').length}/10</span>
                                </div>
                                <input
                                    value={opp.instruction || ''}
                                    onChange={e => updateOpponent(opp.id, { note: e.target.value })}
                                    maxLength={10}
                                    placeholder="ör. hızlı, sağ ayak"
                                    className="w-full bg-[#0A0E14] border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:border-red-500 outline-none transition-colors mb-1.5"
                                />
                                <p className="text-[0.6875rem] text-ink-4 mb-5 px-1">İsim ve not sahada rakibin altında görünür (not maks 10 karakter).</p>

                                <div className="flex gap-2">
                                    <button
                                        onClick={() => { handleRemoveOpponent(opp.id); setNamingOpp(null); }}
                                        className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-red-500/15 text-red-400 text-xs font-extrabold hover:bg-red-500/25 transition-all border border-red-500/30"
                                    ><Trash2 size={14} /> Sil</button>
                                    <button
                                        onClick={() => setNamingOpp(null)}
                                        className="flex-1 py-3 rounded-2xl bg-[#39FF14] text-black text-xs font-extrabold uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all"
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
                        className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-end justify-center p-4"
                        onClick={closeClearSheet}
                    >
                        <motion.div
                            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
                            onClick={e => e.stopPropagation()}
                            className="w-full max-w-sm bg-[#0E1420] border border-white/10 rounded-[24px] p-5 shadow-2xl"
                        >
                            {clearMode === null ? (<>
                            <div className="flex items-center gap-2 mb-4">
                                <Trash2 size={18} className="text-red-400" />
                                <h3 className="text-sm font-extrabold text-white uppercase tracking-widest">Neyi temizleyelim?</h3>
                            </div>
                            <div className="space-y-2">
                                {/* Artık doğrudan silmez: içeriği listeleyip seçtirir. */}
                                <button onClick={() => { setClearPicks([]); setClearMode('drawings'); }} disabled={drawings.length === 0}
                                    className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-white/5 text-white text-sm font-bold hover:bg-white/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                                    <span className="flex items-center gap-3"><PenTool size={16} className="text-[#39FF14]" /> Sadece çizimler</span>
                                    <span className="flex items-center gap-2 text-[0.6875rem] text-ink-4 font-mono">{drawings.length} <ChevronRight size={14} /></span>
                                </button>
                                <button onClick={() => { setClearPicks([]); setClearMode('opponents'); }} disabled={activeTactic.opponents.length === 0}
                                    className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-white/5 text-white text-sm font-bold hover:bg-white/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                                    <span className="flex items-center gap-3"><Swords size={16} className="text-red-400" /> Sadece rakipler</span>
                                    <span className="flex items-center gap-2 text-[0.6875rem] text-ink-4 font-mono">{activeTactic.opponents.length} <ChevronRight size={14} /></span>
                                </button>
                                {selectedEl && (
                                    <button onClick={clearSelected}
                                        className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/5 text-white text-sm font-bold hover:bg-white/10 transition-all">
                                        <Crosshair size={16} className="text-amber-400" /> Seçili ögeyi sil
                                    </button>
                                )}
                                <button onClick={clearAllScene}
                                    className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-red-500/15 text-red-400 text-sm font-extrabold hover:bg-red-500/25 transition-all border border-red-500/30">
                                    <Trash2 size={16} /> Hepsini sil
                                </button>
                            </div>
                            </>) : (<>
                            {/* ── Seçim listesi: tek tek işaretle, altta topluca sil ── */}
                            {(() => {
                                const isDraw = clearMode === 'drawings';
                                const rows = isDraw
                                    ? drawings.map((d, i) => {
                                        const owner = [...activeTactic.slots, ...activeTactic.opponents]
                                            .find(el => el.id === d.attachedTo)?.player?.name;
                                        return {
                                            id: d.id,
                                            label: `${i + 1} · ${d.type === 'line' ? 'Koşu' : 'Pas'}${owner ? ` — ${owner}` : ''}`,
                                        };
                                    })
                                    : activeTactic.opponents.map((o, i) => ({
                                        id: o.id,
                                        label: o.player?.name || `Rakip ${i + 1}`,
                                    }));
                                const total = rows.length;
                                const picked = clearPicks.length;
                                const allPicked = total > 0 && picked === total;
                                return (<>
                                    <div className="flex items-center gap-2 mb-1">
                                        <button onClick={() => { setClearMode(null); setClearPicks([]); }}
                                            aria-label="Geri" title="Geri"
                                            className="w-8 h-8 -ml-1 rounded-full bg-white/5 text-white flex items-center justify-center hover:bg-white/10 transition-all shrink-0">
                                            <ChevronLeft size={16} />
                                        </button>
                                        <h3 className="text-sm font-extrabold text-white uppercase tracking-widest">
                                            {isDraw ? 'Çizimler' : 'Rakipler'}
                                        </h3>
                                        <span className="text-[0.6875rem] text-ink-4 font-mono">{total}</span>
                                    </div>
                                    <p className="text-[0.6875rem] text-ink-4 mb-3 pl-1">
                                        Silmek istediklerine dokunup işaretle, sonra alttaki düğmeye bas.
                                    </p>
                                    {/* Tümünü işaretle / kaldır */}
                                    <button
                                        onClick={() => setClearPicks(allPicked ? [] : rows.map(r => r.id))}
                                        className="w-full mb-2 py-2 rounded-xl bg-white/5 text-gray-300 text-[0.6875rem] font-extrabold uppercase tracking-widest hover:bg-white/10 transition-all"
                                    >{allPicked ? 'İşaretleri kaldır' : 'Tümünü işaretle'}</button>
                                    <div data-testid="clear-pick-list" className="space-y-1.5 max-h-56 overflow-y-auto no-scrollbar">
                                        {rows.map(r => {
                                            const on = clearPicks.includes(r.id);
                                            return (
                                                <button
                                                    key={r.id}
                                                    onClick={() => toggleClearPick(r.id)}
                                                    aria-pressed={on}
                                                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all border ${on ? 'bg-red-500/15 text-red-300 border-red-500/40' : 'bg-white/5 text-white border-transparent hover:bg-white/10'}`}
                                                >
                                                    <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${on ? 'bg-red-500 border-red-500 text-white' : 'border-white/25'}`}>
                                                        {on && <Check size={12} />}
                                                    </span>
                                                    <span className="truncate text-left">{r.label}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <button
                                        onClick={isDraw ? deletePickedDrawings : deletePickedOpponents}
                                        disabled={picked === 0}
                                        className="w-full mt-3 flex items-center justify-center gap-2 py-3 rounded-2xl bg-red-500/15 text-red-400 text-sm font-extrabold hover:bg-red-500/25 transition-all border border-red-500/30 disabled:opacity-30 disabled:cursor-not-allowed"
                                    >
                                        <Trash2 size={16} /> Seçilenleri sil{picked > 0 ? ` (${picked})` : ''}
                                    </button>
                                    <button
                                        onClick={isDraw ? clearDrawingsOnly : clearOpponentsOnly}
                                        className="w-full mt-2 py-3 rounded-2xl bg-white/5 text-gray-300 text-xs font-extrabold uppercase tracking-widest hover:bg-red-500/20 hover:text-red-400 transition-all"
                                    >Hepsini sil ({total})</button>
                                </>);
                            })()}
                            </>)}
                            <button onClick={closeClearSheet}
                                className="w-full mt-3 py-3 rounded-2xl bg-white/5 text-gray-400 text-xs font-bold uppercase tracking-widest hover:bg-white/10 transition-all">
                                Vazgeç
                            </button>
                            <p className="text-[0.6875rem] text-ink-4 text-center mt-2">Sildikten sonra <b className="text-gray-400">GERİ AL</b> ile dönebilirsin.</p>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Tempo ayar sayfası — araç çubuğundaki TEMPO çipinden açılır (plana özel) */}
            <AnimatePresence>
                {showTempoSheet && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-end justify-center p-4"
                        onClick={() => setShowTempoSheet(false)}
                    >
                        <motion.div
                            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
                            onClick={e => e.stopPropagation()}
                            className="w-full max-w-sm bg-[#0E1420] border border-white/10 rounded-[24px] p-5 shadow-2xl"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-sm font-extrabold text-white uppercase tracking-widest flex items-center gap-2">
                                    <Gauge size={16} className="text-blue-400" /> TEMPO
                                </h3>
                                <div className="flex items-baseline gap-0.5">
                                    <span className="text-xl font-extrabold text-blue-400 tabular-nums leading-none">{normalizeTempo(activeTactic.tempo)}</span>
                                    <span className="text-[0.6875rem] font-bold text-ink-4">/10</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => setTempo(normalizeTempo(activeTactic.tempo) - 1)}
                                    disabled={normalizeTempo(activeTactic.tempo) <= 1}
                                    aria-label="Tempoyu azalt"
                                    className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white hover:bg-white/10 active:scale-95 transition disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                                >
                                    <Minus size={16} />
                                </button>
                                <div className="flex-1">
                                    <input
                                        type="range"
                                        min={1}
                                        max={10}
                                        step={1}
                                        value={normalizeTempo(activeTactic.tempo)}
                                        onChange={(e) => setTempo(Number(e.target.value))}
                                        aria-label="Tempo (1-10)"
                                        className="w-full h-2 cursor-pointer accent-blue-400"
                                    />
                                    <div className="flex justify-between mt-1 px-0.5">
                                        <span className="text-[0.6875rem] font-bold text-ink-4 font-mono">1</span>
                                        <span className="text-[0.6875rem] font-bold text-ink-4 font-mono">10</span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setTempo(normalizeTempo(activeTactic.tempo) + 1)}
                                    disabled={normalizeTempo(activeTactic.tempo) >= 10}
                                    aria-label="Tempoyu artır"
                                    className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white hover:bg-white/10 active:scale-95 transition disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                                >
                                    <Plus size={16} />
                                </button>
                            </div>
                            <p className="text-[0.6875rem] text-ink-4 mt-3">Bu ayar yalnız <b className="text-gray-400">aktif planın</b> temposudur; oynatma hızını sürer (5 = temel hız).</p>
                            <button
                                onClick={() => setShowTempoSheet(false)}
                                className="w-full mt-3 py-3 rounded-2xl bg-white/5 text-gray-400 text-xs font-bold uppercase tracking-widest hover:bg-white/10 transition-all"
                            >
                                Tamam
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* İyimser kilit çakışması — sessiz emek kaybı yerine kullanıcıya sor */}
            <AnimatePresence>
                {conflictOpen && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[135] bg-black/75 backdrop-blur-sm flex items-center justify-center p-6"
                    >
                        <motion.div
                            initial={reduceMotion ? false : { scale: 0.92, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, opacity: 0 }}
                            className="w-full max-w-sm rounded-3xl bg-[#0B1120] border border-amber-500/30 p-6 shadow-2xl"
                        >
                            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mb-4">
                                <ShieldAlert size={22} className="text-amber-400" />
                            </div>
                            <h3 className="text-white text-lg font-extrabold mb-1">Taktik bu arada değişti</h3>
                            <p className="text-gray-400 text-[0.8125rem] leading-relaxed mb-5">
                                Bu taktik sen açtıktan sonra (başka bir yönetici tarafından) güncellenmiş. Ne yapmak istersin?
                            </p>
                            <div className="flex flex-col gap-2.5">
                                <button
                                    onClick={() => void reloadConflict()}
                                    disabled={reloadingConflict}
                                    className="w-full py-3 rounded-2xl bg-[#39FF14] text-black font-extrabold text-sm hover:brightness-110 transition flex items-center justify-center gap-2 disabled:opacity-60"
                                >
                                    {reloadingConflict ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />} Güncel sürümü getir
                                </button>
                                <button
                                    onClick={() => void overwriteConflict()}
                                    disabled={reloadingConflict}
                                    className="w-full py-3 rounded-2xl bg-white/5 text-amber-300 font-extrabold text-sm hover:bg-white/10 transition"
                                >
                                    Yine de üzerine yaz
                                </button>
                                <button
                                    onClick={() => setConflictOpen(false)}
                                    className="w-full py-2.5 rounded-2xl text-ink-4 font-bold text-xs uppercase tracking-widest hover:text-white transition"
                                >
                                    Vazgeç
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* İlk kullanım tanıtımı — tek sayfa, tüm araçlar (Yardım ile yeniden açılır) */}
            <AnimatePresence>
                {onboardStep !== null && (() => {
                    // TEK SAYFA kapsamlı araç tanıtımı (demo/örnek-oynatma yok):
                    // tüm araçlar bir ekranda; kullanıcı-başına bir kez görünür.
                    const rows = [
                        { icon: <Users size={18} className="text-[#39FF14]" />, title: 'Oyuncuları yerleştir', body: 'Sahadaki + işaretine dokun; arkadaşını/takımını ekle ya da isim yazıp elle koy.' },
                        { icon: <PenTool size={18} className="text-[#39FF14]" />, title: 'KOŞU çiz', body: 'KOŞU aracını seç, bir oyuncudan başlayıp parmağınla hareket çizgisini çek.' },
                        { icon: <Radio size={18} className="text-[#39FF14]" />, title: 'PAS çiz — tek top, zincir', body: 'Sahada tek top vardır. İlk pası çiz; sonraki pas otomatik önceki pasın bittiği yerden başlar (vurgulu nokta).' },
                        { icon: <Play size={18} className="text-[#39FF14]" />, title: 'OYNAT / DURDUR', body: "OYNAT taktiği canlandırır. DURDUR olduğu yerde DONDURUR; OYNAT kaldığı yerden devam eder." },
                        { icon: <Gauge size={18} className="text-[#39FF14]" />, title: 'Tempo & taraf', body: 'TEMPO ile hızı ayarla. BİZ/RAKİP ile takım değiştir; boş sahaya uzun bas → rakip ekle.' },
                        { icon: <Share2 size={18} className="text-[#39FF14]" />, title: 'Paylaş', body: 'PAYLAŞ ile taktiğini takımına gönder ya da dışa aktar.' },
                    ];
                    return (
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[130] bg-black/75 backdrop-blur-sm flex items-center justify-center p-5"
                        >
                            <motion.div
                                initial={reduceMotion ? false : { scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, opacity: 0 }}
                                className="w-full max-w-sm max-h-[88vh] flex flex-col rounded-3xl bg-[#0B1120] border border-white/10 shadow-2xl overflow-hidden"
                            >
                                <div className="px-6 pt-6 pb-3 shrink-0">
                                    <div className="w-12 h-12 rounded-2xl bg-[#39FF14]/12 border border-[#39FF14]/25 flex items-center justify-center mb-3">
                                        <Sparkles size={22} className="text-[#39FF14]" />
                                    </div>
                                    <h3 className="text-white text-xl font-extrabold leading-tight">Taktik Stüdyo</h3>
                                    <p className="text-gray-400 text-[0.75rem] leading-relaxed mt-1">Sahayı diz, hareketleri çiz, izle ve paylaş. Araçların tamamı:</p>
                                </div>
                                <div className="flex-1 overflow-y-auto overscroll-contain px-6 space-y-2.5 custom-scrollbar">
                                    {rows.map((r, k) => (
                                        <div key={k} className="flex gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                                            <div className="w-9 h-9 rounded-xl bg-[#39FF14]/10 border border-[#39FF14]/25 flex items-center justify-center shrink-0">{r.icon}</div>
                                            <div className="min-w-0">
                                                <p className="text-[0.8125rem] font-extrabold text-white leading-tight">{r.title}</p>
                                                <p className="text-[0.6875rem] text-gray-400 leading-relaxed mt-0.5">{r.body}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="p-5 pt-4 shrink-0">
                                    <button onClick={dismissOnboarding} className="w-full py-3.5 rounded-2xl bg-[#39FF14] text-black font-extrabold text-sm hover:brightness-110 transition">
                                        Başla
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    );
                })()}
            </AnimatePresence>

            {/* S49 — Otomatik taslak: yarım kalan çalışmayı geri yükle */}
            <AnimatePresence>
                {resumeDraft && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6"
                    >
                        <motion.div
                            initial={reduceMotion ? false : { scale: 0.92, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, opacity: 0 }}
                            className="w-full max-w-sm rounded-3xl bg-[#0B1120] border border-white/10 p-6 shadow-2xl"
                        >
                            <div className="w-12 h-12 rounded-2xl bg-[#39FF14]/15 border border-[#39FF14]/30 flex items-center justify-center mb-4">
                                <RotateCcw size={22} className="text-[#39FF14]" />
                            </div>
                            <h3 className="text-white text-lg font-extrabold mb-1">Kaldığın yerden devam?</h3>
                            <p className="text-gray-400 text-[0.8125rem] leading-relaxed mb-5">
                                Yarım kalan bir taktik taslağın var{resumeDraft.plans.length > 1 ? ` (${resumeDraft.plans.length} plan)` : ''}. Geri yüklemek ister misin?
                            </p>
                            <div className="flex gap-3">
                                <button onClick={discardResumeDraft} className="flex-1 py-3 rounded-2xl bg-white/5 text-gray-300 font-extrabold text-sm hover:bg-white/10 transition">
                                    Yeni Başla
                                </button>
                                <button onClick={applyResumeDraft} className="flex-1 py-3 rounded-2xl bg-[#39FF14] text-black font-extrabold text-sm hover:brightness-110 transition flex items-center justify-center gap-2">
                                    <RotateCcw size={16} /> Devam Et
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* S47 — yatay sunum modu ipucu (küçük ekranlarda) */}
            <AnimatePresence>
                {isLandscape && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
                        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[90] px-4 py-2 rounded-full bg-black/80 backdrop-blur border border-[#39FF14]/30 flex items-center gap-2 pointer-events-none"
                    >
                        <Sparkles size={14} className="text-[#39FF14]" />
                        <span className="text-[0.6875rem] text-white font-bold">Sunum modu — sahayı büyütmek için yakınlaştır</span>
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
                        // KONUM: `bottom-32` (128px) çivilenmişti. Stüdyonun kendi balonu
                        // ortak Toast bileşenini kullanmadığı için bu gece yapılan
                        // `.uyari-balonu` düzeltmesi buraya ulaşmamıştı: klavye açıkken
                        // (taktik adı yazılırken) ya da çentikli cihazın ana ekran
                        // çubuğunda balon ARKADA kalıyordu. Asıl tehlike, dosya kaydetme
                        // dürüstleştirmesinin "Görsel bu cihazda kaydedilemedi." mesajının
                        // tam buradan çıkması: görünmeyen dürüst hata = kullanıcı düğmeyi
                        // bozuk sanır. Konum artık index.css'teki ortak kuraldan gelir.
                        //
                        // YATAY ORTALAMA `left-1/2 + -translate-x-1/2` ile YAPILIR.
                        // Bir ara "framer-motion transform'u ezer" gerekçesiyle
                        // `left-0 right-0 w-fit` denendi; ÖLÇÜM bunun YANLIŞ olduğunu
                        // gösterdi: Tailwind v4 `-translate-x-1/2`yi `transform`a
                        // değil ayrı `translate` özelliğine derliyor, framer-motion
                        // ise yalnız `style.transform` yazıyor — ikisi çakışmıyor.
                        // Üstelik `left-0 right-0`, balonun daralma alanını ekranın
                        // yarısından TAMAMINA çıkardığı için uzun mesajlarda balon
                        // iki kenara birden yapışıyordu (390px ekranda ölçüldü).
                        className="uyari-balonu fixed left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 min-w-[280px]"
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
        {confirmElement}
        </MotionConfig>
    );
};

export default Studio;
