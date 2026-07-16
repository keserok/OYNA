// Atak Kütüphanesi (SSOT) — hazır atak şablonları.
//
// Bir şablon SAHADAKİ MEVCUT dizilişe uyarlanır: sabit koordinat listesi değil,
// rol + taraf seçicileri (kast) kullanılır; çizimler seçilen oyuncuların gerçek
// konumlarından başlar. Üretilen çizimler çekirdek stüdyonun DrawingLine
// sözleşmesine birebir uyar:
//   • koşu  = type 'line'  (kesikli çizgi; attachedTo oyuncu markörünü taşır)
//   • pas   = type 'arrow' (ok; top animasyonu bu yol üzerinde oynar)
//   • sıra  = seqStep      (SIRALI oynatmada adım adım anlatım)
// Şablonlar saf fonksiyondur; React'e ve stüdyo durumuna bağımlı değildir.

import type { DrawingLine, Slot } from './types';

type Pt = { x: number; y: number };

// Saha yukarı doğru hücum eder (kendi kalemiz altta, y≈90).
const GOAL: Pt = { x: 50, y: 3 };

const clamp = (v: number, lo = 3, hi = 97) => Math.max(lo, Math.min(hi, v));
const P = (x: number, y: number): Pt => ({ x: clamp(x), y: clamp(y) });
const mid = (a: Pt, b: Pt): Pt => P((a.x + b.x) / 2, (a.y + b.y) / 2);

/**
 * İki nokta arası yumuşak yol örneklemesi (opsiyonel `via` dirseğiyle kuadratik
 * Bezier). Nokta sayısı yol uzunluğuna göre seçilir; animasyon süresi zaten
 * yol uzunluğundan hesaplandığı için örnekleme sıklığı süreyi etkilemez.
 */
const path = (from: Pt, to: Pt, via?: Pt): Pt[] => {
    const len = Math.hypot(to.x - from.x, to.y - from.y);
    const n = Math.max(4, Math.min(14, Math.round(len / 6)));
    const pts: Pt[] = [];
    for (let i = 0; i <= n; i++) {
        const t = i / n;
        if (via) {
            const a = 1 - t;
            pts.push(P(
                a * a * from.x + 2 * a * t * via.x + t * t * to.x,
                a * a * from.y + 2 * a * t * via.y + t * t * to.y,
            ));
        } else {
            pts.push(P(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t));
        }
    }
    return pts;
};

/** Kadro seçici: şablon oyuncularını tekrarsız seçer (kaleci ayrı kapıdan). */
class Cast {
    private used = new Set<string>();
    constructor(private slots: Slot[]) {}
    private get outfield(): Slot[] { return this.slots.filter(s => s.role !== 'GK'); }
    gk(): Slot | null { return this.slots.find(s => s.role === 'GK') ?? null; }
    /** Tercih süzgecine uyan boştaki oyuncuyu skora göre seç; süzgece uyan yoksa herhangi birini. */
    pick(score: (s: Slot) => number, prefer?: (s: Slot) => boolean): Slot | null {
        const free = this.outfield.filter(s => !this.used.has(s.id));
        const pool = prefer && free.some(prefer) ? free.filter(prefer) : free;
        if (!pool.length) return null;
        const best = pool.reduce((a, b) => (score(b) > score(a) ? b : a));
        this.used.add(best.id);
        return best;
    }
}

// Seçici skorları: y küçük = ileri hat; x büyük = sağ taraf.
const enIleri = (s: Slot) => -s.y;
const enGeri = (s: Slot) => s.y;
const merkez = (s: Slot) => -Math.abs(s.x - 50) - Math.abs(s.y - 55) * 0.4;
const sagKanat = (s: Slot) => s.x - s.y * 0.35;
const solKanat = (s: Slot) => (100 - s.x) - s.y * 0.35;

const line = (
    idPrefix: string, n: number, type: DrawingLine['type'],
    points: Pt[], seqStep: number, attachedTo?: string,
): DrawingLine => ({ id: `${idPrefix}_${n}`, points, color: '#39FF14', type, attachedTo, seqStep });

type Builder = (slots: Slot[], idPrefix: string) => DrawingLine[] | null;

// ── Şablonlar ──────────────────────────────────────────────────────────────

/** Kanat atağı: kurucudan kanada pas → çizgiye in + forvet ceza sahasına → orta → vuruş. */
const kanatAtak = (taraf: 'SAG' | 'SOL'): Builder => (slots, idPrefix) => {
    const X = (x: number) => (taraf === 'SAG' ? x : 100 - x);
    const cast = new Cast(slots);
    const kanat = cast.pick(taraf === 'SAG' ? sagKanat : solKanat, s => s.role !== 'DEF');
    const forvet = cast.pick(enIleri, s => s.role === 'FWD');
    const kurucu = cast.pick(merkez, s => s.role === 'MID');
    if (!kanat || !forvet || !kurucu) return null;

    const cizgiDibi = P(X(88), 12);   // kanadın indiği çizgi dibi
    const bulusma = P(X(46), 13);     // ceza sahasında ortanın bulacağı nokta
    let n = 0;
    return [
        line(idPrefix, n++, 'arrow', path(kurucu, kanat), 1, kurucu.id),
        line(idPrefix, n++, 'line', path(kanat, cizgiDibi, P(X(95), (kanat.y + cizgiDibi.y) / 2)), 2, kanat.id),
        line(idPrefix, n++, 'line', path(forvet, bulusma, P((forvet.x + bulusma.x) / 2, (forvet.y + bulusma.y) / 2 + 7)), 2, forvet.id),
        line(idPrefix, n++, 'arrow', path(cizgiDibi, bulusma, P(X(68), 5)), 3, kanat.id),
        line(idPrefix, n++, 'arrow', path(bulusma, GOAL), 4, forvet.id),
    ];
};

/** Verkaç: forvetin ayağına pas → pas-ve-koş boşluğa → duvardan dönen top → şut. */
const verkac: Builder = (slots, idPrefix) => {
    const cast = new Cast(slots);
    const forvet = cast.pick(enIleri, s => s.role === 'FWD');
    const kurucu = cast.pick(merkez, s => s.role === 'MID');
    if (!forvet || !kurucu) return null;

    const yon = kurucu.x <= forvet.x ? -1 : 1; // kurucu kendi tarafındaki kanaldan fırlar
    const bosluk = P(forvet.x + yon * 13, forvet.y - 14);
    let n = 0;
    return [
        line(idPrefix, n++, 'arrow', path(kurucu, forvet), 1, kurucu.id),
        line(idPrefix, n++, 'line', path(kurucu, bosluk, P((kurucu.x + bosluk.x) / 2 + yon * 6, (kurucu.y + bosluk.y) / 2)), 2, kurucu.id),
        line(idPrefix, n++, 'arrow', path(forvet, bosluk), 3, forvet.id),
        line(idPrefix, n++, 'arrow', path(bosluk, GOAL), 4, kurucu.id),
    ];
};

/** Hızlı kontra: kaleciden ileriye uzun çıkış → koşucu kanala sprint → ara pası → şut. */
const kontra: Builder = (slots, idPrefix) => {
    const cast = new Cast(slots);
    const hedef = cast.pick(enIleri, s => s.role === 'FWD');
    const kosucu = cast.pick(enIleri);
    const kaynak = cast.gk() ?? cast.pick(enGeri);
    if (!hedef || !kosucu || !kaynak) return null;

    const gel = P(hedef.x, hedef.y + 8);          // hedef adam topa gelir
    const kanal = P(kosucu.x < 50 ? 33 : 67, 10); // koşucunun dalacağı kanal
    let n = 0;
    return [
        line(idPrefix, n++, 'line', path(hedef, gel), 1, hedef.id),
        line(idPrefix, n++, 'arrow', path(kaynak, gel, P(mid(kaynak, gel).x, mid(kaynak, gel).y - 16)), 1, kaynak.id),
        line(idPrefix, n++, 'line', path(kosucu, kanal, P(mid(kosucu, kanal).x, mid(kosucu, kanal).y + 7)), 2, kosucu.id),
        line(idPrefix, n++, 'arrow', path(gel, kanal), 3, hedef.id),
        line(idPrefix, n++, 'arrow', path(kanal, GOAL), 4, kosucu.id),
    ];
};

/** Ara pası: savunmadan kuruluş → forvetin çapraz koşusu → savunma arkasına ölçülü pas → şut. */
const araPasi: Builder = (slots, idPrefix) => {
    const cast = new Cast(slots);
    const forvet = cast.pick(enIleri, s => s.role === 'FWD');
    const kurucu = cast.pick(merkez, s => s.role === 'MID');
    const stoper = cast.pick(enGeri, s => s.role === 'DEF');
    if (!forvet || !kurucu || !stoper) return null;

    const icYon = forvet.x <= 50 ? 1 : -1; // içeriye doğru çapraz koşu
    const bosluk = P(clamp(forvet.x + icYon * 10, 36, 64), 9);
    let n = 0;
    return [
        line(idPrefix, n++, 'arrow', path(stoper, kurucu), 1, stoper.id),
        line(idPrefix, n++, 'line', path(forvet, bosluk, P((forvet.x + bosluk.x) / 2 - icYon * 5, (forvet.y + bosluk.y) / 2)), 2, forvet.id),
        line(idPrefix, n++, 'arrow', path(kurucu, bosluk), 3, kurucu.id),
        line(idPrefix, n++, 'arrow', path(bosluk, GOAL), 4, forvet.id),
    ];
};

/** Üçgen kurulum: stoper → orta saha → pas-ve-git ile ikinci ortaya → forvete işle → vuruş. */
const ucgenKurulum: Builder = (slots, idPrefix) => {
    const cast = new Cast(slots);
    const stoper = cast.pick(enGeri, s => s.role === 'DEF');
    const orta1 = cast.pick(merkez, s => s.role === 'MID');
    const orta2 = cast.pick(merkez, s => s.role === 'MID');
    const forvet = cast.pick(enIleri, s => s.role === 'FWD');
    if (!stoper || !orta1 || !orta2 || !forvet) return null;

    let n = 0;
    return [
        line(idPrefix, n++, 'arrow', path(stoper, orta1), 1, stoper.id),
        line(idPrefix, n++, 'arrow', path(orta1, orta2), 2, orta1.id),
        line(idPrefix, n++, 'line', path(orta1, P(orta1.x, orta1.y - 12)), 2, orta1.id),
        line(idPrefix, n++, 'arrow', path(orta2, forvet), 3, orta2.id),
        line(idPrefix, n++, 'line', path(orta2, P(orta2.x, orta2.y - 10)), 3, orta2.id),
        line(idPrefix, n++, 'arrow', path(forvet, GOAL), 4, forvet.id),
    ];
};

/** Uzun top: hedef adama havadan top → ikinci topa koşu → kafayla indirme → şut. */
const uzunTop: Builder = (slots, idPrefix) => {
    const cast = new Cast(slots);
    const hedef = cast.pick(enIleri, s => s.role === 'FWD');
    const ikinci = cast.pick(enIleri);
    const kaynak = cast.gk() ?? cast.pick(enGeri);
    if (!hedef || !ikinci || !kaynak) return null;

    const dusen = P(hedef.x + (ikinci.x >= hedef.x ? 11 : -11), hedef.y - 9); // indirilen top
    let n = 0;
    return [
        line(idPrefix, n++, 'arrow', path(kaynak, hedef, P(mid(kaynak, hedef).x, mid(kaynak, hedef).y - 22)), 1, kaynak.id),
        line(idPrefix, n++, 'line', path(ikinci, dusen, P(mid(ikinci, dusen).x, mid(ikinci, dusen).y + 6)), 2, ikinci.id),
        line(idPrefix, n++, 'arrow', path(hedef, dusen), 3, hedef.id),
        line(idPrefix, n++, 'arrow', path(dusen, GOAL), 4, ikinci.id),
    ];
};

// ── Kayıt ──────────────────────────────────────────────────────────────────

export interface AttackPreset {
    id: string;
    name: string;
    icon: string;        // emoji — ARCHETYPES ile aynı desen
    description: string;
    /** Kaleci HARİÇ gereken en az oyuncu (UI bu eşiğin altında şablonu kilitler). */
    minOutfield: number;
    /** Sekans adım sayısı (UI rozeti). */
    steps: number;
    build: (slots: Slot[], idPrefix?: string) => DrawingLine[] | null;
}

const preset = (
    def: Omit<AttackPreset, 'build'>, builder: Builder,
): AttackPreset => ({
    ...def,
    build: (slots, idPrefix = `atk${Date.now()}`) => builder(slots, idPrefix),
});

export const ATTACK_PRESETS: AttackPreset[] = [
    preset({ id: 'KANAT_SAG', name: 'Sağ Kanat Atağı', icon: '🌪️', minOutfield: 3, steps: 4,
        description: 'Kanat çizgiye iner ve ortalar; forvet ceza sahasında tamamlar.' }, kanatAtak('SAG')),
    preset({ id: 'KANAT_SOL', name: 'Sol Kanat Atağı', icon: '🌊', minOutfield: 3, steps: 4,
        description: 'Sol kanattan hızlı iniş, ölçülü orta ve gelen topa vuruş.' }, kanatAtak('SOL')),
    preset({ id: 'VERKAC', name: 'Verkaç (Duvar Pası)', icon: '🔁', minOutfield: 2, steps: 4,
        description: 'Ver, boşluğa fırla; duvardan dönen topla bitir.' }, verkac),
    preset({ id: 'KONTRA', name: 'Hızlı Kontra', icon: '🚀', minOutfield: 2, steps: 4,
        description: 'Kaleciden hızlı çıkış; kanala sprint atan koşucuya ara pası, tek şut.' }, kontra),
    preset({ id: 'ARA_PASI', name: 'Ara Pası', icon: '🎯', minOutfield: 3, steps: 4,
        description: 'Savunmadan kuruluş; forvetin çapraz koşusuna savunma arkasına pas.' }, araPasi),
    preset({ id: 'UCGEN', name: 'Üçgen Kurulum', icon: '🔺', minOutfield: 4, steps: 4,
        description: 'Kısa pas üçgeni ve pas-ve-git ile forvete işle, vuruşla bitir.' }, ucgenKurulum),
    preset({ id: 'UZUN_TOP', name: 'Uzun Top & İkinci Top', icon: '☄️', minOutfield: 2, steps: 4,
        description: 'Hedef adama uzun top; kafayla inen ikinci topu koşucu tamamlar.' }, uzunTop),
];

/** Kaleci hariç saha oyuncusu sayısı (UI kilidi bu eşiğe bakar). */
export const outfieldCount = (slots: Slot[]) => slots.filter(s => s.role !== 'GK').length;
