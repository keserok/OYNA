// BİZ/RAKİP katman anahtarı — saf yardımcılar (SSOT).
//
// Kural: DÜZENLEME durumunda aktif taraf öndedir (yüksek z, tam parlak,
// etkileşimli); pasif taraf arkadadır (düşük z, soluk, dokunulmaz).
// Oynatma/sunum sırasında katmanlama ASKIYA alınır: animasyonda iki takım da
// tam görünür oynar, düzenlemeye dönünce katman görünümü geri gelir.

export type BoardSide = 'US' | 'OPP';

/** Katmanlama yalnız düzenlerken uygulanır (oynatma/sunumda değil). */
export const isLayerEditing = (isSimulating: boolean, presentMode: boolean): boolean =>
    !isSimulating && !presentMode;

/** Çizginin ait olduğu taraf — çizim renk sözleşmesinden (kırmızı = rakip). */
export const lineSide = (color: string): BoardSide => (color === '#ef4444' ? 'OPP' : 'US');

export interface MarkerLayer {
    /** Pasif katman soluk görünür. */
    dimmed: boolean;
    /** Pasif katman düzenlemede dokunulmaz (pointer-events kapalı). */
    interactive: boolean;
    /** Aktif taraf önde (30), pasif arkada (10); sürükleme z'si (50) çağıranda. */
    z: number;
}

export const markerLayer = (side: BoardSide, drawSide: BoardSide, editing: boolean): MarkerLayer => {
    const foreground = !editing || side === drawSide;
    return {
        dimmed: editing && !foreground,
        interactive: !editing || foreground,
        z: foreground ? 30 : 10,
    };
};

/** Pasif tarafın çizgisi mi? (düzenlemede soluklaşır; rozetleri kilitlenir) */
export const lineIsMuted = (color: string, drawSide: BoardSide, editing: boolean): boolean =>
    editing && lineSide(color) !== drawSide;
