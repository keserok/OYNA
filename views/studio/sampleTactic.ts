// Örnek taktik üreticisi — ilk kullanımda "Örnek taktiği yükle" için (SSOT).
//
// Amaç: yeni kullanıcı 10 saniyede çalışan bir taktik görsün. 7v7 2-3-1
// dizilişinde dizili oyuncular + basit bir verkaç (pas + koşu) çizimi üretir;
// OYNAT'a basınca hemen bir hareket oynar. Saf fonksiyon (test edilebilir).

import type { Player, Slot, DrawingLine, TacticState } from './types';
import { DEFAULT_TEMPO } from './types';
import { FORMATIONS } from '../../utils/formations';

const PLACEHOLDER_NAMES = ['Kaleci', 'Emre', 'Deniz', 'Kaya', 'Arda', 'Berk', 'Can'];

const line = (
    id: string, type: DrawingLine['type'], points: { x: number; y: number }[],
    seqStep: number, attachedTo?: string,
): DrawingLine => ({ id, points, color: '#39FF14', type, attachedTo, seqStep });

/**
 * Çalışan bir örnek taktik döndürür. `players` verilirse (gerçek kadro) onlar
 * dizilir; yoksa Türkçe yer-tutucu isimler kullanılır.
 */
export const buildSampleTactic = (opts: { id: string; players?: Player[] }): TacticState => {
    const base = FORMATIONS['7v7']['2-3-1'];
    const slots: Slot[] = base.map((s, i) => {
        const p = opts.players?.[i];
        const player: Player = p ?? {
            id: `sample_${i}`,
            name: PLACEHOLDER_NAMES[i] ?? `Oyuncu ${i + 1}`,
            role: s.role,
        };
        return { ...s, player };
    });

    // Basit verkaç: orta saha (s5, ~50,50) → forvet (s7, ~50,25) pas, ardından
    // forvet ileri koşu. Sekans adımlarıyla SIRALI oynatmada adım adım anlatır.
    const drawings: DrawingLine[] = [
        line('sample_pass', 'arrow', [{ x: 50, y: 50 }, { x: 50, y: 27 }], 1, 's5'),
        line('sample_run', 'line', [{ x: 50, y: 25 }, { x: 50, y: 9 }], 2, 's7'),
    ];

    return {
        id: opts.id,
        name: 'Örnek Taktik',
        size: '7v7',
        formation: '2-3-1',
        slots,
        subs: [],
        captainId: null,
        notes: '',
        opponents: [],
        mentality: 'Balanced',
        tempo: DEFAULT_TEMPO,
        identity: 'BALANCED',
        drawings,
    };
};
