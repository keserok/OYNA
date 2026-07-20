// Taktik Stüdyosu - Paylaşılan Tipler (SSOT)
// Çekirdek stüdyo ve gelişmiş animasyon modülü bu tipleri ortak kullanır.

export interface Player {
    id: string;
    name: string;
    role: string;
    rating: number;
    code?: string;
    isOpponent?: boolean;
    isCustom?: boolean;
}

export type GameIdentity = 'BALANCED' | 'HIGH_PRESS' | 'PARK_BUS' | 'COUNTER_ATTACK';
export type Archetype = 'NONE' | 'FAKE' | 'GOL' | 'GUCLU' | 'TEHLIKELI' | 'SERT' | 'ASIST' | 'HIZLI' | 'KORUYUCU';

export interface Slot {
    id: string;
    x: number;
    y: number;
    role: string;
    player?: Player;
    instruction?: string;
    archetype?: Archetype;
}

export type SquadSize = '2v2' | '3v3' | '4v4' | '5v5' | '6v6' | '7v7' | '8v8' | '9v9' | '10v10' | '11v11';
// Formasyon artık serbest etiket (string): yerleşik SSOT dizilişlerinin yanında
// kullanıcının satır-sayısıyla ürettiği plana-özel dizilişleri de taşır.
export type FormationType = string;

export interface TacticState {
    id?: string;
    teamName?: string;
    name: string;
    size: SquadSize;
    formation: FormationType;
    slots: Slot[];
    subs: Player[];
    captainId: string | null;
    notes: string;
    opponents: Slot[];
    mentality: 'Defensive' | 'Balanced' | 'Attacking';
    /** 1-10 tempo (5 = varsayılan). Eski kayıtlardaki Slow/Normal/Fast okuma yolunda eşlenir. */
    tempo: number;
    identity: GameIdentity;
    groupColor?: 'DEFAULT' | 'RED' | 'NAVY' | 'GREEN';
    drawings?: DrawingLine[];
    status?: 'APPROVED' | 'PENDING_APPROVAL' | 'REJECTED';
    proposedBy?: string | null;
    priority?: number;
    teamId?: string | null; // takım taktiği köprüsü (Küme 3) — DB "teamId"
}

export interface DrawingLine {
    id: string;
    points: { x: number, y: number }[];
    color: string;
    type: 'arrow' | 'line';
    attachedTo?: string; // Bu çizginin bağlı olduğu slot veya rakip ID'si
    seqStep: number;
}

export type StudioTool = 'move' | 'draw_run' | 'draw_pass' | 'opponent';
export type PlayMode = 'SYNC' | 'SEQ';

// Animasyon zamanlama bilgisi (sekans hesabı)
export interface SeqInfo {
    startTime: number;
    duration: number;
}

// Sekans haritası hesaplama sonucu — gelişmiş modüle de geçer
export interface SeqComputation {
    seqMap: Map<string, SeqInfo>;
    totalSeqDuration: number;
}

// --- Sabitler ---

export const ARCHETYPES: Record<Archetype, { label: string, icon: string, hint: string }> = {
    'NONE': { label: 'Yok', icon: '', hint: '' },
    'FAKE': { label: 'Fake', icon: '👻', hint: 'Rakibini şaşırtır ve sahte koşular yapar.' },
    'GOL': { label: 'Gol', icon: '⚽', hint: 'Skor üretmeye odaklanır.' },
    'GUCLU': { label: 'Güçlü', icon: '💪', hint: 'Fiziksel temaslarda ayakta kalır.' },
    'TEHLIKELI': { label: 'Tehlikeli', icon: '⚡', hint: 'Dar alanda beklenmedik işler yapar.' },
    'SERT': { label: 'Sert', icon: '🪓', hint: 'Agresif ve tavizsiz oynar.' },
    'ASIST': { label: 'Asist', icon: '🎯', hint: 'Ölümcül paslarla pozisyon yaratır.' },
    'HIZLI': { label: 'Hızlı', icon: '🏃‍♂️', hint: 'Patlayıcı hızıyla savunmayı deler.' },
    'KORUYUCU': { label: 'Koruyucu', icon: '🛡️', hint: 'Takım savunmasını toparlar ve korur.' }
};

export const INSTRUCTIONS = ['Hücuma Çık', 'Geride Kal', 'Serbest', 'Markaj', 'Oyun Kurucu', 'Pres Yap'];

// --- Tempo (1-10) ---

export const DEFAULT_TEMPO = 5;

/**
 * Tempoyu 1-10 aralığına normalize eder. Eski kayıtlar (Slow/Normal/Fast) ve
 * DB'den text gelen sayısal değerler tek kapıdan eşlenir; tanınmayan değer
 * varsayılana düşer.
 */
export const normalizeTempo = (v: unknown): number => {
    if (v === 'Slow') return 3;
    if (v === 'Normal') return DEFAULT_TEMPO;
    if (v === 'Fast') return 8;
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    if (!Number.isFinite(n)) return DEFAULT_TEMPO;
    return Math.min(10, Math.max(1, Math.round(n)));
};

/** Tempo → oynatma hız çarpanı: 5 = 1.0x (bugünkü hız), 1 = 0.6x, 10 = 1.5x. */
export const tempoSpeedFactor = (tempo: number): number => 0.5 + normalizeTempo(tempo) * 0.1;
