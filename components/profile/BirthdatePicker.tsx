import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft } from 'lucide-react';
import { useLowMotion } from '../../hooks/useLowMotion';
import { useBackDismiss } from '../../hooks/useBackDismiss';

// ════════════════════════════════════════════════════════════════════════════
// DOĞUM TARİHİ SEÇİCİ — üç tekerlek (GÜN · AY · YIL)
// ════════════════════════════════════════════════════════════════════════════
//
// Kaynak: onaylı "Profili Düzenle" tasarımı, "Doğum Tarihi" ekranı.
//
// ── NEDEN <input type="date"> DEĞİL ────────────────────────────────────────
// Yerleşik tarih girdisi her platformda BAŞKA bir şey çiziyor: iOS'ta alttan
// açılan bir tekerlek, Android WebView'da takvim, masaüstünde metin kutusu.
// Doğum tarihi seçmek için takvim en kötüsü — kullanıcı 1998'e gitmek için
// 300 kez "önceki ay"a basıyor. Üç tekerlek yıl/ay/günü doğrudan verir.
//
// ── HİZALAMA MATEMATİĞİ (bozarsan tekerlek kayar) ──────────────────────────
//   öğe yüksekliği           : 44px
//   tekerlek yüksekliği      : 220px  (= 5 öğe)
//   üst/alt dolgu            : 88px   (= 2 öğe)
// Böylece `scrollTop = index * 44` seçili öğeyi TAM ORTAYA getirir:
//   öğenin merkezi = 88 + index*44 + 22 − scrollTop
//   kabın merkezi  = 110
//   ikisi eşit ⇔ scrollTop = index*44 ✓
// Ortadaki vurgu bandı da aynı merkeze oturur.
//
// ── ERİŞİLEBİLİRLİK — tasarımdan BİLİNÇLİ SAPMA ────────────────────────────
// Tasarımda tekerlek öğeleri düz `<div>`. Öyle bırakılırsa ekran okuyucu
// kullanıcısı ve klavyeyle gezen kimse tarihi DEĞİŞTİREMEZ; kaydırma tek
// giriş yolu olur. Burada her öğe gerçek bir `<button>`: dokunarak da,
// klavyeyle de (Tab + Enter, ok tuşları) seçilebiliyor. Görünüm birebir aynı.
//
// ── GEÇERSİZ TARİH ÜRETİLEMEZ ──────────────────────────────────────────────
// Listeler BİRBİRİNE bağlı üretilir:
//   • Yıl  : 1940 … bu yıl
//   • Ay   : seçili yıl bu yılsa yalnız bu aya kadar
//   • Gün  : ayın gerçek gün sayısı (artık yıl dahil), bugünü aşmaz
// "31 Ocak → Şubat" seçilince gün 29/28'e KIRPILIR. Böylece 31 Şubat gibi bir
// tarih hiç oluşamaz; sonradan doğrulamaya gerek kalmaz.
// ════════════════════════════════════════════════════════════════════════════

const ITEM_H = 44;
const WHEEL_H = 220;
const PAD = (WHEEL_H - ITEM_H) / 2; // 88

export const AYLAR = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
] as const;

/** En eski seçilebilir yıl. Kimseyi dışarıda bırakmasın diye cömert. */
export const MIN_YEAR = 1940;

/** Ayın gerçek gün sayısı (artık yıl dahil). */
export const daysInMonth = (year: number, month1: number): number =>
  new Date(year, month1, 0).getDate();

/** `Date` → 'YYYY-MM-DD'. Yerel saatte kurulur; `toISOString()` KULLANILMAZ —
 *  o UTC'ye çevirir ve doğu saat dilimlerinde tarihi bir gün geri atar. */
export const toISODateLocal = (y: number, m1: number, d: number): string =>
  `${y}-${String(m1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** 'YYYY-MM-DD' → {y, m1, d}; bozuk/boş girdide null. */
export const parseISODate = (iso: string): { y: number; m1: number; d: number } | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  if (!m) return null;
  const y = Number(m[1]); const m1 = Number(m[2]); const d = Number(m[3]);
  if (m1 < 1 || m1 > 12 || d < 1 || d > 31) return null;
  return { y, m1, d };
};

export const yasHesapla = (y: number, m1: number, d: number, now: Date = new Date()): number => {
  let yas = now.getFullYear() - y;
  const dogumGunuGecti =
    now.getMonth() + 1 > m1 || (now.getMonth() + 1 === m1 && now.getDate() >= d);
  if (!dogumGunuGecti) yas -= 1;
  return yas;
};

interface WheelProps {
  label: string;
  items: { value: number; text: string }[];
  selected: number;
  onSelect: (v: number) => void;
  lowMotion: boolean;
}

const Wheel: React.FC<WheelProps> = ({ label, items, selected, onSelect, lowMotion }) => {
  const ref = useRef<HTMLDivElement>(null);
  const bastirRef = useRef(false);      // programatik kaydırma sırasında onScroll'u yut
  const zamanlayici = useRef<ReturnType<typeof setTimeout> | null>(null);

  const index = Math.max(0, items.findIndex((i) => i.value === selected));

  // Seçili değer dışarıdan değişince (ör. gün kırpıldı) tekerleği hizala.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const hedef = index * ITEM_H;
    if (Math.abs(el.scrollTop - hedef) < 2) return;
    bastirRef.current = true;
    el.scrollTo({ top: hedef, behavior: lowMotion ? 'auto' : 'smooth' });
    // Kaydırma bitene kadar onScroll'u yut; yoksa kendi hareketimizi
    // "kullanıcı seçti" sanıp değeri geri yazardık (sonsuz salınım).
    if (zamanlayici.current) clearTimeout(zamanlayici.current);
    zamanlayici.current = setTimeout(() => { bastirRef.current = false; }, lowMotion ? 60 : 420);
  }, [index, lowMotion]);

  useEffect(() => () => { if (zamanlayici.current) clearTimeout(zamanlayici.current); }, []);

  const onScroll = useCallback(() => {
    if (bastirRef.current) return;
    const el = ref.current;
    if (!el) return;
    if (zamanlayici.current) clearTimeout(zamanlayici.current);
    // Parmak kalkana kadar bekle: her kaydırma karesinde değer yazmak
    // üstteki büyük tarih metnini titretiyordu.
    zamanlayici.current = setTimeout(() => {
      const i = Math.round(el.scrollTop / ITEM_H);
      const hedef = items[Math.max(0, Math.min(items.length - 1, i))];
      if (hedef && hedef.value !== selected) onSelect(hedef.value);
    }, 90);
  }, [items, selected, onSelect]);

  return (
    <div className="flex-1 min-w-0 flex flex-col gap-2">
      <span className="text-[0.625rem] tracking-[0.14em] text-[#F5F3EE]/[0.45] text-center">{label}</span>
      <div
        ref={ref}
        onScroll={onScroll}
        role="listbox"
        aria-label={label}
        // `data-oyna-no-bounce`: uygulamanın kendi kaydırma motoru (yaylanma)
        // bu bölgeyi DEVRALMASIN. Devralırsa her karede `scrollTop` yazıyor,
        // `snap-mandatory` de her yazımda en yakın öğeye kilitliyor — tekerlek
        // parmağın altında zıplıyor. Motor yatay şeritlerde snap'i zaten
        // atlıyor ama DİKEY tarafta böyle bir muafiyet yok; bu yüzden burada
        // açıkça işaretleniyor.
        data-oyna-no-bounce=""
        className="box-border overflow-y-auto no-scrollbar snap-y snap-mandatory overscroll-contain"
        style={{
          height: WHEEL_H,
          paddingTop: PAD,
          paddingBottom: PAD,
          WebkitMaskImage: 'linear-gradient(180deg,transparent 0,#000 26%,#000 74%,transparent 100%)',
          maskImage: 'linear-gradient(180deg,transparent 0,#000 26%,#000 74%,transparent 100%)',
        }}
      >
        {items.map((it) => {
          const sec = it.value === selected;
          return (
            <button
              key={it.value}
              type="button"
              role="option"
              aria-selected={sec}
              onClick={() => onSelect(it.value)}
              className={`w-full flex items-center justify-center snap-center transition-colors ${
                sec ? 'text-[1.0625rem] text-[#F5F3EE]' : 'text-base text-[#F5F3EE]/[0.45]'
              }`}
              style={{ height: ITEM_H }}
            >
              {it.text}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export interface BirthdatePickerProps {
  open: boolean;
  /** 'YYYY-MM-DD' — boşsa makul bir başlangıçta açılır. */
  value: string;
  onCancel: () => void;
  onConfirm: (iso: string) => void;
}

/**
 * Tam ekran doğum tarihi seçici.
 *
 * z-[270]: `ProfileEditSheet` z-[260]'ta duruyor; seçici onun ÜSTÜNDE açılmalı.
 */
export const BirthdatePicker: React.FC<BirthdatePickerProps> = ({ open, value, onCancel, onConfirm }) => {
  const lowMotion = useLowMotion();
  // Android donanım geri tuşu ve Esc: önce BU katman kapansın. Kayıt olmadan
  // geri tuşu doğrudan `goBack()` çalıştırıyor ve Ayarlar'dan tamamen çıkıp
  // düzenleme ekranındaki kaydedilmemiş değişiklikleri siliyordu.
  // Öncelik 5: hemen altındaki düzenleme katmanından (0) yüksek.
  useBackDismiss(open, onCancel, 'birthdate-picker', 5);
  const bugun = useMemo(() => new Date(), []);
  const buYil = bugun.getFullYear();

  // Varsayılan: 25 yaşındaki birinin doğum yılı — takvimin ortasına düşer,
  // kullanıcı her açtığında 1940'tan sürüklemek zorunda kalmaz.
  const varsayilan = useMemo(() => ({ y: buYil - 25, m1: 1, d: 1 }), [buYil]);

  const [y, setY] = useState(varsayilan.y);
  const [m1, setM1] = useState(varsayilan.m1);
  const [d, setD] = useState(varsayilan.d);

  useEffect(() => {
    if (!open) return;
    const p = parseISODate(value);
    const t = p ?? varsayilan;
    setY(Math.min(Math.max(t.y, MIN_YEAR), buYil));
    setM1(t.m1);
    setD(t.d);
  }, [open, value, varsayilan, buYil]);

  // ── Birbirine bağlı listeler ─────────────────────────────────────────────
  const yillar = useMemo(
    () => Array.from({ length: buYil - MIN_YEAR + 1 }, (_, i) => {
      const yy = MIN_YEAR + i;
      return { value: yy, text: `${yy}` };
    }),
    [buYil],
  );

  const buAy = bugun.getMonth() + 1;
  const buGun = bugun.getDate();

  const aylar = useMemo(() => {
    const son = y === buYil ? buAy : 12;
    return AYLAR.slice(0, son).map((ad, i) => ({ value: i + 1, text: ad }));
  }, [y, buYil, buAy]);

  const gunler = useMemo(() => {
    let son = daysInMonth(y, m1);
    if (y === buYil && m1 === buAy) son = Math.min(son, buGun);
    return Array.from({ length: son }, (_, i) => ({ value: i + 1, text: `${i + 1}` }));
  }, [y, m1, buYil, buAy, buGun]);

  // Seçim geçersiz kaldıysa KIRP (31 Ocak → Şubat = 29/28; gelecek gün → bugün).
  useEffect(() => {
    const enBuyukAy = aylar.length;
    if (m1 > enBuyukAy) { setM1(enBuyukAy); return; }
    const enBuyukGun = gunler.length;
    if (d > enBuyukGun) setD(enBuyukGun);
  }, [aylar.length, gunler.length, m1, d]);

  if (!open) return null;

  const iso = toISODateLocal(y, m1, d);
  const yas = yasHesapla(y, m1, d, bugun);

  return createPortal(
    <div className="pf-serif pf-canvas fixed inset-0 z-[270] flex flex-col text-[#F5F3EE]">
      <div className="pf-ambient" />

      {/* ═══ ÜST ÇUBUK ═══ */}
      <div className="relative z-10 shrink-0 flex items-center gap-3 px-5 pb-2.5 pt-safe">
        <button
          type="button"
          onClick={onCancel}
          aria-label="Geri"
          className="w-11 h-11 rounded-full bg-surface-1/[0.75] border border-white/[0.08] flex items-center justify-center text-[#F5F3EE] hover:bg-white/10 active:scale-95 transition-all shrink-0"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="text-[0.6875rem] tracking-[0.14em] text-[#F5F3EE]/[0.55]">DOĞUM TARİHİ</span>
      </div>

      {/* ═══ GÖVDE ═══ */}
      <div className="relative z-10 flex-1 min-h-0 flex flex-col px-5 pt-4 overflow-y-auto custom-scrollbar">
        <p className="m-0 text-center text-2xl leading-7 font-[Montserrat] font-extrabold italic text-[#F5F3EE]">
          {d} {AYLAR[m1 - 1]} {y}
        </p>
        <p className="mt-2 mb-0 text-center text-[0.8125rem] text-[#F5F3EE]/[0.55]" aria-live="polite">
          {yas} yaşındasın
        </p>

        <div className="mt-5 relative bg-surface-1 border border-white/[0.08] rounded-[24px] px-2 pt-3.5 pb-[18px]">
          {/* Ortadaki vurgu bandı — seçili satırın nerede olduğunu söyler.
              `pointer-events:none`: tekerleklerin dokunuşunu yutmamalı. */}
          <div
            aria-hidden
            className="absolute left-3.5 right-3.5 rounded-[12px] bg-white/[0.06] border-y border-white/[0.12] pointer-events-none"
            style={{ top: 14 + 12 + 8 + PAD, height: ITEM_H }}
          />
          <div className="relative flex gap-1.5">
            <Wheel label="GÜN" items={gunler} selected={d} onSelect={setD} lowMotion={lowMotion} />
            <Wheel label="AY" items={aylar} selected={m1} onSelect={setM1} lowMotion={lowMotion} />
            <Wheel label="YIL" items={yillar} selected={y} onSelect={setY} lowMotion={lowMotion} />
          </div>
        </div>

        {/* Gizlilik sözü: yaş herkese görünür, tarihin kendisi görünmez. */}
        <p className="mt-3.5 mx-0.5 mb-0 text-[0.6875rem] text-[#F5F3EE]/[0.45] text-center">
          Yaşın profilinde görünür, doğum tarihin görünmez.
        </p>
      </div>

      {/* ═══ KAYDET ═══ */}
      <div className="relative z-10 shrink-0 px-5 pt-3 pb-safe">
        <button
          type="button"
          onClick={() => onConfirm(iso)}
          className="w-full h-[50px] rounded-full bg-white text-[#0A0E14] text-[0.8125rem] font-semibold active:scale-95 transition-transform"
        >
          Kaydet
        </button>
      </div>
    </div>,
    document.body,
  );
};

export default BirthdatePicker;
