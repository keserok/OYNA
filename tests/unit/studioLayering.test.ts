import { describe, it, expect } from 'vitest';
import { isLayerEditing, lineSide, markerLayer, lineIsMuted } from '../../views/studio/layering';

// ─── BİZ/RAKİP katman anahtarı — saf yardımcılar ──────────────────────────────
//
// Sözleşme:
//   • Düzenlemede aktif taraf önde (z 30, parlak, etkileşimli); pasif taraf
//     arkada (z 10, soluk, dokunulmaz).
//   • Oynatma/sunumda katmanlama askıya alınır: iki taraf da tam görünür.

describe('isLayerEditing', () => {
    it('yalnız düzenlerken true (oynatma ve sunumda false)', () => {
        expect(isLayerEditing(false, false)).toBe(true);
        expect(isLayerEditing(true, false)).toBe(false);
        expect(isLayerEditing(false, true)).toBe(false);
        expect(isLayerEditing(true, true)).toBe(false);
    });
});

describe('lineSide', () => {
    it('kırmızı çizgi rakibin, diğer renkler bizim', () => {
        expect(lineSide('#ef4444')).toBe('OPP');
        expect(lineSide('#39FF14')).toBe('US');
        expect(lineSide('#ffffff')).toBe('US');
    });
});

describe('markerLayer — düzenleme durumu', () => {
    it('aktif taraf önde: parlak, etkileşimli, z=30', () => {
        expect(markerLayer('US', 'US', true)).toEqual({ dimmed: false, interactive: true, z: 30 });
        expect(markerLayer('OPP', 'OPP', true)).toEqual({ dimmed: false, interactive: true, z: 30 });
    });

    it('pasif taraf arkada: soluk, kilitli, z=10', () => {
        expect(markerLayer('US', 'OPP', true)).toEqual({ dimmed: true, interactive: false, z: 10 });
        expect(markerLayer('OPP', 'US', true)).toEqual({ dimmed: true, interactive: false, z: 10 });
    });
});

describe('markerLayer — oynatma/sunum (editing=false)', () => {
    it('katmanlama askıda: iki taraf da parlak ve önde', () => {
        for (const side of ['US', 'OPP'] as const) {
            for (const drawSide of ['US', 'OPP'] as const) {
                expect(markerLayer(side, drawSide, false)).toEqual({ dimmed: false, interactive: true, z: 30 });
            }
        }
    });
});

describe('lineIsMuted', () => {
    it('düzenlemede pasif tarafın çizgisi soluklaşır', () => {
        expect(lineIsMuted('#39FF14', 'OPP', true)).toBe(true);   // bizim çizgi, RAKİP modu
        expect(lineIsMuted('#ef4444', 'US', true)).toBe(true);    // rakip çizgisi, BİZ modu
        expect(lineIsMuted('#39FF14', 'US', true)).toBe(false);
        expect(lineIsMuted('#ef4444', 'OPP', true)).toBe(false);
    });

    it('oynatma/sunumda hiçbir çizgi soluklaşmaz', () => {
        expect(lineIsMuted('#39FF14', 'OPP', false)).toBe(false);
        expect(lineIsMuted('#ef4444', 'US', false)).toBe(false);
    });
});
